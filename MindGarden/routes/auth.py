from flask import Blueprint, render_template, redirect, url_for, flash, request, session
from flask_login import login_user, logout_user, current_user, UserMixin
from models.mysqldb_alt import db
from themes import current_theme_key
from pymysql.err import IntegrityError

auth_bp = Blueprint('auth', __name__)

# 使用 pymysql 的用户包装类（适配 Flask-Login）
class PyMySQLUser(UserMixin):
    def __init__(self, user_dict):
        self.id = user_dict['id']
        self.username = user_dict['username']
        self.password_hash = user_dict['password_hash']
        self.age_group = user_dict['age_group']
    
    def check_password(self, password):
        from werkzeug.security import check_password_hash
        return check_password_hash(self.password_hash, password)

@auth_bp.route('/register', methods=['GET', 'POST'])
def register():
    if current_user.is_authenticated:
        return redirect(url_for('creation.garden'))
    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        password = request.form.get('password', '')
        age_group = request.form.get('age_group')
        if not username or len(username) > 50 or not password.strip() or age_group not in ('child', 'teen', 'adult'):
            flash('请填写用户名（最多 50 个字符）、密码和年龄段')
            return render_template('auth/register.html'), 400
        
        existing_user = db.get_user_by_username(username)

        if existing_user:
            flash('用户名已存在')
            return redirect(url_for('auth.register'))
        
        # 新账号创建后直接登录，带用户进入心灵花园；
        # 花园的"从门外推进来"动画由前端播放，注册流程无需额外标记。
        try:
            db.create_user(username, password, age_group, current_theme_key())
        except IntegrityError as exc:
            if exc.args[0] != 1062:
                raise
            flash('用户名已存在')
            return redirect(url_for('auth.register'))
        created_user = db.get_user_by_username(username)
        if created_user:
            login_user(PyMySQLUser(created_user))
            return redirect(url_for('creation.garden'))

        flash('账号已创建，请登录')
        return redirect(url_for('auth.login'))
    
    return render_template('auth/register.html')

# Add login functionality
@auth_bp.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('home'))
    
    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        password = request.form.get('password', '')
        remember = 'remember' in request.form
        
        # 使用 pymysql 验证用户
        user_dict = db.get_user_by_username(username)
        if user_dict is None:
            flash('用户名不存在')
            return redirect(url_for('auth.login'))
        else:
            user = PyMySQLUser(user_dict)
            if not user.check_password(password):
                flash('密码错误')
                return redirect(url_for('auth.login'))
            else:
                login_user(user, remember=remember)
                return redirect(url_for('home'))
    
    return render_template('auth/login.html')

# Add logout functionality
@auth_bp.route('/logout')
def logout():
    # 退出登录前补触发：后台更新当前会话的画像（覆盖用户直接关网页、未切换/新建会话的边界情况）
    prev_session_id = session.get('chat_session_id')
    if prev_session_id and current_user.is_authenticated:
        from user_profile.pipeline import schedule_session_update
        schedule_session_update(current_user.id, prev_session_id)
    logout_user()
    for key in ('chat_session_id', 'crisis_message', 'crisis_level', 'theme'):
        session.pop(key, None)
    return redirect(url_for('home'))

@auth_bp.teardown_request
def teardown_request(exception=None):
    db.close()
