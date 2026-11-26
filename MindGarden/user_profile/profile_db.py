"""用户画像存储层：user_profiles / profile_events 两个集合的读写。

- user_profiles：每用户一个文档，_id = MySQL user_id（int）
- profile_events：每个（用户, 会话）一个文档，_id = "{user_id}:{session_id}"，记录处理状态与进度，
  支持幂等与断点续跑（last_processed_message_index 之后的消息为新增，下次只处理新消息）
"""
import datetime

from models.mongo_db import mongo, get_beijing_time


def get_profile_collection():
    """用户画像集合（惰性创建）"""
    return mongo.db.user_profiles


def get_events_collection():
    """画像处理事件集合（惰性创建）"""
    return mongo.db.profile_events


def ensure_indexes():
    """建立查询索引（幂等，可重复调用）"""
    get_events_collection().create_index([("user_id", 1), ("status", 1)])


def new_empty_profile(user_id, now=None):
    """空画像骨架。now 默认为当前北京时间"""
    if now is None:
        now = get_beijing_time()
    return {
        "_id": int(user_id),
        "version": 0,
        "created_at": now,
        "updated_at": now,
        "processed_session_count": 0,
        "basic_info": {},
        "personality": {"communication_style": []},
        "interests": [],
        "life_situation": {"relationships": [], "key_events": [], "goals": []},
        "emotional_patterns": {"triggers": [], "coping": []},
        "communication_preferences": [],
    }


def load_profile(user_id):
    """读取用户画像，无则返回 None"""
    return get_profile_collection().find_one({"_id": int(user_id)})


def save_profile(profile):
    """整文档覆盖保存（read-modify-write 由 pipeline 的 per-user 锁保证安全）"""
    get_profile_collection().replace_one({"_id": profile["_id"]}, profile, upsert=True)


def load_event(user_id, session_id):
    """读取会话的处理事件，无则返回 None"""
    return get_events_collection().find_one({"_id": f"{user_id}:{session_id}"})


def mark_event(user_id, session_id, status, **fields):
    """记录/更新处理事件。started_at 仅在首次创建时写入"""
    events = get_events_collection()
    now = get_beijing_time()
    event_id = f"{user_id}:{session_id}"
    existing = events.find_one({"_id": event_id})
    doc = {"_id": event_id, "user_id": int(user_id), "session_id": session_id,
           "status": status, "finished_at": now}
    if existing:
        doc["started_at"] = existing.get("started_at", now)
    else:
        doc["started_at"] = now
    doc.update(fields)
    events.replace_one({"_id": event_id}, doc, upsert=True)


def delete_user_data(user_id):
    """删除某用户的画像与全部处理事件（重建用）"""
    get_profile_collection().delete_many({"_id": int(user_id)})
    get_events_collection().delete_many({"user_id": int(user_id)})


def reset_all():
    """清空全部画像与事件（回填 --reset 用）"""
    get_profile_collection().delete_many({})
    get_events_collection().delete_many({})


def _fmt_line(label, record):
    """标量记录 -> "标签=值" 短行"""
    return f"{label}={record.get('value', '')}"


def _fmt_item(prefix, item, key_field):
    """列表条目 -> "前缀值" 短行（值后带括号补充信息）"""
    val = str(item.get(key_field, ""))
    extra = item.get("status") or item.get("impact") or item.get("reaction")
    if extra:
        val = f"{val}({extra})"
    return f"{prefix}{val}"


def compact_profile(profile, max_chars=None):
    """把画像压成纯文本摘要，供提取提示词使用（避免重复提取已知信息）。

    按对提取去重的价值排序 facet：沟通偏好 > 基本信息 > 生活状况 > 情绪模式 > 性格 > 兴趣。
    """
    from config import Config
    if max_chars is None:
        max_chars = Config.PROFILE_COMPACT_SUMMARY_CHARS
    lines = []

    prefs = profile.get("communication_preferences") or []
    for p in prefs:
        lines.append(f"沟通偏好: {p.get('request', '')}")

    basic = profile.get("basic_info") or {}
    for k, rec in basic.items():
        lines.append(_fmt_line(f"基本信息.{k}", rec))

    life = profile.get("life_situation") or {}
    occ = life.get("occupation")
    if occ:
        lines.append(_fmt_line("身份", occ))
    for rel in (life.get("relationships") or []):
        lines.append(f"关系: {rel.get('relation', '')}={rel.get('value', '')}")
    for g in (life.get("goals") or []):
        lines.append(_fmt_item("目标: ", g, "goal"))
    for ev in (life.get("key_events") or []):
        lines.append(_fmt_item("重要事件: ", ev, "event"))

    emo = profile.get("emotional_patterns") or {}
    mood = emo.get("current_mood")
    if mood:
        lines.append(_fmt_line("当前情绪", mood))
    for t in (emo.get("triggers") or []):
        lines.append(_fmt_item("情绪触发点: ", t, "trigger"))
    for c in (emo.get("coping") or []):
        lines.append(_fmt_item("应对方式: ", c, "strategy"))

    pers = profile.get("personality") or {}
    for k, rec in pers.items():
        if k == "communication_style":
            continue
        label = rec.get("label") or k
        lines.append(f"性格.{label}={rec.get('value', '')}")
    for cs in (pers.get("communication_style") or []):
        lines.append(f"沟通风格: {cs.get('value', '')}")

    for it in (profile.get("interests") or []):
        lines.append(f"兴趣: {it.get('name', '')}")

    text = "\n".join(lines)
    if len(text) > max_chars:
        text = text[:max_chars - 3] + "..."
    return text
