from themes import GARDEN_SCENES, current_theme_key
from flask import (Blueprint, render_template, request, jsonify, session,
                   send_file, current_app, url_for)
from flask_login import login_required, current_user
from services.ai_chat import get_deepseek_response,extract_topic
from models.mongo_db import (ChatSession, get_user_sessions, get_session_by_id,
                             get_chat_collection, delete_session, delete_all_sessions)
from uuid import uuid4
from services.ai_audproc import iflytek_speech_to_text, iflytek_text_to_speech
from io import BytesIO
import datetime
import os
import re

chat_bp = Blueprint('chat', __name__)

# ============================================================
#  糖果小屋 · 小女巫立绘
# ------------------------------------------------------------
#  立绘就放在 static/candy/ 里，命名 witch-1.png、witch-2.png ……
#  **往文件夹里加图 = 多一个姿势**，不用改代码、不用改模板。
#  房间背景固定叫 room.png（在 candy_house.css 里引用）。
#  详见 static/candy/README.md
# ============================================================
CANDY_DIR = os.path.normpath(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'static', 'candy')
)
_WITCH_RE = re.compile(r'^witch[-_]?(\d+)\.(png|webp|jpe?g|gif)$', re.IGNORECASE)

# ============================================================
#  糖果小屋 · 小女巫的人设
# ------------------------------------------------------------
#  只有糖果小屋页会用到（前端发 persona='witch'）。
#  原版"温暖支持型咨询师"的口吻保留给其它入口，两者互不影响。
#
#  ⚠️ 人设里最硬的一条是"短"：气泡就那么点大，说一大段会撑爆版面，
#     也失去"小女巫随口回你一句"的感觉。所以除了这段提示词，
#     下面还有一道 _trim_witch_reply 的兜底闸门。
# ============================================================
_WITCH_PERSONA = {
    "role": "system",
    "content": (
        "用户是来找你说心里话的朋友。\n"
        "自然地接话，让朋友感到有人陪在身边。\n"
        "铁律（务必遵守）：\n"
        "1. 用户是主角，TA 说什么你接什么。TA 说想去写日记、想跳舞、想画画、想回花园，"
        "先开心地说好，再指个路（写日记去树洞日记、跳舞去心灵喷泉、画画去疗愈回廊），"
        "绝不在 TA 有明确想法的时候还顾着自己提问。\n"
        "2. 极简。每次只回 1 句话，最多 2 句，控制在 40 个字以内。"
        "不分点、不用列表、不加括号补充说明、不解释你为什么这么说。\n"
        "3. 先轻轻接住用户的情绪（半句就够），再给一个符合你身份的小动作，"
        "比如递花、添茶或替朋友照亮花径。\n"
        "4. 不讲大道理、不说教、不分析原因；只有 TA 明显想继续聊、话题又飘忽时，"
        "才问一个短问题。\n"
        "5. 不要自称 AI 或咨询师，不要用专业术语。\n"
        "6. 如果用户说的是严重的痛苦或危险，就收起俏皮，认真温和地陪着，"
        "并鼓励他去找身边信任的人或专业人士。\n"
        "7. 你们是老朋友了——TA 以前来聊过天、也做过剧本疗愈，"
        "可以偶尔自然地提起以前的事，但别像在汇报。\n"
        "8. 不要使用 emoji 和颜文字，界面已经很花了。"
    ),
}
# 模型偶尔会忘了人设写成一段，这里再钉一句（放在最后，权重更高）
_WITCH_BREVITY = {
    "role": "system",
    "content": "再提醒一次：这次也只用一到两句话回答，越短越好，不要超过 40 个字。",
}


# 意图识别：用户说"想去哪"，女巫指路之外，前端再弹一个跳转小芯片。
# 按出现顺序先匹配先赢；词表故意收得窄，宁可不弹也别乱弹。
_GOTO_INTENTS = [
    (('写日记', '写写日记', '日记', '树洞', '写下来', '写点东西'), '树洞日记', '/journal/create'),
    (('跳舞', '喷泉', '舞动', '跳一跳', '活动一下身体'), '心灵喷泉', '/garden/mirror'),
    (('画画', '创作', '回廊', '做作品', '画一张'), '疗愈回廊', '/gallery'),
    (('回花园', '去花园', '回首页'), '心灵花园', '/garden'),
]


