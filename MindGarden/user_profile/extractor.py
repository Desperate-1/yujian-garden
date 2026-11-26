"""画像增量提取：会话分批 + DeepSeek JSON 模式调用。

防超限设计：单次 LLM 调用输入 = 当前画像摘要（≤1500字）+ 一个对话批次（用户消息 ≤4000字），
无论会话多长都保持输入有界；每批提取的是相对当前画像的「增量」，逐批合并后画像始终完整。
"""
import datetime
import json
import re
import time

import requests

from config import Config
from user_profile.profile_db import compact_profile

# 允许的画像类别
FACETS = {"basic_info", "personality", "interests", "life_situation",
          "emotional_patterns", "communication_preferences"}

# 大五人格 key 归一化（提示词允许模型输出中文名，这里统一成英文 key）
BIG_FIVE_ALIASES = {
    "openness": "openness", "开放性": "openness", "开放": "openness",
    "conscientiousness": "conscientiousness", "尽责性": "conscientiousness", "尽责": "conscientiousness",
    "extraversion": "extraversion", "外向性": "extraversion", "外向": "extraversion",
    "agreeableness": "agreeableness", "宜人性": "agreeableness", "宜人": "agreeableness",
    "neuroticism": "neuroticism", "神经质": "neuroticism",
    "情绪易感性": "neuroticism", "情绪稳定性": "neuroticism", "情绪稳定": "neuroticism",
}
BIG_FIVE = set(BIG_FIVE_ALIASES.values())

EXTRACTION_SYSTEM_PROMPT = """你是一名专业的心理咨询师助理，负责从用户与AI心理陪伴助手的对话记录中提取"用户画像增量信息"。

任务要求：
1. 只提取本批对话中新出现、新确认或发生变化的用户信息（增量）。【用户当前画像摘要】中已存在且未变化的信息不要重复输出。
2. 只从「用户」的发言中提取，严禁把助手的发言当成用户特征（一旦混入将受到惩罚）。
3. facet 只能是以下之一：
   - basic_info：仅限身份类基础信息（昵称、年龄/学段、性别、所在地等）；健康状况与身体情况用 life_situation 的 key=health 表达
   - personality：性格特质（key 写大五人格之一：开放性/尽责性/外向性/宜人性/情绪易感性，value 用 1~5 打分，如 "2.5"）；也可写沟通风格标签（key 写 communication_style，value 如 "话少，习惯发短句"）
   - interests：兴趣爱好（key 为兴趣名，value 写程度描述，如 "非常喜欢"）
   - life_situation：身份职业（key=occupation）、关系（key=relationship，value 写 "关系类型：详情"，如 "家庭：与父母关系紧张"）、重要事件（key=key_event，value 写事件名，可带 impact 字段）、近期目标（key=goal，value 写目标，可带 status 字段：进行中/搁置/已完成）
   - emotional_patterns：情绪触发点（key=trigger，可带 reaction 字段）、应对方式（key=coping）、当前情绪状态（key=current_mood）
   - communication_preferences：用户对AI说话方式的明确要求（如"温柔一点""不要用列表""回复短一点"），非常重要，必须完整提取，key 写 request。注意：用户询问AI能力的问题（如"你最长能回复多少"）不是偏好，不要提取；含义相近的要求合并成一条，不要拆成多条
4. 每条信息包含：facet、key、value（尽量简短）、confidence（置信度0~1，按用户表达的明确程度打分）、salience（显著性1~10：这条信息对理解该用户有多重要）、evidence（引用用户原话作为证据，≤30字，1~2条）。
5. 时间锚定：对话中的相对时间（"上周""昨天""明年"）必须换算为绝对日期，以本批对话的时间戳为准。
6. 完整性清单：本批目标输出 5~15 条；对话涉及多个话题时，必须逐个话题检查，防止只提取第一个话题。
7. 不要编造对话中没有的信息；信息模糊时 confidence 给低分（<0.5）而不是不输出。
8. 严格按以下 JSON 格式输出（这是 JSON 输出模式）：
{"changes": [{"facet": "...", "key": "...", "value": "...", "confidence": 0.8, "salience": 7, "evidence": ["..."]}]}
若本批对话没有任何新信息，输出：{"changes": []}"""


