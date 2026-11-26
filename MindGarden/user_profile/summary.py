"""注入用精选摘要生成：从画像中筛选条目，组装成 system 消息。

排序策略：先按优先级分级（P0 沟通偏好 > P1 近期目标/情绪/事件 > P2 性格/基本信息 > P3 兴趣/应对），
类内先看与当前消息的话题重叠（jieba 词集交集），再看「显著性×新鲜度×置信度」综合分。
字符预算 PROFILE_MAX_INJECT_CHARS 内尽量多塞高优先级条目。
词集缓存以 (user_id, profile_version) 为键，画像每次合并 version+1 自动失效。
"""
from config import Config
from models.mongo_db import get_beijing_time
from user_profile.merge import days_since, recency_weight
from user_profile.profile_db import load_profile

TRAIT_LABELS = {
    "openness": "开放性", "conscientiousness": "尽责性",
    "extraversion": "外向性", "agreeableness": "宜人性",
    "neuroticism": "情绪易感性",
}

_STOPWORDS = {"的", "了", "吗", "呢", "吧", "啊", "呀", "是", "我", "你", "他", "她", "它",
              "我们", "你们", "他们", "她们", "这", "那", "这个", "那个", "一个", "就是",
              "不是", "但是", "可是", "因为", "所以", "然后", "还是", "还有", "觉得",
              "有点", "可能", "应该", "可以", "什么", "怎么", "为什么", "时候", "现在",
              "今天", "昨天", "明天", "真的", "非常", "比较", "一直", "已经", "没有"}

_ATTR_CACHE = {}  # user_id -> (version, [candidate dicts])


def _tokenize(text):
    """jieba 分词 -> 词集（长度>1 且非停用词）。jieba 首次加载较慢，按需导入"""
    import jieba
    words = jieba.lcut(text or "")
    return {w for w in words if len(w) > 1 and w not in _STOPWORDS}


def _cand(prio, line, tokens, score):
    return {"prio": prio, "line": line, "tokens": tokens, "score": score}


def _score(rec):
    """综合分：显著性 × (0.5 + 近因权重) × 置信度"""
    now = get_beijing_time()
    conf = float(rec.get("confidence", 0.5))
    sal = float(rec.get("salience", 5))
    return sal * (0.5 + recency_weight(rec.get("last_seen"), now)) * conf


