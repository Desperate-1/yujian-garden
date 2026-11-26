# MindGarden 主题（美术风格）体系
#
# 三套风格：可爱风 cute / 清新风 fresh / 丑萌风 ugly。
# - 风格选择存 users.theme（未登录用户存 session）
# - 每套风格可有独立素材目录 static/garden/themes/<key>/，
#   缺图时自动回退到默认（可爱风 / 旧版素材），方便美术逐张替换。
# - 模板里用 theme_asset('depth/far-gallery.png') 取图。

import os
from functools import lru_cache
from flask import url_for

THEMES = {
    'cute': {
        'name': '晨日动漫',
        'en': 'CUTE',
        'desc': '穿过粉色花树，到糖霜小屋敲敲门',
        'emoji': '✿',
    },
    'fresh': {
        'name': '云水亭庭',
        'en': 'FRESH',
        'desc': '沿着浅绿石径，到藤蔓环绕的小屋喝杯茶',
        'emoji': '❧',
    },
    'ugly': {
        'name': '月下花园',
        'en': 'UGLY-CUTE',
        'desc': '跟着月光，去紫色花房找星芽',
        'emoji': '✧',
    },
}

GARDEN_SCENES = {
    'cute': dict(title='晨日樱花园', house='樱桃小屋', path='沿花径去喷泉', sky='太阳',
                 host='糖糖', role='花店店长', welcome='早呀！今天的第一束小雏菊开好了，挑一枝陪你聊聊天？',
                 gesture='糖糖把一枝小雏菊递过来。', knock='糖糖抱着新剪的花迎了出来。',
                 persona='你是樱花园开花店的糖糖，爽朗、亲切，喜欢边理花边听朋友说话。'),
    'fresh': dict(title='云汀水院', house='听水茶室', path='沿石径去喷泉', sky='太阳',
                  host='清禾', role='茶室主人', welcome='帘外的水光正好。我温了两盏茶，想坐一会儿吗？',
                  gesture='清禾收拢折扇，向你轻轻一礼。', knock='清禾放下茶盏，执扇出门相迎。',
                  persona='你是云汀水院的清禾，身穿汉服，照看临水茶室。用自然的现代中文，温柔从容，像邻家姐姐。'),
    'ugly': dict(title='月下花园', house='星灯花房', path='沿花径去喷泉', sky='月亮',
                 host='星芽', role='守园女孩', welcome='嘘，你看见花丛里的小光点了吗？提灯给你，我们边走边聊。',
                 gesture='星芽晃了晃小灯，朝你眨了眨眼。', knock='星芽提着花灯，从花房里探出头来。',
                 persona='你是月下花园的星芽，提灯照料夜间花园，活泼俏皮，懂得在朋友需要的时候安静倾听。'),
}

DEFAULT_THEME = 'cute'

# 主题素材根目录（相对 static/）
_THEME_DIR = os.path.join('garden', 'themes')

# 可爱风的"正式素材"就是现有的 garden/depth 与 garden/parallax 目录。
# 主题目录里找到同名文件就优先用主题版，找不到回退到这些旧路径。
_LEGACY_PREFIXES = ('depth', 'parallax')


def is_valid_theme(key):
    return isinstance(key, str) and key in THEMES


def _static_root():
    from flask import current_app
    return current_app.static_folder


@lru_cache(maxsize=512)
def _resolve(theme, name):
    """返回相对 static/ 的路径；按 主题目录 → 可爱风目录 → 旧版目录 的顺序回退。"""
    candidates = []
    for key in dict.fromkeys((theme, DEFAULT_THEME)):
        base = os.path.join(_THEME_DIR, key)
        if name.endswith('.png'):
            candidates.append(os.path.join(base, 'print', name[:-4] + '.webp'))
        candidates.append(os.path.join(base, name))
    candidates.append(os.path.join('garden', name))  # 旧版素材（depth/ parallax/）
    root = _static_root()
    for rel in candidates:
        if os.path.exists(os.path.join(root, rel)):
            return rel.replace(os.sep, '/')
    # 文件不存在也返回主题路径（让 <img onerror> 兜底逻辑接管）
    return candidates[0].replace(os.sep, '/')


def theme_asset_url(theme, name):
    """模板用的取图函数：theme_asset('depth/far-gallery.png')。"""
    if theme not in THEMES:
        theme = DEFAULT_THEME
    return url_for('static', filename=_resolve(theme, name))


def current_theme_key():
    """当前用户/访客的风格：登录读 users.theme，否则读 session。"""
    from flask import session
    from flask_login import current_user
    theme = None
    try:
        if current_user.is_authenticated:
            theme = getattr(current_user, 'theme', None)
    except Exception:
        theme = None
    if not theme:
        theme = session.get('theme')
    return theme if is_valid_theme(theme) else DEFAULT_THEME


def resolve_existing(theme, *names):
    """按顺序找第一个真实存在的素材（相对 static/ 的路径），都没有则返回 None。

    用于近景场景这类"有专用图就用，没有就退回全景图"的场合。
    """
    if theme not in THEMES:
        theme = DEFAULT_THEME
    root = _static_root()
    for name in names:
        rel = _resolve(theme, name)
        if os.path.exists(os.path.join(root, rel.replace('/', os.sep))):
            return rel
    return None


def clear_asset_cache():
    """素材目录变化后调用（开发期换图用）。"""
    _resolve.cache_clear()
