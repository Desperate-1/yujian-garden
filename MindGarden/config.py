import os
import json
import threading
import datetime
import secrets
import time
from pathlib import Path
from sqlalchemy.engine import URL

# ============================================================
#  AI 调用日志（自动记录，供申报材料《人工智能工具使用说明》使用）
# ------------------------------------------------------------
#  每次调用大模型都会追加一行 JSON 到 logs/ai_call_log.jsonl。
#  目的：申报时能凭真实记录导出调用链，而不是凭记忆复述。
#  写日志失败绝不影响主流程（全部 try/except 兜底）。
# ============================================================
_LOG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'logs', 'ai_call_log.jsonl')
_LOG_LOCK = threading.Lock()


def log_ai_call(site, provider, model, prompt="", response="", usage=None,
                elapsed=None, image=None, ok=True, error=None, extra=None):
    """追加一条 AI 调用记录。site=业务环节(如 pose_vision)。"""
    try:
        rec = {
            'time': datetime.datetime.now().isoformat(timespec='seconds'),
            'site': site,
            'provider': provider,
            'model': model,
            'ok': ok,
            'elapsed_sec': round(elapsed, 2) if elapsed is not None else None,
        }
        if usage:
            rec['usage'] = {k: v for k, v in usage.items() if isinstance(v, (int, float))}
        os.makedirs(os.path.dirname(_LOG_PATH), exist_ok=True)
        line = json.dumps(rec, ensure_ascii=False)
        with _LOG_LOCK:
            with open(_LOG_PATH, 'a', encoding='utf-8') as f:
                f.write(line + '\n')
    except Exception:
        pass


def _read_secret(name):
    """读密钥环境变量：去掉首尾空白，并剥离误加的最外层一对引号。

    Windows 上 cmd 的 `set NAME="sk-xxx"` 会把引号一起写进变量值，
    拼成 `Bearer "sk-xxx"` 后服务端一律 401，而 print 出来看着是正常的。
    引号永远不属于 key 本身，这里直接剥掉并留提示，不让坏 token 发出去。
    """
    v = os.environ.get(name, '').strip()
    if len(v) >= 2 and v[0] == v[-1] and v[0] in ('"', "'"):
        print(f"[配置提示] {name} 的值首尾带引号，已自动剥离。"
              f"建议重设该变量去掉引号（引号不属于 key 本身）。")
        v = v[1:-1].strip()
    return v


def session_secret():
    configured = os.environ.get('SECRET_KEY')
    if configured:
        return configured
    directory = Path(__file__).resolve().parent / 'instance'
    directory.mkdir(exist_ok=True, mode=0o700)
    path = directory / 'session.key'
    try:
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    except FileExistsError:
        # Another worker can have created the file before writing its content.
        for _ in range(100):
            value = path.read_text(encoding='ascii').strip()
            if len(value) == 64:
                return value
            time.sleep(0.01)
        raise RuntimeError('本地会话密钥不完整，请设置 SECRET_KEY 或修复 instance/session.key')
    with os.fdopen(fd, 'w', encoding='ascii') as file:
        value = secrets.token_hex(32)
        file.write(value)
    return value


def mysql_options():
    return dict(host=os.environ.get('MYSQL_HOST', '127.0.0.1'), port=int(os.environ.get('MYSQL_PORT', 3306)),
                user=os.environ.get('MYSQL_USER', 'root'), password=os.environ.get('MYSQL_PASSWORD', ''),
                database=os.environ.get('MYSQL_DATABASE', 'teaching'), charset='utf8mb4')


