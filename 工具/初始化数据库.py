"""用应用的连接配置建表。同一数据库可重复运行。"""
import argparse
import sys
from pathlib import Path

app_dir = Path(__file__).resolve().parents[1] / 'MindGarden'
sys.path.insert(0, str(app_dir))
import pymysql
from pymysql.constants import CLIENT
from pymongo import MongoClient
from config import Config, mysql_options


def initialize(first_password=False):
    options = mysql_options()
    if first_password:
        # Only the newly initialized, loopback-only portable instance uses this.
        local = dict(options, database=None, user='root', password='')
        with pymysql.connect(**local) as connection, connection.cursor() as cursor:
            cursor.execute("ALTER USER CURRENT_USER() IDENTIFIED BY %s", (options['password'],))
        return
    options['client_flag'] = CLIENT.MULTI_STATEMENTS
    try:
        connection = pymysql.connect(**options)
    except pymysql.err.OperationalError as exc:
        if exc.args[0] != 1049:  # The selected database does not exist.
            raise
        database = options['database'].replace('`', '``')
        with pymysql.connect(**dict(options, database=None)) as admin, admin.cursor() as cursor:
            cursor.execute(f"CREATE DATABASE IF NOT EXISTS `{database}` CHARACTER SET utf8mb4")
        connection = pymysql.connect(**options)
    with connection, connection.cursor() as cursor:
        cursor.execute((app_dir / 'mysql teaching.sql').read_text(encoding='utf-8-sig'))
        while cursor.nextset():
            pass
    print('MySQL 表结构已就绪。')
    with MongoClient(Config.MONGO_URI, serverSelectionTimeoutMS=5000) as client:
        client.get_default_database().command('ping')
    print('MongoDB 连接成功。')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--new-portable-instance', action='store_true')
    args = parser.parse_args()
    try:
        initialize(args.new_portable_instance)
    except Exception as error:
        code = error.args[0] if error.args and isinstance(error.args[0], int) else ''
        sys.exit(f'初始化失败（{type(error).__name__} {code}），请检查服务、数据库配置和账号权限。')
