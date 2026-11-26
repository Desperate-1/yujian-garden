# -*- coding: utf-8 -*-
"""
剧本疗愈 · CrewAI 多智能体 CBT 治疗流程（方案B：库级集成）
================================================================

来源：therapyllm 项目 crew_zh.py（队友郑翔桓），按与老师商讨的方向做了裁剪：

  保留：用户信息收集 → 意图分析 → 剧本设计 → 角色扮演治疗实施 → 团队总结
  砍掉：视频生成三个 agent（通义万相链路）、Gradio 界面、chromadb 记忆库、
        启动即清库的破坏性逻辑、全局 SSL 关闭补丁

与原版的关键差异（都是刻意为之）：
  1. memory=False —— 记忆走我们自己的 MongoDB（therapy_scripts 集合），
     不拖进 chromadb / torch / 2.5G embedding 模型；
  2. 人机交互工具不再走 Gradio 轮询，而是 threading.Event + Mongo 持久化，
     由 Flask 路由投递用户回答；
  3. 文件工具（FileRead/FileWriter）全部去掉 —— 任务产出经 CrewAI 的
     context 机制直接传递，最终由本模块统一落 Mongo；
  4. 剧本可中断续接：active 会话状态实时写 Mongo，服务重启后可从
     「角色扮演」阶段带着已有剧本与对话记录恢复（见 resume_session）。

⚠️ 必须在 import crewai 之前设好 CREWAI_STORAGE_DIR，
   否则 crewai 会在 %LOCALAPPDATA%\\CrewAI 下建目录（权限可能失败）。
"""

import os
import threading
import time
import traceback
import uuid
from typing import Any, Dict, List, Optional

# ---- 在 import crewai 之前定好存储目录（模块级，越早越好）----
_STORAGE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                            'crewai_storage')
os.makedirs(_STORAGE_DIR, exist_ok=True)
os.environ.setdefault('CREWAI_STORAGE_DIR', _STORAGE_DIR)
# crewai 的遥测默认外发数据，关掉
os.environ.setdefault('CREWAI_TRACING_ENABLED', 'false')
os.environ.setdefault('OTEL_SDK_DISABLED', 'true')

# crewai 即使 tracing=False，Crew 构造时也会初始化 TraceCollectionListener，
# 其 TokenManager 会往 %LOCALAPPDATA%\crewai 写密钥文件（权限可能直接失败）。
# 把它的安全存储目录重定向到项目内，一劳永逸。
try:
    from pathlib import Path as _Path
    from crewai.cli.shared.token_manager import TokenManager as _TM

    def _secure_storage_path(_self):
        p = _Path(_STORAGE_DIR) / 'secure'
        p.mkdir(parents=True, exist_ok=True)
        return p

    _TM.get_secure_storage_path = _secure_storage_path
except Exception:   # crewai 版本差异导致路径不存在时，不阻塞主流程
    pass

from pydantic import BaseModel, Field, ConfigDict  # noqa: E402


# ============================================================
#  数据模型（从 crew_zh.py 原样保留的 5 个，视频相关 2 个已删）
# ============================================================
class UserProfile(BaseModel):
    """用户档案"""
    model_config = ConfigDict(populate_by_name=True)
    basic_info: Dict[str, str] = Field(..., description="用户基本信息", alias="基本信息")
    medical_history: Dict[str, Any] = Field(..., description="精神病史和隐私信息", alias="精神病史")
    current_symptoms: List[str] = Field(..., description="当前困扰", alias="当前困扰")


class UserReqInfo(BaseModel):
    """意图分析"""
    model_config = ConfigDict(populate_by_name=True)
    raw_requirement: List[str] = Field(..., description="用户表层需求", alias="表层需求")
    underlying_req: List[str] = Field(..., description="深层心理需求", alias="深层心理需求")
    emotional_state: Dict[str, float] = Field(
        ...,
        description="情感状态评估(0-10分制)，"
        "【强制】必须且只能使用以下标准心理学情感指标进行0-10分制评估: "
        "distress-痛苦, anxiety-焦虑, depression-抑郁, anger-愤怒, fear-恐惧, sadness-悲伤, "
        "guilt-内疚, shame-羞耻, loneliness-孤独, helplessness-无助, envy-嫉妒, "
        "hopelessness-绝望, worthlessness-无价值感, insecurity-不安全感, "
        "hope-希望, calm-平静, joy-愉悦, contentment-满足, confidence-自信。"
        "禁止使用其他自定义指标。",
        alias="情感状态")


class TherapyScenario(BaseModel):
    """治疗剧本"""
    model_config = ConfigDict(populate_by_name=True)
    scenario_topic: str = Field(..., description="治疗剧情主题", alias="治疗主题")
    roles: List[Dict[str, str]] = Field(..., description="角色设定", alias="角色设定")
    design_dialogue_flow: List[Dict[str, Any]] = Field(..., description="预设对话流程", alias="对话流程")
    therapeutic_goals: str = Field(..., description="治疗目标", alias="治疗目标")
    expected_outcomes: str = Field(..., description="预期效果", alias="预期效果")


class TreatmentProcedure(BaseModel):
    """治疗实施记录"""
    model_config = ConfigDict(populate_by_name=True)
    real_roles: List[Dict[str, str]] = Field(..., description="实际对话角色", alias="实际对话角色")
    real_dialogue_flow: List[Dict[str, Any]] = Field(..., description="实际对话流程", alias="实际对话流程")
    completed_stages: List[str] = Field(..., description="完成的治疗阶段", alias="完成的治疗阶段")
    treatment_goals_achieved: bool = Field(..., description="治疗目标是否达成", alias="治疗目标是否达成")
    early_termination_reason: Optional[str] = Field(None, description="提前终止的原因", alias="提前终止原因")


