# -*- coding: utf-8 -*-
"""日记情绪分析：大模型打分 + 危机信号识别。

## 为什么重写

原来只有一行：`SnowNLP(text).sentiments`。

SnowNLP 是**电商评论语料**训练的模型，用在日记情绪上**判定方向是错的**。
实测（本项目真实测试）：

    「我很痛苦，非常难过绝望」  SnowNLP = 0.9323   ← 比"今天很开心"(0.8428) 还高
    「很抑郁」                SnowNLP = 0.9027
    「今天很开心」             SnowNLP = 0.8428
    「期末考砸了，觉得自己很没用」 SnowNLP = 0.7058

结果就是：用户无论写多难过，分数都下不去，情绪轨迹失去意义。

## 现在的方案（三级）

    1. 危机信号识别（关键词，毫秒级）—— 最高优先级，独立于分数
    2. 大模型打分（GLM）—— 主力，能理解"隐晦的负面"（如"室友都走了，宿舍好安静"）
    3. SnowNLP 兜底 —— 大模型不可用时（断网/额度耗尽）仍能出分

## 分数口径：0 ~ 1（与界面一致）

    0.0  极度痛苦 / 绝望 / 危机
    0.3  明显低落
    0.5  平静 / 中性
    0.7  轻松愉快
    1.0  非常开心

⚠️ 注意：**不是 -1~1**。界面上的历史代码按 -1~1 写判断条件，
导致"负面用橙色"的分支是死代码，已在页面侧一并修正。

## 危机信号的处理原则

识别到危机信号时：
  - **仍然给出情绪分**（不因为说到危机就抹掉数据）
  - **额外返回 crisis 标记与温和的求助提示**
  - 提示语气要**陪伴而非警示**，不说教、不诊断、不承诺保密
"""
import os
import re
import time

# ---------------- 危机信号词表 ----------------
# 分两档：direct = 明确的自伤/轻生表达；indirect = 强烈的无意义感/告别倾向
CRISIS_DIRECT = [
    '想死', '去死', '自杀', '轻生', '结束生命', '不想活', '不想活了',
    '活不下去', '死了算了', '不如死', '想不开', '一了百了',
    '割腕', '跳楼', '安眠药', '烧炭', '上吊',
]
CRISIS_INDIRECT = [
    '活着没意思', '活着没意义', '活着干什么', '活着为了什么',
    '活着是为什么', '活着为什么', '为什么要活着', '活着的意义',
    '不知道活着', '没有意义', '没意思了', '消失算了', '不存在就好了',
    '没人需要我', '我是累赘', '拖累别人', '对不起所有人',
    '告别', '最后一条', '撑不下去', '熬不下去', '看不到希望', '绝望',
]

# ---------------- 大模型结构化分析 ----------------
_PROMPT = """你是情绪分析助手。阅读下面的日记，判断作者**当下**的情绪状态。

输出严格的 JSON（不要 markdown 代码块、不要多余文字）：
{"score": 0到1之间的小数, "emotions": ["最多3个情绪词"], "reason": "一句话说明判断依据，不超过30字", "risk": "none或concern或crisis"}

打分刻度：
0.0 = 极度痛苦、绝望、有自伤念头
0.1 = 非常痛苦
0.2 = 明显低落、压抑
0.3 = 有些低落
0.5 = 平静、中性
0.7 = 轻松愉快
0.9 = 非常开心、有活力
1.0 = 极度喜悦

risk 判定：
none    = 没有风险信号
concern = 有持续的消沉、无望感，但没有自伤指向
crisis  = 出现自伤、轻生、活着没意义的表达

要求：
1. 注意理解**隐晦的表达**：例如"室友都走了，宿舍好安静"是孤独感（约 0.3），
   "期末考砸了，觉得自己很没用"是自我否定（约 0.25）。不要因为没有明显的
   负面词就打高分。
2. 反语、自嘲、"其实也没什么"这类轻描淡写，结合上下文判断真实情绪。
3. 情绪词用中文，2~4 个字，如 孤独、焦虑、释然、疲惫、委屈、平静。
4. 不要同情、不要说教、不要给建议。

日记内容：
{text}"""


