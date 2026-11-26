
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime

#参考资料：https://blog.csdn.net/umut9/article/details/142435311
#https://blog.csdn.net/weixin_41405524/article/details/146349153

db = SQLAlchemy()

class User(db.Model):
    __tablename__ = 'users'
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(128))
    age_group = db.Column(db.String(20))
    # 美术风格：cute 可爱风 / fresh 清新风 / ugly 丑萌风（见 themes.py）
    theme = db.Column(db.String(20), nullable=False, default='cute')
    
    # 新增：用户点赞和收藏关系
    liked_works = db.relationship('WorkLike', backref='user', lazy='dynamic', cascade='all, delete-orphan')
    collected_works = db.relationship('WorkCollection', backref='user', lazy='dynamic', cascade='all, delete-orphan')
    
    def get_id(self):
        return str(self.id)
    
    @property
    def is_active(self):
        return True  # All users are active by default
    
    @property
    def is_authenticated(self):
        return True  # User is authenticated

    @property
    def is_anonymous(self):
        return False  # Not an anonymous user
 
    def set_password(self, password):
        self.password_hash = generate_password_hash(password)
    
    def check_password(self, password):
        return check_password_hash(self.password_hash, password)
    

class Journal(db.Model):
    __tablename__ = 'journals'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    content = db.Column(db.Text, nullable=False)
    emotion_score = db.Column(db.Float)
    created_at = db.Column(db.Date, nullable=False)


# 新增：作品点赞表
class WorkLike(db.Model):
    __tablename__ = 'work_likes'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    work_id = db.Column(db.Integer, nullable=False)  # 作品ID
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # 唯一约束：一个用户只能点赞一个作品一次
    __table_args__ = (db.UniqueConstraint('user_id', 'work_id', name='unique_user_work_like'),)

# 新增：作品收藏表
class WorkCollection(db.Model):
    __tablename__ = 'work_collections'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    work_id = db.Column(db.Integer, nullable=False)  # 作品ID
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # 唯一约束：一个用户只能收藏一个作品一次
    __table_args__ = (db.UniqueConstraint('user_id', 'work_id', name='unique_user_work_collection'),)