"""确定性画像合并：把提取出的 delta changes 合并进全局画像。

规则（本地确定性，无 LLM 参与，可复现可审计）：
- 近因权重（Ebbinghaus 式）：w = max(0.1, 1/(1 + 衰减系数 × 距 last_seen 天数))
- 数值特质（大五 1~5 分）：置信度×近因加权平均；置信度 noisy-OR（上限 0.98）
- 标量同值：置信度 noisy-OR、证据去重追加；值冲突：置信度×显著性×近因 高者胜
  （旧值胜出时忽略新信息，避免把冲突证据挂到胜者名下）
- 列表条目按名称匹配；超上限淘汰 权重×显著性×近因 最低者
- 末尾剪枝：置信度<下限 且 显著性<4 且 过期>45天 的条目删除；communication_preferences 永不剪枝
"""
import datetime

from config import Config
from user_profile.extractor import BIG_FIVE, BIG_FIVE_ALIASES

# 可透传到列表条目的补充字段
_EXTRA_FIELDS = ("status", "impact", "reaction", "date")


def days_since(dt, now):
    """距今多少天（容忍 naive/aware 混用与字符串时间戳）"""
    if dt is None:
        return 99999.0
    if isinstance(dt, str):
        try:
            dt = datetime.datetime.fromisoformat(dt)
        except (TypeError, ValueError):
            return 0.0
    if dt.tzinfo is None:
        base = now.replace(tzinfo=None) if now.tzinfo is not None else now
        return (base - dt).total_seconds() / 86400.0
    if now.tzinfo is None:
        now2 = now.replace(tzinfo=dt.tzinfo)
        return (now2 - dt).total_seconds() / 86400.0
    return (now - dt).total_seconds() / 86400.0


def recency_weight(dt, now):
    """Ebbinghaus 式近因权重，范围 [0.1, 1.0]"""
    return max(0.1, 1.0 / (1.0 + Config.PROFILE_RECENCY_DECAY_PER_DAY * days_since(dt, now)))


def noisy_or(c1, c2):
    return min(0.98, 1 - (1 - c1) * (1 - c2))


def _new_record(value, change, session_id, now, **extra):
    rec = {"value": value,
           "confidence": change["confidence"],
           "salience": change["salience"],
           "evidence": list(change["evidence"]),
           "first_seen": now, "last_seen": now,
           "source_sessions": [session_id]}
    rec.update(extra)
    return rec


def _append_evidence(rec, new_evidence):
    """证据去重追加，保留最新 N 条"""
    seen = list(rec.get("evidence") or [])
    for e in new_evidence:
        if e not in seen:
            seen.append(e)
    rec["evidence"] = seen[-Config.PROFILE_MAX_EVIDENCE:]


def _append_session(rec, session_id):
    ss = list(rec.get("source_sessions") or [])
    if session_id not in ss:
        ss.append(session_id)
    rec["source_sessions"] = ss[-Config.PROFILE_MAX_SOURCE_SESSIONS:]


def _touch(rec, change, session_id, now):
    """同值确认/条目更新：置信度 noisy-OR、显著性取大、证据与会话追加、last_seen 刷新"""
    rec["confidence"] = noisy_or(float(rec.get("confidence", 0.5)), change["confidence"])
    rec["salience"] = max(rec.get("salience", 0), change["salience"])
    _append_evidence(rec, change["evidence"])
    _append_session(rec, session_id)
    rec["last_seen"] = now


def _merge_scalar(container, key, change, session_id, now):
    """标量合并：新键插入 / 同值确认 / 冲突取优。返回是否实际改动"""
    value = change["value"]
    old = container.get(key)
    if old is None:
        container[key] = _new_record(value, change, session_id, now)
        return True
    if str(old.get("value", "")) == str(value):
        _touch(old, change, session_id, now)
        return True
    # 冲突：置信度×显著性×近因 高者胜
    w_old = float(old.get("confidence", 0.5)) * old.get("salience", 0) * \
        recency_weight(old.get("last_seen"), now)
    w_new = change["confidence"] * change["salience"]
    if w_new > w_old:
        container[key] = _new_record(value, change, session_id, now)
        return True
    return False  # 旧值胜出，忽略新信息


def _merge_numeric_trait(container, key, change, session_id, now):
    """大五数值特质：置信度×近因加权平均"""
    old = container.get(key)
    try:
        v_new = float(change["value"])
    except (TypeError, ValueError):
        return False
    if old is None:
        container[key] = _new_record(v_new, change, session_id, now)
        return True
    try:
        v_old = float(old.get("value", 3.0))
    except (TypeError, ValueError):
        v_old = 3.0
    w_old = float(old.get("confidence", 0.5)) * recency_weight(old.get("last_seen"), now)
    w_new = change["confidence"]
    old["value"] = round((v_old * w_old + v_new * w_new) / (w_old + w_new), 1)
    _touch(old, change, session_id, now)
    return True