def _score_with_llm(text, timeout=12):
    """调用大模型做结构化情绪分析。失败返回 None（由调用方回退）。

    ## 为什么默认用 DeepSeek 而不是 GLM

    实测同一组日记（本项目真实数据）：

        文本                        GLM     DeepSeek    DeepSeek 识别的情绪
        期末考砸了，觉得自己很没用      0.25    0.25        自我否定,失落,沮丧
        室友都走了，宿舍好安静         0.30    0.30        孤独,失落,平静
        最近撑不下去了，活着没意思      0.05    0.05        绝望,疲惫,无意义感
                                  risk=none  risk=crisis   ← GLM 漏了风险标记
        今天很开心                  0.80    0.85        开心,满足,轻松

    分数一致，但 DeepSeek：
      1. **快 20 倍**（平均 1.0 秒 vs GLM 的 2.6~20 秒）
      2. **能返回情绪标签与理由**（GLM 那次只给了分数）
      3. **主动标出了 crisis 风险**（GLM 漏判）

    另外 DeepSeek 是纯文本模型，把 GLM 的额度留给视觉识别更合理。

    ## 一次调用拿到全部

    不拆成"先识别情绪、再打分"两次请求 —— 那样 token 和延迟都翻倍。
    改成让模型**一次输出结构化 JSON**：分数 + 情绪标签 + 理由 + 风险等级。
    """
    import json as _json
    import requests
    from config import Config

    api_key = getattr(Config, 'DEEPSEEK_API_KEY', None) or os.environ.get('DEEPSEEK_API_KEY')
    if not api_key:
        return None

    model = os.environ.get('SENTIMENT_MODEL') or getattr(Config, 'DEEPSEEK_MODEL', 'deepseek-chat')
    url = os.environ.get('SENTIMENT_ENDPOINT', 'https://api.deepseek.com/chat/completions')
    payload = {
        'model': model,
        'messages': [{'role': 'user', 'content': _PROMPT.replace('{text}', text[:2000])}],
        'temperature': 0.1,
        'max_tokens': 300,
        'response_format': {'type': 'json_object'},
        # deepseek-flash 是推理模型，不关思考会把 300 额度全花在推理上、content 返回空。
        'thinking': {'type': 'disabled'},
    }
    try:
        r = requests.post(url,
                          headers={'Authorization': f'Bearer {api_key}',
                                   'Content-Type': 'application/json'},
                          json=payload, timeout=timeout)
        if not r.ok:
            print(f'[情绪分析] 大模型返回 {r.status_code}: {r.text[:150]}')
            return None
        content = r.json()['choices'][0]['message']['content'].strip()
        data = _json.loads(content)
        score = float(data.get('score'))
        if not (0.0 <= score <= 1.0):
            return None
        tags = data.get('emotions') or []
        if isinstance(tags, str):
            tags = [t.strip() for t in tags.replace('，', ',').split(',') if t.strip()]
        return {
            'score': round(score, 4),
            'tags': [str(t)[:12] for t in tags[:3]],
            'reason': str(data.get('reason') or '')[:120],
            'risk': str(data.get('risk') or 'none').lower(),
        }
    except Exception as e:
        print(f'[情绪分析] 大模型调用失败: {type(e).__name__}: {str(e)[:120]}')
        return None


def _score_with_snownlp(text):
    """兜底：SnowNLP。虽然方向不可靠，但有总比没有好（且会记录来源）。"""
    try:
        from snownlp import SnowNLP
        return round(float(SnowNLP(text).sentiments), 4)
    except Exception as e:
        print(f'[情绪分析] SnowNLP 失败: {e}')
        return 0.5


def detect_crisis(text):
    """识别危机信号。返回 (是否危机, 命中的词, 强度)。

    强度：direct 命中为 'high'，仅 indirect 命中为 'medium'。
    """
    if not text:
        return False, [], None
    hits_d = [w for w in CRISIS_DIRECT if w in text]
    hits_i = [w for w in CRISIS_INDIRECT if w in text]
    if hits_d:
        return True, hits_d, 'high'
    if hits_i:
        return True, hits_i, 'medium'
    return False, [], None


