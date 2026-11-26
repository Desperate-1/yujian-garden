# -*- coding: utf-8 -*-
"""剧本疗愈路由：把 CrewAI 治疗流程接到网页对话上。

前端交互模型（轮询，和花园页进度条同一套思路）：
  POST /therapy/start            开一局 → {session_id}
  GET  /therapy/state/<sid>      轮询：阶段 / 待回答问题 / 状态
  POST /therapy/answer/<sid>     投递用户回答 {text}
  POST /therapy/stop/<sid>       主动结束
  POST /therapy/resume/<sid>     断点续接（从角色扮演阶段继续）
  GET  /therapy/list             历史剧本列表（长时记忆）
"""
from flask import Blueprint, jsonify, request, current_app
from flask_login import login_required, current_user

from services import therapy_crew

therapy_bp = Blueprint('therapy', __name__)


@therapy_bp.route('/therapy/start', methods=['POST'])
@login_required
def start():
    data = request.get_json(silent=True) or {}
    # 开局表格 + 用户选定的治愈女巫（3 选 1 的结果）
    raw_preset = data.get('preset') or {}
    preset = {k: str(v)[:200] for k, v in raw_preset.items()
              if k in ('nickname', 'mood', 'situation', 'witch_look', 'style', 'plot_pref')}
    raw_witch = data.get('witch') or {}
    witch = {'url': str(raw_witch.get('url', ''))[:200],
             'desc': str(raw_witch.get('desc', ''))[:200]}
    try:
        sid = therapy_crew.start_session(current_user.id, current_app._get_current_object(),
                                         preset=preset, witch=witch)
    except RuntimeError as e:
        return jsonify({'ok': False, 'msg': str(e)}), 503
    except Exception as e:
        current_app.logger.error(f'剧本疗愈启动失败: {e}')
        return jsonify({'ok': False, 'msg': '启动失败，请稍后再试'}), 500
    return jsonify({'ok': True, 'session_id': sid})


@therapy_bp.route('/therapy/witch_portraits', methods=['POST'])
@login_required
def witch_portraits():
    """根据用户填的「期望女巫形象」现场生成 3 张立绘供选择。
    云端混元生图并行出图，约 40~60 秒；全部失败时 ok=False，
    前端退回「老朋友三选一」（现有立绘）。"""
    data = request.get_json(silent=True) or {}
    look = (data.get('look') or '').strip()[:200]
    style = (data.get('style') or 'cute').strip()
    from services.witch_portraits import generate_witch_portraits
    try:
        return jsonify(generate_witch_portraits(current_user.id, look, style))
    except Exception as e:
        current_app.logger.error(f'女巫立绘生成失败: {e}')
        return jsonify({'ok': False, 'portraits': [], 'msg': '生成失败，请稍后再试'}), 500


@therapy_bp.route('/companion/set', methods=['POST'])
@login_required
def companion_set():
    """把当前治愈女巫设为全局陪伴者（跟着用户去日记页等）。"""
    data = request.get_json(silent=True) or {}
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'ok': False, 'msg': '名字为空'}), 400
    from services.witch_portraits import set_companion
    set_companion(current_user.id, name,
                  description=(data.get('description') or '')[:300],
                  portrait=(data.get('portrait') or '')[:200],
                  topic=(data.get('topic') or '')[:60])
    return jsonify({'ok': True})


@therapy_bp.route('/companion/current')
@login_required
def companion_current():
    from services.witch_portraits import get_companion
    return jsonify({'ok': True, 'companion': get_companion(current_user.id)})


@therapy_bp.route('/therapy/state/<session_id>')
@login_required
def state(session_id):
    st = therapy_crew.get_state(session_id, current_user.id)
    if not st:
        return jsonify({'ok': False, 'msg': '会话不存在'}), 404
    # 只暴露前端需要的字段，对话记录尾部给一小段做渲染
    transcript = st.get('transcript') or []
    return jsonify({
        'ok': True,
        'status': st.get('status'),
        'stage': st.get('stage'),
        'stage_name': st.get('stage_name'),
        'pending_question': st.get('pending_question'),
        'invitation': st.get('invitation'),
        'transcript': transcript[-60:],
        'scenario': st.get('scenario'),
        'record': st.get('record'),
        'witch': st.get('witch'),
        'preset': st.get('preset'),
        'error': st.get('error'),
    })


@therapy_bp.route('/therapy/answer/<session_id>', methods=['POST'])
@login_required
def answer(session_id):
    text = (request.get_json(silent=True) or {}).get('text', '').strip()
    if not text:
        return jsonify({'ok': False, 'msg': '内容为空'}), 400
    if not therapy_crew.deliver_answer(session_id, text):
        return jsonify({'ok': False, 'msg': '会话不在进行中'}), 409
    return jsonify({'ok': True})


@therapy_bp.route('/therapy/stop/<session_id>', methods=['POST'])
@login_required
def stop(session_id):
    if not therapy_crew.stop_session(session_id, current_user.id):
        return jsonify({'ok': False, 'msg': '会话不存在'}), 404
    return jsonify({'ok': True})


@therapy_bp.route('/therapy/resume/<session_id>', methods=['POST'])
@login_required
def resume(session_id):
    ok = therapy_crew.resume_session(session_id, current_user.id,
                                     current_app._get_current_object())
    if not ok:
        return jsonify({'ok': False, 'msg': '无法续接（会话进行中或还没生成剧本）'}), 409
    return jsonify({'ok': True})


@therapy_bp.route('/therapy/list')
@login_required
def list_all():
    return jsonify({'ok': True, 'sessions': therapy_crew.list_sessions(current_user.id)})