class OverallRecord(BaseModel):
    """全程总结"""
    model_config = ConfigDict(populate_by_name=True)
    summary_text: str = Field(..., description="治疗全程概述", alias="治疗全程概述")
    treatment_effect_eval: List[Dict[str, float]] = Field(..., description="治疗效果评价", alias="治疗效果评价")
    agent_effect_eval: List[Dict[str, float]] = Field(..., description="团队成员工作质量评价", alias="团队成员工作质量评价")


class HumanInputSchema(BaseModel):
    question: str = Field(description="与用户对话交互的内容")


# ============================================================
#  跨场馆流转：agent 主动邀请用户去别的景点
# ------------------------------------------------------------
#  老师商讨的方向：剧本进行中或走完后，由程序根据上下文
#  「带用户飞转」—— 去喷泉跳舞释放、去树洞写日记整理、
#  去回廊把情绪变成作品。邀请写进会话状态，前端轮询到后
#  弹出邀请卡（倒计时自动前往，可取消），用户始终有决定权。
# ============================================================
SCENES = {
    'fountain': {'name': '心灵喷泉', 'url': '/garden/mirror',
                 'hint': '用身体把情绪跳出来'},
    'journal': {'name': '树洞日记', 'url': '/journal/create',
                'hint': '把此刻的想法写下来'},
    'creation': {'name': '疗愈回廊', 'url': '/gallery',
                 'hint': '把这份情绪变成一件作品'},
}


class SceneInviteSchema(BaseModel):
    scene: str = Field(description="要邀请用户前往的场景：fountain(心灵喷泉/跳舞) / journal(树洞日记/写作) / creation(疗愈回廊/艺术创作)")
    message: str = Field(description="邀请语，一两句温暖的话，说明为什么建议现在去那里")


def _send_invitation(session_id: str, scene: str, message: str) -> str:
    info = SCENES.get(scene)
    if not info:
        return f"未知场景 {scene}，可用：{', '.join(SCENES)}"
    _persist(session_id, invitation={
        'scene': scene, 'name': info['name'], 'url': info['url'],
        'message': message, 'ts': time.time()})
    _append_transcript(session_id, 'agent', f'[邀请] {message}（→ {info["name"]}）')
    return f"邀请已发送给用户（目的地：{info['name']}）。用户可能去也可能留下，请自然继续对话，不要追问。"


# ============================================================
#  会话桥：Agent ↔ 用户
# ------------------------------------------------------------
#  agent 调用人机交互工具 → 问题写入会话（内存 + Mongo），
#  线程在 Event 上等待；Flask 路由收到用户回答后 set Event。
# ============================================================
class SessionBridge:
    ANSWER_TIMEOUT = 600          # 等用户回答最长 10 分钟（比原版 300s 宽）
    PENDING_TIMEOUT_TEXT = "用户暂时没回应，请用温和的方式继续推进对话，不要结束治疗。"

    def __init__(self, session_id: str):
        self.session_id = session_id
        self.event = threading.Event()
        self.answer: Optional[str] = None
        self.stop_requested = False

    def ask(self, question: str) -> str:
        """agent 侧调用：发一个问题，阻塞等用户回答"""
        if self.stop_requested:
            return "用户已离开，请自然收尾并结束治疗。"
        _append_transcript(self.session_id, 'agent', question)
        _set_state(self.session_id, pending_question=question)
        self.event.clear()
        got = self.event.wait(self.ANSWER_TIMEOUT)
        _set_state(self.session_id, pending_question=None)
        if self.stop_requested:
            return "用户已离开，请自然收尾并结束治疗。"
        if not got or self.answer is None:
            return self.PENDING_TIMEOUT_TEXT
        ans = self.answer
        self.answer = None
        _append_transcript(self.session_id, 'user', ans)
        return ans

    def deliver(self, text: str):
        """路由侧调用：投递用户回答"""
        self.answer = text
        self.event.set()

    def stop(self):
        self.stop_requested = True
        self.event.set()


# ============================================================
#  会话存储：内存（活的桥）+ Mongo（持久状态）
# ============================================================
_BRIDGES: Dict[str, SessionBridge] = {}
_THREADS: Dict[str, threading.Thread] = {}
_STATES: Dict[str, Dict[str, Any]] = {}     # 内存态：无 app context 也能查
_LOCK = threading.Lock()

_FLASK_APP = None   # 后台线程里操作 Mongo 需要 app context


def init_app(flask_app):
    """app 启动时就把 Flask 实例交过来。

    之前 _FLASK_APP 只在 start_session/resume_session 里赋值，
    服务刚启动时 list_sessions 因 _FLASK_APP is None 跳过 Mongo 查询，
    剧本架首载永远是空的——必须新建一局再退出才看得到老剧本。
    """
    global _FLASK_APP
    _FLASK_APP = flask_app


def _get_collection():
    from models.mongo_db import mongo
    return mongo.db.therapy_scripts


