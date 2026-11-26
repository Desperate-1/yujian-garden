# 用户画像子系统（纯后端）
# 从聊天记录（MongoDB teaching.chats）构建用户画像，并在对话时把精选画像摘要注入提示词。
# 模块分工：
#   profile_db.py  画像与处理事件的 Mongo 存取
#   extractor.py   会话分批 + DeepSeek JSON 增量提取
#   merge.py       确定性合并（置信度/显著性/近因加权 + 剪枝）
#   summary.py     注入用精选摘要生成
#   pipeline.py    处理编排 + 后台线程触发
#   api.py         管理 API 蓝图（/profile-api）
#   backfill.py    存量会话回填 CLI
