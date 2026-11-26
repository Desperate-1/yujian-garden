"""画像处理管线：process_session 编排 + 会话结束后台触发。

process_session 被三处共用：会话切换触发的后台线程、管理 API、回填脚本。
约束：本模块所有函数不访问 flask 全局（request/session/current_user），上下文全部经参数传入，
因此可在后台 daemon 线程中安全运行（Flask-PyMongo 3.x 的 mongo.db 直接挂在扩展实例上，
PyMongo 客户端线程安全，无需 app context）。
"""
import re
import threading

from config import Config
from models.mongo_db import get_beijing_time, get_chat_collection
from user_profile.extractor import iter_chunks, extract_delta
from user_profile.merge import merge_delta
from user_profile.profile_db import (delete_user_data, load_event, load_profile,
                                     mark_event, new_empty_profile, save_profile)

_locks = {}
_locks_guard = threading.Lock()


def _get_user_lock(user_id):
    """每用户一把锁，防止同一用户的并发 read-modify-write"""
    with _locks_guard:
        if user_id not in _locks:
            _locks[user_id] = threading.Lock()
        return _locks[user_id]


def _resolve_user_id(session_doc, session_id):
    """会话文档 -> 用户 id。老文档无 user_id 字段时从 session_id 前缀解析"""
    raw = session_doc.get("user_id")
    if raw is not None:
        try:
            return int(raw)
        except (TypeError, ValueError):
            pass
    m = re.match(r"^chat_(\d+)_", session_id or "")
    return int(m.group(1)) if m else None


def _stat_remaining(messages):
    """未处理消息中用户消息的条数与字符数"""
    count = 0
    chars = 0
    for m in messages:
        if m.get("role") == "user":
            count += 1
            chars += len(m.get("content") or "")
    return count, chars


def process_session(user_id, session_id):
    """处理（或增量续处理）一个会话：分批提取 -> 合并 -> 更新画像。

    幂等：事件已 processed 且无新消息时直接返回；
    断点续跑：事件记录 last_processed_message_index，失败/中断后从该位置继续。
    返回 {'success': bool, 'status': str, 'change_count': int, 'chunk_count': int, 'user_id': int}
    """
    now = get_beijing_time()
    chats = get_chat_collection()
    session_doc = chats.find_one({"session_id": session_id})
    if not session_doc:
        mark_event(user_id, session_id, "failed", error="会话不存在")
        return {"success": False, "status": "failed", "change_count": 0,
                "chunk_count": 0, "user_id": user_id}

    uid = _resolve_user_id(session_doc, session_id)
    if uid is None:
        mark_event(user_id, session_id, "no_user_id", error="无法从会话解析出用户id")
        return {"success": False, "status": "no_user_id", "change_count": 0,
                "chunk_count": 0, "user_id": user_id}

    messages = session_doc.get("messages") or []
    total_count = len(messages)

    # 断点续跑：从事件记录的进度位置继续（processed/skipped/failed 均按此恢复），
    # 进度已到末尾则幂等返回，只处理其后新增的消息
    ev = load_event(uid, session_id)
    start = int((ev.get("last_processed_message_index") or 0)) if ev else 0
    if start >= total_count:
        return {"success": True, "status": "already_processed", "change_count": 0,
                "chunk_count": 0, "user_id": uid}

    remaining = messages[start:]
    n_user, user_chars = _stat_remaining(remaining)

    # 门槛：用户消息太少，不值得调 LLM
    if n_user < Config.PROFILE_MIN_SESSION_USER_MESSAGES or \
       user_chars < Config.PROFILE_MIN_SESSION_USER_CHARS:
        status = "skipped_too_short" if start == 0 else "processed"
        mark_event(uid, session_id, status,
                   total_message_count=total_count,
                   last_processed_message_index=total_count,
                   message_count=n_user, user_message_chars=user_chars,
                   chunk_count=0, delta_change_count=0,
                   error="用户消息过少，跳过" if start == 0 else None)
        return {"success": True, "status": status, "change_count": 0,
                "chunk_count": 0, "user_id": uid}

    profile = load_profile(uid) or new_empty_profile(uid, now)
    first_full_run = not (ev and ev.get("status") == "processed")

    total_applied = 0
    chunk_count = 0
    processed_index = start

    try:
        # 分批循环：每批输入 = 当前画像摘要 + 本批对话，逐批增量合并
        for chunk_messages, end_index in iter_chunks(session_doc, start):
            chunk_count += 1
            changes = extract_delta(chunk_messages, profile)
            if changes is None:
                # 提取失败：保留进度，下次从当前批重试
                mark_event(uid, session_id, "failed",
                           total_message_count=total_count,
                           last_processed_message_index=processed_index,
                           chunk_count=chunk_count - 1,
                           delta_change_count=total_applied,
                           error="LLM提取失败（JSON解析/空响应）",
                           model=Config.PROFILE_EXTRACT_MODEL)
                return {"success": False, "status": "failed",
                        "change_count": total_applied, "chunk_count": chunk_count - 1,
                        "user_id": uid}
            total_applied += merge_delta(profile, changes, session_id, now)
            save_profile(profile)
            processed_index = end_index
            # 每批持久化进度，中断可续跑
            mark_event(uid, session_id, "processing",
                       total_message_count=total_count,
                       last_processed_message_index=processed_index,
                       chunk_count=chunk_count,
                       delta_change_count=total_applied,
                       model=Config.PROFILE_EXTRACT_MODEL)
    except Exception as e:
        mark_event(uid, session_id, "failed",
                   total_message_count=total_count,
                   last_processed_message_index=processed_index,
                   chunk_count=chunk_count, delta_change_count=total_applied,
                   error=str(e)[:300], model=Config.PROFILE_EXTRACT_MODEL)
        return {"success": False, "status": "failed",
                "change_count": total_applied, "chunk_count": chunk_count, "user_id": uid}

    if first_full_run:
        profile["processed_session_count"] = profile.get("processed_session_count", 0) + 1
        save_profile(profile)

    mark_event(uid, session_id, "processed",
               total_message_count=total_count,
               last_processed_message_index=total_count,
               message_count=n_user, user_message_chars=user_chars,
               chunk_count=chunk_count, delta_change_count=total_applied,
               model=Config.PROFILE_EXTRACT_MODEL)
    return {"success": True, "status": "processed", "change_count": total_applied,
            "chunk_count": chunk_count, "user_id": uid}