def iter_chunks(session_doc, start_index=0):
    """把会话消息从 start_index 起按消息边界分批。

    每批用户消息累计字符 ≤ PROFILE_CHUNK_MAX_USER_CHARS 且消息条数 ≤ PROFILE_CHUNK_MAX_MESSAGES；
    助手消息不计入预算但随批保留（维持轮次上下文）。
    产出 (chunk_messages, end_index)，end_index 为该批最后一条消息在 messages 数组中的下标+1。
    """
    messages = session_doc.get("messages") or []
    chunk = []
    user_chars = 0
    i = start_index
    while i < len(messages):
        msg = messages[i]
        content = msg.get("content") or ""
        chunk.append(msg)
        if msg.get("role") == "user":
            user_chars += len(content)
        i += 1
        if user_chars >= Config.PROFILE_CHUNK_MAX_USER_CHARS or \
           len(chunk) >= Config.PROFILE_CHUNK_MAX_MESSAGES:
            yield list(chunk), i
            chunk = []
            user_chars = 0
    if chunk:
        yield list(chunk), i


def _fmt_ts(ts):
    """时间戳格式化为北京时间字符串（兼容 datetime 与字符串）"""
    if isinstance(ts, datetime.datetime):
        if ts.tzinfo is None:
            return ts.strftime("%Y-%m-%d %H:%M")
        return ts.astimezone(datetime.timezone(datetime.timedelta(hours=8))).strftime("%Y-%m-%d %H:%M")
    return str(ts)[:16]


def build_transcript(chunk_messages):
    """批次消息 -> 对话文本（含时间范围头，供相对时间锚定）"""
    lines = []
    ts_list = [m.get("timestamp") for m in chunk_messages if m.get("timestamp")]
    if ts_list:
        lines.append(f"（对话时间：{_fmt_ts(ts_list[0])} 至 {_fmt_ts(ts_list[-1])}，相对时间请以此锚定）")
    for msg in chunk_messages:
        role = "用户" if msg.get("role") == "user" else "助手"
        lines.append(f"{role}：{msg.get('content', '')}")
    return "\n".join(lines)


def _parse_json_content(content):
    """把模型返回文本解析成 dict：直接解析失败则剥 markdown 代码围栏，再失败用正则抠首个 {...} 块"""
    if not content or not content.strip():
        return None
    text = content.strip()
    try:
        data = json.loads(text)
        return data if isinstance(data, dict) else None
    except (json.JSONDecodeError, ValueError):
        pass
    # 剥掉 ```json ... ``` 围栏
    if text.startswith("```"):
        text = text.strip("`")
        text = text[4:].strip() if text.lower().startswith("json") else text
        text = text.rstrip("`").strip()
        try:
            data = json.loads(text)
            return data if isinstance(data, dict) else None
        except (json.JSONDecodeError, ValueError):
            pass
    # 最后手段：正则取第一个 { ... } 块
    m = re.search(r"\{.*\}", content, re.S)
    if m:
        try:
            data = json.loads(m.group(0))
            return data if isinstance(data, dict) else None
        except (json.JSONDecodeError, ValueError):
            pass
    return None


