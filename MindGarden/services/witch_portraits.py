# -*- coding: utf-8 -*-
"""剧本疗愈 · 治愈女巫立绘生成

============================================================
 用户在开局表格里写「我希望治愈我的女巫长什么样」，
 这里拿这个描述生成 3 张立绘供 TA 选一张。

 通道优先级：
   1. 腾讯云混元生图（约 33 秒/张，3 张并行 ≈ 40~60 秒）
   2. 本地 SD1.5（慢，2~4 分钟/张，仅在云端不可用且模型在时）
   3. 都不行 → 返回 ok=False，前端改用现有立绘做「老朋友三选一」

 生成图存到 static/candy/generated/，直接走 /static/ 提供给前端。
============================================================
"""
import os
import time
import threading
from io import BytesIO
from typing import Any, Dict, List, Optional

from config import Config

_GEN_DIR = os.path.normpath(os.path.join(
    os.path.dirname(os.path.abspath(__file__)), '..', 'static', 'candy', 'generated'))

# 三种美术风格对应的生图基调（与首页风格选择保持一致）
_STYLE_PROMPTS = {
    'cute':  '柔软甜暖的童话糖果风，粉色与奶油色调，毛绒绒的质感，圆滚滚的可爱造型',
    'fresh': '清新自然的田园风，薄荷绿与米白色调，点缀叶片与晨光，轻盈通透',
    'ugly':  '丑萌搞怪风，歪歪扭扭的丑萌小怪兽气质，大地色系，表情滑稽但眼神温柔善良',
}

# 三张候选各自的姿势/动作差异（同一个人设，三种神态）
_VARIANTS = [
    '微笑着张开双手打招呼',
    '举着一根发光的小魔法棒，俏皮地歪着头',
    '双手捧着一颗发光的小爱心，闭眼微笑',
]


def _build_prompt(look: str, style: str, variant: str) -> str:
    flavor = _STYLE_PROMPTS.get(style, _STYLE_PROMPTS['cute'])
    look_part = f'形象要求：{look}。' if look else '形象温暖亲切、让人一看就想亲近。'
    return ('治愈系儿童绘本插画，一位小女巫的全身角色立绘。'
            f'{flavor}。{variant}。{look_part}'
            '居中构图，角色占画面大部分，纯色浅色背景，柔和光线，'
            '精致细腻，适合心理健康疗愈应用的原创角色设计。')


def _save_image(img, user_id: int, idx: int) -> str:
    """存图到 static/candy/generated/，返回前端可用 URL。"""
    os.makedirs(_GEN_DIR, exist_ok=True)
    if img.mode != 'RGB':
        img = img.convert('RGB')
    img.thumbnail((900, 900))          # 立绘展示用不到 1024 原尺寸，省点体积
    name = f'witch_{int(user_id)}_{int(time.time())}_{idx}.png'
    path = os.path.join(_GEN_DIR, name)
    img.save(path, format='PNG')
    return f'/static/candy/generated/{name}'


def _gen_one_cloud(prompt: str) -> 'object':
    """云端出一张图，返回 PIL Image。异常向上抛。"""
    from services.ai_art import TencentImageClient
    client = TencentImageClient()
    if not client.available():
        raise RuntimeError('未配置 TENCENT_SECRET_ID / TENCENT_SECRET_KEY')
    submit = client.submit_text_to_image(prompt)
    resp = submit.get('Response', {}) or {}
    if 'Error' in resp:
        err = resp['Error']
        raise RuntimeError(f"提交生图失败：{err.get('Code')} {err.get('Message', '')[:100]}")
    job_id = resp.get('JobId')
    if not job_id:
        raise RuntimeError('提交生图失败：未返回 JobId')
    images = client.wait_for_image(job_id, max_wait=180, interval=4)
    raw = client.fetch_image_bytes(images[0])
    from PIL import Image
    return Image.open(BytesIO(raw))


def generate_witch_portraits(user_id: int, look: str, style: str = 'cute') -> Dict[str, Any]:
    """生成 3 张女巫立绘。返回 {'ok', 'portraits': [url,url,url], 'msg'}。

    部分成功也返回 ok=True（有几张给几张）；一张都没有才 ok=False。

    实测坑：腾讯混元生图账号级并发上限为 1 个任务（RequestLimitExceeded.JobNumExceed），
    3 张并行提交只有 1 张能挤进去。故改为串行生成 + 限流重试，全程约 40~60 秒。
    """
    look = (look or '').strip()[:200]
    style = style if style in _STYLE_PROMPTS else 'cute'
    prompts = [_build_prompt(look, style, v) for v in _VARIANTS]

    results: List[Optional[str]] = [None, None, None]
    errors: List[str] = []

    def _work(i: int):
        last: Optional[Exception] = None
        for attempt in range(3):
            try:
                img = _gen_one_cloud(prompts[i])
                results[i] = _save_image(img, user_id, i + 1)
                return
            except Exception as e:
                last = e
                # 限流类错误等一等再试；其他错误（参数/内容审核）重试无意义，直接放弃
                if 'RequestLimitExceeded' in str(e) or 'JobNumExceed' in str(e):
                    time.sleep(3 + attempt * 2)
                    continue
                break
        errors.append(f'第{i+1}张: {last}')

    for i in range(3):
        _work(i)

    if errors:
        print('[witch_portraits] 云端生图失败明细:', '；'.join(errors))
    portraits = [u for u in results if u]
    if portraits:
        return {'ok': True, 'portraits': portraits,
                'msg': 'ok' if len(portraits) == 3 else '部分生成成功'}
    return {'ok': False, 'portraits': [],
            'msg': '云端画室暂时打烊了，先看看老朋友吧'}


# ============================================================
#  当前治愈女巫（全局陪伴者）：选定的女巫跟着用户去日记/喷泉
# ------------------------------------------------------------
#  文件层存储：data/companion/<user_id>.json
#  {'name','description','portrait','scene_topic','ts'}
# ============================================================
_COMPANION_DIR = os.path.normpath(os.path.join(
    os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'companion'))


def set_companion(user_id: int, name: str, description: str = '',
                  portrait: str = '', topic: str = '') -> None:
    import json
    os.makedirs(_COMPANION_DIR, exist_ok=True)
    data = {'name': (name or '糖糖')[:30], 'description': (description or '')[:300],
            'portrait': portrait, 'topic': topic[:60], 'ts': time.time()}
    with open(os.path.join(_COMPANION_DIR, f'{int(user_id)}.json'), 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False)


def get_companion(user_id: int) -> Optional[Dict[str, Any]]:
    import json
    try:
        with open(os.path.join(_COMPANION_DIR, f'{int(user_id)}.json'), 'r', encoding='utf-8') as f:
            data = json.load(f)
        if data.get('name'):
            return data
    except (OSError, ValueError):
        pass
    return None