def _persist(sid: str, **fields):
    """把状态字段写进 Mongo（长时记忆的落点）。失败只警告，不打断治疗。"""
    fields['updated_at'] = time.time()
    with _LOCK:
        _STATES.setdefault(sid, {}).update(fields)
    if _FLASK_APP is None:
        return
    try:
        with _FLASK_APP.app_context():
            _get_collection().update_one(
                {'session_id': sid}, {'$set': fields}, upsert=True)
    except Exception as e:
        print(f'[剧本疗愈] Mongo 持久化失败（不影响进行中的会话）: {e}')


def _set_state(sid: str, **fields):
    _persist(sid, **fields)


def _append_transcript(session_id: str, role: str, content: str):
    entry = {'role': role, 'content': content, 'ts': time.time()}
    with _LOCK:
        _STATES.setdefault(session_id, {}).setdefault('transcript', []).append(entry)
    if _FLASK_APP is None:
        return
    try:
        with _FLASK_APP.app_context():
            _get_collection().update_one(
                {'session_id': session_id},
                {'$push': {'transcript': entry}, '$set': {'updated_at': time.time()}},
                upsert=True)
    except Exception as e:
        print(f'[剧本疗愈] 对话记录写入失败: {e}')


# ============================================================
#  Crew 构建（LLM / 工具 / 五个 agent / 五个任务）
# ============================================================
def _make_llms():
    """三个温度档的 DeepSeek LLM，对应原版的 analyzer / prompt / manager / design"""
    from crewai import LLM
    api_key = os.environ.get('DEEPSEEK_API_KEY', '')
    if not api_key:
        raise RuntimeError('DEEPSEEK_API_KEY 未设置，剧本疗愈不可用')
    base_url = os.environ.get('DEEPSEEK_API_BASE', 'https://api.deepseek.com/v1')
    model = os.environ.get('DEEPSEEK_MODEL', 'deepseek-flash')
    if '/' not in model:
        model = f'deepseek/{model}'

    def _llm(temperature, max_tokens=4000, timeout=300):
        return LLM(model=model, api_key=api_key, base_url=base_url,
                   temperature=temperature, max_tokens=max_tokens,
                   request_timeout=timeout)

    return {
        'analyzer': _llm(1.0),
        'prompt': _llm(1.1),
        'manager': _llm(0.7),
        'design': _llm(1.3, max_tokens=8192, timeout=600),   # 长 JSON 剧本输出
    }


# 剧本基调跟随用户在首页选的美术风格（用户强制要求时以用户为准）
_STYLE_TONES = {
    'cute':  '剧本整体基调：柔软甜暖的童话糖果风，场景可以是糖果屋、云朵下午茶，角色像毛绒玩偶一样温暖。',
    'fresh': '剧本整体基调：自然清新的田园风，场景可以是清晨植物园、微风与溪流，角色温柔轻盈。',
    'ugly':  '剧本整体基调：丑萌搞怪但内心温柔的世界，角色是歪歪扭扭的小怪兽，看着滑稽、其实善良。',
}


