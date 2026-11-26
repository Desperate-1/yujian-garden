# 先把日志接管装上，再 import 其它模块 —— 这样各模块 import 期的输出也会被记下。
# 关键点：日志文件是"写一次开一次"，不长期占用句柄，
# 否则应用运行期间无法压缩/复制该文件（会遇到"另一个程序正在使用此文件"）。
try:
    import _logging
    _logging.install()
except Exception as _e:
    print(f"[日志] 文件日志未启用（不影响运行）: {_e}")

from flask import Flask
from config import Config
from flask_login import LoginManager
from flask import render_template, request
import os

app = Flask(__name__)
app.config.from_object(Config)
# 开发/调参期：静态资源不缓存，改完 CSS/JS 刷新即生效，避免"改了没反应"
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0

# 初始化数据库
from models.mysql_db import db, User
db.init_app(app)

from models.mongo_db import mongo 
mongo.init_app(app)

login_manager = LoginManager()
login_manager.login_view = 'auth.login'
login_manager.init_app(app)

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

# 注册蓝图
from routes.auth import auth_bp
from routes.journal import journal_bp
from routes.chat import chat_bp
from routes.creation import creation_bp
from routes.usergui import work_interaction_bp
from user_profile.api import profile_bp
from routes.therapy import therapy_bp

app.register_blueprint(creation_bp)
app.register_blueprint(auth_bp)
app.register_blueprint(journal_bp)
app.register_blueprint(chat_bp)
app.register_blueprint(work_interaction_bp, url_prefix='/work')
app.register_blueprint(profile_bp)
app.register_blueprint(therapy_bp)

# 剧本疗愈的 Mongo 访问依赖 app 实例：启动即注入，
# 否则首载剧本架为空（_FLASK_APP 要等第一次开新局才被赋值）
from services import therapy_crew as _therapy_crew
_therapy_crew.init_app(app)

@app.route('/')
def home():
    return render_template('index.html')


# ================================================================
# 美术风格（主题）体系 —— 见 themes.py
# 全站页面通过 <html data-theme> + CSS 变量 + theme_asset() 取图切换风格。
# ================================================================
from themes import GARDEN_SCENES, THEMES, DEFAULT_THEME, is_valid_theme, theme_asset_url, current_theme_key


def _current_theme():
    return current_theme_key()


@app.context_processor
def inject_theme():
    theme = _current_theme()
    return {
        'g_theme': theme,
        'g_scene': GARDEN_SCENES[theme],
        'g_themes': THEMES,
        'theme_asset': lambda name: theme_asset_url(theme, name),
    }


# ================================================================
# 晨日街景背景音乐。其他场景不加载播放资源。
# 扫描 static/music/ 的逻辑在 routes/creation.py 的 get_music_library；
# 这里按目录修改时间缓存，避免每个请求都读一次文件夹。
# ================================================================
_music_cache = {'mtime': None, 'tracks': []}


def _music_tracks():
    from routes.creation import get_music_library, MUSIC_DIR
    try:
        mtime = os.path.getmtime(MUSIC_DIR)
    except OSError:
        return []
    if _music_cache['mtime'] != mtime:
        _music_cache['tracks'] = get_music_library()
        _music_cache['mtime'] = mtime
    return _music_cache['tracks']


@app.context_processor
def inject_music():
    morning = request.endpoint == 'creation.garden' and current_theme_key() == 'cute'
    return {'g_music_tracks': _music_tracks() if morning else []}


@app.route('/theme', methods=['POST'])
def set_theme():
    """切换美术风格。登录用户写进账号；未登录写 session。"""
    from flask import session, jsonify
    from flask_login import current_user
    key = request.form.get('theme')
    if not key and request.is_json:
        data = request.get_json(silent=True)
        key = data.get('theme') if isinstance(data, dict) else None
    if not is_valid_theme(key):
        return jsonify({'ok': False, 'error': 'unknown theme'}), 400
    if current_user.is_authenticated:
        current_user.theme = key
        db.session.commit()
    session['theme'] = key
    return jsonify({'ok': True, 'theme': key, 'name': THEMES[key]['name']})


def _ensure_schema():
    """补齐已有安装缺少的列，已有记录继续使用原值。"""
    from sqlalchemy import inspect, text
    columns = {
        'users': {'theme': "VARCHAR(20) NOT NULL DEFAULT 'cute'"},
        'journals': {'emotion_tags': 'VARCHAR(255)', 'emotion_reason': 'TEXT', 'risk_level': 'VARCHAR(20)'},
        'artworks': {'intent': 'VARCHAR(255)', 'emotion_score': 'FLOAT'},
    }
    with app.app_context():
        try:
            inspector = inspect(db.engine)
            for table, additions in columns.items():
                existing = {column['name'] for column in inspector.get_columns(table)}
                for name, definition in additions.items():
                    if name not in existing:
                        db.session.execute(text(f'ALTER TABLE `{table}` ADD COLUMN `{name}` {definition}'))
                        db.session.commit()
        except Exception as exc:
            db.session.rollback()
            app.logger.warning('数据库结构检查未完成，请核对数据库连接与部署记录。%s', type(exc).__name__)


_ensure_schema()

@app.teardown_appcontext
def close_db_connection(exception):
    from models.mysqldb_alt import db
    db.close()
    
if __name__ == '__main__':
    # use_reloader=False：关闭自动重载子进程，避免启动时所有 import 被执行两遍
    # （Windows + Defender 下第二遍 re-import 很慢，易被中断报 KeyboardInterrupt）。
    # 代价：改了 Python 代码不会自动重启，需手动 Ctrl+C 后重新运行。
    #
    # 监听地址：默认 0.0.0.0，让同一局域网内的手机/平板也能访问，
    # 便于用真机测试摄像头与麦克风（这两个 API 在移动端浏览器上行为与桌面不同）。
    # 想只允许本机访问时，设 HOST=127.0.0.1 即可。
    import os
    host = os.environ.get('HOST', '127.0.0.1')
    port = int(os.environ.get('PORT', '5000'))
    print(f'\n  本机访问:   http://127.0.0.1:{port}')
    if host == '0.0.0.0':
        import socket
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(('8.8.8.8', 80))
            lan_ip = s.getsockname()[0]
            s.close()
            print(f'  手机访问:   http://{lan_ip}:{port}   （手机需连同一 WiFi）')
        except Exception:
            print('  手机访问:   用 ipconfig 查本机局域网 IP，端口 ' + str(port))
    print()
    import sys
    if '--open-browser' in sys.argv:
        from threading import Thread
        import webbrowser
        from werkzeug.serving import make_server
        # 绑定成功后才打开浏览器。服务器在启动窗口内运行，Ctrl+C 直接结束本实例。
        with make_server(host, port, app, threaded=True) as server:
            Thread(target=webbrowser.open, args=(f'http://127.0.0.1:{port}/',), daemon=True).start()
            server.serve_forever()
    else:
        app.run(host=host, port=port, debug=False, use_reloader=False)