def _detect_goto(text: str):
    """用户这句话里有没有明确的"想去哪"。有就返回 {'name','url'}。"""
    if not text:
        return None
    for keywords, name, url in _GOTO_INTENTS:
        for kw in keywords:
            if kw in text:
                return {'name': name, 'url': url}
    return None


def _trim_witch_reply(text, max_sentences=2, soft_limit=60):
    """小女巫的"简洁闸门"：回复明显超长时，按句切到前一两句。

    设计上的取舍：
      · **只在超过 soft_limit 字时才动手** —— 短回复（包括"抱歉，我现在无法回应"这类
        兜底语）原样放行，绝不因为闸门把正常回答改坏；
      · 按中文句末标点切，保留标点，尽量不破坏语气；
      · 这只是人设提示词的保险丝，不是内容审核，不做任何改写。
    """
    if not text:
        return text
    t = str(text).strip()
    if len(t) <= soft_limit:
        return t
    parts = [p.strip() for p in re.findall(r'[^。！？!?…\n]+[。！？!?…]*', t) if p.strip()]
    if len(parts) <= max_sentences:
        return t
    return ''.join(parts[:max_sentences])


def _scan_witch_poses(directory, url_prefix):
    """扫一个目录里的 witch-N 立绘，返回 (编号, url) 列表。"""
    try:
        names = os.listdir(directory)
    except OSError:
        return []
    found = []
    for name in names:
        m = _WITCH_RE.match(name)
        if m and os.path.isfile(os.path.join(directory, name)):
            found.append((int(m.group(1)), url_for('static', filename=f'{url_prefix}/{name}')))
    found.sort(key=lambda x: x[0])
    return found


def get_witch_poses():
    """扫描女巫立绘，按文件名里的编号排序，返回可直接放进 <img src> 的地址列表。

    按当前美术风格取图：static/candy/themes/<风格>/ 里有立绘就用，
    没有就退回 static/candy/ 的可爱风立绘；再读不到就返回空列表，
    页面会自己降级成"还没有立绘"的提示，而不是整页 500。
    """
    theme = current_theme_key()
    if theme != 'cute':
        themed = _scan_witch_poses(os.path.join(CANDY_DIR, 'themes', theme),
                                   f'candy/themes/{theme}')
        if themed:
            return [url for _, url in themed]
    base = _scan_witch_poses(CANDY_DIR, 'candy')
    return [url for _, url in base]


def get_candy_room_url():
    """取与当前门外景物相连的室内插画。"""
    theme = current_theme_key()
    return url_for('static', filename=f'garden/illustrated/{theme}/room.webp')

@chat_bp.route('/chat', methods=['GET'])
@login_required
def index():
    if not session.get('chat_session_id', '').startswith(f'chat_{current_user.id}_'):
        session['chat_session_id'] = f"chat_{current_user.id}_{uuid4().hex}"
    return render_template('chat/index.html')


@chat_bp.route('/chat/historyall', methods=['GET'])
@login_required
def chat_history_all():
    """New route for the enhanced chat interface with session history"""
    return render_template('chat/history.html')


@chat_bp.route('/candy-house', methods=['GET'])
@login_required
def candy_house():
    """在当前花园的房间接续对话，保留用户的剧本与历史会话。"""
    if not session.get('chat_session_id', '').startswith(f'chat_{current_user.id}_'):
        session['chat_session_id'] = f"chat_{current_user.id}_{uuid4().hex}"
    return render_template(
        'chat/candy_house.html',
        witch_poses=[url_for('static', filename=f'garden/hosts/{current_theme_key()}.webp')],
        story_poses=get_witch_poses(),
        room_url=get_candy_room_url(),
        chat_session_id=session['chat_session_id'],
    )


@chat_bp.route('/chat/sessions', methods=['GET'])
@login_required
def get_user_chat_sessions():
    """Get all chat sessions for the current user"""
    try:
        sessions = get_user_sessions(current_user.id)
        return jsonify(sessions)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@chat_bp.route('/chat/session/<session_id>', methods=['GET'])