class Config:
    # ============ 敏感配置：全部从环境变量读取（终端 export 设置），不再硬编码在文件中 ============
    # PowerShell（本机终端）示例：
    #   $env:DEEPSEEK_API_KEY = "sk-你的key"
    #   $env:KIMI_API_KEY     = "sk-你的key"
    #   $env:IFLYTEK_APP_ID = "..."; $env:IFLYTEK_API_KEY = "..."; $env:IFLYTEK_API_SECRET = "..."
    #   $env:TENCENT_SECRET_ID = "..."; $env:TENCENT_SECRET_KEY = "..."
    #   $env:SECRET_KEY = "python -c 'import secrets; print(secrets.token_hex(32))' 生成的随机串"
    # Git Bash 示例：export DEEPSEEK_API_KEY="sk-你的key"（其余同理）
    # 未设置时 API 调用会失败（聊天返回兜底语、语音/创作/画像提取记录错误），请先 export 再启动。
    # 坑：值里不要带引号。cmd 的 `set NAME="sk-xxx"`(= 写法) 会把引号一起存进变量值，
    #     请求头变成 Bearer "sk-xxx" -> 服务端 401，且 print 出来看不出问题。
    #     PowerShell 的 `$env:NAME = "sk-xxx"` 不会带引号，是安全的写法。

    SECRET_KEY = session_secret()
    _mysql = mysql_options()
    SQLALCHEMY_DATABASE_URI = URL.create(
        'mysql+pymysql', username=_mysql['user'], password=_mysql['password'], host=_mysql['host'],
        port=_mysql['port'], database=_mysql['database'], query={'charset': 'utf8mb4'})
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    MONGO_URI = os.environ.get('MONGO_URI', 'mongodb://127.0.0.1:27017/teaching')

    # DeepSeek API（环境变量 DEEPSEEK_API_KEY）
    DEEPSEEK_API_KEY = _read_secret('DEEPSEEK_API_KEY')
    DEEPSEEK_ENDPOINT = 'https://api.deepseek.com/v1/chat/completions'
    # 模型名：官方文档现用 `deepseek-flash`（旧名 deepseek-v4-flash 仍可调用，
    # 但对应模型已下线，会由 DeepSeek-V4.1-Flash 按 Flash 价格提供服务）。
    DEEPSEEK_MODEL = (os.environ.get('DEEPSEEK_MODEL') or 'deepseek-flash').strip()

    # Kimi K2.6 视觉 API（月之暗面 Moonshot 官方，用于图片识图→创作描述；环境变量 KIMI_API_KEY）
    KIMI_API_KEY = _read_secret('KIMI_API_KEY')
    KIMI_ENDPOINT = 'https://api.moonshot.cn/v1/chat/completions'
    KIMI_VISION_MODEL = 'kimi-k2.6'

    # ============================================================
    #  姿态识别（视觉理解）后端选择
    # ------------------------------------------------------------
    #  VISION_PROVIDER 决定用哪个多模态模型做"看图→姿态描述"：
    #    'glm'    -> 智谱 GLM-5.3-Flash（原生多模态，有免费额度）【当前方案 Plan B】
    #    'kimi'   -> 月之暗面 Kimi（原版实现）
    #    'custom' -> 自定义（为后续接入学姐微调模型预留）
    #
    #  设计意图：老师明确"底下用哪个模型问题不大，只要具备姿态识别
    #  vision 理解能力即可"，学姐的方案也是在基础模型上微调。因此把
    #  "用谁"做成一行配置，将来接入微调模型只需新增一个 provider，
    #  不必改业务代码。
    #
    #  切换方式（启动前在终端设置）：
    #    $env:VISION_PROVIDER = "glm"
    # ============================================================
    VISION_PROVIDER = (os.environ.get('VISION_PROVIDER') or 'glm').strip().lower()

    # 智谱 GLM（OpenAI 兼容接口）
    GLM_API_KEY = _read_secret('GLM_API_KEY')
    GLM_ENDPOINT = 'https://open.bigmodel.cn/api/paas/v4/chat/completions'
    # 默认用免费视觉模型 glm-4v-flash（稳定、零成本），万一限流/不可用会
    # 自动降级到 GLM_VISION_MODEL_FALLBACK。这样评委点开时几乎不可能跑不动。
    GLM_VISION_MODEL = (os.environ.get('GLM_VISION_MODEL') or 'glm-4v-flash').strip()
    GLM_VISION_MODEL_FALLBACK = (os.environ.get('GLM_VISION_MODEL_FALLBACK')
                                 or 'glm-5.3-flash').strip()
    # 免费模型偶发 429（访问量过大），失败后重试次数与间隔
    VISION_RETRY = int(os.environ.get('VISION_RETRY') or 2)
    VISION_RETRY_WAIT = float(os.environ.get('VISION_RETRY_WAIT') or 3)

    # 自定义后端（预留：接入学姐微调模型时填写）
    CUSTOM_VISION_ENDPOINT = os.environ.get('CUSTOM_VISION_ENDPOINT', '').strip()
    CUSTOM_VISION_MODEL = os.environ.get('CUSTOM_VISION_MODEL', '').strip()
    CUSTOM_VISION_API_KEY = _read_secret('CUSTOM_VISION_API_KEY')

    # 图片预处理：发送前压缩到最长边不超过该值，避免 base64 体积过大烧 token
    VISION_IMAGE_MAX_SIDE = int(os.environ.get('VISION_IMAGE_MAX_SIDE') or 1024)
    VISION_IMAGE_JPEG_QUALITY = int(os.environ.get('VISION_IMAGE_JPEG_QUALITY') or 85)

    # 姿态分析提示词（各后端共用同一套，保证切换后输出口径一致）
    VISION_POSE_PROMPT = (
        '请详细描述图中人物的姿态、动作、肢体语言、情绪状态、穿着和所处环境。'
        '用中文描述，100字以内。'
    )

    # 用户画像（user_profile）配置
    PROFILE_ENABLED = True                     # 总开关：注入+后台更新
    PROFILE_EXTRACT_MODEL = 'deepseek-flash'
    PROFILE_EXTRACT_TEMPERATURE = 0.3          # 提取用低温，保证JSON稳定
    PROFILE_EXTRACT_MAX_TOKENS = 2048
    PROFILE_EXTRACT_RETRIES = 2                # 空/坏JSON时额外重试次数
    PROFILE_CHUNK_MAX_USER_CHARS = 4000        # 每批用户消息字符上限（防超限）
    PROFILE_CHUNK_MAX_MESSAGES = 30            # 每批消息条数上限
    PROFILE_COMPACT_SUMMARY_CHARS = 1500       # 送入提取的画像摘要上限
    PROFILE_MIN_SESSION_USER_MESSAGES = 3      # 会话用户消息条数低于此值跳过
    PROFILE_MIN_SESSION_USER_CHARS = 50        # 用户消息总字符数低于此值跳过（宽松：多轮短消息会话也值得提取）
    PROFILE_MAX_INJECT_CHARS = 1000            # 注入摘要硬字符上限（≈300-500 token）
    PROFILE_MAX_EVIDENCE = 3                   # 每条属性保留的证据引用条数上限
    PROFILE_MAX_SOURCE_SESSIONS = 3
    PROFILE_MAX_INTERESTS = 15                 # interests 列表上限
    PROFILE_MAX_LIST_ITEMS = 8                 # 其他列表类属性上限
    PROFILE_CONFIDENCE_FLOOR = 0.3             # 置信度低于此值且过期 -> 剪枝
    PROFILE_PRUNE_DAYS = 45                    # last_seen 超过此天数视为过期
    PROFILE_RECENCY_DECAY_PER_DAY = 0.02       # Ebbinghaus 式时间衰减系数
    PROFILE_ADMIN_IDS = []                     # 可查看/操作他人画像的用户id；空=仅本人
    PROFILE_ASYNC = True                       # 会话结束更新走后台线程（False=同步，调试用）


