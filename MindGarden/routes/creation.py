from flask import (Blueprint, render_template, request, jsonify, current_app,
                   send_from_directory, session, url_for)
from flask_login import login_required, current_user
import base64
from services.ai_art import (create_art, progress_start, set_progress,
                             progress_finish, get_progress)
from services.user_interact import WorkInteractionService
from models.mysqldb_alt import db
import os
import datetime
import time
import shutil

creation_bp = Blueprint('creation', __name__)

# ============================================================
#  心灵花园 · 背景音乐库
# ------------------------------------------------------------
#  音乐文件就放在 static/music/ 里 —— **往文件夹里丢歌 = 加歌**，
#  不用改代码、不用改数据库、不用重启（下次渲染花园页就会读到）。
#  文件（去掉扩展名）就是歌名，详见 static/music/README.md。
# ============================================================
MUSIC_DIR = os.path.normpath(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'static', 'music')
)
MUSIC_EXTS = ('.mp3', '.m4a', '.aac', '.ogg', '.oga', '.wav', '.flac')


def get_music_library():
    """扫描音乐库，返回 [{'title': 歌名, 'url': 可直接播放的地址}]。

    读不到目录（比如文件夹被删了）时返回空列表 —— 花园页会自己把播放器收起来，
    绝不因为「没有歌」而让整个花园打不开。
    """
    try:
        names = sorted(os.listdir(MUSIC_DIR))
    except OSError as e:
        current_app.logger.warning(f"音乐库目录不可读（花园将没有背景音乐）: {e}")
        return []

    tracks = []
    for name in names:
        if os.path.splitext(name)[1].lower() not in MUSIC_EXTS:
            continue
        if not os.path.isfile(os.path.join(MUSIC_DIR, name)):
            continue
        tracks.append({
            'title': os.path.splitext(name)[0],
            'url': url_for('static', filename=f'music/{name}'),
        })
    return tracks

@creation_bp.route('/create', methods=['GET'])
@login_required
def create_page():
    return render_template('creation/create.html')


@creation_bp.route('/generate_art/progress', methods=['GET'])
@login_required
def generate_art_progress():
    """查询当前生成进度。

    本地模型推理很慢（出图 13~17 分钟），前端在等待期间轮询这里，
    就能显示"当前在哪一步、已用多久"，而不是干等一个转圈动画。
    """
    return jsonify(get_progress())