def _build_crew(bridge: SessionBridge, resume_ctx: Optional[Dict[str, Any]] = None,
                preset: Optional[Dict[str, Any]] = None):
    """构建治疗 Crew。

    resume_ctx 不为 None 时是「断点续接」：跳过收集/意图/设计三段，
    直接把已有的档案、意图、剧本、对话记录塞进实施任务的描述里。

    preset 不为 None 时是「开局表格」：用户在开赛前已经填了
    昵称/心情/处境/期望女巫形象，收集与剧本设计任务直接使用，
    不再重复提问，剧本基调跟随用户选的美术风格。
    """
    from crewai import Agent, Crew, Task, Process
    from crewai.tools import BaseTool

    llms = _make_llms()
    preset = preset or {}
    style_tone = _STYLE_TONES.get(preset.get('style'), _STYLE_TONES['cute'])

    # ---- 人机交互工具（绑定本会话的桥）----
    class ChatBridgeTool(BaseTool):
        name: str = "人机交互工具"
        description: str = "使用此工具与用户进行对话交互，每次调用发送一段话并等待用户真实回应"
        args_schema: type = HumanInputSchema

        def _run(self, question: str) -> str:
            return bridge.ask(question)

    chat_tool = ChatBridgeTool()

    # ---- 场景邀请工具（跨场馆流转，绑定本会话）----
    class SceneInviteTool(BaseTool):
        name: str = "场景邀请工具"
        description: str = ("在治疗进入合适节点时，主动邀请用户前往花园的其他场馆继续疗愈。"
                            "调用后系统会向用户弹出邀请卡，用户可自行决定是否前往。")
        args_schema: type = SceneInviteSchema

        def _run(self, scene: str, message: str) -> str:
            return _send_invitation(bridge.session_id, scene, message)

    invite_tool = SceneInviteTool()

    # ---- Agent 定义（backstory 与原版一致，文件工具相关提示已随工具一起移除）----
    collector = Agent(
        role='用户信息收集专员',
        goal='通过多轮对话收集用户基本信息（昵称、年龄、性别、职业等隐私信息）、精神病史隐私、当前困扰（必须问），建立完整的用户档案',
        backstory=(
            '专业的信息收集专家，擅长通过温和的对话方式逐步获取用户信息，注重隐私保护和用户体验。'
            '【铁律1】必须通过人机交互工具逐项收集信息，绝对禁止编造。即使只差一个字段，也必须调用工具询问，不能自己填。'
            '【铁律2】用户拒绝（说"隐私""不想说""不方便"等）→ 该字段记空字符串""，立即进入下一步，绝不能填入"用户拒绝提供""未知"等臆造文字。'
            '【铁律3】当前困扰是治疗入口，必须通过人机交互工具问到，不可跳过。'
            '【铁律4】问法要自然亲切，一次只问一件事，像朋友聊天，不要像填表审讯。'
        ),
        llm=llms['analyzer'],
        function_calling_llm=llms['manager'],
        tools=[chat_tool],
        allow_delegation=False,
        max_retry_limit=5,
        verbose=False,
    )

    intent_analyst = Agent(
        role="对话意图识别专家",
        goal="基于用户信息，分析用户当前潜在深层需求和情感状态，识别非字面表达的深层心理需求，提供极强的情感共鸣",
        backstory="拥有心理学背景的AI专家，具备敏锐的情感洞察力和共情能力，能准确捕捉用户的真实意图和情感需求。",
        llm=llms['analyzer'],
        function_calling_llm=llms['manager'],
        allow_delegation=False,
        max_retry_limit=5,
        verbose=False,
    )

    scenario_designer = Agent(
        role="情境设计治疗师",
        goal="基于用户信息和识别出的意图及需求，创作设计用户友好的中文情境治疗剧情",
        backstory="专业的心理治疗情境设计师，具备专业心理学知识，拥有个性化编剧和极强共情能力。",
        llm=llms['design'],
        function_calling_llm=llms['manager'],
        allow_delegation=False,
        max_retry_limit=10,
        verbose=False,
    )

    practitioner = Agent(
        role='情境治疗实施专家',
        goal='读取治疗剧本，通过多轮持续对话完整实施情境治疗，每轮都调用人机交互工具获取用户真实回应，灵活调整表达方式推进下一轮对话，确保完成所有治疗阶段后再基于真实对话生成记录',
        backstory=("【最高优先级：多轮对话是强制要求】"
            "你是通过连续多轮对话来实施治疗的，一次人机交互工具调用 = 一轮对话，远远不够。"
            "你必须调用人机交互工具很多次（通常至少5-15轮）才能完成整个治疗过程。"
            "调用一次人机交互工具 ≠ 任务完成！任务完成的唯一条件是：剧本中所有治疗阶段都已完成，并且用户明确说了'结束对话'或'停止治疗'。\n\n"
            "【当用户回应简短或不理解时，必须继续对话】"
            "- 用户说'啥'、'什么意思'、'不明白' → 这是用户没理解，不是结束信号！"
            "  你必须：用更简单通俗的语言重新表达，再次调用人机交互工具发送给用户。"
            "- 用户说'无'、'不知道'、'嗯'、'哦' → 这是需要更多引导的信号，不是结束信号！"
            "  你必须：使用开放式问题引导，从身体感觉、情绪状态、想法认知等不同角度提问。\n\n"
            "【结束对话的唯一合法条件】"
            "1) 用户明确说出了'结束对话'、'停止治疗'、'就到这里吧'等明确拒绝继续的话；"
            "2) 剧本中所有治疗阶段都已完成，并且你询问了'是否还有其他困扰需要讨论？'，用户回答了'没有'。\n\n"
            "【角色形象要求】"
            "扮演剧本角色时，每段台词开头用「角色名：」标明是谁在说话，让用户分得清角色。"
            "绝对不可扮演用户本人。具备极强共情能力，积极乐观，尊重用户边界。\n\n"
            "【跨场馆邀请：在合适的节点带用户去花园里别处走走】"
            "你还配备了场景邀请工具，可以在以下时机主动邀请用户："
            "a) 某个治疗阶段顺利完成、用户情绪明显松动时；"
            "b) 用户的困扰更适合用身体释放（邀请去心灵喷泉跳舞）、书写整理（邀请去树洞日记）"
            "或艺术表达（邀请去疗愈回廊创作）来延续时；"
            "c) 全部治疗阶段完成、收尾时作为温柔的下一步建议。"
            "注意：一次治疗全程最多邀请1-2次，绝不连续邀请；邀请语要承接当下的对话内容，"
            "说明为什么此刻适合去那里；发出邀请后继续自然对话，不要追问用户去了没有。"),
        llm=llms['prompt'],
        function_calling_llm=llms['manager'],
        tools=[chat_tool, invite_tool],
        allow_delegation=False,
        max_retry_limit=5,
        max_execution_time=3600,
        use_system_prompt=False,
        verbose=False,
    )

    manager = Agent(
        role="治疗团队经理",
        goal="协调团队成员工作，基于各阶段产出客观总结治疗全程并评价工作质量",
        backstory="经验丰富的心理治疗项目经理，擅长协调专业团队并提供质量把控。",
        llm=llms['manager'],
        function_calling_llm=llms['manager'],
        allow_delegation=False,
        max_retry_limit=5,
        verbose=False,
    )

    # ---- 任务定义（文件读写提示已移除，产出经 context 传递）----
    # 开局表格：用户赛前填好的信息直接采用，收集任务不再重复提问
    preset_lines = []
    if preset.get('nickname'):
        preset_lines.append(f"昵称：{preset['nickname']}")
    if preset.get('mood'):
        preset_lines.append(f"当前心情：{preset['mood']}")
    if preset.get('situation'):
        preset_lines.append(f"当前处境：{preset['situation']}")
    collect_prefix = ''
    if preset_lines:
        collect_prefix = (
            "【开局表格（用户开赛前亲手填的，直接采用，绝对不要重复提问这些内容）】\n"
            + '\n'.join(preset_lines)
            + "\n当前困扰可结合「当前心情/处境」理解，但仍需用一次对话温和确认细节。\n\n")

    collect_task = Task(
        description=(
            collect_prefix +
            "按以下顺序执行，每一步都必须调用人机交互工具，不可跳过、不可合并、不可编造数据：\n\n"
            "第1步：问昵称，记录用户原话。用户拒绝则此字段记空字符串，继续下一步。"
            "（若开局表格已提供昵称，跳过此步，直接使用即可）\n"
            "第2步：问年龄，规则同上。\n"
            "第3步：问性别，规则同上。\n"
            "第4步：问职业/教育，规则同上。\n"
            "第5步：问精神病史（既往病史、家族史、用药情况），规则同上。\n"
            "第6步：问当前心理困扰。此步骤不可跳过，必须获得用户实质性回答。如用户回避，换一种温和方式再问一次。\n\n"
            "⚠️ 拒绝=留空字符串''，绝对不要把\"用户拒绝提供\"\"未知\"等臆造文字填入字段。"
            "每一步都必须真正调用工具，严禁在工具调用之间自行脑补多个字段。"
        ),
        expected_output="完整的用户档案JSON数据，包含基本信息、病史隐私、当前困扰",
        agent=collector,
        output_json=UserProfile,
    )

    intent_task = Task(
        description=("基于已收集的用户信息，深度分析用户的潜在深层心理需求，"
            "识别非字面表达的情感状态和真实意图，提供情感共鸣和理解。"
            "【输出格式强制要求】必须输出严格的JSON格式，字段名："
            "raw_requirement(用户表层需求，字符串数组)、underlying_req(深层心理需求，字符串数组)、"
            "emotional_state(情感状态评估，键为英文情感指标名如anxiety/distress等，值为0-10分数)。"),
        expected_output="严格的JSON格式报告，字段名必须为: raw_requirement, underlying_req, emotional_state",
        agent=intent_analyst,
        context=[collect_task],
        output_json=UserReqInfo,
    )

    # 剧本设计：基调跟随用户选的美术风格；用户选定的治愈女巫要登场；
    # 用户在表格里写的剧情要求是最高优先级
    design_extras = [style_tone]
    # 女巫的上下文记忆：过往心灵旅程摘要回流进新剧本，
    # 让新故事可以轻轻承接旧经历（一切以用户当下填的需求为准，不生硬复述）
    try:
        _uid = _session_user_id(bridge.session_id)
        if _uid:
            from services.witch_memory import recent_memories
            _journey = [str(m.get('text', '')) for m in recent_memories(_uid, limit=30)
                        if m.get('kind') in ('therapy', 'therapy_done')][:3]
            _journey = [t for t in _journey if t]
            if _journey:
                design_extras.append(
                    '【用户的过往心灵旅程】' + '；'.join(_journey) +
                    '。新剧本可以轻轻承接这些经历（比如老角色回来看望、熟悉的意象重现），'
                    '也可以另起新篇章——一切以用户当下的需求为准。')
    except Exception:
        pass
    if preset.get('witch_look'):
        design_extras.append(
            f"用户亲手选的治愈女巫形象：{preset['witch_look']}。"
            "请让她作为剧本里最重要的陪伴角色登场（名字你来起，形象和性格要贴合这段描述）。")
    if preset.get('plot_pref'):
        design_extras.append(f"【最高优先级】用户对剧情的强制要求：{preset['plot_pref']}，必须照做。")

    design_task = Task(
        description=("根据用户信息和识别出的心理意图，创作设计针对性的治疗编剧脚本，"
            "特别是针对原生家庭创伤等心理问题，构建用户友好的治疗情境，让用户通过参与情境对话实现治疗目的。"
            + '\n'.join(design_extras) +
            "【分步设计要求】1. 治疗主题 2. 角色设定（2-3个角色）3. 对话流程（3-5轮关键对话，每轮含角色和内容）"
            "4. 治疗目标 5. 预期效果。"
            "【输出格式强制要求】必须输出严格的JSON格式，字段名："
            "scenario_topic(治疗主题)、roles(角色设定，对象数组，每个含name和description)、"
            "design_dialogue_flow(对话流程，对象数组，每个含role和content)、"
            "therapeutic_goals(治疗目标)、expected_outcomes(预期效果)。"
            "【内容长度】总内容控制在2000字符以内。"),
        expected_output="严格的JSON格式剧本，字段名必须为: scenario_topic, roles, design_dialogue_flow, therapeutic_goals, expected_outcomes",
        agent=scenario_designer,
        context=[collect_task, intent_task],
        output_json=TherapyScenario,
    )

    if resume_ctx:
        history_lines = '\n'.join(
            f"{'用户' if m['role'] == 'user' else '角色'}: {m['content']}"
            for m in resume_ctx.get('transcript', [])[-40:])
        practice_desc = (
            "这是一次断点续接的治疗。以下既有材料直接给你，无需重新收集：\n"
            f"【用户档案】{resume_ctx.get('user_info')}\n"
            f"【治疗剧本】{resume_ctx.get('scenario')}\n"
            f"【已有对话记录】\n{history_lines or '（尚无）'}\n\n"
            "请从对话记录中断处自然接续，继续按剧本实施情境治疗。"
            "其余规则不变：每轮对话必须调用人机交互工具，完成所有治疗阶段后才允许结束。")
        practice_ctx = []
    else:
        practice_desc = (
            "根据已创建的治疗剧本，灵活扮演不同角色（绝对不能扮演用户本人），通过多轮共情对话实施情境治疗过程。"
            "【强制要求】必须使用人机交互工具与用户进行实时对话，不能自行生成对话内容。"
            "【流程完整性】必须按照剧本中的预设对话流程完整执行。"
            "【对话连续性】每次对话都要调用人机交互工具获取用户真实响应，然后根据剧本和用户响应继续下一轮对话。"
            "【用户响应处理】当用户给出简短回答如'无'、'不知道'时，应使用开放式问题引导、提供具体选择或示例、"
            "从身体感觉/情绪状态/想法认知等不同角度提问，保持耐心，不要因为简短回答就结束对话。"
            "【结束条件】只有用户明确表示'结束对话'/'停止治疗'，或已完整执行剧本所有治疗阶段后才能结束。"
            "完成预设脚本对话后，询问用户'是否还有困扰需要讨论？'，并根据回答决定是否继续。"
            "根据真实的人机交互对话内容生成治疗记录，不得捏造对话内容。")
        practice_ctx = [design_task]

    practice_task = Task(
        description=practice_desc,
        expected_output="基于真实人机交互对话的完整情境治疗对话记录",
        agent=practitioner,
        context=practice_ctx,
        output_json=TreatmentProcedure,
    )

    summary_task = Task(
        description=("协调总结整个心理治疗过程。基于各阶段任务产出，客观输出治疗过程概要，"
            "并评价：信息收集的完整性、意图分析的准确性、情境设计的专业性、治疗实施的效果。"
            "重点评价不同环节的工作质量，而非剧本中角色的表现。"),
        expected_output="精简的治疗过程总结和工作质量评价",
        agent=manager,
        context=[practice_task] if resume_ctx else [intent_task, design_task, practice_task],
        output_json=OverallRecord,
    )

    if resume_ctx:
        agents = [practitioner, manager]
        tasks = [practice_task, summary_task]
    else:
        agents = [collector, intent_analyst, scenario_designer, practitioner, manager]
        tasks = [collect_task, intent_task, design_task, practice_task, summary_task]

    # 每完成一个任务就把阶段往前推一格，前端按钮实时显示「走到哪了」
    _offset = 3 if resume_ctx else 0
    _counter = {'i': 0}

    def _on_task_done(_output):
        i = _offset + _counter['i']
        _counter['i'] += 1
        advance_stage(bridge.session_id, min(i + 1, 4))
        # 中间产物即产即落库（不等全局结束）—— 前端「剧本卡」、女巫的长期记忆、
        # 以及「中途退出后再回来续接」都靠这口热乎的：缺了 user_info，resume 只能拒绝
        try:
            j = getattr(_output, 'json_dict', None)
            if not j:
                return
            keys = set(j.keys())
            if 'scenario_topic' in j or '治疗主题' in j:
                _persist(bridge.session_id, scenario=j)
                _remember_scenario(bridge.session_id, j)
            # 注意：pydantic json_dict 默认按字段名（英文）序列化，中文 alias 判断要双兼容
            elif ({'basic_info', 'medical_history', 'current_symptoms'} & keys
                  or {'基本信息', '精神病史', '当前困扰'} & keys):
                _persist(bridge.session_id, user_info=j)
            elif ({'raw_requirement', 'underlying_req', 'emotional_state'} & keys
                  or {'表层需求', '深层心理需求'} & keys):
                _persist(bridge.session_id, user_req=j)
        except Exception:
            pass

    return Crew(
        agents=agents,
        tasks=tasks,
        process=Process.sequential,
        memory=False,            # 记忆走 MongoDB，不用 chromadb
        tracing=False,
        planning=False,
        verbose=False,
        task_callback=_on_task_done,
    )