@login_required
def get_chat_session(session_id):
    """Get messages for a specific session"""
    try:
        messages = get_session_by_id(session_id, current_user.id)
        return jsonify(messages)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@chat_bp.route('/chat/session/<session_id>', methods=['DELETE'])
@login_required
def remove_chat_session(session_id):
    """删除（清空）某个会话。

    删除时同时做两件事：
      1) 删除 MongoDB 里的会话记录
      2) 如果删的正好是当前会话，清掉 session 里的 chat_session_id，
         避免后续发消息又把它"写活"回来
    """
    try:
        deleted = delete_session(session_id, current_user.id)
        if not deleted:
            return jsonify({'error': '会话不存在或无权删除'}), 404

        if session.get('chat_session_id') == session_id:
            session.pop('chat_session_id', None)

        return jsonify({'success': True, 'deleted': deleted, 'session_id': session_id})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@chat_bp.route('/chat/sessions', methods=['DELETE'])
@login_required
def remove_all_chat_sessions():
    """清空当前用户的全部会话。"""
    try:
        deleted = delete_all_sessions(current_user.id)
        session.pop('chat_session_id', None)
        return jsonify({'success': True, 'deleted': deleted})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@chat_bp.route('/chat/new-session', methods=['POST'])
@login_required
def create_new_session():
    """Create a new chat session"""
    try:
        # 会话结束触发：新建会话前，后台更新旧会话的画像
        prev_session_id = session.get('chat_session_id')
        if prev_session_id:
            from user_profile.pipeline import schedule_session_update
            schedule_session_update(current_user.id, prev_session_id)

        new_session_id = f"chat_{current_user.id}_{uuid4().hex}"
        session['chat_session_id'] = new_session_id
        
        # Initialize with empty messages array
        chats = get_chat_collection()
        chats.insert_one({
            "session_id": new_session_id,
            "user_id": current_user.id,
            "messages": [],
            "created_at": datetime.datetime.utcnow()
        })
        
        return jsonify({"session_id": new_session_id})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@chat_bp.route('/chat/send', methods=['POST'])