# 启动自检：key 缺失时直接说清楚，避免请求带着空 Bearer 头出去、只看到一句难懂的 401。
# 只报变量名与状态，不打印 key 本身。（带引号的值已由 _read_secret 当场剥离并提示。）
_need = [('DEEPSEEK_API_KEY', Config.DEEPSEEK_API_KEY, 'AI 聊天 / 提示词生成 / 用户画像')]
# 姿态识别只需当前选中的那个后端的 key，不要因为没配另一个就报错
if Config.VISION_PROVIDER == 'glm':
    _need.append(('GLM_API_KEY', Config.GLM_API_KEY, f'姿态识别（VISION_PROVIDER=glm, {Config.GLM_VISION_MODEL}）'))
elif Config.VISION_PROVIDER == 'kimi':
    _need.append(('KIMI_API_KEY', Config.KIMI_API_KEY, f'姿态识别（VISION_PROVIDER=kimi, {Config.KIMI_VISION_MODEL}）'))
elif Config.VISION_PROVIDER == 'custom':
    _need.append(('CUSTOM_VISION_API_KEY', Config.CUSTOM_VISION_API_KEY, '姿态识别（VISION_PROVIDER=custom）'))
    if not Config.CUSTOM_VISION_ENDPOINT:
        print('[配置警告] VISION_PROVIDER=custom 但 CUSTOM_VISION_ENDPOINT 未设置。')
else:
    print(f"[配置警告] VISION_PROVIDER='{Config.VISION_PROVIDER}' 不是已知值"
          f"（可选 glm / kimi / custom），姿态识别将不可用。")

for _name, _val, _use in _need:
    if not _val:
        print(f"[配置警告] 环境变量 {_name} 未设置或为空 -> 相关 API 调用会返回 401。"
              f"\n           用途：{_use}"
              f"\n           请设置后重启本进程。"
              f"\n           PowerShell 写法：$env:{_name} = \"你的key\"")

print(f"[配置] 姿态识别后端 VISION_PROVIDER = {Config.VISION_PROVIDER}"
      + (f" ({Config.GLM_VISION_MODEL})" if Config.VISION_PROVIDER == 'glm' else '')
      + (f" ({Config.KIMI_VISION_MODEL})" if Config.VISION_PROVIDER == 'kimi' else '')
      + (f" ({Config.CUSTOM_VISION_MODEL})" if Config.VISION_PROVIDER == 'custom' else ''))