def _run_update(user_id, session_id):
    """后台线程入口：异常只打印，绝不影响聊天主流程"""
    try:
        result = process_session(user_id, session_id)
        print(f"画像更新完成 {session_id}: {result['status']} "
              f"变化{result['change_count']}条/共{result['chunk_count']}批")
    except Exception as e:
        print(f"后台画像更新失败 {session_id}: {e}")


def schedule_session_update(user_id, session_id):
    """会话结束时触发画像更新（后台线程或同步，由 PROFILE_ASYNC 控制）"""
    if not Config.PROFILE_ENABLED:
        return
    if Config.PROFILE_ASYNC:
        t = threading.Thread(target=_run_update, args=(user_id, session_id), daemon=True)
        t.start()
    else:
        _run_update(user_id, session_id)


def iter_sessions_for_user(user_id):
    """按时间升序列出某用户全部会话（回填/重建用；老文档无 created_at 时按 _id 兜底）"""
    chats = get_chat_collection()
    cursor = chats.find({"session_id": {"$regex": f"^chat_{user_id}_"}})
    return list(cursor.sort([("created_at", 1), ("_id", 1)]))


def rebuild_user(user_id):
    """删除画像与事件后按时间序重跑该用户全部会话。返回汇总 dict"""
    uid = int(user_id)
    delete_user_data(uid)
    summary = {"processed": 0, "skipped": 0, "failed": 0, "no_user_id": 0, "version": 0}
    sessions = iter_sessions_for_user(uid)
    for i, sess in enumerate(sessions):
        result = process_session(uid, sess["session_id"])
        if result["status"] in ("processed", "already_processed"):
            summary["processed"] += 1
        elif result["status"] == "failed":
            summary["failed"] += 1
        elif result["status"] == "no_user_id":
            summary["no_user_id"] += 1
        else:
            summary["skipped"] += 1
        if (i + 1) % 10 == 0:
            print(f"  用户{uid}: 已处理 {i + 1}/{len(sessions)} 个会话")
    profile = load_profile(uid)
    summary["version"] = profile.get("version", 0) if profile else 0
    return summary