@creation_bp.route('/generate_art', methods=['POST'])
@login_required
def generate_art():
    try:
        import cv2        # lazy import：避免启动期加载 cv2（重型库）
        import numpy as np
        # 获取上传的图片
        image_data = request.json.get('image_data')
        if not image_data:
            return jsonify({'error': '没有上传图片'}), 400

        # 获取创作类型
        # typeindex: 1=图片(HunyuanDiT/云生图), 2=动画(AnimateDiff), 3=风格迁移(InstructPix2Pix), 4=3D(混元3D), 其他=音乐(AudioLDM2)
        typeindex = request.json.get('typeindex', 6)

        # 【疗愈回廊创新点】创作意图：用户可选填"此刻想安放的情绪"
        intent = (request.json.get('intent') or '').strip()[:120] or None

        # 【疗愈回廊创新点】期望心情：只作为生成方向传给模型，不入库为情绪值
        mood = (request.json.get('mood') or '').strip()[:20] or None
        mood_hint = (request.json.get('mood_hint') or '').strip()[:200] or None

        # 【疗愈回廊创新点】情绪基线：取用户最近一条日记的情绪值，
        # 随作品一起存下来，之后才能在回廊里画出"情绪疗愈轨迹"。
        try:
            emotion_score = db.get_latest_emotion_score(current_user.id)
        except Exception as _e:
            current_app.logger.warning(f"读取情绪基线失败（不影响生成）: {_e}")
            emotion_score = None

        # 解码base64图片
        image_data = image_data.split(',')[1]
        image_bytes = base64.b64decode(image_data)
        nparr = np.frombuffer(image_bytes, np.uint8)
        image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if image is None or image.size == 0:
            return jsonify({'error': '图片解码失败，请重新拍摄'}), 400

        # 保存临时图片文件
        os.makedirs('genres', exist_ok=True)
        tmp_filename = f"{current_user.id}_tmp.jpg"
        tmp_filepath = os.path.join('genres', tmp_filename)
        cv2.imwrite(tmp_filepath, image)

        # 启动进度追踪：前端会轮询 /generate_art/progress
        task_id = f"{current_user.id}_{int(time.time())}"
        progress_start(task_id, typeindex)

        # 调用AI艺术生成服务（mood 作为生成方向传入）
        result = create_art(tmp_filepath, typeindex, mood=mood, mood_hint=mood_hint)

        # 生成失败时 result 为 None
        if result is None:
            progress_finish(ok=False, error='艺术生成失败')
            return jsonify({'error': '艺术生成失败，请稍后重试'}), 500

        # create_art 带回了具体失败原因（如 3D 缺腾讯云密钥），原样转给前端，
        # 便于用户知道到底缺什么，而不是只看到一句"生成失败"。
        if isinstance(result, dict) and result.get('__error__'):
            progress_finish(ok=False, error=result['__error__'])
            return jsonify({'error': result['__error__']}), 500

        # 生成时间戳
        timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
        creation_id = None
        preview_base64 = None

        # ── 图片类型：typeindex 1, 2, 3 ──
        if typeindex in [1, 2, 3]:
            if typeindex == 2:
                # AnimateDiff 动画 → gen_anim 已保存到 animation.gif
                gif_filename = f"{current_user.id}_{timestamp}.gif"
                gif_filepath = os.path.join('genres', gif_filename)
                if os.path.exists("animation.gif"):
                    shutil.move("animation.gif", gif_filepath)
                creation_id = db.create_artwork(current_user.id, gif_filepath, 'image', intent, emotion_score)
            else:
                # HunyuanDiT 图片 / InstructPix2Pix 风格迁移 → PIL Image
                img_filename = f"{current_user.id}_{timestamp}.jpg"
                img_filepath = os.path.join('genres', img_filename)
                if hasattr(result, 'save'):
                    result.save(img_filepath)
                else:
                    cv2.imwrite(img_filepath, result)
                creation_id = db.create_artwork(current_user.id, img_filepath, 'image', intent, emotion_score)

            # 读取文件返回base64预览
            preview_path = gif_filepath if typeindex == 2 else img_filepath
            with open(preview_path, 'rb') as f:
                preview_bytes = f.read()
            mime = 'image/gif' if typeindex == 2 else 'image/jpeg'
            preview_base64 = f'data:{mime};base64,{base64.b64encode(preview_bytes).decode("utf-8")}'

        # ── 3D类型：typeindex 4 ──
        elif typeindex == 4:
            mp4_path = "3d_output.mp4"
            preview_path = "3d_output_preview.png"

            timestamp_int = int(time.time())
            mp4_filename = f"{current_user.id}_{timestamp_int}.mp4"
            preview_filename = f"{current_user.id}_{timestamp_int}_preview.png"

            mp4_save_path = os.path.join('genres', mp4_filename)
            preview_save_path = os.path.join('genres', preview_filename)

            # 移动文件到genres目录
            if os.path.exists(mp4_path):
                shutil.move(mp4_path, mp4_save_path)
            if os.path.exists(preview_path):
                shutil.move(preview_path, preview_save_path)

            # 保存到数据库，content_type设为'3d'
            creation_id = db.create_artwork(current_user.id, preview_save_path, '3d', intent, emotion_score)

            # 返回预览图
            if os.path.exists(preview_save_path):
                with open(preview_save_path, 'rb') as f:
                    preview_bytes = f.read()
                preview_base64 = f'data:image/png;base64,{base64.b64encode(preview_bytes).decode("utf-8")}'

        # ── 音乐类型：typeindex 5+ ──
        else:
            # 注意：写出的是 WAV 波形数据（scipy.io.wavfile），
            # 扩展名必须叫 .wav —— 以前叫 .mp3 导致内容与实际格式不符
            music_filename = f"{current_user.id}_{timestamp}.wav"
            music_filepath = os.path.join('genres', music_filename)

            # create_art 返回的是音频数据 (numpy array)
            if isinstance(result, np.ndarray):
                import scipy.io.wavfile
                scipy.io.wavfile.write(music_filepath, 16000, result)

            # 保存音乐记录到数据库
            creation_id = db.create_artwork(current_user.id, music_filepath, 'music', intent, emotion_score)
            # 音乐没有图片预览

        # ── 返回结果 ──
        progress_finish(ok=True, result={'creation_id': creation_id})

        # 【学姐方法】可选：把关节矫正的骨架对比图一并返回给前端。
        # 由环境变量 SHOW_SKELETON 控制，**默认关闭**。
        #
        # 为什么默认关：实测矫正效果正常，但把骨架线摆在创作结果旁边，
        # 对普通用户（心理疗愈场景）是额外认知负担 —— 他们关心"我的作品"，
        # 不关心关节点。技术亮点留在答辩演示和文档里体现即可。
        # 需要展示时：设 SHOW_SKELETON=on，界面就会出现矫正前后对比图。
        #
        # 【同时落盘一份】：原来只把 base64 返回给前端，磁盘上不留文件，
        # 导致事后想找"当时那张骨架图"就找不到了（做申报材料时需要）。
        # 现在每次生成都往 genres/skeleton/ 存一份，方便随时取用。
        skeleton_b64 = None
        if os.environ.get('SHOW_SKELETON', 'off').strip().lower() in ('on', '1', 'true', 'yes'):
            try:
                from services import pose_correction as pc
                _r = pc.get_last_result(tmp_filepath)
                if _r is not None:
                    from io import BytesIO as _BytesIO
                    _img = pc.render_skeleton_comparison(tmp_filepath, result=_r)
                    # 缩小一点再传，避免 base64 过大拖慢响应
                    _img.thumbnail((1400, 1400))
                    _buf = _BytesIO()
                    _img.save(_buf, format='JPEG', quality=82)

                    # 落盘：文件名带时间戳，不会互相覆盖
                    try:
                        _sk_dir = os.path.join('genres', 'skeleton')
                        os.makedirs(_sk_dir, exist_ok=True)
                        _sk_name = f'{current_user.id}_{timestamp}_skel.jpg'
                        _img.save(os.path.join(_sk_dir, _sk_name), quality=88)
                        print(f'[姿态矫正] 骨架对比图已存档: genres/skeleton/{_sk_name}')
                    except Exception as _se:
                        current_app.logger.warning(f'骨架图存档失败: {_se}')

                    skeleton_b64 = ('data:image/jpeg;base64,'
                                    + base64.b64encode(_buf.getvalue()).decode('utf-8'))
                    print(f'[姿态矫正] 已生成骨架对比图 '
                          f'({len(_buf.getvalue())/1024:.0f} KB)')
            except Exception as _e:
                current_app.logger.warning(f'骨架可视化跳过: {_e}')

        return jsonify({
            'success': True,
            'image_url': preview_base64,
            'content_type': 'music' if typeindex not in [1, 2, 3, 4] else (
                '3d' if typeindex == 4 else 'image'
            ),
            'creation_id': creation_id,
            'skeleton_url': skeleton_b64
        })

    except Exception as e:
        current_app.logger.error(f"艺术生成错误: {str(e)}")
        try:
            progress_finish(ok=False, error=str(e)[:300])
        except Exception:
            pass
        return jsonify({'error': '艺术生成失败'}), 500

