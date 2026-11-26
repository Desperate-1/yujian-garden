from flask_pymongo import PyMongo
import uuid
import datetime
import pytz

# Remove app import and create mongo without initialization
mongo = PyMongo()

def get_beijing_time():
    """获取当前北京时间"""
    beijing_tz = pytz.timezone('Asia/Shanghai')
    return datetime.datetime.now(beijing_tz)

def get_chat_collection():
    #如果该集合不存在，MongoDB 会在首次插入数据时自动创建它（惰性创建）
    return mongo.db.chats

class ChatSession:
    def __init__(self, user_id, session_id=None):  # Add session_id as optional parameter
        self.user_id = user_id
        if session_id:
            self.session_id = session_id
        else:
            self.session_id = f"chat_{user_id}_{uuid.uuid4().hex}"
    
    def save_message(self, role, content):
        chats = get_chat_collection()

        now = get_beijing_time()
        chats.update_one(
            {"user_id": self.user_id, "session_id": self.session_id},
            {"$setOnInsert": {"keywords": "", "created_at": now},
             "$push": {"messages": {"role": role, "content": content, "timestamp": now}}},
            upsert=True,
        )

    def update_keywords(self, keywords):
        """更新会话关键词"""
        chats = get_chat_collection()
        chats.update_one(
            {"user_id": self.user_id, "session_id": self.session_id},
            {"$set": {"keywords": keywords}}
        )

    def get_history(self):
        chats = get_chat_collection()
        session_data = chats.find_one({"user_id": self.user_id, "session_id": self.session_id})
        if session_data and 'messages' in session_data:
            # Format the timestamps for display
            formatted_messages = []
            for message in session_data['messages']:
                # 如果timestamp是datetime对象，直接格式化
                if isinstance(message["timestamp"], datetime.datetime):
                    # 转换为北京时间显示
                    beijing_tz = pytz.timezone('Asia/Shanghai')
                    if message["timestamp"].tzinfo is None:
                        # 如果是naive datetime，假设是UTC，转换为北京时间
                        utc_time = pytz.utc.localize(message["timestamp"])
                        beijing_time = utc_time.astimezone(beijing_tz)
                    else:
                        # 如果有时区信息，直接转换
                        beijing_time = message["timestamp"].astimezone(beijing_tz)
                    
                    formatted_timestamp = beijing_time.strftime("%Y-%m-%d %H:%M:%S")
                else:
                    # 如果是字符串，直接使用
                    formatted_timestamp = message["timestamp"]
                
                formatted_message = {
                    "role": message["role"],
                    "content": message["content"],
                    "timestamp": formatted_timestamp
                }
                formatted_messages.append(formatted_message)
            return formatted_messages
        return []

def get_user_sessions(user_id):
    """Get all chat sessions for a specific user"""
    chats = get_chat_collection()
    # Find sessions where session_id starts with the user's ID pattern
    sessions = chats.find({
        "user_id": user_id
    }).sort("_id", -1)  # Sort by most recent first
    
    session_list = []
    for session in sessions:
        if 'messages' in session and session['messages']:
            last_message = session['messages'][-1]
            
            # 获取关键词，如果没有则使用最后一条消息的前12个字符
            topic = session.get("keywords", "")
            if not topic  and last_message["content"]:
                topic = last_message["content"][:12] + "..." if len(last_message["content"]) > 12 else last_message["content"]
            
            # 处理时间显示
            if isinstance(last_message["timestamp"], datetime.datetime):
                beijing_tz = pytz.timezone('Asia/Shanghai')
                if last_message["timestamp"].tzinfo is None:
                    utc_time = pytz.utc.localize(last_message["timestamp"])
                    beijing_time = utc_time.astimezone(beijing_tz)
                else:
                    beijing_time = last_message["timestamp"].astimezone(beijing_tz)
                formatted_timestamp = beijing_time.strftime("%Y-%m-%d %H:%M:%S")
            else:
                formatted_timestamp = last_message["timestamp"]

            session_list.append({
                "session_id": session["session_id"],
                "last_message": last_message["content"][:30] + "..." if len(last_message["content"]) > 30 else last_message["content"],
                "last_timestamp": formatted_timestamp,
                "message_count": len(session["messages"]),
                "keywords": topic
            })
    
    return session_list


def delete_session(session_id, user_id):
    """删除指定用户的某个会话。

    安全约束：必须同时匹配 session_id 和 user_id，
    防止通过伪造 session_id 删掉别人的对话。
    返回删除的条目数（0 表示不存在或不属于该用户）。
    """
    chats = get_chat_collection()
    result = chats.delete_one({"session_id": session_id, "user_id": user_id})
    return result.deleted_count


def delete_all_sessions(user_id):
    """删除该用户的全部会话，返回删除条数。"""
    chats = get_chat_collection()
    result = chats.delete_many({"user_id": user_id})
    return result.deleted_count


def get_session_by_id(session_id, user_id):
    """Get a specific session by session_id, verifying it belongs to the user"""
    return ChatSession(user_id, session_id).get_history()