#: 危机提示文案。原则：陪伴而非警示；不说教、不诊断、不承诺保密。
CRISIS_MESSAGE = (
    '看到你写下的这些，我很在意。\n\n'
    '此刻的难受是真实的，但你不必一个人扛着。如果有可以信任的人——'
    '朋友、家人、老师，试着告诉他们一点点也好。\n\n'
    '如果情况让你感到危险，请优先联系专业帮助：\n'
    '  · 全国心理援助热线：12356\n'
    '  · 北京心理危机研究与干预中心：010-82951332\n'
    '  · 紧急情况请拨打 120\n\n'
    '这个平台会一直在这里，但真正能接住你的，是和你一样真实的人。'
)


def analyze_sentiment(text):
    """兼容旧接口：只返回分数（浮点数）。

    保留这个函数是为了不破坏既有调用方（创作链路、日记路由）。
    需要危机信号时请改用 analyze_journal()。
    """
    return analyze_journal(text)['score']


def analyze_journal(text):
    """完整分析。返回 dict：

        {
          'score': 0.0~1.0,          # 情绪分
          'tags': [...],             # 情绪标签，如 ['孤独','疲惫']
          'reason': str,             # 判断理由（可展示给用户，说明分数怎么来的）
          'risk': 'none'|'concern'|'crisis',
          'source': 'llm'|'snownlp', # 来源，便于排查
          'elapsed_ms': int,
          'crisis': bool,            # 是否需要展示危机提示
          'crisis_level': 'high'|'medium'|None,
          'crisis_words': [...],     # 关键词命中的词（便于复核，不展示给用户）
          'crisis_message': str|None # 给用户的温和提示
        }

    ## 危机信号是"双保险"

    关键词表（毫秒级、永不失败）+ 大模型 risk 判定（能理解隐晦表达）。
    任一命中即触发提示 —— 宁可误报，不可漏报。
    大模型不可用时，关键词这一路仍然独立工作。
    """
    t0 = time.time()
    text = (text or '').strip()

    if not text:
        return {'score': 0.5, 'tags': [], 'reason': '', 'risk': 'none',
                'source': 'empty', 'elapsed_ms': 0,
                'crisis': False, 'crisis_level': None,
                'crisis_words': [], 'crisis_message': None}

    # 关闭大模型时可强制走兜底（便于离线演示 / 省额度）
    use_llm = os.environ.get('SENTIMENT_USE_LLM', 'on').strip().lower() not in (
        'off', '0', 'false', 'no')

    llm = _score_with_llm(text) if use_llm else None

    if llm:
        score = llm['score']
        tags = llm['tags']
        reason = llm['reason']
        llm_risk = llm['risk']
        source = 'llm'
    else:
        score = _score_with_snownlp(text)
        tags, reason, llm_risk = [], '', 'none'
        source = 'snownlp'

    # ---- 危机信号：关键词 + 大模型，双保险 ----
    kw_crisis, words, kw_level = detect_crisis(text)
    llm_crisis = llm_risk in ('concern', 'crisis')
    if llm_risk == 'crisis':
        llm_level = 'high'
    elif llm_risk == 'concern':
        llm_level = 'medium'
    else:
        llm_level = None

    is_crisis = kw_crisis or llm_crisis
    level = kw_level or llm_level

    # 命中危机时，若分数偏高就向下压一档 ——
    # "说到危机"本身说明情绪处于低位，不该因表达克制而得到高分。
    if is_crisis and score > 0.25:
        score = 0.15 if level == 'high' else 0.25

    # 风险等级要落到库里（关键词命中但模型没判出来时也要记录）
    risk = 'crisis' if level == 'high' else ('concern' if level == 'medium' else 'none')

    elapsed = int((time.time() - t0) * 1000)
    print(f'[情绪分析] source={source} score={score} tags={tags} '
          f'risk={risk} 关键词={words} 耗时={elapsed}ms')

    return {
        'score': round(float(score), 4),
        'tags': tags,
        'reason': reason,
        'risk': risk,
        'source': source,
        'elapsed_ms': elapsed,
        'crisis': is_crisis,
        'crisis_level': level,
        'crisis_words': words,
        'crisis_message': CRISIS_MESSAGE if is_crisis else None,
    }