def _load_creations():
    """取当前用户的全部作品，并补齐互动状态。

    花园与疗愈回廊都要用，抽出来避免两处重复（也少了漏改一处的风险）。
    """
    creations = db.get_user_artworks(current_user.id)
    for creation in creations:
        if isinstance(creation.get('content_type'), bytes):
            creation['content_type'] = creation['content_type'].decode('utf-8')
        creation['content_type'] = str(creation['content_type'])
        creation['filename'] = creation['content_path'].replace('\\', '/').rsplit('/', 1)[-1]
        creation['interaction_status'] = WorkInteractionService.get_user_interaction_status(creation['id'])
        creation['work_stats'] = WorkInteractionService.get_work_stats(creation['id'])
        creation['user_status'] = creation['interaction_status']
    return creations


@creation_bp.route('/garden')
@login_required
def garden():
    """游览纸雕花园，沿小径走向心灵喷泉。"""
    return render_template('creation/garden.html')


@creation_bp.route('/garden/music')
@login_required
def garden_music():
    """音乐库清单（JSON）。花园页由模板直接注入，这里留着方便自检与后续扩展。"""
    from themes import current_theme_key
    tracks = get_music_library() if current_theme_key() == 'cute' else []
    return jsonify({'count': len(tracks), 'tracks': tracks})