def _token_overlap_ratio(a, b):
    """jieba 词集重叠率（近重复条目识别：如"不要用诗意比喻" vs "不要用诗意、肉麻的比喻"）"""
    if not a or not b:
        return 0.0
    import jieba  # 懒加载
    ta = {w for w in jieba.lcut(a) if len(w) > 1}
    tb = {w for w in jieba.lcut(b) if len(w) > 1}
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / min(len(ta), len(tb))


def _merge_list_item(lst, match_key, change, session_id, now, fuzzy=False):
    """列表条目合并：按 match_key 匹配，命中则更新、未命中则追加。

    fuzzy=True 时（沟通偏好/沟通风格/情绪触发点）：完全匹配失败后，
    词集重叠率 ≥0.5 视为同一条目的更新（近重复去重）。返回 (是否有改动, 是否新条目)
    """
    value = change["value"]
    for item in lst:
        if str(item.get(match_key, "")) == str(value):
            for f in _EXTRA_FIELDS:
                if f in change:
                    item[f] = change[f]
            _touch(item, change, session_id, now)
            return True, False
    if fuzzy:
        best, best_ratio = None, 0.0
        for item in lst:
            ratio = _token_overlap_ratio(str(value), str(item.get(match_key, "")))
            if ratio > best_ratio:
                best, best_ratio = item, ratio
        if best is not None and best_ratio >= 0.5:
            for f in _EXTRA_FIELDS:
                if f in change:
                    best[f] = change[f]
            _touch(best, change, session_id, now)
            return True, False
    item = {match_key: value,
            "confidence": change["confidence"], "salience": change["salience"],
            "evidence": list(change["evidence"]),
            "first_seen": now, "last_seen": now,
            "source_sessions": [session_id]}
    for f in _EXTRA_FIELDS:
        if f in change:
            item[f] = change[f]
    lst.append(item)
    return True, True


def _interest_weight(value):
    """兴趣程度启发式 -> weight（程度副词判定，默认 0.7）"""
    if any(w in value for w in ("非常", "特别", "最", "痴迷", "超", "狂热")):
        return 0.9
    if any(w in value for w in ("比较", "有点", "偶尔", "一般")):
        return 0.5
    return 0.7


def _cap_list(lst, cap, now, weighted=False):
    """列表超上限时淘汰 (权重×显著性×近因) 最低者"""
    while len(lst) > cap:
        def score(item):
            w = item.get("weight", 0.5) if weighted else 1.0
            return w * item.get("salience", 0) * recency_weight(item.get("last_seen"), now)
        loser = min(lst, key=score)
        lst.remove(loser)


def _merge_relationship(life, change, session_id, now):
    """关系类：value 形如 "家庭：与父母关系紧张"，按冒号前的关系类型匹配"""
    raw = str(change["value"])
    rel_type, _, detail = raw.partition("：")
    rel_type = rel_type.strip()[:20]
    detail = detail.strip()[:80] if detail.strip() else rel_type
    if not rel_type:
        return False
    lst = life.setdefault("relationships", [])
    for item in lst:
        if str(item.get("relation", "")) == rel_type:
            if detail != rel_type:
                item["value"] = detail
            _touch(item, change, session_id, now)
            return True
    item = {"relation": rel_type, "value": detail,
            "confidence": change["confidence"], "salience": change["salience"],
            "evidence": list(change["evidence"]),
            "first_seen": now, "last_seen": now,
            "source_sessions": [session_id]}
    lst.append(item)
    return True


