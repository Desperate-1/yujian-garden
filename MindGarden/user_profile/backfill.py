"""存量聊天记录画像回填脚本。

用法（注意：必须用 conda 环境 mindgarden 的 Python 3.10 运行，
PATH 里的 Anaconda 3.12 没有安装 flask_pymongo）：
    python -m user_profile.backfill --all
参数：
    --all              回填全部用户（默认）
    --user N           只回填指定用户（可重复传多个）
    --limit N          每个用户最多处理 N 个会话（从最早开始，调试用）
    --recent N         每个用户只处理最近的 N 个会话（省 API 调用）
    --since 日期       只处理该日期(YYYY-MM-DD)及之后的会话（省 API 调用）
    --top-chars K      每个用户只处理用户消息总字数最高的 K 个会话（信息量优先，省 API 调用）
    --reset            先清空全部画像与处理事件再回填

省调用说明：幂等（已处理会话重跑零调用）+ 短会话门槛跳过 + 上述三个过滤参数。
多个过滤参数可组合，顺序为：--since 过滤 -> --top-chars 选优 -> --recent 取近 -> --limit 截断。

首次运行即「无画像时用全部历史构建」：按会话时间升序逐批处理，长会话自动分批，
单次 LLM 调用输入有界，不会超限。重复运行幂等（已处理会话跳过）。
"""
import argparse
import datetime
import re
import sys

import pytz


def iter_user_ids():
    """枚举 chats 中的全部用户：user_id 字段 ∪ session_id 前缀正则提取（兜底老文档）"""
    from models.mongo_db import get_chat_collection
    chats = get_chat_collection()
    user_ids = set()
    for doc in chats.find({}, {"session_id": 1, "user_id": 1}):
        raw = doc.get("user_id")
        if raw is not None:
            try:
                user_ids.add(int(raw))
            except (TypeError, ValueError):
                pass
        m = re.match(r"^chat_(\d+)_", str(doc.get("session_id", "")))
        if m:
            user_ids.add(int(m.group(1)))
    return sorted(user_ids)


def _session_time(doc):
    """会话时间：created_at 优先，老文档用首条消息时间戳兜底；统一为北京时间 aware"""
    tz = pytz.timezone("Asia/Shanghai")
    t = doc.get("created_at") or (doc.get("messages") or [{}])[0].get("timestamp")
    if t is None:
        return None
    if not isinstance(t, datetime.datetime):
        return None
    if t.tzinfo is None:
        return tz.localize(t)
    return t.astimezone(tz)


def _user_chars(doc):
    """会话中用户消息总字数（信息量指标）"""
    return sum(len(m.get("content") or "")
               for m in doc.get("messages", []) if m.get("role") == "user")


def main(argv=None):
    parser = argparse.ArgumentParser(description="从聊天记录回填用户画像")
    parser.add_argument("--all", action="store_true", help="回填全部用户（默认）")
    parser.add_argument("--user", type=int, action="append", help="只回填指定用户，可重复")
    parser.add_argument("--limit", type=int, default=0, help="每个用户最多处理 N 个会话（从最早开始）")
    parser.add_argument("--recent", type=int, default=0, help="每个用户只处理最近 N 个会话")
    parser.add_argument("--since", type=str, default="", help="只处理该日期(YYYY-MM-DD)及之后的会话")
    parser.add_argument("--top-chars", type=int, default=0, help="只处理用户消息总字数最高的 K 个会话")
    parser.add_argument("--reset", action="store_true", help="先清空全部画像与事件")
    args = parser.parse_args(argv)

    since_dt = None
    if args.since:
        try:
            since_dt = pytz.timezone("Asia/Shanghai").localize(
                datetime.datetime.strptime(args.since, "%Y-%m-%d"))
        except ValueError:
            print("--since 格式应为 YYYY-MM-DD")
            return 1

    # 触发 mongo.init_app（app.py 顶层执行，不会启动服务器）
    from app import app  # noqa: F401
    from user_profile.profile_db import (ensure_indexes, load_profile, reset_all)
    from user_profile.pipeline import iter_sessions_for_user, process_session

    ensure_indexes()
    if args.reset:
        reset_all()
        print("已清空全部画像与处理事件")

    if args.user:
        user_ids = args.user
    else:
        user_ids = iter_user_ids()
    if not user_ids:
        print("chats 集合中没有任何用户，回填结束")
        return 0

    total_processed = total_skipped = total_failed = 0
    for uid in user_ids:
        sessions = iter_sessions_for_user(uid)  # 时间升序
        # 过滤链：--since 过滤 -> --top-chars 选优 -> --recent 取近 -> --limit 截断
        if since_dt is not None:
            sessions = [s for s in sessions
                        if _session_time(s) is not None and _session_time(s) >= since_dt]
        if args.top_chars:
            sessions = sorted(sessions, key=_user_chars, reverse=True)[:args.top_chars]
            # 恢复时间升序，保证画像按时间顺序累积
            sessions.sort(key=lambda s: _session_time(s) or datetime.datetime.min.replace(tzinfo=pytz.UTC))
        if args.recent:
            sessions = sessions[-args.recent:]
        if args.limit:
            sessions = sessions[:args.limit]
        processed = skipped = failed = 0
        for i, sess in enumerate(sessions):
            result = process_session(uid, sess["session_id"])
            if result["status"] in ("processed", "already_processed"):
                processed += 1
            elif result["status"] == "failed":
                failed += 1
                print(f"  会话 {sess['session_id']} 处理失败: 请查 profile_events 中的 error 字段")
            else:
                skipped += 1
            if (i + 1) % 10 == 0:
                print(f"用户{uid}: 已处理 {i + 1}/{len(sessions)} 个会话 "
                      f"(成功{processed}/跳过{skipped}/失败{failed})")
        profile = load_profile(uid)
        version = profile.get("version", 0) if profile else 0
        print(f"用户 {uid}: 会话 {len(sessions)} 个 -> 处理 {processed} / 跳过 {skipped} / "
              f"失败 {failed}，画像版本 {version}")
        total_processed += processed
        total_skipped += skipped
        total_failed += failed

    print(f"\n回填完成：共 {total_processed} 个会话处理成功，{total_skipped} 个跳过，"
          f"{total_failed} 个失败")
    return 0


if __name__ == "__main__":
    sys.exit(main())