# ============================================================
#  心灵喷泉 · 舞动起来！（跳舞游戏分数）
# ============================================================
@creation_bp.route('/garden/dance_score', methods=['POST'])
@login_required
def save_dance_score():
    """保存一局舞蹈游戏分数。前端在结算时调用。"""
    data = request.get_json(silent=True) or {}
    track = str(data.get('track', '')).strip()[:128]
    try:
        score = int(data.get('score', 0))
    except (TypeError, ValueError):
        return jsonify({'ok': False, 'msg': '分数格式不对'}), 400
    if not track or score < 0 or score > 1000000:
        return jsonify({'ok': False, 'msg': '参数不对'}), 400

    username = getattr(current_user, 'username', None) or f"用户{current_user.id}"
    try:
        best = db.save_dance_score(current_user.id, username, track, score)
    except Exception as e:
        current_app.logger.error(f"保存舞蹈分数失败: {e}")
        return jsonify({'ok': False, 'msg': '保存失败，请稍后再试'}), 500
    return jsonify({'ok': True, 'best': best})


@creation_bp.route('/garden/dance_scores')
@login_required
def list_dance_scores():
    """排行榜：全站前十 + 个人前五。"""
    try:
        data = db.get_dance_scores(limit=10, user_id=current_user.id)
    except Exception as e:
        current_app.logger.error(f"读取舞蹈排行榜失败: {e}")
        return jsonify({'top': [], 'mine': []})
    rows = list(data.get('top', []))
    if data.get('mine'):
        rows.append(data['mine'])
    for row in rows:
        if row.get('created_at') is not None:
            row['created_at'] = str(row['created_at'])
    return jsonify(data)


@creation_bp.route('/garden/mirror')
@login_required
def mirror():
    """心灵喷泉：浏览器本地姿态识别驱动 3D 小伙伴（画面不上传）。

    URL 保留 /garden/mirror 不变，避免破坏已有书签与测试脚本；
    用户可见名称统一为「心灵喷泉」。
    """
    return render_template('creation/mirror.html')


@creation_bp.route('/gallery')
@login_required
def gallery():
    """疗愈回廊：作品陈列页（花园远景「艺术回廊」的落点）。

    情绪曲线已从展示层移除，但日记与情绪数据仍完整保留在数据库中。
    """
    try:
        return render_template('creation/gallery.html', creations=_load_creations())
    except Exception as e:
        current_app.logger.error(f"获取疗愈回廊错误: {str(e)}")
        return render_template('creation/gallery.html', creations=[])



