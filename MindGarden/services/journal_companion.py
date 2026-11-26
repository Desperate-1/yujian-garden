# -*- coding: utf-8 -*-
"""树洞日记 · 小精灵陪伴

============================================================
 老师商讨的方向：用户写日记时，剧本疗愈里的角色可以走出来，
 在旁边陪一会儿、轻轻回应。

 谁来了陪：
   · 用户最近一次剧本疗愈里有角色 → 那个角色来（延续治疗的温度）
   · 从没做过剧本 / Mongo 没启动 → 默认小精灵「小栖」来

 回应时机由前端掌握（停笔 ~18 秒且写了够多新字），
 这里只负责「给一段草稿 → 回一句贴角色的话」。

 铁律：永远返回 ok+name+reply —— LLM 挂了就用兜底文案，
 小精灵不能因为接口故障就「死在桌上」。
============================================================
"""
import random
from typing import Any, Dict

# 默认小精灵：住在树洞边的「小栖」
DEFAULT_SPRITE = {
    'kind': 'sprite',
    'name': '小栖',
    'description': '住在树洞边的小精灵，圆圆的一小团，头上顶着片小叶子。'
                   '安静、温暖、特别会倾听，说话轻轻的。',
    'topic': '',
}

# LLM 故障时的兜底回应（也要像小栖说的话）
_FALLBACK_LINES = [
    '我在呢，你慢慢写，不急。',
    '写下来就好了一半啦。',
    '我帮你看着这片树洞，你安心写。',
    '嗯，我听到了。',
]

_RULES = (
    '【规则】\n'
    '1. 用户正在日记本上写字，写到一半停下来时，你轻声说一两句话。\n'
    '2. 每次回应 1-2 句短句，最多 60 字，像耳语一样轻。\n'
    '3. 以倾听和陪伴为主：多接住情绪，少给建议，不说教、不评判、不连续提问。\n'
    '4. 始终保持角色口吻和性格，绝不提自己是 AI、程序或模型。\n'
    '5. 不要复述用户写的内容，像朋友一样自然回应。\n'
    '6. 若内容流露出强烈的自伤、轻生或绝望信号：先温柔地表达心疼，'
    '再轻轻建议把这份沉重告诉身边信任的人或寻求专业帮助，语气绝不能像说教。'
)


def sprite_persona_for(user_id: int) -> Dict[str, Any]:
    """决定今天谁来陪写（优先级从高到低）：
    1. 用户亲手选定的治愈女巫（全局陪伴者，跟着 TA 走）
    2. 最近一次剧本疗愈里的第一个角色
    3. 默认小精灵「小栖」
    """
    try:
        from services.witch_portraits import get_companion
        comp = get_companion(user_id)
        if comp and comp.get('name'):
            return {'kind': 'companion', 'name': comp['name'],
                    'description': comp.get('description') or '用户亲手选的治愈女巫',
                    'topic': comp.get('topic', ''),
                    'portrait': comp.get('portrait', '')}
    except Exception:
        pass
    try:
        from services.therapy_crew import latest_scenario_roles
        sc = latest_scenario_roles(user_id)
    except Exception:
        sc = None
    if sc and sc.get('roles'):
        role = sc['roles'][0]
        return {'kind': 'script', 'name': role['name'],
                'description': role['description'], 'topic': sc.get('topic', '')}
    return dict(DEFAULT_SPRITE)


def _build_system(persona: Dict[str, Any]) -> str:
    kind = persona.get('kind')
    if kind == 'companion':
        who = (f"你是{persona['name']}，{persona['description']}。\n"
               "你是用户亲手选定、亲手「画」出来的治愈女巫，"
               "跟着 TA 从糖果小屋一路来到树洞日记。现在用户坐在书桌前写日记，"
               "你就趴在桌角陪着。你认得 TA，语气亲近自然。")
    elif kind == 'script':
        who = (f"你是{persona['name']}，{persona['description']}\n"
               f"你刚陪用户走完一段关于「{persona.get('topic', '心灵')}」的旅程，"
               f"现在用户坐在树洞前的书桌旁写日记，你陪在桌角。\n"
               f"可以偶尔轻轻提起你们一起经历过的故事，但不要每次都提。")
    else:
        who = (f"你是{persona['name']}，{persona['description']}\n"
               f"用户坐在树洞前的书桌旁写日记，你就趴在桌角陪着。")
    return who + '\n' + _RULES


def companion_reply(user_id: int, draft: str) -> Dict[str, Any]:
    """给一段日记草稿，回一句贴角色的陪伴语。永不抛异常。"""
    persona = sprite_persona_for(user_id)
    draft = (draft or '').strip()[-800:]   # 只带最近一段，省 token 也聚焦当下
    if not draft:
        return {'ok': False, 'name': persona['name'], 'reply': ''}

    reply = ''
    try:
        from services.ai_chat import get_deepseek_response
        reply = get_deepseek_response([
            {'role': 'system', 'content': _build_system(persona)},
            {'role': 'user', 'content': f'用户在日记里写道：\n{draft}'},
        ]) or ''
    except Exception as e:
        print(f'[小精灵陪伴] LLM 调用失败: {e}')

    reply = reply.strip()
    # get_deepseek_response 出错时会返回一句客套话，换掉，别让小精灵出戏
    if not reply or '无法回应' in reply or '稍后再试' in reply:
        reply = random.choice(_FALLBACK_LINES)
    return {'ok': True, 'name': persona['name'],
            'kind': persona.get('kind', 'sprite'), 'reply': reply}