@login_required
def send_message():
    data = request.get_json(silent=True)
    if not isinstance(data, dict) or not isinstance(data.get('message'), str) or not data['message'].strip():
        return jsonify({"error": "请填写消息"}), 400
    user_message = data['message'].strip()
    session_id = data.get('session_id')
    
    if not session_id:
        return jsonify({"error": "会话ID缺失"}), 400
    
    if not isinstance(session_id, str) or not session_id.startswith(f"chat_{current_user.id}_"):
        return jsonify({"error": "会话不可用"}), 404

    # 会话切换检测：若用户从上一个会话切换过来，后台更新上一个会话的画像
    prev_session_id = session.get('chat_session_id')
    if prev_session_id and prev_session_id != session_id:
        from user_profile.pipeline import schedule_session_update
        schedule_session_update(current_user.id, prev_session_id)

    # 更新session中的当前会话ID
    session['chat_session_id'] = session_id
    
    chat_session = ChatSession(user_id=current_user.id, session_id=session_id)  # Now accepts session_id

    # 保存用户消息到MongoDB
    chat_session.save_message('user', user_message)
    
    # 获取完整对话历史
    history = chat_session.get_history()
    
    # 构建发送给AI的消息，只包含当前会话的实际对话
    ai_messages = []
    for msg in history:
        # 只包含用户和助手的实际对话
        if msg['role'] in ['user', 'assistant']:
            ai_messages.append({
                "role": msg['role'],
                "content": msg['content']
            })

    # 构建最终的AI请求消息
    final_messages = ai_messages.copy()

    # 用户画像注入：作为第一条 system 消息，优先于 comfort/critical 提示
    from user_profile.summary import build_profile_summary
    profile_sys = build_profile_summary(current_user.id, session_id, user_message)
    if profile_sys:
        final_messages.insert(0, profile_sys)

    # 长期记忆注入：剧本疗愈经历 + 最近几次聊天话题（文件层，Mongo 不在也有效），
    # 女巫"记得我"就靠它。紧跟画像之后、人设之前。
    from services.witch_memory import build_memory_context
    mem_sys = build_memory_context(current_user.id)
    if mem_sys:
        final_messages.insert(1 if profile_sys else 0, mem_sys)

    comfort_setting = {
            "role": "system",
            "content": "请根据语境，使用一段温馨或鼓励或理解支持或俏皮活泼高昂的文字回答，请自行判断用户聊天状态（无需输出）并适时调整回答长度，自行决定是否帮助用户分析其所面临的问题产生的原因，不要使用列表，避免理性工具化回答，需要激发用户生命力。"
        }

    # 口吻分岔口：糖果小屋来的请求用"小女巫"人设，其它入口保持原来的咨询师口吻
    is_witch = (request.json.get('persona') or '').strip().lower() == 'witch'

    if is_witch:
        identity = GARDEN_SCENES[current_theme_key()]["persona"]
        final_messages.append({"role": "system", "content": identity + "\n" + _WITCH_PERSONA["content"]})
        final_messages.append(_WITCH_BREVITY)
    else:
        final_messages.append(comfort_setting)

        if "为什么" in user_message or "为何" in user_message or \
         "如何" in user_message or "怎么办" in user_message:
            # 在AI响应前插入批判性思考提示
            critical_trigger = {
                "role": "system",
                "content": "请引导用户进一步探索问题背后的价值观和需求，帮助用户发现新的视角解决问题。"
            }
            final_messages.append(critical_trigger)
    
    # 获取AI回复
    ai_reply = get_deepseek_response(final_messages)

    # 小女巫要短：万一模型没听人设，这里再兜一道（详见 _trim_witch_reply 的说明）
    if is_witch:
        ai_reply = _trim_witch_reply(ai_reply)
    
    # 保存AI回复
    chat_session.save_message('assistant', ai_reply)
    
    # 提取并保存对话关键词
    try:
        current_session_history = chat_session.get_history()
        full_conversation = "\n".join([f"{msg['role']}: {msg['content']}" for msg in current_session_history])
        
        topic = extract_topic(full_conversation)
        chat_session.update_keywords(topic)
        # 写进女巫的长期记忆（文件层）：这次聊了什么 + TA 最后说的话
        from services.witch_memory import remember
        remember(current_user.id, 'chat',
                 f'「{topic}」，TA 最后说：“{user_message[:40]}”',
                 sid=session_id)
    except Exception as e:
        print(f"主题提取失败: {e}")
        # 如果提取失败，使用用户消息的前几个词作为主题
        if user_message:
            import jieba
            words = jieba.lcut(user_message)
            short_topic = ' '.join(words[:2]) if len(words) >= 2 else user_message[:15]
            chat_session.update_keywords(short_topic)
    
    return jsonify({
        "reply": ai_reply,
        "session_id": session_id,
        # 用户说"想去哪"时带上跳转目标，前端在气泡下弹个小芯片（仅女巫闲聊模式）
        "goto": _detect_goto(user_message) if is_witch else None,
    })

@chat_bp.route('/chat/history', methods=['GET'])
@login_required
def get_chat_history():
    session_id = session.get('chat_session_id')
    if not session_id:
        return jsonify([])
    
    chat_session = ChatSession(user_id=current_user.id, session_id=session_id)
    history = chat_session.get_history()
    
    return jsonify(history)

@chat_bp.route('/chat/voice-input', methods=['POST'])
@login_required
def handle_voice_input():
    if 'audio' not in request.files:
        return jsonify({'error': 'No audio file provided'}), 400
        
    audio_file = request.files['audio']
    
    try:
        text = iflytek_speech_to_text(audio_file)
        return jsonify({'text': text})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@chat_bp.route('/chat/voice-output', methods=['POST'])
@login_required
def handle_voice_output():
    text = request.json.get('text')
    
    if not text:
        return jsonify({'error': 'No text provided'}), 400
    
    try:
        audio_data = iflytek_text_to_speech(text)
        return send_file(
            BytesIO(audio_data),
            mimetype='audio/mp3',
            as_attachment=False,
            download_name='response.mp3'
        )
    except Exception as e:
        return jsonify({'error': str(e)}), 500