def _hex_to_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def _build_healing_stats(points):
    """把轨迹点汇总成可展示的统计结论（供回廊顶部的"疗愈小结"使用）。"""
    scored = [p for p in points if p.get('score') is not None]
    if not scored:
        return None

    first, last = scored[0], scored[-1]
    delta = last['score'] - first['score']

    # 情绪值区间 0~1（SnowNLP 情感极性）。分档给中文描述。
    def band(v):
        if v < 0.2:
            return '低落'
        if v < 0.4:
            return '偏沉'
        if v < 0.6:
            return '平稳'
        if v < 0.8:
            return '轻快'
        return '愉悦'

    trend = '上升' if delta > 0.05 else ('下降' if delta < -0.05 else '平稳')
    return {
        'count': len(scored),
        'artwork_count': sum(1 for p in points if p.get('kind') == 'artwork'),
        'first_score': round(first['score'], 3),
        'first_band': band(first['score']),
        'last_score': round(last['score'], 3),
        'last_band': band(last['score']),
        'delta': round(delta, 3),
        'delta_pct': round(abs(delta) * 100, 1),
        'trend': trend,
        'avg_score': round(sum(p['score'] for p in scored) / len(scored), 3),
        'span_start': first['time'],
        'span_end': last['time'],
    }


def _rgb_to_hex(rgb):
    return '#%02X%02X%02X' % tuple(max(0, min(255, int(round(c)))) for c in rgb)


# 情绪配色带：低分=偏沉的灰蓝，中段=鼠尾草绿，高分=明亮青绿
# 刻意不用"红=坏/绿=好"的交通灯配色，避免给用户评判感 —— 疗愈产品不该让人有压力
_EMOTION_STOPS = [
    (0.0, '#8A9AA5'),
    (0.3, '#A8B8B0'),
    (0.5, '#7FB8B0'),
    (0.7, '#5A9E96'),
    (1.0, '#4FA98F'),
]


def _interp_color(v):
    """按情绪值 0~1 在配色带上取色。None 表示没有情绪数据，返回中性灰。"""
    if v is None:
        return '#C9C2B6'
    v = max(0.0, min(1.0, float(v)))
    for i in range(len(_EMOTION_STOPS) - 1):
        v0, c0 = _EMOTION_STOPS[i]
        v1, c1 = _EMOTION_STOPS[i + 1]
        if v0 <= v <= v1:
            t = 0.0 if v1 == v0 else (v - v0) / (v1 - v0)
            a, b = _hex_to_rgb(c0), _hex_to_rgb(c1)
            return _rgb_to_hex(tuple(a[k] + (b[k] - a[k]) * t for k in range(3)))
    return _EMOTION_STOPS[-1][1]


@creation_bp.app_template_filter('score_color')
def score_color(value):
    """模板过滤器：把情绪值映射成颜色。"""
    if value is None:
        return '#C9C2B6'
    try:
        return _interp_color(float(value))
    except (TypeError, ValueError):
        return '#C9C2B6'