# ============================================================
#  对外接口：启动 / 投递回答 / 查询 / 停止 / 续接 / 列表
# ============================================================
STAGES = {0: '收集信息', 1: '分析意图', 2: '生成剧本', 3: '角色扮演治疗', 4: '总结'}


def _inherit_preset(user_id: int) -> Optional[Dict[str, Any]]:
    """最近一本带开局表格的会话 → 继承它的 preset（开局信息只在第一次问）。"""
    for s in list_sessions(user_id, limit=20):
        p = s.get('preset') or {}
        if any(str(v).strip() for v in p.values()):
            return {k: v for k, v in p.items()
                    if k in ('nickname', 'mood', 'situation', 'witch_look', 'style', 'plot_pref')}
    return None


def _inherit_witch(user_id: int) -> Optional[Dict[str, str]]:
    """用户之前选定的治愈女巫（全局陪伴者）→ 新剧本直接带着 TA，不再重新生成立绘。"""
    try:
        from services.witch_portraits import get_companion
        comp = get_companion(user_id) or {}
        if comp.get('name') or comp.get('portrait'):
            return {'url': str(comp.get('portrait') or ''),
                    'desc': str(comp.get('description') or comp.get('name') or '')}
    except Exception:
        pass
    return None


def start_session(user_id: int, flask_app, preset: Optional[Dict[str, Any]] = None,
                  witch: Optional[Dict[str, Any]] = None) -> str:
    """开一局新的剧本疗愈，返回 session_id。

    preset：开局表格（昵称/心情/处境/期望女巫形象/风格/剧情偏好），
    witch：用户从 3 张生成立绘里选定的治愈女巫 {'url','desc'}。

    首次开剧本才填表选女巫；之后再开新本，preset 继承上一本的、
    witch 沿用用户正在作伴的治愈女巫——不再填表、不再等生图。
    """
    global _FLASK_APP
    _FLASK_APP = flask_app
    preset = dict(preset or {})
    # 开局信息只在第一次问：空着的字段自动从上一本剧本继承；
    # 前端显式传了的字段（比如用户当下选的美术风格）尊重前端，不覆盖
    inherited = _inherit_preset(user_id) or {}
    for k, v in inherited.items():
        if not str(preset.get(k) or '').strip():
            preset[k] = v
    if not witch or not (witch.get('url') or witch.get('desc')):
        witch = _inherit_witch(user_id) or (witch or {})
    session_id = f"therapy_{user_id}_{uuid.uuid4().hex[:12]}"
    bridge = SessionBridge(session_id)
    _BRIDGES[session_id] = bridge
    _persist(session_id,
             session_id=session_id, user_id=user_id, status='running',
             stage=0, stage_name=STAGES[0], pending_question=None,
             created_at=time.time(), transcript=[],
             preset=preset or {}, witch=witch or {})

    def _run():
        try:
            crew = _build_crew(bridge, preset=preset)
            result = crew.kickoff()
            _finish(session_id, result)
        except Exception as e:
            traceback.print_exc()
            _persist(session_id, status='error', error=str(e))

    t = threading.Thread(target=_run, name=f'therapy-{session_id}', daemon=True)
    _THREADS[session_id] = t
    t.start()
    return session_id


