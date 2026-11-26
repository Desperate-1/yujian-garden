# -*- coding: utf-8 -*-
"""姿态检测与矫正服务 —— 集成学姐的 CABT-Fusion 方法。

背景
----
原系统的姿态识别流程是「照片 -> 视觉大模型 -> 一段文字描述」，
只产出自然语言，没有任何结构化的人体关键点信息。

学姐的方法（论文：Confidence-Aware Bounded Template Fusion for 2D Human
Pose Refinement）做的是另一件事：
    1. MediaPipe 从照片检测 15 个人体关键点及其置信度
    2. 用固定姿态模板作结构参考，按置信度加权融合 —— 置信度低的点更多
       采纳模板，置信度高的点保留原检测
    3. 纯后处理，不需要重新训练

本模块把这两步接进来，对外只暴露一个 `detect_and_correct_pose()`，
调用方不需要了解 MediaPipe 或模板融合的细节。

⚠️ 中文路径问题（重要）
--------------------
MediaPipe 的原生层无法打开**含中文的路径**。实测同一个模型文件：

    D:\\示例花园\\services\\pose_landmarker.task   -> Unable to open file
    C:\\pose_mirror\\services\\pose_landmarker.task            -> 加载成功

本项目位于含中文的路径下，所以这里会在启动时建一个纯 ASCII 的目录联接
（junction）指向项目，再把模型路径替换成镜像路径。这是免复制的解法，
删除 junction 也不会影响原文件。
"""
import os
import subprocess
import sys
import threading
import time

# matplotlib 默认缓存目录可能不可写（Windows 常见），提前指定一个可写位置，
# 否则导入 mediapipe 时会打印一串权限告警。
os.environ.setdefault('MPLCONFIGDIR',
                      os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                                   '.mplcache'))

# ---------------- 学姐项目的定位 ----------------

def _find_pose_project():
    """定位合作方的姿态矫正项目根目录（含 core/ 与 services/ 的那一层）。

    ## 为什么要搜多个目录名

    这个项目在磁盘上被重命名过（`pose_estimation` → `参考代码_姿态矫正`），
    而改名会让本模块直接失效（找不到项目 = 姿态矫正静默跳过）。
    因此这里**同时接受新旧两种目录名**，并且不假定嵌套层级 ——
    直接在外层目录下逐层找"含 core/ 和 services/pose_landmarker.task 的那一层"。

    还可以用环境变量 POSE_PROJECT_ROOT 直接指定，部署到别处时最省事。
    """
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # MindGarden/
    parent = os.path.dirname(here)                                       # 项目根

    # 候选外层目录名（新旧都认）
    outer_names = [
        '参考代码_姿态矫正',   # 当前
        'pose_estimation',     # 原名称
    ]

    candidates = []
    env = os.environ.get('POSE_PROJECT_ROOT')
    if env:
        candidates.append(env)
    for name in outer_names:
        outer = os.path.join(parent, name)
        # 两种层级都试：外层直接就是项目 / 外层里还嵌一层同名目录
        candidates.append(outer)
        candidates.append(os.path.join(outer, name))
        # 也扫一遍外层的子目录，避免目录名再变时又要改代码
        if os.path.isdir(outer):
            try:
                for sub in os.listdir(outer):
                    candidates.append(os.path.join(outer, sub))
            except OSError:
                pass

    for c in candidates:
        if (os.path.isdir(os.path.join(c, 'core')) and
                os.path.exists(os.path.join(c, 'services', 'pose_landmarker.task'))):
            return os.path.abspath(c)
    return None


POSE_PROJECT = _find_pose_project()

# ---------------- ASCII 镜像（绕开中文路径限制） ----------------

_ASCII_MIRROR = os.environ.get('POSE_ASCII_MIRROR', r'C:\pose_mirror')
_mirror_ready = None
_mirror_lock = threading.Lock()


