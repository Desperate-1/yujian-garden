"""用户画像管理 API（纯后端，无前端页面）。

全部端点需要登录；查看/操作他人画像需 current_user.id 在 Config.PROFILE_ADMIN_IDS 中（默认空=仅本人）。
"""
import datetime
import threading

from flask import Blueprint, jsonify, request
from flask_login import current_user, login_required

from config import Config
from user_profile.pipeline import process_session, rebuild_user, schedule_session_update
from user_profile.profile_db import get_events_collection, load_profile
from user_profile.summary import build_profile_summary

profile_bp = Blueprint('profile_api', __name__, url_prefix='/profile-api')


def _to_jsonable(obj):
    """把 Mongo 文档里的 datetime 递归转成 isoformat 字符串，供 jsonify"""
    if isinstance(obj, datetime.datetime):
        return obj.isoformat()
    if isinstance(obj, dict):
        return {k: _to_jsonable(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_to_jsonable(v) for v in obj]
    return obj


def _resolve_user():
    """解析目标用户 id：默认本人；带 user_id 参数需管理员权限"""
    uid = request.args.get("user_id") or (request.get_json(silent=True) or {}).get("user_id")
    if uid is not None:
        if current_user.id not in Config.PROFILE_ADMIN_IDS:
            return None, jsonify({"error": "无权查看/操作他人画像"}), 403
        return int(uid), None, None
    return current_user.id, None, None


@profile_bp.route('/profile', methods=['GET'])
@login_required
def get_profile():
    """完整画像 JSON（无画像返回 {"profile": null}）"""
    uid, err_resp, code = _resolve_user()
    if err_resp:
        return err_resp, code
    profile = load_profile(uid)
    return jsonify({"profile": _to_jsonable(profile) if profile else None})


@profile_bp.route('/inject-preview', methods=['POST'])
@login_required
def inject_preview():
    """预览当前将注入的画像 system 消息（只读，不调 LLM）"""
    body = request.get_json(silent=True) or {}
    message = body.get("message", "")
    session_id = body.get("session_id", "")
    uid, err_resp, code = _resolve_user()
    if err_resp:
        return err_resp, code
    profile_sys = build_profile_summary(uid, session_id, message)
    return jsonify({
        "injected": bool(profile_sys),
        "system_message": profile_sys,
        "char_count": len(profile_sys["content"]) if profile_sys else 0,
    })


@profile_bp.route('/process-session', methods=['POST'])
@login_required
def process_session_api():
    """同步/后台处理指定会话的画像（LLM 调用约 10-30 秒，?async=1 转后台）"""
    body = request.get_json(silent=True) or {}
    session_id = body.get("session_id")
    if not session_id:
        return jsonify({"error": "缺少 session_id"}), 400
    uid, err_resp, code = _resolve_user()
    if err_resp:
        return err_resp, code
    if request.args.get("async") == "1":
        schedule_session_update(uid, session_id)
        return jsonify({"started": True, "session_id": session_id})
    result = process_session(uid, session_id)
    return jsonify(_to_jsonable(result))


@profile_bp.route('/rebuild', methods=['POST'])
@login_required
def rebuild_profile():
    """删除画像后按时间序重跑全部会话。默认后台执行（?async=0 同步）"""
    uid, err_resp, code = _resolve_user()
    if err_resp:
        return err_resp, code
    if request.args.get("async") != "0":
        t = threading.Thread(target=rebuild_user, args=(uid,), daemon=True)
        t.start()
        return jsonify({"success": True, "job": "async"})
    summary = rebuild_user(uid)
    return jsonify(_to_jsonable(summary))


@profile_bp.route('/status', methods=['GET'])
@login_required
def profile_status():
    """画像版本信息 + 最近 20 条处理事件"""
    uid, err_resp, code = _resolve_user()
    if err_resp:
        return err_resp, code
    profile = load_profile(uid)
    profile_info = None
    if profile:
        profile_info = {"version": profile.get("version", 0),
                        "updated_at": _to_jsonable(profile.get("updated_at")),
                        "processed_session_count": profile.get("processed_session_count", 0)}
    events = list(get_events_collection()
                  .find({"user_id": uid})
                  .sort("finished_at", -1)
                  .limit(20))
    return jsonify({"profile": profile_info, "events": _to_jsonable(events)})