def _finish(session_id: str, result):
    """kickoff 完成：把各任务产出拆开落 Mongo"""
    with _LOCK:
        cur_status = (_STATES.get(session_id) or {}).get('status')
    # 用户中途主动退出的局：收尾产物照收（记录/记忆都有价值），
    # 但状态保持 aborted（中断），不被盖成 done（已走完），剧本架显示才诚实
    final_status = 'aborted' if cur_status == 'aborted' else 'done'
    out = {'status': final_status, 'pending_question': None, 'stage': 4, 'stage_name': STAGES[4]}
    try:
        for task_out in getattr(result, 'tasks_output', []) or []:
            j = getattr(task_out, 'json_dict', None)
            if not j:
                continue
            keys = set(j.keys())
            # 注意：pydantic json_dict 默认按字段名（英文）序列化，中文 alias 判断要双兼容
            if {'basic_info', 'medical_history', 'current_symptoms'} & keys \
                    or {'基本信息', '精神病史', '当前困扰'} & keys:
                out['user_info'] = j
            elif {'raw_requirement', 'underlying_req'} & keys or 'emotional_state' in j \
                    or {'表层需求', '深层心理需求'} & keys:
                out['user_req'] = j
            elif 'scenario_topic' in j or '治疗主题' in j:
                out['scenario'] = j
            elif 'real_dialogue_flow' in j or '实际对话流程' in j:
                out['treatment'] = j
            elif 'summary_text' in j or '治疗全程概述' in j:
                out['record'] = j
    except Exception as e:
        print(f'[剧本疗愈] 结果解析异常: {e}')
    _persist(session_id, **out)
    _remember_finished(session_id, out)