def _ensure_ascii_mirror():
    """建立/复用指向项目根目录的 ASCII junction，返回可用的镜像路径。

    为什么不用复制：项目里的模型有 5.5 MB，而且以后可能还有别的资源文件。
    junction 是零拷贝的，删除它也不会动到原目录。
    """
    global _mirror_ready
    if _mirror_ready is not None:
        return _mirror_ready

    with _mirror_lock:
        if _mirror_ready is not None:
            return _mirror_ready

        if not POSE_PROJECT:
            _mirror_ready = None
            return None

        task_rel = os.path.join('services', 'pose_landmarker.task')

        # 目标路径本身是否就是纯 ASCII？是的话不必建镜像
        if POSE_PROJECT.isascii():
            _mirror_ready = POSE_PROJECT
            return _mirror_ready

        # 镜像已存在且可用
        if os.path.exists(os.path.join(_ASCII_MIRROR, task_rel)):
            _mirror_ready = _ASCII_MIRROR
            return _mirror_ready

        # 走到这里说明镜像「看起来存在但不可用」。
        # 常见原因：项目目录被改名/移动了，junction 成了**悬空链接** ——
        # 此时 os.path.exists() 对里面的文件返回 False，而 os.rmdir() 又因为
        # 链接仍指向一个（已不存在的）目录而失败，导致镜像永远修不好。
        # 解决办法：用 `rmdir` 命令删链接（它专门处理重解析点，不递归内容）。
        if os.path.exists(_ASCII_MIRROR):
            print(f'[姿态矫正] 检测到失效镜像，正在重建: {_ASCII_MIRROR}')
            try:
                subprocess.run(['cmd', '/c', 'rmdir', _ASCII_MIRROR],
                               capture_output=True, text=True, timeout=15)
            except Exception as e:
                print(f'[姿态矫正] 删除旧镜像失败: {e}')
            # 命令删不掉时再试 Python 的 rmdir（对空链接目录有效）
            if os.path.exists(_ASCII_MIRROR):
                try:
                    os.rmdir(_ASCII_MIRROR)
                except OSError:
                    print(f'[姿态矫正] {_ASCII_MIRROR} 无法删除（不是链接？），跳过镜像')
                    _mirror_ready = None
                    return None

        try:
            r = subprocess.run(['cmd', '/c', 'mklink', '/J', _ASCII_MIRROR, POSE_PROJECT],
                               capture_output=True, text=True)
            if r.returncode == 0 and os.path.exists(os.path.join(_ASCII_MIRROR, task_rel)):
                print(f'[姿态矫正] 已建立 ASCII 镜像: {_ASCII_MIRROR} -> {POSE_PROJECT}')
                _mirror_ready = _ASCII_MIRROR
            else:
                print(f'[姿态矫正] 建立镜像失败: {r.stdout.strip()} {r.stderr.strip()}')
                _mirror_ready = None
        except Exception as e:
            print(f'[姿态矫正] 建立镜像异常: {e}')
            _mirror_ready = None

        return _mirror_ready


# ---------------- 惰性加载 ----------------

_detector = None
_detector_error = None
_correction_mod = None
_templates_mod = None
_kp_names = None


def _load_modules():
    """把学姐项目的模块导入进来。失败时抛出可读的异常。"""
    global _correction_mod, _templates_mod, _kp_names

    if _correction_mod is not None:
        return

    if not POSE_PROJECT:
        raise RuntimeError(
            '未找到姿态矫正项目（pose_estimation）。'
            '请确认其位于项目同级目录，或用环境变量 POSE_PROJECT_ROOT 指定。')

    if POSE_PROJECT not in sys.path:
        sys.path.insert(0, POSE_PROJECT)

    from core.enhanced_correction import confidence_aware_correction
    from core.pose_templates import STANDARD_POSE_TEMPLATES
    from core.keypoint_config import KEYPOINT_NAMES

    _correction_mod = confidence_aware_correction
    _templates_mod = STANDARD_POSE_TEMPLATES
    _kp_names = KEYPOINT_NAMES


def _load_detector():
    """加载 MediaPipe 检测器（首次调用较慢，之后复用）。"""
    global _detector, _detector_error

    if _detector is not None:
        return _detector
    if _detector_error is not None:
        raise _detector_error

    try:
        _load_modules()
        mirror = _ensure_ascii_mirror()
        if not mirror:
            raise RuntimeError(
                '无法建立 ASCII 路径镜像，MediaPipe 无法加载模型'
                '（它不支持含中文的路径）。')

        from core.pose_detector import PoseDetector

        model_path = os.path.join(mirror, 'services', 'pose_landmarker.task')
        print(f'[姿态矫正] 加载 MediaPipe 模型: {model_path}')

        # 必须显式传 model_path：PoseDetector 的默认参数在函数定义时就绑定了
        # 原项目里的中文路径，改模块变量不会生效。
        _detector = PoseDetector(model_path=model_path)
        return _detector
    except Exception as e:
        _detector_error = e
        raise


# ---------------- 对外接口 ----------------

