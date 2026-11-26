import pymysql
from werkzeug.security import generate_password_hash
from flask import g
from config import mysql_options

class MySQLDatabase:
    def get_connection(self):
        if 'mysql_db' not in g:
            g.mysql_db = pymysql.connect(
                **mysql_options(),
                cursorclass=pymysql.cursors.DictCursor
            )
        return g.mysql_db

    def close(self):
        mysql_db = g.pop('mysql_db', None)
        if mysql_db is not None:
            mysql_db.close()

    def get_user_by_username(self, username):
        connection = self.get_connection()
        with connection.cursor() as cursor:
            sql = "SELECT * FROM users WHERE username = %s"
            cursor.execute(sql, (username,))
            return cursor.fetchone()
    
    def create_user(self, username, password, age_group, theme='cute'):
        connection = self.get_connection()
        with connection.cursor() as cursor:
            sql = "INSERT INTO users (username, password_hash, age_group, theme) VALUES (%s, %s, %s, %s)"
            password_hash = generate_password_hash(password)
            cursor.execute(sql, (username, password_hash, age_group, theme))
            connection.commit()
            return cursor.lastrowid

    def create_journal(self, user_id, content, emotion_score,
                       emotion_tags=None, emotion_reason=None, risk_level=None):
        """写入日记。

        新增的 3 个参数（emotion_tags / emotion_reason / risk_level）是**可选**的，
        旧的调用方式 create_journal(uid, text, score) 仍然可用 ——
        这样创作链路等既有调用方不会因为签名变化而报错。
        """
        connection = self.get_connection()
        with connection.cursor() as cursor:
            sql = ("INSERT INTO journals "
                   "(user_id, content, emotion_score, emotion_tags, "
                   " emotion_reason, risk_level, created_at) "
                   "VALUES (%s, %s, %s, %s, %s, %s, NOW())")
            cursor.execute(sql, (user_id, content, emotion_score,
                                 emotion_tags, emotion_reason, risk_level))
            connection.commit()
            return cursor.lastrowid
    
    def get_user_journals(self, user_id):
        connection = self.get_connection()
        with connection.cursor() as cursor:
            sql = "SELECT * FROM journals WHERE user_id = %s ORDER BY created_at DESC"
            cursor.execute(sql, (user_id,))
            return cursor.fetchall()
    
    def get_journal_by_id(self, journal_id, user_id):
        connection = self.get_connection()
        with connection.cursor() as cursor:
            sql = "SELECT * FROM journals WHERE id = %s AND user_id = %s"
            cursor.execute(sql, (journal_id, user_id))
            return cursor.fetchone()

    def create_artwork(self, user_id, content_path, content_type,
                       intent=None, emotion_score=None):
        """创建作品记录。

        intent / emotion_score 是"疗愈回廊"创新功能所需的两个字段：
          - intent：创作时用户填写的"想安放的情绪"（可选）
          - emotion_score：创作当下的情绪基线，取用户最近一条日记的情绪值，
            用于在回廊里画出"情绪疗愈轨迹"
        两者都可为空，不影响原有调用方。
        """
        connection = self.get_connection()
        with connection.cursor() as cursor:
            sql = ("INSERT INTO artworks "
                   "(user_id, content_path, content_type, created_at, intent, emotion_score) "
                   "VALUES (%s, %s, %s, NOW(), %s, %s)")
            cursor.execute(sql, (user_id, content_path, content_type,
                                 intent, emotion_score))
            connection.commit()
            return cursor.lastrowid

    def get_user_artworks(self, user_id):
        connection = self.get_connection()
        with connection.cursor() as cursor:
            sql = ("SELECT id, content_path, content_type, created_at, intent, emotion_score "
                   "FROM artworks WHERE user_id = %s ORDER BY created_at DESC")
            cursor.execute(sql, (user_id,))
            return cursor.fetchall()

    def get_latest_emotion_score(self, user_id):
        """取用户最近一条日记的情绪值，作为创作当下的情绪基线。"""
        connection = self.get_connection()
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT emotion_score FROM journals "
                "WHERE user_id = %s AND emotion_score IS NOT NULL "
                "ORDER BY created_at DESC LIMIT 1", (user_id,))
            row = cursor.fetchone()
            return float(row['emotion_score']) if row and row['emotion_score'] is not None else None

    def get_healing_trajectory(self, user_id, limit=60):
        """构建"情绪疗愈轨迹"数据。

        把日记情绪点与创作点合并成一条按时间排序的序列，供回廊画曲线：
          - 每个点标出类型（journal=记录心情 / artwork=创作）
          - 作品点带上作品类型与预览路径，可点击查看
        这是"疗愈回廊"与普通作品陈列馆的核心差别：
        用户能看到自己的情绪随创作行为发生的变化。
        """
        connection = self.get_connection()
        points = []
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT id, content, emotion_score, created_at FROM journals "
                "WHERE user_id = %s AND emotion_score IS NOT NULL "
                "ORDER BY created_at ASC", (user_id,))
            for r in cursor.fetchall():
                points.append({
                    'kind': 'journal',
                    'id': r['id'],
                    'score': float(r['emotion_score']),
                    'time': r['created_at'],
                    'label': (r['content'] or '')[:24],
                })

            cursor.execute(
                "SELECT id, content_path, content_type, created_at, intent, emotion_score "
                "FROM artworks WHERE user_id = %s ORDER BY created_at ASC", (user_id,))
            for r in cursor.fetchall():
                score = r['emotion_score']
                points.append({
                    'kind': 'artwork',
                    'id': r['id'],
                    'score': float(score) if score is not None else None,
                    'time': r['created_at'],
                    'label': r['intent'] or '',
                    'content_type': r['content_type'],
                    'path': r['content_path'],
                })

        points.sort(key=lambda p: p['time'])
        return points[-limit:] if limit else points
    
    def delete_artwork(self, artwork_id, user_id):
        """删除用户的作品"""
        connection = self.get_connection()
        with connection.cursor() as cursor:
            cursor.execute("SELECT id FROM artworks WHERE id = %s AND user_id = %s FOR UPDATE", (artwork_id, user_id))
            if cursor.fetchone() is None:
                connection.rollback()
                return False
            # 所有权与关联记录的删除在同一个事务中检查。

            delete_likes_sql = "DELETE FROM work_likes WHERE work_id = %s"
            delete_collections_sql = "DELETE FROM work_collections WHERE work_id = %s"
            cursor.execute(delete_likes_sql, (artwork_id,))
            cursor.execute(delete_collections_sql, (artwork_id,))
            
            # 删除作品
            sql = "DELETE FROM artworks WHERE id = %s AND user_id = %s"
            cursor.execute(sql, (artwork_id, user_id))
            connection.commit()
            return cursor.rowcount > 0


    # ---------- 「舞动起来」节奏游戏排行榜 ----------
    def _ensure_dance_table(self, cursor):
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS dance_scores (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                username VARCHAR(80) NOT NULL,
                track VARCHAR(200) NOT NULL,
                score INT NOT NULL,
                created_at DATETIME NOT NULL,
                INDEX idx_score (score DESC)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """)

    def save_dance_score(self, user_id, username, track, score):
        """存一局成绩，返回该玩家历史最高分"""
        connection = self.get_connection()
        with connection.cursor() as cursor:
            self._ensure_dance_table(cursor)
            cursor.execute(
                "INSERT INTO dance_scores (user_id, username, track, score, created_at) "
                "VALUES (%s, %s, %s, %s, NOW())",
                (user_id, username, track, int(score)))
            connection.commit()
            cursor.execute("SELECT MAX(score) AS best FROM dance_scores WHERE user_id = %s", (user_id,))
            return cursor.fetchone()['best']

    def get_dance_scores(self, limit=10, user_id=None):
        """全站前 N 名 + （可选）当前玩家的最好成绩"""
        connection = self.get_connection()
        with connection.cursor() as cursor:
            self._ensure_dance_table(cursor)
            cursor.execute(
                "SELECT username, track, score, created_at FROM dance_scores "
                "ORDER BY score DESC, created_at ASC LIMIT %s", (int(limit),))
            top = cursor.fetchall()
            mine = None
            if user_id is not None:
                cursor.execute(
                    "SELECT track, score, created_at FROM dance_scores "
                    "WHERE user_id = %s ORDER BY score DESC LIMIT 1", (user_id,))
                mine = cursor.fetchone()
            return {'top': top, 'mine': mine}

    # 新增：点赞相关方法
    def toggle_like(self, user_id, work_id):
        """切换点赞状态"""
        connection = self.get_connection()
        with connection.cursor() as cursor:
            # 检查是否已经点赞
            check_sql = "SELECT id FROM work_likes WHERE user_id = %s AND work_id = %s"
            cursor.execute(check_sql, (user_id, work_id))
            existing_like = cursor.fetchone()
            
            if existing_like:
                # 取消点赞
                delete_sql = "DELETE FROM work_likes WHERE user_id = %s AND work_id = %s"
                cursor.execute(delete_sql, (user_id, work_id))
                connection.commit()
                return {'liked': False, 'message': '取消点赞'}
            else:
                # 添加点赞
                insert_sql = "INSERT INTO work_likes (user_id, work_id) VALUES (%s, %s)"
                cursor.execute(insert_sql, (user_id, work_id))
                connection.commit()
                return {'liked': True, 'message': '点赞成功'}

    def toggle_collection(self, user_id, work_id):
        """切换收藏状态"""
        connection = self.get_connection()
        with connection.cursor() as cursor:
            # 检查是否已经收藏
            check_sql = "SELECT id FROM work_collections WHERE user_id = %s AND work_id = %s"
            cursor.execute(check_sql, (user_id, work_id))
            existing_collection = cursor.fetchone()
            
            if existing_collection:
                # 取消收藏
                delete_sql = "DELETE FROM work_collections WHERE user_id = %s AND work_id = %s"
                cursor.execute(delete_sql, (user_id, work_id))
                connection.commit()
                return {'collected': False, 'message': '取消收藏'}
            else:
                # 添加收藏
                insert_sql = "INSERT INTO work_collections (user_id, work_id) VALUES (%s, %s)"
                cursor.execute(insert_sql, (user_id, work_id))
                connection.commit()
                return {'collected': True, 'message': '收藏成功'}

    def get_user_interaction_status(self, user_id, work_id):
        """获取用户对作品的交互状态"""
        connection = self.get_connection()
        with connection.cursor() as cursor:
            # 检查点赞状态
            like_sql = "SELECT id FROM work_likes WHERE user_id = %s AND work_id = %s"
            cursor.execute(like_sql, (user_id, work_id))
            liked = cursor.fetchone() is not None
            
            # 检查收藏状态
            collection_sql = "SELECT id FROM work_collections WHERE user_id = %s AND work_id = %s"
            cursor.execute(collection_sql, (user_id, work_id))
            collected = cursor.fetchone() is not None
            
            return {'liked': liked, 'collected': collected}


    def get_work_stats(self, work_id):
        """获取作品的统计信息"""
        connection = self.get_connection()
        with connection.cursor() as cursor:
            # 获取点赞数
            like_count_sql = "SELECT COUNT(*) as count FROM work_likes WHERE work_id = %s"
            cursor.execute(like_count_sql, (work_id,))
            like_count = cursor.fetchone()['count']
            
            # 获取收藏数
            collection_count_sql = "SELECT COUNT(*) as count FROM work_collections WHERE work_id = %s"
            cursor.execute(collection_count_sql, (work_id,))
            collection_count = cursor.fetchone()['count']
            
            return {
                'like_count': like_count,
                'collection_count': collection_count
            }

    def get_all_artworks_with_stats(self):
        """获取所有作品及其统计信息"""
        connection = self.get_connection()
        with connection.cursor() as cursor:
            sql = """
            SELECT a.*, 
                   (SELECT COUNT(*) FROM work_likes WHERE work_id = a.id) as like_count,
                   (SELECT COUNT(*) FROM work_collections WHERE work_id = a.id) as collection_count
            FROM artworks a 
            ORDER BY a.created_at DESC
            """
            cursor.execute(sql)
            return cursor.fetchall()

    def get_journals_with_pagination(self, user_id, page=1, per_page=5):
        """获取分页的日记列表（按用户过滤）"""
        try:
            offset = (page - 1) * per_page
            connection = self.get_connection()
            with connection.cursor() as cursor:
                # 获取日记数据
                cursor.execute("""
                    SELECT id, created_at, emotion_score, content
                    FROM journals
                    WHERE user_id = %s
                    ORDER BY created_at DESC
                    LIMIT %s OFFSET %s
                """, (user_id, per_page, offset))

                journals = []
                for row in cursor.fetchall():
                    journals.append({
                        'id': row['id'],
                        'created_at': row['created_at'].strftime('%Y-%m-%d %H:%M') if row['created_at'] else '',
                        'emotion_score': float(row['emotion_score']) if row['emotion_score'] is not None else 0.0,
                        'content_preview': row['content'][:50] + '...' if row['content'] and len(row['content']) > 50 else row['content'] if row['content'] else ''
                    })

                # 获取总数
                cursor.execute("SELECT COUNT(*) as count FROM journals WHERE user_id = %s", (user_id,))
                total_result = cursor.fetchone()
                total = total_result['count'] if total_result else 0

                return journals, total

        except Exception as e:
            print(f"Error getting journals with pagination: {e}")
            return [], 0

    def delete_journals_by_ids(self, user_id, journal_ids):
        """批量删除日记（按用户过滤）"""
        try:
            if not journal_ids:
                return False

            connection = self.get_connection()
            with connection.cursor() as cursor:
                placeholders = ','.join(['%s'] * len(journal_ids))
                cursor.execute(
                    f"DELETE FROM journals WHERE user_id = %s AND id IN ({placeholders})",
                    [user_id] + list(journal_ids)
                )
                connection.commit()

                return True

        except Exception as e:
            print(f"Error deleting journals: {e}")
            self.get_connection().rollback()
            return False


# Singleton instance
db = MySQLDatabase()