def call_deepseek_json(messages):
    """DeepSeek JSON 模式调用。返回 dict；空 content/坏 JSON 退避重试；仍失败降级普通文本再解析。

    不复用 services.ai_chat.get_deepseek_response：其 temperature=0.7 且异常被吞成道歉文本，
    提取需要结构化输出与明确的失败信号。
    """
    headers = {"Authorization": f"Bearer {Config.DEEPSEEK_API_KEY}",
               "Content-Type": "application/json"}
    base_payload = {
        "model": Config.PROFILE_EXTRACT_MODEL,
        "messages": messages,
        "temperature": Config.PROFILE_EXTRACT_TEMPERATURE,
        "max_tokens": Config.PROFILE_EXTRACT_MAX_TOKENS,
        # 关思维链必须是顶层字段（原生 REST 调用）；extra_body 是 OpenAI SDK 写法，REST 不识别。
        # 不关的话推理 token 会耗尽 max_tokens 导致 content 为空，且 temperature 不生效。
        "thinking": {"type": "disabled"},
    }

    def _post(payload):
        response = requests.post(Config.DEEPSEEK_ENDPOINT, headers=headers,
                                 data=json.dumps(payload), timeout=60)
        response.raise_for_status()
        return response.json()["choices"][0]["message"]

    # 第一轮：JSON 模式（DeepSeek 官方已知偶发空 content，退避后重试）
    payload = dict(base_payload)
    payload["response_format"] = {"type": "json_object"}
    for attempt in range(Config.PROFILE_EXTRACT_RETRIES + 1):
        try:
            msg = _post(payload)
            content = msg.get("content") or ""
            if not content.strip():
                hint = "（返回了reasoning_content）" if msg.get("reasoning_content") else ""
                print(f"画像提取警告: 空content{hint}(第{attempt + 1}次)")
                time.sleep(1 + attempt)  # 短暂退避
                continue
            data = _parse_json_content(content)
            if data is not None:
                return data
            print(f"画像提取警告: 内容无法解析为JSON(第{attempt + 1}次)")
        except Exception as e:
            print(f"画像提取失败(第{attempt + 1}次): {e}")
        time.sleep(1 + attempt)

    # 兜底：去掉 JSON 模式用普通文本请求一次，再手动解析
    print("画像提取: JSON模式持续失败，降级为普通文本请求")
    try:
        msg = _post(base_payload)
        return _parse_json_content(msg.get("content") or "")
    except Exception as e:
        print(f"画像提取降级请求也失败: {e}")
    return None


def _norm_evidence(raw):
    """证据归一化：字符串列表，每条 ≤30 字，最多 2 条"""
    if isinstance(raw, str):
        raw = [raw]
    if not isinstance(raw, list):
        return []
    out = []
    for e in raw:
        if isinstance(e, str) and e.strip():
            out.append(e.strip()[:30])
    return out[:2]


def _normalize_change(item):
    """校验并归一化单条 delta：非法则返回 None"""
    if not isinstance(item, dict):
        return None
    facet = str(item.get("facet", "")).strip()
    key = str(item.get("key", "")).strip()
    value = item.get("value")
    if facet not in FACETS or not key:
        return None
    if value is None or (isinstance(value, str) and not value.strip()):
        return None
    # 大五 key 中文别名归一化
    if facet == "personality" and key in BIG_FIVE_ALIASES:
        key = BIG_FIVE_ALIASES[key]
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        value = str(value)
    else:
        value = str(value).strip()[:100]
    try:
        confidence = float(item.get("confidence", 0.5))
    except (TypeError, ValueError):
        confidence = 0.5
    confidence = max(0.0, min(1.0, confidence))
    try:
        salience = int(float(item.get("salience", 5)))
    except (TypeError, ValueError):
        salience = 5
    salience = max(1, min(10, salience))
    change = {"facet": facet, "key": key, "value": value,
              "confidence": confidence, "salience": salience,
              "evidence": _norm_evidence(item.get("evidence"))}
    # 透传可选补充字段（status/impact/reaction/date）
    for extra in ("status", "impact", "reaction", "date"):
        if item.get(extra):
            change[extra] = str(item[extra]).strip()[:50]
    return change


def extract_delta(chunk_messages, profile):
    """对一个对话批次做增量提取。

    返回归一化的 changes 列表（可为空列表）；LLM 调用失败返回 None（由管线记 failed）。
    """
    transcript = build_transcript(chunk_messages)
    summary = compact_profile(profile)
    if not summary.strip():
        summary = "（暂无画像，请从头提取）"
    user_prompt = (f"【用户当前画像摘要】（仅用于避免重复提取）\n{summary}\n\n"
                   f"【本批对话记录】\n{transcript}\n\n"
                   f"请提取本批对话中的画像增量信息，输出 JSON。")
    data = call_deepseek_json([
        {"role": "system", "content": EXTRACTION_SYSTEM_PROMPT},
        {"role": "user", "content": user_prompt},
    ])
    if data is None:
        return None
    raw_changes = data.get("changes")
    if not isinstance(raw_changes, list):
        print(f"画像提取警告: changes 非列表: {str(data)[:100]}")
        return []
    changes = []
    for item in raw_changes:
        norm = _normalize_change(item)
        if norm:
            changes.append(norm)
    return changes