def apply_change(profile, change, session_id, now):
    """把单条 delta 合并进画像。返回是否实际改动"""
    facet = change["facet"]
    key = change["key"]
    changed = False

    if facet == "basic_info":
        changed = _merge_scalar(profile.setdefault("basic_info", {}), key, change, session_id, now)

    elif facet == "personality":
        pers = profile.setdefault("personality", {})
        trait_key = BIG_FIVE_ALIASES.get(key, key)  # 中文别名归一化（如"神经质"->neuroticism）
        if trait_key in BIG_FIVE:
            changed = _merge_numeric_trait(pers, trait_key, change, session_id, now)
        else:  # 沟通风格标签 -> communication_style 列表
            changed, _ = _merge_list_item(pers.setdefault("communication_style", []),
                                          "value", change, session_id, now, fuzzy=True)
            _cap_list(pers["communication_style"], Config.PROFILE_MAX_LIST_ITEMS, now)

    elif facet == "interests":
        # 提示词约定：key 为兴趣名，value 为程度描述（如"非常喜欢"）
        interests = profile.setdefault("interests", [])
        name = change["key"]
        degree = change["value"]
        c = dict(change)
        c["value"] = name
        changed, is_new = _merge_list_item(interests, "name", c, session_id, now)
        # 兴趣程度启发式更新 weight（新条目设置；已存在条目取大）
        target = next((i for i in interests if i.get("name") == name), None)
        if target is not None:
            w = _interest_weight(degree)
            if is_new or w > target.get("weight", 0):
                target["weight"] = w
            if is_new:
                target["degree"] = degree
        _cap_list(interests, Config.PROFILE_MAX_INTERESTS, now, weighted=True)

    elif facet == "life_situation":
        life = profile.setdefault("life_situation", {})
        if key == "occupation":
            changed = _merge_scalar(life, "occupation", change, session_id, now)
        elif key == "relationship":
            changed = _merge_relationship(life, change, session_id, now)
            _cap_list(life.setdefault("relationships", []), Config.PROFILE_MAX_LIST_ITEMS, now)
        elif key == "goal":
            changed, _ = _merge_list_item(life.setdefault("goals", []), "goal", change, session_id, now)
            _cap_list(life["goals"], Config.PROFILE_MAX_LIST_ITEMS, now)
        elif key == "key_event":
            changed, _ = _merge_list_item(life.setdefault("key_events", []), "event", change, session_id, now)
            _cap_list(life["key_events"], Config.PROFILE_MAX_LIST_ITEMS, now)
        else:
            changed = _merge_scalar(life, key, change, session_id, now)

    elif facet == "emotional_patterns":
        emo = profile.setdefault("emotional_patterns", {})
        if key == "trigger":
            changed, _ = _merge_list_item(emo.setdefault("triggers", []), "trigger", change, session_id, now, fuzzy=True)
            _cap_list(emo["triggers"], Config.PROFILE_MAX_LIST_ITEMS, now)
        elif key == "coping":
            changed, _ = _merge_list_item(emo.setdefault("coping", []), "strategy", change, session_id, now)
            _cap_list(emo["coping"], Config.PROFILE_MAX_LIST_ITEMS, now)
        else:
            changed = _merge_scalar(emo, key, change, session_id, now)

    elif facet == "communication_preferences":
        prefs = profile.setdefault("communication_preferences", [])
        changed, _ = _merge_list_item(prefs, "request", change, session_id, now, fuzzy=True)
        _cap_list(prefs, Config.PROFILE_MAX_LIST_ITEMS, now)  # 仅限条数，永不剪枝

    return changed


def _stale_low(rec, now):
    """是否满足剪枝条件：置信度低 + 显著性低 + 长期未出现"""
    return (rec.get("confidence", 1.0) < Config.PROFILE_CONFIDENCE_FLOOR and
            rec.get("salience", 10) < 4 and
            days_since(rec.get("last_seen"), now) > Config.PROFILE_PRUNE_DAYS)


def prune(profile, now):
    """剪枝：删除过期且低价值条目。communication_preferences 永不剪枝"""
    basic = profile.get("basic_info") or {}
    for k in list(basic.keys()):
        if _stale_low(basic[k], now):
            del basic[k]

    pers = profile.get("personality") or {}
    for k in list(pers.keys()):
        rec = pers[k]
        if isinstance(rec, dict) and _stale_low(rec, now):
            del pers[k]

    life = profile.get("life_situation") or {}
    for k in list(life.keys()):
        rec = life[k]
        if isinstance(rec, dict) and not isinstance(rec.get("value"), list) and \
           "relation" not in rec and _stale_low(rec, now):
            del life[k]
        elif isinstance(rec, list):
            life[k] = [i for i in rec if not _stale_low(i, now)]

    emo = profile.get("emotional_patterns") or {}
    for k in list(emo.keys()):
        rec = emo[k]
        if isinstance(rec, dict) and _stale_low(rec, now):
            del emo[k]
        elif isinstance(rec, list):
            emo[k] = [i for i in rec if not _stale_low(i, now)]

    interests = profile.get("interests") or []
    profile["interests"] = [i for i in interests
                            if not (_stale_low(i, now) or i.get("weight", 1.0) < 0.25)]


def merge_delta(profile, changes, session_id, now):
    """合并一批 delta 到画像（原地修改）。返回实际生效的条数"""
    applied = 0
    for change in changes:
        try:
            if apply_change(profile, change, session_id, now):
                applied += 1
        except Exception as e:
            print(f"合并单条失败 {change}: {e}")
    prune(profile, now)
    if applied:
        profile["version"] = profile.get("version", 0) + 1
        profile["updated_at"] = now
    return applied