def _profile_to_candidates(profile):
    """画像 -> 候选注入行列表（未排序，携带优先级与话题词集）"""
    now = get_beijing_time()
    cands = []

    # P0：沟通偏好（无条件注入，最高优先级）
    for p in profile.get("communication_preferences") or []:
        req = str(p.get("request", "")).strip()
        if req:
            cands.append(_cand(0, f"- 沟通偏好：{req}", _tokenize(req), _score(p)))

    life = profile.get("life_situation") or {}

    # P1：近期目标 / 当前情绪 / 30天内重要事件与触发点
    for g in (life.get("goals") or []):
        goal = str(g.get("goal", "")).strip()
        if goal:
            status = g.get("status")
            text = f"{goal}（{status}）" if status else goal
            cands.append(_cand(1, f"- 近期目标：{text}", _tokenize(text), _score(g)))
    mood = (profile.get("emotional_patterns") or {}).get("current_mood")
    if mood:
        val = str(mood.get("value", "")).strip()
        if val:
            cands.append(_cand(1, f"- 当前情绪：{val}", _tokenize(val), _score(mood)))
    for ev in (life.get("key_events") or []):
        if days_since(ev.get("last_seen"), now) <= 30:
            event = str(ev.get("event", "")).strip()
            impact = ev.get("impact")
            text = f"{event}（{impact}）" if impact else event
            cands.append(_cand(1, f"- 近期事件：{text}", _tokenize(text), _score(ev)))
    for t in ((profile.get("emotional_patterns") or {}).get("triggers") or []):
        if days_since(t.get("last_seen"), now) <= 45:
            trig = str(t.get("trigger", "")).strip()
            reaction = t.get("reaction")
            text = f"{trig}（{reaction}）" if reaction else trig
            cands.append(_cand(1, f"- 情绪触发点：{text}", _tokenize(text), _score(t)))

    # P2：性格特质（极端特质优先，取前3合并一行）/ 沟通风格 / 基本信息 / 近期关系
    pers = profile.get("personality") or {}
    traits = []
    for k, rec in pers.items():
        if k == "communication_style" or not isinstance(rec, dict):
            continue
        try:
            v = float(rec.get("value", 3.0))
        except (TypeError, ValueError):
            continue
        conf = float(rec.get("confidence", 0.5))
        traits.append((conf * abs(v - 3.0), k, rec, v))
    traits.sort(key=lambda x: -x[0])
    if traits:
        parts = []
        tokens = set()
        for _, k, rec, v in traits[:3]:
            label = rec.get("label") or TRAIT_LABELS.get(k, k)
            parts.append(f"{label}({v:.1f}/5)")
            tokens |= _tokenize(label)
        line = "- 性格特点：" + "、".join(parts)
        score = max(_score(rec) for _, _, rec, _ in traits[:3])
        cands.append(_cand(2, line, tokens, score))
    for cs in (pers.get("communication_style") or [])[:1]:
        val = str(cs.get("value", "")).strip()
        if val:
            cands.append(_cand(2, f"- 沟通风格：{val}", _tokenize(val), _score(cs)))
    basic = profile.get("basic_info") or {}
    for key in ("age_group", "occupation"):
        rec = basic.get(key)
        if rec:
            val = str(rec.get("value", "")).strip()
            if val:
                cands.append(_cand(2, f"- 基本信息：{val}", _tokenize(val), _score(rec)))
    for rel in (life.get("relationships") or [])[:2]:
        if days_since(rel.get("last_seen"), now) <= 60:
            rtype = str(rel.get("relation", "")).strip()
            detail = str(rel.get("value", "")).strip()
            if rtype:
                text = f"{rtype}：{detail}" if detail and detail != rtype else rtype
                cands.append(_cand(2, f"- 关系：{text}", _tokenize(text), _score(rel)))

    # P3：兴趣（weight×显著性×近因 排序取前5）/ 应对方式
    interests = sorted(profile.get("interests") or [],
                       key=lambda i: -_score(i) * float(i.get("weight", 0.7)))
    if interests:
        names = [str(i.get("name", "")).strip() for i in interests[:5]]
        names = [n for n in names if n]
        if names:
            line = "- 兴趣爱好：" + "、".join(names)
            tokens = set()
            for n in names:
                tokens |= _tokenize(n)
            score = max(_score(i) for i in interests[:5])
            cands.append(_cand(3, line, tokens, score))
    coping = [str(c.get("strategy", "")).strip()
              for c in ((profile.get("emotional_patterns") or {}).get("coping") or [])]
    coping = [c for c in coping if c]
    if coping:
        line = "- 应对方式：" + "、".join(coping[:3])
        cands.append(_cand(3, line, _tokenize(line),
                           max(_score(c) for c in
                               ((profile.get("emotional_patterns") or {}).get("coping") or [])
                               if c.get("strategy"))))
    return cands


def build_profile_summary(user_id, session_id, user_message):
    """构建注入用 system 消息。返回 {'role':'system','content':...} 或 None（未启用/无画像）"""
    if not Config.PROFILE_ENABLED:
        return None
    profile = load_profile(user_id)
    if not profile or profile.get("version", 0) <= 0:
        return None

    # 词集缓存：画像版本变化自动失效
    version = profile["version"]
    cached = _ATTR_CACHE.get(user_id)
    if cached and cached[0] == version:
        cands = cached[1]
    else:
        cands = _profile_to_candidates(profile)
        _ATTR_CACHE[user_id] = (version, cands)

    msg_tokens = _tokenize(user_message)
    header = "【用户画像（仅供参考，请自然融入对话，不要直接提及画像内容）】"
    budget = Config.PROFILE_MAX_INJECT_CHARS - len(header)

    # 类内排序：(-话题重叠数, -综合分)
    def sort_key(c):
        overlap = len(c["tokens"] & msg_tokens)
        return (c["prio"], -overlap, -c["score"])

    lines = []
    used = 0
    for c in sorted(cands, key=sort_key):
        if used + len(c["line"]) > budget:
            if used == 0:  # 预算连一条都放不下：截断首条
                lines.append(c["line"][:budget - 1] + "…")
            break
        lines.append(c["line"])
        used += len(c["line"])
    if not lines:
        return None
    return {"role": "system", "content": header + "\n" + "\n".join(lines)}