#: 矫正强度预设。
#:
#: ⚠️ 这些值来自合作方的实验选定结果，不是随意定的，也不要用演示脚本里的示例值。
#:    合作方 `v4/v4/minratio/test_selected_minratio.csv` 的验证集结果：
#:
#:      数据档位   k    min_ratio   模板最大影响   NKE-13(基线→矫正)   改善
#:      clean     3     1.0          0%           0.02513 → 0.02513    0%
#:      medium    3     0.8         20%           0.14397 → 0.13799   4.15%
#:      heavy     3     0.4(→用0.6)  60%(→40%)    0.35419 → 0.27337   22.82%
#:
#:    注意 k 固定为 3（合作方 "global sigmoid k fixed at 3"）。
#:
#:    ❌ 常见误用：demo_refinement.py 里写的是 {'k': 8.0, 'min_ratio': 0.10}，
#:       那是用来演示效果的示例值，min_ratio=0.10 意味着模板可占 90%，
#:       在真实照片上会把关节强行拉向模板，反而破坏原始姿态。本项目曾误用该值。
#:
#: 档位语义（按**数据整体质量**，不是按单张图的置信度）：
#:   clean  —— 数据干净（如实验室采集、公开数据集），矫正无收益，min_ratio=1.0
#:   medium —— 一般拍摄条件（如团队手机实拍），min_ratio=0.8
#:   heavy  —— 噪声大/遮挡严重，min_ratio=0.6，矫正收益最明显
POSE_STRENGTH_PRESETS = {
    'clean':  {'k': 3.0, 'min_ratio': 1.0},
    'medium': {'k': 3.0, 'min_ratio': 0.8},
    'heavy':  {'k': 3.0, 'min_ratio': 0.6},
}

#: 默认档位：medium（一般拍摄条件）
DEFAULT_POSE_STRENGTH = os.environ.get('POSE_STRENGTH', 'medium').strip().lower()

DEFAULT_CORRECTION_CONFIG = dict(
    POSE_STRENGTH_PRESETS.get(DEFAULT_POSE_STRENGTH,
                              POSE_STRENGTH_PRESETS['medium']))


def get_correction_config(strength=None):
    """按档位取矫正参数。strength 可为 clean / medium / heavy，或直接传 dict。"""
    if isinstance(strength, dict):
        return dict(strength)
    key = (strength or DEFAULT_POSE_STRENGTH or 'medium').strip().lower()
    return dict(POSE_STRENGTH_PRESETS.get(key, POSE_STRENGTH_PRESETS['medium']))

#: 平均置信度低于此值时，认为检测整体不可信，不套用模板矫正。
#:
#: 为什么要这个阈值（实测发现）：
#:   模板融合的前提是"检测大体正确、只是个别点不准"。
#:   但实测遇到一张躺卧人物照，MediaPipe 把姿态整个检测错了，
#:   此时套用站立模板反而会把错误结构"焊死"，结果比不矫正更差。
#:   所以检测整体不可信时应当放弃矫正，并如实告知，而不是硬套模板。
DEFAULT_MIN_MEAN_SCORE = float(os.environ.get('POSE_MIN_MEAN_SCORE') or 0.45)


def is_available():
    """检测矫正功能是否可用（缺依赖/缺模型时返回 False，不抛异常）。"""
    try:
        _load_modules()
        _load_detector()
        return True
    except Exception as e:
        print(f'[姿态矫正] 不可用: {e}')
        return False