def _build_trajectory_svg(points, width=800, height=200, pad_x=26, pad_y=28):
    """把轨迹点换算成 SVG 折线 / 面积 / 散点坐标。

    纵轴固定映射到 0~1（情绪值的完整取值范围），不做自适应缩放 ——
    这样不同用户的曲线可以直接比较，也避免"小波动看起来像大起大落"。

    ⚠️ 折线只连"有情绪值"的点。早期作品没有情绪分（该功能后加），
       如果把它们也算进折线，曲线会在 None 处断裂或塌到 0，图会失真。
       没有情绪分的作品仍会以散点形式标在曲线上，保留"那天创作过"的信息。
    """
    # 有情绪值的点参与画线，横轴按"有值的点"均分，曲线才连续可读
    scored = [(i, p) for i, p in enumerate(points) if p.get('score') is not None]
    if len(scored) < 2:
        return {'line': '', 'area': '', 'points': []}

    plot_w = width - pad_x * 2
    plot_h = height - pad_y * 2
    n = len(scored)

    def x_at(k):
        return pad_x + plot_w * k / (n - 1)

    def y_at(score):
        return pad_y + plot_h * (1.0 - max(0.0, min(1.0, score)))

    coords = [(x_at(k), y_at(p['score']), p) for k, (_, p) in enumerate(scored)]

    # 平滑折线：相邻点之间用二次贝塞尔做圆角过渡，视觉更柔和（贴合疗愈主题）
    d = f'M {coords[0][0]:.1f} {coords[0][1]:.1f}'
    for i in range(1, len(coords)):
        x0, y0 = coords[i - 1][0], coords[i - 1][1]
        x1, y1 = coords[i][0], coords[i][1]
        mx = (x0 + x1) / 2
        d += f' Q {mx:.1f} {y0:.1f} {mx:.1f} {(y0 + y1) / 2:.1f}'
        d += f' Q {mx:.1f} {y1:.1f} {x1:.1f} {y1:.1f}'

    axis_y = pad_y + plot_h
    area = d + f' L {coords[-1][0]:.1f} {axis_y:.1f} L {coords[0][0]:.1f} {axis_y:.1f} Z'

    # 散点：有情绪值的点按实际坐标画；没有情绪值的作品点，贴到相邻插值高度上，
    # 用灰色小点表示"这天创作过，但没有情绪记录"。
    out_points = []
    for x, y, p in coords:
        label = p.get('label') or ''
        tip = f"{p['time'].strftime('%Y-%m-%d')} 情绪 {p['score']:.2f}"
        if label:
            tip += ('  作品意图：' + label) if p.get('kind') == 'artwork' else ('  ' + label)
        out_points.append({
            'x': round(x, 1), 'y': round(y, 1),
            'color': _interp_color(p['score']),
            'artwork': p.get('kind') == 'artwork',
            'tip': tip,
        })

    return {'line': d, 'area': area, 'points': out_points}


    """把轨迹点汇总成可展示的统计结论（供回廊顶部的"疗愈小结"使用）。"""
    scored = [p for p in points if p.get('score') is not None]
    if not scored:
        return None

    first, last = scored[0], scored[-1]
    delta = last['score'] - first['score']

    # 情绪值区间 0~1（SnowNLP 情感极性）。分档给中文描述。
    def band(v):
        if v < 0.2:
            return '低落'
        if v < 0.4:
            return '偏沉'
        if v < 0.6:
            return '平稳'
        if v < 0.8:
            return '轻快'
        return '愉悦'

    trend = '上升' if delta > 0.05 else ('下降' if delta < -0.05 else '平稳')
    return {
        'count': len(scored),
        'artwork_count': sum(1 for p in points if p.get('kind') == 'artwork'),
        'first_score': round(first['score'], 3),
        'first_band': band(first['score']),
        'last_score': round(last['score'], 3),
        'last_band': band(last['score']),
        'delta': round(delta, 3),
        'delta_pct': round(delta * 100, 1),
        'trend': trend,
        'avg_score': round(sum(p['score'] for p in scored) / len(scored), 3),
        'span_start': first['time'],
        'span_end': last['time'],
    }

@creation_bp.route('/gallery/healing-trajectory', methods=['GET'])
@login_required
def healing_trajectory_api():
    """情绪疗愈轨迹的 JSON 接口。

    供回廊图表使用，也便于调试和后续做数据导出。
    """
    try:
        points = db.get_healing_trajectory(current_user.id)
        stats = _build_healing_stats(points)
        # created_at 是 datetime，转成字符串以便 JSON 序列化
        for p in points:
            if p.get('time') is not None:
                p['time'] = p['time'].strftime('%Y-%m-%d %H:%M:%S')
        if stats:
            for k in ('span_start', 'span_end'):
                if stats.get(k) is not None:
                    stats[k] = stats[k].strftime('%Y-%m-%d')
        return jsonify({'points': points, 'stats': stats})
    except Exception as e:
        current_app.logger.error(f"获取疗愈轨迹失败: {str(e)}")
        return jsonify({'error': str(e)}), 500


@creation_bp.route('/genres/<filename>')
def send_genres_file(filename):
    return send_from_directory('genres', filename)