# ============================================================
#  女巫的长期记忆：剧本经历回流（文件层，Mongo 不在也写得进）
# ============================================================
def _session_user_id(session_id: str) -> Optional[int]:
    with _LOCK:
        st = _STATES.get(session_id) or {}
    return st.get('user_id')


def _scenario_bits(scenario: Dict[str, Any]):
    """从剧本 JSON 里抠出 主题 / 角色名列表 / 治疗目标（中英键兼容）。"""
    topic = scenario.get('scenario_topic') or scenario.get('治疗主题') or '一段心灵旅程'
    roles = scenario.get('roles') or scenario.get('角色设定') or []
    names = []
    for r in roles:
        if isinstance(r, dict):
            n = r.get('name') or r.get('角色名') or r.get('角色')
            if n:
                names.append(str(n))
    goals = scenario.get('therapeutic_goals') or scenario.get('治疗目标') or ''
    return str(topic), names, str(goals)


def _remember_scenario(session_id: str, scenario: Dict[str, Any]):
    uid = _session_user_id(session_id)
    if not uid:
        return
    try:
        from services.witch_memory import remember
        topic, names, goals = _scenario_bits(scenario)
        text = f'剧本《{topic}》，里面有角色：{"、".join(names[:4]) or "治愈伙伴"}'
        if goals:
            text += f'，目标是{goals[:60]}'
        remember(uid, 'therapy', text, sid=session_id)
    except Exception as e:
        print(f'[剧本疗愈] 写记忆失败（不影响治疗）: {e}')


def _remember_finished(session_id: str, out: Dict[str, Any]):
    uid = _session_user_id(session_id)
    if not uid:
        return
    try:
        from services.witch_memory import remember
        scenario = out.get('scenario')
        if scenario:
            topic, names, _ = _scenario_bits(scenario)
            _remember_scenario(session_id, scenario)   # 兜底：回调没抓到也在这里补上
        else:
            topic, names = '一段心灵旅程', []
        record = out.get('record') or {}
        summary = record.get('summary_text') or record.get('治疗全程概述') or ''
        text = f'剧本《{topic}》走完了全程'
        if summary:
            text += f'，{str(summary)[:80]}'
        remember(uid, 'therapy_done', text, sid=session_id)
    except Exception as e:
        print(f'[剧本疗愈] 写记忆失败（不影响治疗）: {e}')


def deliver_answer(session_id: str, text: str) -> bool:
    bridge = _BRIDGES.get(session_id)
    if not bridge:
        return False
    bridge.deliver(text)
    return True


