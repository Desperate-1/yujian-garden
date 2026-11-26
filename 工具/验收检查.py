# -*- coding: utf-8 -*-
"""端到端验收脚本：验证 MindGarden 的数据库连通性 + 关键功能可读写。

用法：从项目根目录使用 MindGarden/.venv 的 Python 运行本文件。
"""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'MindGarden'))
from config import Config, mysql_options

sys.stdout.reconfigure(encoding="utf-8")

print("=" * 60)
print(" MindGarden 环境验收检查")
print("=" * 60)

# ---------- 1. MySQL ----------
print("\n[1] MySQL")
try:
    import pymysql
    conn = pymysql.connect(**mysql_options())
    with conn.cursor() as cur:
        cur.execute("SELECT VERSION()")
        print("    版本        :", cur.fetchone()[0])
        cur.execute("SHOW TABLES")
        tables = [r[0] for r in cur.fetchall()]
        print("    表数量      :", len(tables))
    conn.close()
    print("    [OK] MySQL 连接与读取正常")
except Exception as e:
    print("    [FAIL] MySQL:", type(e).__name__)

# ---------- 2. MongoDB ----------
print("\n[2] MongoDB")
try:
    import pymongo
    mc = pymongo.MongoClient(Config.MONGO_URI, serverSelectionTimeoutMS=6000)
    info = mc.server_info()
    print("    版本        :", info["version"])
    mc.admin.command("ping")
    print("    集合数量    :", len(mc.get_default_database().list_collection_names()))
    print("    [OK] MongoDB 连接正常")
except Exception as e:
    print("    [FAIL] MongoDB:", type(e).__name__)

# ---------- 3. 关键依赖 ----------
print("\n[3] 关键 Python 依赖")
mods = ["flask", "flask_sqlalchemy", "flask_login", "flask_pymongo",
        "sqlalchemy", "pymysql", "pymongo", "snownlp", "jieba", "PIL",
        "pydantic", "requests", "websocket", "pytz"]
for m in mods:
    try:
        mod = __import__(m)
        v = getattr(mod, "__version__", "")
        print(f"    [OK]   {m:20s} {v}")
    except Exception as e:
        print(f"    [FAIL] {m:20s} {type(e).__name__}")

# ---------- 4. 环境变量（API Key） ----------
print("\n[4] 可选云端服务配置")
keys = ["DEEPSEEK_API_KEY", "GLM_API_KEY", "TENCENT_SECRET_ID",
        "TENCENT_SECRET_KEY", "IFLYTEK_APP_ID", "IFLYTEK_API_KEY",
        "IFLYTEK_API_SECRET"]
for k in keys:
    v = os.environ.get(k, "")
    if not v:
        print(f"    [未启用] {k}")
    else:
        print(f"    [已配] {k} ")

# ---------- 5. 项目模块 ----------
print("\n[5] 项目模块导入")
for m in ["config", "models.mysql_db", "models.mongo_db", "models.mysqldb_alt",
          "services.ai_art", "services.ai_chat", "services.ai_audproc",
          "services.sentiment", "routes.auth", "routes.journal",
          "routes.chat", "routes.creation", "user_profile.pipeline"]:
    try:
        __import__(m)
        print(f"    [OK]   {m}")
    except Exception as e:
        print(f"    [FAIL] {m:28s} {type(e).__name__}")

print("\n" + "=" * 60)
print(" 检查结束")
print("=" * 60)