def detect_and_correct_pose(image_path,
                            template_key=None,
                            config=None,
                            min_mean_score=None):
    """从照片检测人体关键点并做置信度感知矫正。

    Args:
        image_path: 图片路径（支持中文路径，内部会做处理）。
        template_key: 结构先验模板。留空则用视觉模型判断姿态类型
            （standing / walk / sit），判断不出时回退 standing。
        config: 矫正参数，默认 {'k': 8.0, 'min_ratio': 0.10}。
        min_mean_score: 平均置信度低于此值时**不做矫正**，直接返回原始检测，
            并在结果的 `corrected` 字段标记为 False。
            这是安全阀：检测整体错位时套模板会让结果更差。

    Returns:
        dict，包含：
            keypoints      最终关键点 [[x, y], ...]（0~1 归一化）
            raw_keypoints  矫正前的关键点
            corrected      是否真的做了矫正
            skip_reason    未矫正的原因（若未矫正）
            scores / names / pose_type / moved / image_shape ...
    """
    _load_modules()
    detector = _load_detector()

    import numpy as np

    t0 = time.time()
    result = detector.detect_from_file(image_path)
    if result is None:
        raise RuntimeError('照片中未检测到人体，请换一张全身清晰的照片。')

    scores = list(result.scores)
    mean_score = sum(scores) / len(scores) if scores else 0.0
    raw = np.asarray(result.keypoints, dtype=float)

    # 模板选择：优先用视觉模型给出的姿态类型
    if template_key is None:
        pt = result.pose_type if result.pose_type in _templates_mod else 'standing'
    else:
        pt = template_key if template_key in _templates_mod else 'standing'

    threshold = DEFAULT_MIN_MEAN_SCORE if min_mean_score is None else float(min_mean_score)

    # 安全阀：整体检测不可信时放弃矫正。
    # 模板融合只能修正"个别点不准"，不能挽救"整个姿态检测错了"的情况。
    if mean_score < threshold:
        reason = (f'整体检测置信度偏低（平均 {mean_score:.3f} < {threshold}），'
                  f'套用模板可能让结果更差，已跳过矫正')
        print(f'[姿态矫正] {reason}')
        dt = time.time() - t0
        return {
            'keypoints': raw.tolist(),
            'raw_keypoints': raw.tolist(),
            'corrected': False,
            'skip_reason': reason,
            'scores': scores,
            'names': list(_kp_names),
            'pose_type': pt,
            'moved': [0.0] * len(raw),
            'mean_score': round(mean_score, 4),
            'reliable': False,
            'image_shape': result.image_shape,
            'elapsed_ms': round(dt * 1000, 1),
            'correction_info': None,
        }

    corrected, info = _correction_mod(
        result.keypoints,
        scores,
        coordinate_type='image_normalized',
        config=dict(config or DEFAULT_CORRECTION_CONFIG),
        template_key=pt,
    )

    fixed = np.asarray(corrected, dtype=float)
    n = min(len(raw), len(fixed))
    moved = [round(float(np.linalg.norm(fixed[i] - raw[i])), 5) for i in range(n)]

    dt = time.time() - t0
    print(f'[姿态矫正] 检测+矫正完成 {dt*1000:.0f}ms  '
          f'姿态={pt} 平均置信度={mean_score:.3f} '
          f'最大位移={max(moved) if moved else 0:.4f}')

    return {
        'keypoints': fixed.tolist(),
        'raw_keypoints': raw.tolist(),
        'corrected': True,
        'skip_reason': None,
        'scores': scores,
        'names': list(_kp_names),
        'pose_type': pt,
        'moved': moved,
        'mean_score': round(mean_score, 4),
        'reliable': True,
        'image_shape': result.image_shape,
        'elapsed_ms': round(dt * 1000, 1),
        'correction_info': info,
    }


def describe_pose(result):
    """把关键点结果转成一句中文描述，供后续创作提示词使用。

    这一步是"结构化关键点 -> 自然语言"的桥：原系统的创作流程需要文字描述，
    而矫正方法给的是坐标，这里把两者接起来。
    """
    kp = result['keypoints']
    sc = result['scores']
    names = result['names']

    if len(kp) < 15:
        return '人物姿态信息不完整。'

    def get(i):
        return kp[i]

    parts = []
    # 用左右腕相对肩/髋的高度判断手臂姿态
    r_wrist, l_wrist = get(4), get(7)
    r_shoulder, l_shoulder = get(2), get(5)
    r_hip, l_hip = get(8), get(11)

    for label, wrist, shoulder, hip, conf in (
            ('右手', r_wrist, r_shoulder, r_hip, sc[4]),
            ('左手', l_wrist, l_shoulder, l_hip, sc[7])):
        if conf < 0.3:
            continue
        # y 越小越高（图像坐标）
        if wrist[1] < shoulder[1]:
            parts.append(f'{label}抬起')
        elif wrist[1] > hip[1]:
            parts.append(f'{label}自然下垂')
        else:
            parts.append(f'{label}在腰部附近')

    # 腿部：膝盖相对髋部的水平偏移判断是否迈步
    r_knee, l_knee = get(9), get(12)
    hip_width = abs(r_hip[0] - l_hip[0]) or 0.1
    knee_offset = abs(r_knee[0] - l_knee[0]) / hip_width
    if knee_offset > 0.8:
        parts.append('双腿分开呈迈步状')
    elif knee_offset < 0.3:
        parts.append('双腿并拢')

    pose_cn = {'standing': '站立', 'walk': '行走', 'sit': '坐姿'}.get(
        result['pose_type'], '站立')

    desc = f'人物呈{pose_cn}姿态'
    if parts:
        desc += '，' + '，'.join(parts)
    # 如实标注是否做过矫正：没矫正时不该让下游误以为关节已修正
    if not result.get('corrected', True):
        desc += '（关节检测整体置信度偏低，未做模板矫正）'
    return desc + '。'