def get_state(session_id: str, user_id: int) -> Optional[Dict[str, Any]]:
    with _LOCK:
        st = dict(_STATES.get(session_id) or {})
    if st and st.get('user_id') == user_id:
        st.pop('_id', None)
        return st
    # 内存没有（服务重启过）→ 从 Mongo 捞
    if _FLASK_APP is not None:
        try:
            with _FLASK_APP.app_context():
                doc = _get_collection().find_one(
                    {'session_id': session_id, 'user_id': user_id},
                    {'_id': 0})
                return doc
        except Exception:
            return None
    return None


def stop_session(session_id: str, user_id: int) -> bool:
    st = get_state(session_id, user_id)
    if not st:
        return False
    bridge = _BRIDGES.get(session_id)
    if bridge:
        bridge.stop()
    _persist(session_id, status='aborted', pending_question=None)
    return True


def resume_session(session_id: str, user_id: int, flask_app) -> bool:
    """断点续接：带着已有档案/剧本/对话记录，从角色扮演阶段重启 Crew"""
    global _FLASK_APP
    _FLASK_APP = flask_app
    doc = get_state(session_id, user_id)
    if not doc:
        return False
    # 「进行中」只认本进程活着的桥；服务重启后 Mongo 里残留的 running
    # 是僵尸状态（线程早没了），应当允许续接而不是拒之门外
    if doc.get('status') == 'running' and session_id in _BRIDGES:
        return False
    if not (doc.get('scenario') and doc.get('user_info')):
        return False    # 还没走到剧本就断了，只能重开一局

    bridge = SessionBridge(session_id)
    _BRIDGES[session_id] = bridge
    _persist(session_id, status='running', stage=3, stage_name=STAGES[3],
             pending_question=None, resumed_at=time.time())

    ctx = {'user_info': doc.get('user_info'), 'scenario': doc.get('scenario'),
           'transcript': doc.get('transcript', [])}

    def _run():
        try:
            crew = _build_crew(bridge, resume_ctx=ctx)
            result = crew.kickoff()
            _finish(session_id, result)
        except Exception as e:
            traceback.print_exc()
            _persist(session_id, status='error', error=str(e))

    t = threading.Thread(target=_run, name=f'therapy-resume-{session_id}', daemon=True)
    _THREADS[session_id] = t
    t.start()
    return True


def list_sessions(user_id: int, limit: int = 20) -> List[Dict[str, Any]]:
    """剧本架数据：Mongo 历史 + 本进程内存合并，按创建时间倒序。

    Mongo 不在时至少本次进程里的剧本还能列出来（评委演示机兜底）。
    """
    seen: Dict[str, Dict[str, Any]] = {}
    if _FLASK_APP is not None:
        try:
            with _FLASK_APP.app_context():
                docs = _get_collection().find(
                    {'user_id': user_id},
                    {'_id': 0, 'session_id': 1, 'status': 1, 'created_at': 1,
                     'updated_at': 1, 'stage_name': 1, 'witch': 1, 'preset': 1,
                     'scenario.scenario_topic': 1, 'scenario.治疗主题': 1,
                     'transcript': {'$slice': 1}}
                ).sort('created_at', -1).limit(limit)
                for d in docs:
                    seen[d['session_id']] = d
        except Exception:
            pass
    with _LOCK:
        for sid, st in _STATES.items():
            if st.get('user_id') != user_id or sid in seen:
                continue
            seen[sid] = {
                'session_id': sid,
                'status': st.get('status'),
                'created_at': st.get('created_at'),
                'updated_at': st.get('updated_at', st.get('created_at')),
                'stage_name': st.get('stage_name'),
                'scenario': st.get('scenario'),
                'witch': st.get('witch'),
                'preset': st.get('preset'),
                'transcript': (st.get('transcript') or [])[:1],
            }
    out = list(seen.values())
    out.sort(key=lambda d: d.get('created_at') or 0, reverse=True)
    return out[:limit]


def advance_stage(session_id: str, stage: int):
    """供 task_callback 调用（若启用）"""
    _persist(session_id, stage=stage, stage_name=STAGES.get(stage, str(stage)))


def latest_scenario_roles(user_id: int) -> Optional[Dict[str, Any]]:
    """最近一次带剧本的会话：治疗主题 + 角色表（[{name, description}]）。

    给日记页「小精灵陪伴」用：剧本里的角色走出小屋，
    在用户写日记时继续陪一会儿。Mongo 没启动 / 没剧本时返回 None。
    """
    if _FLASK_APP is None:
        return None
    try:
        with _FLASK_APP.app_context():
            doc = _get_collection().find_one(
                {'user_id': user_id, 'scenario': {'$exists': True}},
                {'_id': 0, 'scenario': 1},
                sort=[('updated_at', -1)])
    except Exception:
        return None
    if not doc:
        return None
    sc = doc.get('scenario') or {}
    roles = sc.get('roles') or sc.get('角色设定') or []
    topic = sc.get('scenario_topic') or sc.get('治疗主题') or ''
    norm = []
    for r in roles:
        if not isinstance(r, dict):
            continue
        # crewAI 按别名序列化时键是中文，兼容两种
        name = r.get('name') or r.get('角色名') or r.get('角色')
        desc = r.get('description') or r.get('描述') or r.get('角色描述') or ''
        if name:
            norm.append({'name': str(name), 'description': str(desc)})
    if not norm:
        return None
    return {'topic': str(topic), 'roles': norm}