def get_status():
    """返回集成状态，供诊断接口/启动自检使用。"""
    return {
        'project_found': bool(POSE_PROJECT),
        'project_path': POSE_PROJECT,
        'ascii_mirror': _ASCII_MIRROR if POSE_PROJECT and not POSE_PROJECT.isascii() else POSE_PROJECT,
        'detector_loaded': _detector is not None,
        'detector_error': str(_detector_error) if _detector_error else None,
        'templates': list(_templates_mod.keys()) if _templates_mod else [],
    }


# ---------------- 最近一次结果（供可视化复用） ----------------
# 创作流程里已经算过一次检测+矫正，前端要展示骨架时不必重跑
# （重跑虽是 30ms，但会再调一次视觉模型判断姿态类型，约 1-3 秒）。
_last_result = None
_last_image = None


def remember_result(image_path, result):
    """缓存最近一次的检测结果。"""
    global _last_result, _last_image
    _last_result = result
    _last_image = image_path


def get_last_result(image_path=None):
    """取最近一次结果；若指定了路径且不匹配，则重新检测。"""
    global _last_result, _last_image
    if _last_result is not None and (image_path is None or _last_image == image_path):
        return _last_result
    if image_path is None:
        return None
    result = detect_and_correct_pose(image_path)
    remember_result(image_path, result)
    return result


# ---------------- 骨架可视化 ----------------

#: 15 点骨架连线（与 core/keypoint_config.py 的协议一致）
SKELETON_EDGES = [
    (0, 1),
    (1, 2), (2, 3), (3, 4),
    (1, 5), (5, 6), (6, 7),
    (1, 14),
    (14, 8), (8, 9), (9, 10),
    (14, 11), (11, 12), (12, 13),
]

_RED = (226, 74, 62)
_GREEN = (46, 168, 124)


def render_skeleton_comparison(image_path, result=None, width=900):
    """渲染"矫正前(红) / 矫正后(绿) / 叠加"三联骨架对比图。

    返回 PIL Image。用于：
      - 网页端向用户展示关节矫正效果（可选）
      - 生成比赛文档用的对比图

    为什么是三联而不是单张：单看矫正后的骨架无法体现"改了什么"，
    并列展示才能让评委/用户看出方法的价值（这也与论文 Fig.3 一致）。
    """
    from PIL import Image, ImageDraw, ImageFont

    if result is None:
        result = get_last_result(image_path)
    if result is None:
        raise RuntimeError('没有可用的姿态检测结果')

    base = Image.open(image_path).convert('RGB')
    W, H = base.size
    if W > width:
        scale = width / W
        base = base.resize((width, int(H * scale)), Image.LANCZOS)
        W, H = base.size

    def _font(size):
        for name in ('msyh.ttc', 'simhei.ttf', 'arial.ttf'):
            try:
                return ImageFont.truetype(name, size)
            except Exception:
                continue
        return ImageFont.load_default()

    def draw(d, kpts, color, w=4, r=6):
        pts = [(k[0] * W, k[1] * H) for k in kpts]
        for a, b in SKELETON_EDGES:
            if a < len(pts) and b < len(pts):
                d.line([pts[a], pts[b]], fill=color, width=w)
        for i, (x, y) in enumerate(pts):
            rr = r if i in (0, 1, 14) else r - 2
            d.ellipse([x - rr, y - rr, x + rr, y + rr], fill=color, outline='white', width=2)

    title_h, foot_h = 44, 38
    canvas = Image.new('RGB', (W * 3, H + title_h + foot_h), (252, 251, 249))
    d = ImageDraw.Draw(canvas)
    f_t, f_f = _font(24), _font(18)

    before = base.copy()
    draw(ImageDraw.Draw(before), result['raw_keypoints'], _RED)
    after = base.copy()
    draw(ImageDraw.Draw(after), result['keypoints'], _GREEN)
    overlay = base.copy()
    draw(ImageDraw.Draw(overlay), result['raw_keypoints'], _RED, w=3, r=5)
    layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    draw(ImageDraw.Draw(layer), result['keypoints'], _GREEN + (170,), w=3, r=5)
    overlay = Image.alpha_composite(overlay.convert('RGBA'), layer).convert('RGB')

    for i, (img, title) in enumerate([(before, 'Before correction'),
                                      (after, 'After correction'),
                                      (overlay, 'Overlay')]):
        canvas.paste(img, (W * i, title_h))
        tw = d.textlength(title, font=f_t)
        d.text((W * i + (W - tw) / 2, 12), title, fill=(40, 48, 46), font=f_t)

    foot = (f"mean conf {result['mean_score']:.3f}   "
            f"pose {result['pose_type']}   "
            f"Red: before   Green: after")
    d.text((W + 8, H + title_h + 8), foot, fill=(90, 96, 94), font=f_f)
    return canvas
