import os
os.environ['HF_ENDPOINT'] = 'https://hf-mirror.com'
import base64
from typing import Dict, Optional, List
import hashlib
import hmac
import sys
import time
import datetime
if sys.version_info[0] <= 2:
    from httplib import HTTPSConnection
else:
    from http.client import HTTPSConnection
import requests
import json
from config import Config, log_ai_call
import PIL
from PIL import Image, ImageOps
import threading
import datetime as _dt


# ============================================================
#  生成进度追踪
# ------------------------------------------------------------
#  本地模型推理很慢（HunyuanDiT 出图约 13~17 分钟），而 Flask 是同步处理，
#  前端在等待期间完全不知道进行到哪一步、是不是卡死了。
#  这里用一个进程内的进度表，生成过程中不断更新，前端轮询 /generate_art/progress
#  就能看到"当前在哪一步、已用多久"。
#  设计成纯内存、尽力而为：多用户并发时只保留最后启动的那个任务。
# ============================================================
_progress_lock = threading.Lock()
_progress = {
    'task_id': None,
    'stage': 'idle',        # 阶段标识
    'label': '未开始',       # 给人看的中文描述
    'percent': 0,           # 0-100
    'detail': '',
    'started_at': None,
    'updated_at': None,
    'finished': False,
    'error': None,
    'typeindex': None,
    'result': None,
}


def progress_start(task_id, typeindex):
    """开始一个新任务，重置进度。"""
    now = _dt.datetime.now()
    with _progress_lock:
        _progress.update({
            'task_id': task_id,
            'stage': 'prepare',
            'label': '准备中…',
            'percent': 2,
            'detail': '',
            'started_at': now,
            'updated_at': now,
            'finished': False,
            'error': None,
            'typeindex': typeindex,
            'result': None,
        })


def set_progress(stage, label, percent, detail=''):
    """更新当前任务进度。不影响主流程，任何异常都吞掉。"""
    try:
        with _progress_lock:
            _progress.update({
                'stage': stage,
                'label': label,
                'percent': max(0, min(100, int(percent))),
                'detail': detail,
                'updated_at': _dt.datetime.now(),
            })
    except Exception:
        pass


def progress_finish(ok=True, error=None, result=None):
    try:
        with _progress_lock:
            _progress.update({
                'stage': 'done' if ok else 'error',
                'label': '已完成' if ok else '生成失败',
                'percent': 100 if ok else _progress.get('percent', 0),
                'finished': True,
                'error': error,
                'result': result,
                'updated_at': _dt.datetime.now(),
            })
    except Exception:
        pass


def get_progress():
    """返回当前进度的快照（含已用秒数），供前端轮询。"""
    with _progress_lock:
        snap = dict(_progress)
    if snap.get('started_at'):
        end = snap.get('updated_at') or _dt.datetime.now()
        snap['elapsed_sec'] = round((end - snap['started_at']).total_seconds(), 1)
    else:
        snap['elapsed_sec'] = 0
    snap.pop('started_at', None)
    snap.pop('updated_at', None)
    return snap


def read_image(image_path):
    """读取本地图片。

    ⚠️ 不能用 cv2.imread：Windows 上它按 ANSI 编码解析路径，
    遇到中文目录（如 "...\\国创B\\MindGarden\\..."）会直接返回 None，
    随后传给 diffusers 就报 "`image` input cannot be undefined."。
    PIL 能正确处理 Unicode 路径，这里统一用 PIL，并转成 RGB。
    """
    import PIL
    img = PIL.Image.open(image_path)
    img = PIL.ImageOps.exif_transpose(img)
    return img.convert("RGB")


def _prepare_pix2pix_image(image, target=512):
    """把输入图统一到 512x512（保持比例、居中、白底补边）。

    InstructPix2Pix 基于 SD1.5，训练分辨率是 512x512；手机拍的竖图
    直接送进去会被强行拉伸，导致输出变形。这里主动按比例裁剪填充。
    """
    import PIL
    if not isinstance(image, PIL.Image.Image):
        raise ValueError("风格迁移需要一张图片，收到的是 %s" % type(image).__name__)

    if image.mode != "RGB":
        image = image.convert("RGB")

    scale = min(target / image.width, target / image.height)
    new_w = max(1, int(round(image.width * scale)))
    new_h = max(1, int(round(image.height * scale)))
    resized = image.resize((new_w, new_h), PIL.Image.LANCZOS)

    canvas = PIL.Image.new("RGB", (target, target), (255, 255, 255))
    canvas.paste(resized, ((target - new_w) // 2, (target - new_h) // 2))
    return canvas


def gen_anim(posetxt="微笑着且活泼跳舞的女孩",
             neg_txt="扫描件,简朴的画作,像素风,原画,草图,手绘,铅笔,裸露的人体"):
    """生成动画（AnimateDiff-Lightning + SD1.5 底模）

    说明：本机 CPU 无原生低精度指令，只能用 fp32，且帧数/步数越多越慢，
    因此沿用 AnimateDiff-Lightning 的少步数设计（默认 4 步）。
    """
    import torch  # 按需导入
    from diffusers import AnimateDiffPipeline, MotionAdapter, EulerDiscreteScheduler
    from diffusers.utils import export_to_gif
    from huggingface_hub import hf_hub_download
    from safetensors.torch import load_file

    step = int(os.environ.get('ANIM_STEPS', '4'))  # Options: [1,2,4,8]
    ckpt = f"animatediff_lightning_{step}step_diffusers.safetensors"

    # ---- 运动适配器：优先用本地副本 ----
    local_adapter = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                                 'models', 'AnimateDiff-Lightning', ckpt)
    if os.path.exists(local_adapter):
        adapter_path = local_adapter
        print(f'[动画生成] 运动适配器（本地）: {ckpt}')
    else:
        adapter_path = hf_hub_download("ByteDance/AnimateDiff-Lightning", ckpt)
        print(f'[动画生成] 运动适配器（在线）: {ckpt}')

    # ---- 底模：必须是 SD1.5 系（CLIP 文本编码器）----
    # ⚠️ 原代码用的 IDEA-CCNL/Taiyi-Stable-Diffusion-1B-Anime-Chinese 是 BERT
    #    文本编码器（中文词表 21128），而 AnimateDiff-Lightning 的运动适配器
    #    是按 SD1.5 + CLIP 的文本空间训练的。两者不兼容，实测输出纯噪声
    #    （中文、英文提示词都一样）。所以改用真正的 SD1.5 作为底模。
    base = _local_model_dir('sd15') or "AI-ModelScope/stable-diffusion-v1-5"
    print(f'[动画生成] 底模来源: {base}')

    device = torch.device('cpu')
    dtype = torch.float32
    adapter = MotionAdapter().to(device, dtype)
    adapter.load_state_dict(load_file(adapter_path, device="cpu"))
    pipe = AnimateDiffPipeline.from_pretrained(base, motion_adapter=adapter,
                                               torch_dtype=dtype,
                                               low_cpu_mem_usage=True).to(device)
    pipe.scheduler = EulerDiscreteScheduler.from_config(
        pipe.scheduler.config, timestep_spacing="trailing", beta_schedule="linear")

    print(f'[动画生成] 开始推理（{step} 步，CPU 较慢，请耐心等待…）')
    set_progress('generate', f'正在生成动画（{step} 步，约 4~5 分钟）…', 35)

    def _anim_step(pipe_, i, timestep, cb_kwargs):
        pct = 38 + ((i + 1) / max(1, step)) * 34      # 38% -> 72%
        set_progress('generate', f'正在生成动画 {i + 1}/{step} 步…', pct)
        return cb_kwargs      # 必须回传，见 _on_step_end 的说明

    output = pipe(prompt=posetxt, guidance_scale=1.0, num_inference_steps=step,
                  negative_prompt=neg_txt, callback_on_step_end=_anim_step)
    set_progress('save', '正在合成动画文件…', 78)
    export_to_gif(output.frames[0], "animation.gif")
    return output.frames[0]


def _local_model_dir(name):
    """返回本地模型目录（如果已下载）。

    模型体积很大（HunyuanDiT 约 13.5 GB），在线拉取既慢又容易被限流，
    因此优先使用预先下载到 <项目>/models/<name> 的本地副本；
    找不到时才回退到在线仓库（HF_ENDPOINT 指向镜像站）。
    """
    p = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                     'models', name)
    if os.path.isdir(p) and os.path.exists(os.path.join(p, 'model_index.json')):
        return p
    return None


# ============================================================
#  腾讯云混元生图（文本生图）
# ------------------------------------------------------------
#  替代本地 HunyuanDiT 的理由（实测对比）：
#      本地 HunyuanDiT：1024x1024、15 步，CPU 上约 13~17 分钟
#      云端混元生图  ：同尺寸，实测约 33 秒，且中文理解与画质更好
#  价格：极速版 0.099 元/张，新开通送 50 次免费额度（1 年有效）。
#  鉴权：与混元生 3D 相同的 TC3-HMAC-SHA256 签名；地域必须用
#        ap-guangzhou（实测换成 ap-shanghai 会报 UnsupportedRegion）。
# ============================================================
class TencentImageClient:
    """腾讯云混元生图客户端（文本生图）。"""

    HOST = "aiart.tencentcloudapi.com"
    SERVICE = "aiart"
    VERSION = "2022-12-29"

    def __init__(self, region: str = None):
        self.secret_id = os.environ.get('TENCENT_SECRET_ID', '').strip()
        self.secret_key = os.environ.get('TENCENT_SECRET_KEY', '').strip()
        self.region = region or os.environ.get('TENCENT_REGION', 'ap-guangzhou')

    def available(self) -> bool:
        return bool(self.secret_id and self.secret_key)

    # ---------- 签名与请求 ----------
    @staticmethod
    def _sign(key: bytes, msg: str) -> bytes:
        return hmac.new(key, msg.encode("utf-8"), hashlib.sha256).digest()

    def _headers(self, action: str, payload: str) -> Dict[str, str]:
        ts = int(time.time())
        date = datetime.datetime.utcfromtimestamp(ts).strftime("%Y-%m-%d")
        ct = "application/json; charset=utf-8"
        canonical_headers = (f"content-type:{ct}\n"
                             f"host:{self.HOST}\n"
                             f"x-tc-action:{action.lower()}\n")
        signed_headers = "content-type;host;x-tc-action"
        hashed = hashlib.sha256(payload.encode("utf-8")).hexdigest()
        canonical_request = (f"POST\n/\n\n{canonical_headers}\n"
                             f"{signed_headers}\n{hashed}")
        scope = f"{date}/{self.SERVICE}/tc3_request"
        string_to_sign = (f"TC3-HMAC-SHA256\n{ts}\n{scope}\n"
                          f"{hashlib.sha256(canonical_request.encode('utf-8')).hexdigest()}")
        kd = self._sign(f"TC3{self.secret_key}".encode("utf-8"), date)
        ks = self._sign(kd, self.SERVICE)
        ksign = self._sign(ks, "tc3_request")
        sig = hmac.new(ksign, string_to_sign.encode("utf-8"), hashlib.sha256).hexdigest()
        return {
            "Authorization": (f"TC3-HMAC-SHA256 Credential={self.secret_id}/{scope}, "
                              f"SignedHeaders={signed_headers}, Signature={sig}"),
            "Content-Type": ct,
            "Host": self.HOST,
            "X-TC-Action": action,
            "X-TC-Timestamp": str(ts),
            "X-TC-Version": self.VERSION,
            "X-TC-Region": self.region,
        }

    def _call(self, action: str, payload: dict, timeout: int = 60) -> Dict:
        body = json.dumps(payload)
        headers = self._headers(action, body)
        conn = HTTPSConnection(self.HOST, timeout=timeout)
        try:
            conn.request("POST", "/", headers=headers, body=body.encode("utf-8"))
            resp = conn.getresponse()
            return json.loads(resp.read().decode("utf-8"))
        finally:
            conn.close()

    # ---------- 业务方法 ----------
    def submit_text_to_image(self, prompt: str, resolution: str = "1024:1024") -> Dict:
        return self._call("SubmitTextToImageJob", {
            "Prompt": prompt[:1024],
            "Resolution": resolution,
            "LogoAdd": 0,          # 不加腾讯云水印（比赛作品不应带第三方水印）
        })

    def query_text_to_image(self, job_id: str) -> Dict:
        return self._call("QueryTextToImageJob", {"JobId": job_id})

    def wait_for_image(self, job_id: str, max_wait: int = 300, interval: int = 4) -> List[str]:
        """轮询直到出图，返回图片 URL/base64 列表。

        状态码：1=等待 2=运行中 4=处理中 5=处理完成 6=生成失败
        """
        deadline = time.time() + max_wait
        last = {}
        while time.time() < deadline:
            time.sleep(interval)
            resp = self.query_text_to_image(job_id)
            r = resp.get("Response", {}) or {}
            if "Error" in r:
                raise Exception(f"查询生图任务失败：{r['Error'].get('Code')} "
                                f"{r['Error'].get('Message', '')[:120]}")
            last = r
            imgs = r.get("ResultImage") or []
            if imgs:
                return imgs
            code = str(r.get("JobStatusCode", ""))
            if code == "6":
                details = r.get("ResultDetails") or []
                msg = ""
                if details and isinstance(details[0], dict):
                    msg = details[0].get("ErrorMessage", "")
                raise Exception(f"生图失败：{msg or r.get('JobStatusMsg', '未知原因')}")
        raise Exception(f"生图超时（{max_wait} 秒），最后状态："
                        f"{last.get('JobStatusCode')} {last.get('JobStatusMsg', '')}")

    @staticmethod
    def fetch_image_bytes(item: str) -> bytes:
        """腾讯云返回的可能是 base64，也可能是可下载 URL，两种都要支持。"""
        if item.startswith("data:image"):
            return base64.b64decode(item.split(",", 1)[1])
        if item.startswith("http"):
            resp = requests.get(item, timeout=90)
            resp.raise_for_status()
            return resp.content
        # 既不是 URL 也不是 data URI，按裸 base64 处理
        return base64.b64decode(item)


def gen_imgs_cloud(prompt: str):
    """用腾讯云混元生图出图，返回 PIL Image。失败时抛异常，由调用方决定是否回退本地。"""
    from io import BytesIO

    client = TencentImageClient()
    if not client.available():
        raise Exception("未配置 TENCENT_SECRET_ID / TENCENT_SECRET_KEY")

    set_progress('generate', '正在调用云端混元生图（约 30 秒）…', 20)
    submit = client.submit_text_to_image(prompt)
    if "Error" in submit.get("Response", {}):
        err = submit["Response"]["Error"]
        code = err.get("Code", "")
        if "ResourceInsufficient" in code:
            raise Exception("混元生图免费额度已用尽。可到 "
                            "https://console.cloud.tencent.com/aiart 领取额度或开通后付费。")
        raise Exception(f"提交生图任务失败：{code} {err.get('Message', '')[:120]}")

    job_id = submit["Response"].get("JobId")
    if not job_id:
        raise Exception("提交生图任务失败：未返回 JobId")

    set_progress('generate', '云端正在绘制（约 30 秒）…', 35)
    images = client.wait_for_image(job_id)
    set_progress('save', '正在保存作品…', 72)

    raw = client.fetch_image_bytes(images[0])
    img = Image.open(BytesIO(raw)).convert("RGB")
    print(f'[图片生成] 云端出图成功：{img.size[0]}x{img.size[1]}，{len(raw)/1024:.1f} KB')
    return img


def _gen_imgs_local_sd15(prompt, steps=None, size=512):
    """本地兜底出图：复用已有的 SD1.5（动画生成用的同一个底模）。

    为什么不再用 HunyuanDiT 兜底：
      - HunyuanDiT 要 13.5 GB 磁盘、且必须 1024x1024，CPU 上约 13~17 分钟；
      - SD1.5 本来就在机器上（动画生成在用，3.97 GB），512x512 出图约 2~4 分钟。
      兜底的意义是"断网也能演示"，不是出精品图 —— 用 SD1.5 换掉 13.5 GB 很划算。
    """
    import torch
    from diffusers import StableDiffusionPipeline, EulerDiscreteScheduler

    base = _local_model_dir('sd15')
    if not base:
        # 不要回退到在线仓库：模型有 4 GB，断网或网速差时会长时间卡在下载，
        # 用户只会看到"一直在生成"。宁可快速失败并说清原因。
        raise Exception(
            "本地兜底模型 SD1.5 未找到（models/sd15）。"
            "请确认模型目录完整，或改用云端生图（设 IMAGE_PROVIDER=cloud）。")
    print(f'[图片生成] 本地兜底模型: {base}')
    # 步数实测对比（同一提示词，512x512，CPU）：
    #   Euler  10 步  33 秒 —— 构图偏抽象
    #   Euler  16 步  53 秒 —— 人物结构清晰、配色协调（采用）
    #   DPM++  10 步  36 秒 —— 明显更抽象，人物几乎融进背景
    # 兜底出图不追求速度极致，53 秒换来可用画面是值得的。
    steps = steps or int(os.environ.get('SD15_STEPS', '16'))

    set_progress('load_model', '加载本地兜底模型（SD1.5，约 4 GB）…', 16)
    pipe = StableDiffusionPipeline.from_pretrained(
        base, torch_dtype=torch.float32,
        safety_checker=None, requires_safety_checker=False,
        low_cpu_mem_usage=True)
    pipe.to("cpu")
    # Euler + trailing 步进在这种少步数场景下收敛更快
    pipe.scheduler = EulerDiscreteScheduler.from_config(
        pipe.scheduler.config, timestep_spacing="trailing")

    def _sd_step(pipe_, i, timestep, cb_kwargs):
        pct = 20 + ((i + 1) / max(1, steps)) * 50      # 20% -> 70%
        set_progress('generate', f'正在本地生成图片 {i + 1}/{steps} 步…', pct)
        return cb_kwargs

    print(f'[图片生成] 本地兜底出图（{steps} 步，512x512，约 2~4 分钟）…')
    set_progress('generate', f'本地生成中（{steps} 步，约 2~4 分钟）…', 20)
    image = pipe(prompt, num_inference_steps=steps,
                 guidance_scale=7.5, height=size, width=size,
                 callback_on_step_end=_sd_step).images[0]
    set_progress('save', '正在保存作品…', 75)
    image.save("result.png")
    return image


def _gen_imgs_local(bkgtxt="疗愈风格的中国山水画", posetxt=""):
    """本地兜底入口：优先 SD1.5，显式要求时才用 HunyuanDiT。"""
    if os.environ.get('LOCAL_IMAGE_MODEL', 'sd15').strip().lower() == 'hunyuan':
        return _gen_imgs_hunyuan(bkgtxt, posetxt)
    prompt = ('以' + bkgtxt + '为背景，' + posetxt) if bkgtxt else posetxt
    return _gen_imgs_local_sd15(prompt)


def _gen_imgs_hunyuan(bkgtxt="疗愈风格的中国山水画", posetxt=""):
    """本地 HunyuanDiT 出图（保留以备用：需 13.5 GB 磁盘、1024x1024、约 13~17 分钟）。

    默认不再走这条路，因为 SD1.5 兜底更快、占用小得多。
    如需用回它，设 LOCAL_IMAGE_MODEL=hunyuan。
    """
    import torch  # 按需导入
    from diffusers import HunyuanDiTPipeline  # 按需导入

    model = _local_model_dir('HunyuanDiT')
    if not model:
        # 同 _gen_imgs_local_sd15：不回退在线下载。这个模型有 13.5 GB，
        # 断网时会一直卡在下载上，表现为"生成中"却永远不出结果。
        raise Exception(
            "本地 HunyuanDiT 模型未找到（models/HunyuanDiT，约 13.5 GB）。"
            "默认兜底请用 SD1.5（设 LOCAL_IMAGE_MODEL=sd15），或改用云端生图。")
    print(f'[图片生成] 模型来源: {model}')

    # 【精度：必须 fp32】本机 CPU（i9-14900HX，torch 仅识别到 AVX2）没有
    # 原生 fp16/bf16 指令，实测低精度比 fp32 慢约 700 倍（0.002s vs 1.4s），
    # 且 fp16 直接 .to() 转换会让 CPU 推理卡住不动。所以只能用 fp32。
    #
    # 【内存】fp32 权重约 13.5 GB，本机总内存 15.7 GB，实测峰值约 8.2 GB
    # （low_cpu_mem_usage 避免加载期出现两份副本）。运行期间不要再开大型程序。
    #
    # 【耗时】实测单步约 52 秒，15 步约 13.6 分钟（1024x1024）。
    # 注意 HunyuanDiT 不支持小于 1024x1024 的尺寸，传 512 会被强制放大。
    steps = int(os.environ.get('HUNYUAN_STEPS', '15'))
    set_progress('load_model', '加载图片生成模型（约 13.5 GB，首次约 10 秒）…', 16)
    pipe = HunyuanDiTPipeline.from_pretrained(
        model,
        torch_dtype=torch.float32,
        low_cpu_mem_usage=True,
    )
    pipe.to("cpu")

    # 出图是耗时大头：把 16% ~ 74% 这段按步数线性映射，前端能看到"步数在走"
    def _on_step_end(pipe_, step, timestep, cb_kwargs):
        done = step + 1
        pct = 18 + (done / max(1, steps)) * 54      # 18% -> 72%
        set_progress('generate', f'正在生成图片 {done}/{steps} 步…',
                     pct, detail=f'每步约 52 秒')
        # ⚠️ 必须回传 tensor 字典：diffusers 内部会做
        #    callback_outputs.pop("latents", latents)，
        #    返回 None 会直接抛 AttributeError: 'NoneType' object has no attribute 'pop'
        return cb_kwargs

    print(f'[图片生成] 开始推理：15 步以内约 {steps * 52 / 60:.0f} 分钟，请耐心等待…')
    set_progress('generate', f'开始生成图片（共 {steps} 步，每步约 52 秒）…', 18)
    image = pipe(
        prompt='以' + bkgtxt + '为背景，' + posetxt,
        height=1024,
        width=1024,
        num_inference_steps=steps,
        guidance_scale=6.0,
        negative_prompt='模糊的, 扭曲, 低质量',
        callback_on_step_end=_on_step_end,
    ).images[0]
    set_progress('save', '正在保存作品…', 78)
    image.save("result.png")
    return image


def gen_imgs(bkgtxt="疗愈风格的中国山水画", posetxt=""):
    """生成图片：优先走云端混元生图，失败则回退本地 SD1.5。

    为什么要做成"云优先 + 本地兜底"：
      - 云端实测约 20~35 秒，质量更好；
      - 但比赛现场可能断网、额度可能用完，本地模型能保证"至少还能出图"，
        不会让整个作品演示因为一个外部依赖直接瘫痪。
    本地兜底用的是 SD1.5（动画生成的同一个底模，约 3 分钟），
    而不是 HunyuanDiT（13.5 GB、约 13~17 分钟）—— 兜底只需"能出图"。
    用环境变量控制：IMAGE_PROVIDER = auto（默认）/ cloud / local
    """
    provider = os.environ.get('IMAGE_PROVIDER', 'auto').strip().lower()
    prompt = ('以' + bkgtxt + '为背景，' + posetxt) if bkgtxt else posetxt

    if provider in ('auto', 'cloud'):
        try:
            return gen_imgs_cloud(prompt)
        except Exception as e:
            if provider == 'cloud':
                raise
            # 静默回退会让用户困惑：进度条走到 15% 后突然要等十几分钟，
            # 却不知道发生了什么。这里把原因显式显示出来。
            reason = str(e)[:160]
            print(f'[图片生成] 云端不可用，回退本地模型。原因：{reason}')
            set_progress('load_model',
                         f'云端生图不可用，已改用本地模型（约 3 分钟）…',
                         15, detail=f'原因：{reason}')

    return _gen_imgs_local(bkgtxt, posetxt)


def download_image(url: str):
    """从URL下载图片"""
    import PIL  # 按需导入
    image = PIL.Image.open(requests.get(url, stream=True).raw)
    image = PIL.ImageOps.exif_transpose(image)
    image = image.convert("RGB")
    return image


def imggenimg_curl(fix_prompt: str, img_url: str, imgsource: int):
    """风格迁移（InstructPix2Pix）"""
    import torch  # 按需导入
    from diffusers import StableDiffusionInstructPix2PixPipeline, EulerAncestralDiscreteScheduler

    if imgsource == 1:
        image = download_image(img_url)
        image.save("image.png")
    else:
        image = read_image(img_url)

    image = _prepare_pix2pix_image(image, 512)

    model_id = _local_model_dir('instruct-pix2pix') or "timbrooks/instruct-pix2pix"
    print(f'[风格迁移] 模型来源: {model_id}')
    # InstructPix2Pix 基于 SD1.5，原生 512x512。本机只能 fp32。
    # low_cpu_mem_usage 避免加载期出现两份权重副本（本机内存只有 15.7 GB）。
    pipe = StableDiffusionInstructPix2PixPipeline.from_pretrained(
        model_id, torch_dtype=torch.float32, safety_checker=None,
        low_cpu_mem_usage=True)
    pipe.to("cpu")
    pipe.scheduler = EulerAncestralDiscreteScheduler.from_config(pipe.scheduler.config)

    steps = int(os.environ.get('PIX2PIX_STEPS', '10'))
    # image_guidance_scale 控制"保留多少原图结构"：
    #   原代码写死 1，约束偏弱；官方推荐区间是 1.5~2.0。
    #   实测（用带文字的海报做输入）1.4 时文字、构图、元素位置都能保住，
    #   同时风格转换明显；再往上（2.2）会退化成"只调色不变风格"。
    #   因此默认取 1.5，可用环境变量覆盖；
    #   若发现用户照片的姿态保留不够，就往上调（1.8 / 2.0）。
    img_scale = float(os.environ.get('PIX2PIX_IMAGE_GUIDANCE', '1.5'))
    txt_scale = float(os.environ.get('PIX2PIX_TEXT_GUIDANCE', '7.5'))
    print(f'[风格迁移] 开始推理（{steps} 步，image_guidance={img_scale}）…')
    set_progress('generate', f'正在做风格迁移（{steps} 步，约 1~2 分钟）…', 40)

    def _p2p_step(pipe_, step, timestep, cb_kwargs):
        pct = 42 + ((step + 1) / max(1, steps)) * 26     # 42% -> 68%
        set_progress('generate', f'正在做风格迁移 {step + 1}/{steps} 步…', pct)
        return cb_kwargs      # 必须回传，见 _on_step_end 的说明

    images = pipe(fix_prompt, image=image, num_inference_steps=steps,
                  image_guidance_scale=img_scale,
                  guidance_scale=txt_scale,
                  negative_prompt="human with more than two arms, human body without clothes",
                  callback_on_step_end=_p2p_step).images
    set_progress('save', '正在保存作品…', 75)
    return images[0]


def _load_audioldm2(repo_id):
    """加载 AudioLDM 2，并修掉魔搭镜像的一个配置缺陷。

    问题：AI-ModelScope/audioldm2 里 language_model 的 model_index.json 与
          config.json 都把类名写成 GPT2Model（基座模型），但 AudioLDM2 的
          管线代码需要 GPT2LMHeadModel（它要调用
          _update_model_kwargs_for_generation 做自回归生成）。用 GPT2Model
          直接报 AttributeError。官方原仓库声明的是 GPT2LMHeadModel。

    修法：先正常加载管线，再把 language_model 换成用 GPT2LMHeadModel 重新
          加载的同权重模型。12 层 GPT-2 的 lm_head 与词嵌入是权重共享的
          （实测 wte 与 lm_head 同一块内存），所以本地没有 lm_head 张量也不影响。
    """
    import torch
    from diffusers import AudioLDM2Pipeline
    from transformers import GPT2Config, GPT2LMHeadModel

    pipe = AudioLDM2Pipeline.from_pretrained(repo_id, torch_dtype=torch.float32,
                                             low_cpu_mem_usage=True)

    lm = pipe.language_model
    if not hasattr(lm, '_update_model_kwargs_for_generation'):
        print('[音乐生成] 检测到 language_model 是基座模型，按配置缺陷修复…')
        if not os.path.isdir(repo_id):
            # 在线仓库声明正确，无需修复
            print('[音乐生成] 在线仓库，跳过修复')
        else:
            lm_dir = os.path.join(repo_id, 'language_model')
            cfg = GPT2Config.from_pretrained(lm_dir)
            fixed = GPT2LMHeadModel.from_pretrained(lm_dir, config=cfg,
                                                    torch_dtype=torch.float32)
            pipe.language_model = fixed
            print('[音乐生成] 已替换为 GPT2LMHeadModel（lm_head 与词嵌入权重共享）')
    return pipe


def genmusic(gentxt: str):
    """生成音乐（AudioLDM 2）

    ⚠️ 原代码用的是 MusicLDMPipeline + ucsd-reach/musicldm，但：
        MusicLDMPipeline 自 diffusers 0.33.1 起已废弃且不再修 bug，
        在本项目使用的 diffusers 0.41 上直接报错
        （AttributeError: 'BaseModelOutputWithPooling' object has no attribute 'to'）。
        AudioLDM 2 是它的官方后继者，未废弃，接口基本一致。
    """
    import torch  # 按需导入
    import scipy  # 按需导入

    repo_id = _local_model_dir('audioldm2') or "AI-ModelScope/audioldm2"
    print(f'[音乐生成] 模型来源: {repo_id}')
    pipe = _load_audioldm2(repo_id)
    pipe = pipe.to("cpu")
    steps = int(os.environ.get('MUSIC_STEPS', '10'))
    secs = float(os.environ.get('MUSIC_LENGTH', '10.0'))
    print(f'[音乐生成] 开始推理（{steps} 步，时长 {secs} 秒，CPU 较慢）…')
    set_progress('generate', f'正在生成音乐（{steps} 步，约 30 秒）…', 40)

    def _music_step(pipe_, i, timestep, cb_kwargs):
        pct = 42 + ((i + 1) / max(1, steps)) * 28     # 42% -> 70%
        set_progress('generate', f'正在生成音乐 {i + 1}/{steps} 步…', pct)
        return cb_kwargs      # 必须回传，见 _on_step_end 的说明

    # diffusers 版本兼容：新版用 callback_on_step_end（回传 kwargs），
    # 旧版（如 0.41 的 AudioLDM2）只有老式 callback(i, t, latents)，不回传。
    import inspect as _inspect
    _call_params = _inspect.signature(pipe.__call__).parameters
    if 'callback_on_step_end' in _call_params:
        audio = pipe(gentxt, num_inference_steps=steps,
                     audio_length_in_s=secs, callback_on_step_end=_music_step).audios[0]
    else:
        def _legacy_step(i, timestep, latents):
            pct = 42 + ((i + 1) / max(1, steps)) * 28
            set_progress('generate', f'正在生成音乐 {i + 1}/{steps} 步…', pct)
        audio = pipe(gentxt, num_inference_steps=steps,
                     audio_length_in_s=secs, callback=_legacy_step,
                     callback_steps=1).audios[0]
    set_progress('save', '正在写入音频文件…', 78)
    scipy.io.wavfile.write("techno.wav", rate=16000, data=audio)
    return audio


class TencentAI3DClient:
    """腾讯云AI 3D API客户端"""

    def __init__(self, region: str = "ap-guangzhou"):
        # 腾讯云密钥（环境变量读取，见 config.py 顶部注释；终端 export TENCENT_SECRET_ID/TENCENT_SECRET_KEY）
        self.secret_id = os.environ.get('TENCENT_SECRET_ID', '')
        self.secret_key = os.environ.get('TENCENT_SECRET_KEY', '')
        self.region = region
        self.service = "ai3d"
        self.host = "ai3d.ap-shanghai.tencentcloudapi.com"
        self.version = "2025-05-13"
        self.token = ""

    def _sign(self, key: bytes, msg: str) -> bytes:
        """生成签名"""
        return hmac.new(key, msg.encode("utf-8"), hashlib.sha256).digest()

    def _generate_authorization(self, action: str, payload: str) -> Dict[str, str]:
        """生成TC3签名认证头"""
        timestamp = int(time.time())
        date = datetime.datetime.utcfromtimestamp(timestamp).strftime("%Y-%m-%d")

        http_request_method = "POST"
        canonical_uri = "/"
        canonical_querystring = ""
        ct = "application/json; charset=utf-8"
        canonical_headers = f"content-type:{ct}\nhost:{self.host}\nx-tc-action:{action.lower()}\n"
        signed_headers = "content-type;host;x-tc-action"
        hashed_request_payload = hashlib.sha256(payload.encode("utf-8")).hexdigest()

        canonical_request = (
            f"{http_request_method}\n"
            f"{canonical_uri}\n"
            f"{canonical_querystring}\n"
            f"{canonical_headers}\n"
            f"{signed_headers}\n"
            f"{hashed_request_payload}"
        )

        credential_scope = f"{date}/{self.service}/tc3_request"
        hashed_canonical_request = hashlib.sha256(canonical_request.encode("utf-8")).hexdigest()
        string_to_sign = (
            f"TC3-HMAC-SHA256\n"
            f"{timestamp}\n"
            f"{credential_scope}\n"
            f"{hashed_canonical_request}"
        )

        secret_date = self._sign(f"TC3{self.secret_key}".encode("utf-8"), date)
        secret_service = self._sign(secret_date, self.service)
        secret_signing = self._sign(secret_service, "tc3_request")
        signature = hmac.new(secret_signing, string_to_sign.encode("utf-8"), hashlib.sha256).hexdigest()

        authorization = (
            f"TC3-HMAC-SHA256 Credential={self.secret_id}/{credential_scope}, "
            f"SignedHeaders={signed_headers}, Signature={signature}"
        )

        headers = {
            "Authorization": authorization,
            "Content-Type": ct,
            "Host": self.host,
            "X-TC-Action": action,
            "X-TC-Timestamp": str(timestamp),
            "X-TC-Version": self.version
        }

        if self.region:
            headers["X-TC-Region"] = self.region
        if self.token:
            headers["X-TC-Token"] = self.token

        return headers

    def _make_request(self, action: str, payload: str) -> Dict:
        """发送API请求"""
        headers = self._generate_authorization(action, payload)

        try:
            conn = HTTPSConnection(self.host)
            conn.request("POST", "/", headers=headers, body=payload.encode("utf-8"))
            response = conn.getresponse()
            response_data = response.read().decode('utf-8')
            conn.close()
            return json.loads(response_data)
        except Exception as e:
            print(f"API请求失败: {str(e)}")
            return {"Response": {"Error": str(e)}}

    def submit_3d_job(self, prompt: str, result_format: str = "MP4") -> Dict:
        """提交3D生成任务"""
        payload = json.dumps({
            "Prompt": prompt,
            "ResultFormat": result_format
        })
        return self._make_request("SubmitHunyuanTo3DRapidJob", payload)

    def query_3d_job(self, job_id: str) -> Dict:
        """查询3D生成任务状态"""
        payload = json.dumps({"JobId": job_id})
        return self._make_request("QueryHunyuanTo3DRapidJob", payload)

    def wait_for_job_completion(self, job_id: str, max_attempts: int = 60, interval: int = 10) -> Dict:
        """等待任务完成"""
        for attempt in range(max_attempts):
            print(f"查询任务状态... ({attempt + 1}/{max_attempts})")
            result = self.query_3d_job(job_id)

            if "Response" in result:
                status = result["Response"].get("Status", "")

                # 实测腾讯云返回的状态名是 WAIT / RUN / DONE，
                # 原代码只判断 PENDING / RUNNING，导致日志一直打印"未知状态"
                # （功能不受影响，但排障时很误导）。这里两种写法都认。
                if status in ("DONE", "SUCCESS"):
                    print("任务已完成!")
                    return result
                # 腾讯云实测终态名是 FAIL（不是 FAILED）。漏掉它会导致
                # 失败的任务被当成"未知状态"继续轮询，白等满 60 次（10 分钟）。
                elif status in ("FAIL", "FAILED", "CANCEL", "CANCELLED"):
                    print(f"任务失败或取消: {status}")
                    # 把服务端给的原因打出来，否则只看到 FAIL 无法排障
                    _err = result["Response"].get("ErrorCode") or result["Response"].get("Error")
                    _msg = result["Response"].get("ErrorMessage") or result["Response"].get("ErrorMsg")
                    if _err or _msg:
                        print(f"失败原因: {_err or ''} {_msg or ''}".strip())
                    else:
                        print(f"失败详情: {json.dumps(result, ensure_ascii=False)[:600]}")
                    return result
                elif status in ("PENDING", "WAIT", "QUEUED", "WAITING"):
                    print("任务排队中...")
                elif status in ("RUNNING", "RUN", "IN_PROGRESS"):
                    print("任务执行中...")
                else:
                    print(f"未知状态: {status} | 原始响应: {json.dumps(result, ensure_ascii=False)[:300]}")

            if attempt < max_attempts - 1:
                time.sleep(interval)

        print("任务查询超时")
        return result

    def download_3d_result(self, result_data: Dict, save_path: str = None) -> Optional[str]:
        """下载3D生成结果"""
        try:
            if "Response" not in result_data:
                print("无效的响应数据")
                return None

            response = result_data["Response"]

            if "ResultFile3Ds" not in response or not response["ResultFile3Ds"]:
                print("未找到结果文件")
                return None

            # 获取第一个MP4文件
            mp4_files = [f for f in response["ResultFile3Ds"] if f.get("Type") == "MP4"]
            if not mp4_files:
                print("未找到MP4格式的结果文件")
                return None

            mp4_url = mp4_files[0].get("Url")
            if not mp4_url:
                print("MP4文件URL为空")
                return None

            # 生成保存路径
            if not save_path:
                timestamp = int(time.time())
                save_path = f"3d_result_{timestamp}.mp4"

            # 下载文件
            response = requests.get(mp4_url, stream=True)
            response.raise_for_status()

            with open(save_path, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)

            print(f"文件已下载到: {save_path}")

            # 如果有预览图也下载
            preview_url = mp4_files[0].get("PreviewImageUrl")
            if preview_url:
                preview_path = save_path.replace('.mp4', '_preview.png')
                preview_response = requests.get(preview_url)
                preview_response.raise_for_status()

                with open(preview_path, 'wb') as f:
                    f.write(preview_response.content)
                print(f"预览图已下载到: {preview_path}")

            return save_path

        except Exception as e:
            print(f"下载失败: {str(e)}")
            return None


def gen_3dimg(prompt_txt: str, wait_for_completion: bool = True, save_path: str = None) -> Dict:
    """生成3D图像"""
    client = TencentAI3DClient()

    print("提交3D生成任务...")
    submit_result = client.submit_3d_job(prompt_txt)

    if "Response" not in submit_result or "JobId" not in submit_result["Response"]:
        print("任务提交失败")
        return submit_result

    job_id = submit_result["Response"]["JobId"]
    print(f"任务提交成功，JobId: {job_id}")

    if wait_for_completion:
        print("等待任务完成...")
        final_result = client.wait_for_job_completion(job_id)

        # 下载结果
        if (final_result.get("Response", {}).get("Status") == "DONE" and
                final_result.get("Response", {}).get("ResultFile3Ds")):
            client.download_3d_result(final_result, save_path)

        return final_result

    return submit_result


def _prepare_image_base64(image_path, max_side=None, quality=None):
    """读取图片 → 压缩 → base64。

    原实现直接把整张原图 base64 发出去，实测一张 2.3MB 的 PNG 就吃掉
    4400 prompt tokens，免费额度很快见底；而多模态模型并不需要那么高的
    分辨率就能识别姿态。这里统一压到最长边 VISION_IMAGE_MAX_SIDE。

    返回 (base64_str, mime_type, 原始KB, 压缩后KB)
    """
    from PIL import Image
    import io

    if max_side is None:
        max_side = getattr(Config, 'VISION_IMAGE_MAX_SIDE', 1024)
    if quality is None:
        quality = getattr(Config, 'VISION_IMAGE_JPEG_QUALITY', 85)

    orig_kb = os.path.getsize(image_path) / 1024.0
    img = Image.open(image_path)
    img = ImageOps.exif_transpose(img)          # 纠正手机照片方向
    if img.mode not in ('RGB', 'L'):
        img = img.convert('RGB')

    w, h = img.size
    scale = min(1.0, float(max_side) / max(w, h))
    if scale < 1.0:
        img = img.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.LANCZOS)

    buf = io.BytesIO()
    img.convert('RGB').save(buf, format='JPEG', quality=quality, optimize=True)
    data = buf.getvalue()
    return base64.b64encode(data).decode('utf-8'), 'jpeg', orig_kb, len(data) / 1024.0


def _call_vision_api(endpoint, api_key, model, image_path, prompt, extra_payload=None,
                     timeout=180, max_tokens=2048):
    """向 OpenAI 兼容的多模态接口发起一次"看图"请求，返回文本描述。

    Kimi / GLM-5.3-Flash / 将来的微调模型都遵循同一套 messages 结构
    （content 数组里放 image_url + text），所以这里做成共用实现。

    注意 max_tokens 因模型而异：例如智谱 glm-4v-flash 限制上限为 1024，
    传 2048 会直接 400。姿态描述本身很短，1024 完全够用。
    """
    b64, mime, orig_kb, new_kb = _prepare_image_base64(image_path)

    messages = [{
        "role": "user",
        "content": [
            {"type": "image_url",
             "image_url": {"url": f"data:image/{mime};base64,{b64}"}},
            {"type": "text", "text": prompt},
        ]
    }]
    payload = {"model": model, "messages": messages, "max_tokens": max_tokens}
    if extra_payload:
        payload.update(extra_payload)

    resp = requests.post(
        endpoint,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json=payload,
        timeout=timeout,
    )
    if not resp.ok:
        print(f'[姿态识别] API error {resp.status_code}')
    resp.raise_for_status()
    data = resp.json()
    msg = data["choices"][0]["message"]
    content = msg.get("content") or msg.get("reasoning_content") or ""
    if not content:
        raise Exception("视觉模型返回了空内容")
    return content, {
        'image_orig_kb': round(orig_kb, 1),
        'image_sent_kb': round(new_kb, 1),
        'usage': data.get('usage'),
        'model_returned': data.get('model'),
    }


def vision_analyze_pose(image_path):
    """姿态识别：看图 → 中文姿态/动作/情绪描述。

    按 Config.VISION_PROVIDER 分发到不同后端，对外签名与返回值保持不变，
    因此 create_art() 等调用方无需任何改动。

      glm    -> 智谱 GLM-5.3-Flash（原生多模态，有免费额度）—— **本项目当前使用**
      kimi   -> 月之暗面 Kimi K2.6（项目原版实现，需要 KIMI_API_KEY 才能用）
      custom -> 自定义端点（预留给后续接入的姿态识别微调模型）

    ⚠️ 注意区分"代码支持"与"实际在用"：
       上面的分支都实现了，但真正执行哪一条由环境变量 VISION_PROVIDER 决定。
       本项目配置为 glm，所以 Kimi 分支从未执行过。
       写材料或答辩时不要表述成"调用了 Kimi"。
    """
    # 默认值用 glm 而不是原版的 kimi：本项目实际配置就是 glm，
    # 万一 VISION_PROVIDER 丢失，也不该静默切到一个没有密钥的后端。
    provider = (getattr(Config, 'VISION_PROVIDER', 'glm') or 'glm').lower()
    prompt = getattr(Config, 'VISION_POSE_PROMPT',
                     '请详细描述图中人物的姿态、动作、肢体语言、情绪状态、穿着和所处环境。用中文描述，100字以内。')

    if provider == 'glm':
        endpoint, key = Config.GLM_ENDPOINT, Config.GLM_API_KEY
        primary = Config.GLM_VISION_MODEL
        fallback = getattr(Config, 'GLM_VISION_MODEL_FALLBACK', '') or ''
        models = [primary] + ([fallback] if fallback and fallback != primary else [])
        extra = {"temperature": 1}
        # glm-4v-flash 等模型 max_tokens 上限为 1024，超出直接 400；姿态描述很短，够用
        vtokens = 1024
    elif provider == 'kimi':
        endpoint, key = Config.KIMI_ENDPOINT, Config.KIMI_API_KEY
        models = [Config.KIMI_VISION_MODEL]
        extra = None
        vtokens = 4096          # 与原版实现保持一致
    elif provider == 'custom':
        endpoint = Config.CUSTOM_VISION_ENDPOINT
        key = Config.CUSTOM_VISION_API_KEY
        models = [Config.CUSTOM_VISION_MODEL]
        extra = None
        vtokens = int(os.environ.get('CUSTOM_VISION_MAX_TOKENS') or 1024)
        if not endpoint:
            raise Exception("VISION_PROVIDER=custom 但 CUSTOM_VISION_ENDPOINT 未配置")
    else:
        raise Exception(f"未知的 VISION_PROVIDER: {provider}（可选 glm / kimi / custom）")

    t0 = time.time()
    last_err = None
    for i, model in enumerate(models):
        try:
            content, meta = _call_vision_api(endpoint, key, model, image_path, prompt,
                                             extra_payload=extra, max_tokens=vtokens)
            dt = time.time() - t0
            print(f'[姿态识别] provider={provider} model={model} 耗时={dt:.1f}s '
                  f'图片 {meta["image_orig_kb"]}KB -> {meta["image_sent_kb"]}KB')
            print('[姿态识别] 已收到识别结果')
            log_ai_call(site='pose_vision', provider=provider, model=model,
                        prompt=prompt, response=content, usage=meta.get('usage'),
                        elapsed=dt, image=os.path.basename(image_path), ok=True,
                        extra=dict(meta, configured_model=models[0],
                                   used_fallback=(i > 0)))
            return content
        except Exception as e:
            last_err = e
            if i < len(models) - 1:
                wait = getattr(Config, 'VISION_RETRY_WAIT', 3)
                print(f'[姿态识别] 模型 {model} 失败（{e}），'
                      f'{wait}s 后改用备用模型 {models[i + 1]} 重试...')
                time.sleep(wait)
            else:
                print(f'[姿态识别] 模型 {model} 失败，且无更多备用模型：{e}')

    dt = time.time() - t0
    log_ai_call(site='pose_vision', provider=provider, model=models[0],
                prompt=prompt, elapsed=dt, image=os.path.basename(image_path),
                ok=False, error=last_err, extra={'tried_models': models})
    raise last_err


# ============================================================
#  姿态类型判断（为学姐的矫正方法选模板）
# ------------------------------------------------------------
#  学姐的方法（CABT-Fusion）需要指定一个结构先验模板：
#      standing / walk / sit
#  论文里的模板是固定的，模板选错矫正方向就会错。
#
#  原项目的 pose_detector.detect_pose_type() 用膝盖与髋部的相对位置做判断，
#  这在关键点本身不准时（正是需要矫正的场景）容易判错 —— 形成一个循环依赖：
#  关键点不准 -> 姿态判错 -> 模板选错 -> 矫正方向错误。
#
#  这里改用多模态模型直接看图判断姿态类型，绕开这个循环。
#
#  ⚠️ 解析策略（实测教训）：
#     多模态模型经常把提问里的选项词复述一遍再回答，例如
#       "choosing from standing, walk, or sit. Looking at the image, ..."
#     如果直接用 "standing" in text 判断，会命中复述内容，
#     导致结果恒为 standing —— 这个 bug 让整个模板选择形同虚设。
#     因此：提示词改用数字编号，解析时先跳过复述部分再匹配关键词。
# ============================================================
#: 数字 -> 模板名的映射（数字比英文词不容易被模型复述）
POSE_TYPE_DIGITS = {'1': 'standing', '2': 'walk', '3': 'sit'}

POSE_TYPE_PROMPT = (
    "看图判断人物姿态，从下列三选一，只回复对应数字（一个字符）：\n"
    "1 = 站立或直立\n"
    "2 = 行走、迈步或腿部明显前后分开\n"
    "3 = 坐着或蹲着（身体高度明显降低）"
)

#: 允许的模板名，与 core/pose_templates.py 里的 STANDARD_POSE_TEMPLATES 一致
VALID_POSE_TYPES = ('standing', 'walk', 'sit')


def classify_pose_type(image_path):
    """用视觉模型判断姿态类型，供学姐的矫正方法选择结构模板。

    返回值保证在 VALID_POSE_TYPES 之内；任何异常都回退 'standing'，
    因为这个值只影响矫正的模板选择，不应该让整条创作流程失败。
    """
    try:
        provider = (getattr(Config, 'VISION_PROVIDER', 'glm') or 'glm').lower()
        if provider == 'glm':
            endpoint, key = Config.GLM_ENDPOINT, Config.GLM_API_KEY
            models = [Config.GLM_VISION_MODEL]
            vtokens = 16
        elif provider == 'kimi':
            endpoint, key = Config.KIMI_ENDPOINT, Config.KIMI_API_KEY
            models = [Config.KIMI_VISION_MODEL]
            vtokens = 16
        elif provider == 'custom':
            endpoint, key = Config.CUSTOM_VISION_ENDPOINT, Config.CUSTOM_VISION_API_KEY
            models = [Config.CUSTOM_VISION_MODEL]
            vtokens = 16
        else:
            return 'standing'

        t0 = time.time()
        content, _meta = _call_vision_api(endpoint, key, models[0], image_path,
                                          POSE_TYPE_PROMPT, extra_payload={"temperature": 0.1},
                                          timeout=60, max_tokens=vtokens)
        dt = time.time() - t0

        raw = (content or '').strip()
        # 只在"回答部分"里找数字：模型可能先复述再回答，取最后一个出现的数字
        digits = [c for c in raw if c in POSE_TYPE_DIGITS]
        if digits:
            hit = POSE_TYPE_DIGITS[digits[-1]]
            src = f'数字 {digits[-1]}'
        else:
            # 没有数字时退回关键词匹配，但必须先剥掉复述部分
            low = raw.lower()
            # 截掉第一个句号前的复述内容（模型常以复述开头）
            head, _, tail = low.partition('.')
            scan = tail if tail and len(tail) > 5 else low
            if 'sit' in scan or '坐' in scan or 'squat' in scan:
                hit = 'sit'
            elif 'walk' in scan or '走' in scan or 'stepp' in scan or 'stride' in scan:
                hit = 'walk'
            elif 'stand' in scan or '站' in scan:
                hit = 'standing'
            else:
                hit = 'standing'
            src = f'关键词匹配（原文 {raw[:60]!r}）'

        print(f'[姿态类型] 视觉模型判断={hit}（{src}）耗时 {dt:.1f}s')
        log_ai_call(site='pose_type', provider=provider, model=models[0],
                    prompt=POSE_TYPE_PROMPT, response=content,
                    elapsed=dt, image=os.path.basename(image_path), ok=True,
                    extra={'parsed': hit, 'source': src})
        return hit
    except Exception as e:
        print(f'[姿态类型] 判断失败，回退 standing。原因：{e}')
        return 'standing'


def augment_with_deepseek(pose_description, context_txt):
    """用 DeepSeek 将姿态描述转化为创作提示词。

    【关于 thinking（思考模式）——实测对比】
      同一提示词（要求"以 a cartoon drawing 开头，不多于15个英文单词"）：

        思考=off   2.8 秒   输出 "a cartoon"                    ← 被截断，不可用
        思考=on   13.0 秒   输出 "a cartoon drawing: healing-style man
                                  standing, arms high in V, legs apart,
                                  head bowed."                  ← 完整且贴合

      原因：这类任务要求同时满足"固定开头 + 词数上限 + 包含姿态要素"，
      模型需要推理才能收敛，少了这步会中途截断。
      因此**默认开启思考**（质量优先）。确实想省 token 时：
        DEEPSEEK_THINKING = off
      额定额度见下方 max_tokens 说明。

    【关于 max_tokens（实测踩坑）】
      开思考时，**思考内容也计入 max_tokens**。曾把上限设成 1024，
      结果模型把额度全用在推理上，最终 content 返回空字符串，
      直接抛"DeepSeek 返回了空内容"。
      所以：开思考必须给足额度（默认 4096）；关思考时几十个 token 就够（默认 512）。
    """
    headers = {
        "Authorization": f"Bearer {Config.DEEPSEEK_API_KEY}",
        "Content-Type": "application/json"
    }
    messages = [
        {"role": "system", "content": context_txt},
        {"role": "user", "content": f"人物姿态描述：{pose_description}"}
    ]
    thinking_on = os.environ.get('DEEPSEEK_THINKING', 'on').strip().lower() not in (
        'off', '0', 'false', 'no')
    # 额度必须按是否开思考分别给：思考算在 max_tokens 里
    default_max = '4096' if thinking_on else '512'
    payload = {
        "model": Config.DEEPSEEK_MODEL,
        "messages": messages,
        "temperature": float(os.environ.get('DEEPSEEK_TEMPERATURE', '1.0')),
        "max_tokens": int(os.environ.get('DEEPSEEK_MAX_TOKENS', default_max)),
    }
    if thinking_on:
        payload["thinking"] = {"type": "enabled"}
    t0 = time.time()
    resp = requests.post(
        Config.DEEPSEEK_ENDPOINT,
        headers=headers,
        json=payload,
        timeout=60
    )
    if not resp.ok:
        print(f'DeepSeek API error {resp.status_code}: {resp.text}')
        log_ai_call(site='art_prompt', provider='deepseek', model=Config.DEEPSEEK_MODEL,
                    prompt=pose_description, elapsed=time.time() - t0, ok=False,
                    error=f'HTTP {resp.status_code}: {resp.text[:300]}')
    resp.raise_for_status()
    data = resp.json()
    reasoning = data["choices"][0]["message"].get("reasoning_content", "")
    result = data["choices"][0]["message"].get("content", "")
    if reasoning:
        print(f'=== DeepSeek 思考过程 ===\n{reasoning}\n=== 思考结束 ===')
    print(f'=== DeepSeek 最终输出 ===\n{result if result else "(空)"}')
    if not result:
        log_ai_call(site='art_prompt', provider='deepseek', model=Config.DEEPSEEK_MODEL,
                    prompt=pose_description, elapsed=time.time() - t0, ok=False,
                    error='模型返回空内容')
        raise Exception("DeepSeek 返回了空内容")
    log_ai_call(site='art_prompt', provider='deepseek', model=Config.DEEPSEEK_MODEL,
                prompt=f'[system]{context_txt}\n[user]人物姿态描述：{pose_description}',
                response=result, usage=data.get('usage'),
                elapsed=time.time() - t0, ok=True)
    return result


def _pose_correction_describe(image_path):
    """调用学姐的关键点矫正方法，返回一句结构化姿态描述。

    设计原则：**尽力而为，绝不阻断主流程**。
    姿态矫正只是给创作提示词补充结构化信息，即使依赖缺失、模型加载失败
    或照片里检测不到人体，也应该让创作继续走下去 —— 所以这里把所有异常
    都吞掉并返回 None。

    开启开关：环境变量 POSE_CORRECTION = on（默认）/ off
    """
    if os.environ.get('POSE_CORRECTION', 'on').strip().lower() in ('off', '0', 'false', 'no'):
        return None

    try:
        from services import pose_correction as pc

        # 模板选择：让视觉模型看图判断站立/行走/坐姿。
        # 学姐项目自带的 detect_pose_type() 依赖关键点本身准确，
        # 而"关键点不准"正是需要矫正的场景，会形成循环依赖，所以不用它。
        template_key = classify_pose_type(image_path)

        result = pc.detect_and_correct_pose(image_path, template_key=template_key)
        # 缓存下来：前端若要展示骨架可视化，可以直接复用这次结果，
        # 避免重复检测、更避免重复调用视觉模型判断姿态类型。
        pc.remember_result(image_path, result)
        desc = pc.describe_pose(result)
        print(f'[姿态矫正] 模板={template_key} 平均置信度={result["mean_score"]} '
              f'最大位移={max(result["moved"]) if result["moved"] else 0:.4f}')
        print('[姿态矫正] 已生成结构化描述')
        return desc
    except Exception as e:
        print(f'[姿态矫正] 跳过（不影响创作）：{type(e).__name__}: {e}')
        return None


def create_art(img_path, typeindex, mood=None, mood_hint=None):
    """根据图片生成艺术创作

    流程：视觉模型分析姿态 → DeepSeek 生成创作提示词 → AI 生成

    typeindex:
        1 - 图片生成（云端混元生图 / 本地 HunyuanDiT）
        2 - 动画生成 (AnimateDiff)
        3 - 风格迁移 (InstructPix2Pix)
        4 - 3D生成 (腾讯混元3D)
        其他 - 音乐生成 (AudioLDM 2)

    mood / mood_hint：【疗愈回廊创新点】用户期望得到的心情，
        作为"生成方向"追加进提示词，让作品朝用户想要的情绪基调靠拢。
        这是可选的，不传则与原行为完全一致。
    """
    print(img_path)

    if typeindex == 1:
        context_txt = "你是一位极具创意的视觉艺术创作专家，请根据人物姿态描述，结合疗愈风格，给出一句文字描述，不多于50字。"
    elif typeindex == 2:
        context_txt = "你是一位极具创意的视觉艺术创作专家，请以疗愈风格为主，将描述的人物姿态改编为轻盈宁静或轻松活泼的形象，给出一句英文描述，不多于15个英文单词。"
    elif typeindex == 3:
        context_txt = "你是一位极具创意的视觉艺术创作专家，请以疗愈风格为主，以a cartoon drawing开头，描述图片中的人物形象，仅一句话不多于15个英文单词。"
    elif typeindex == 4:
        context_txt = "你是一位极具创意的视觉艺术创作专家，请以疗愈风格为主，在描述的人物姿态基础上增强为轻松活泼的形象，描述整体形象和局部具体动作，给出一段中文描述，不多于38个字。"
    else:
        context_txt = "你是一位极具创意的音乐创作专家，请以疗愈风格为主，生成一句精确英文，描述的音乐特征能够安抚描述中当前姿态的人物，仅一句话不多于15个英文单词。"

    try:
        # Step 1: 分析图中人物姿态
        set_progress('pose', '正在识别照片里的姿态与情绪…', 8)
        pose_description = vision_analyze_pose(img_path)

        # Step 1b: 【学姐方法】关键点检测 + 置信度感知矫正
        #   原流程只有文字描述；这里补上结构化关键点，并用学姐的模板融合方法
        #   修正低置信度/错位的关节点，再把矫正结果转成一句话合并进描述。
        #   整个环节是"尽力而为"：任何失败都不影响后面的创作流程。
        set_progress('correct', '正在矫正关节定位…', 11)
        corrected_desc = _pose_correction_describe(img_path)
        if corrected_desc:
            pose_description = f'{pose_description}\n结构化姿态分析（已矫正）：{corrected_desc}'

        # Step 2: 转化为创作提示词
        set_progress('prompt', '正在生成创作提示词…', 13)

        # 【疗愈回廊创新点】把用户"期望得到的心情"作为生成方向追加进指令。
        # 只加一句方向性描述，不改变原有提示词结构，保持与原行为兼容。
        if mood:
            if typeindex in (2, 3):
                # 这两个类型的提示词是英文，方向提示也用英文，避免模型混语言
                context_txt += (f" The user wants to feel '{mood_hint or mood}'. "
                                f"Please steer the mood of the description in that direction.")
            else:
                context_txt += (f" 用户希望获得「{mood}」的心情"
                                + (f"（方向：{mood_hint}）" if mood_hint else "")
                                + "。请让描述的情绪基调朝这个方向靠拢。")

        aug_txt = augment_with_deepseek(pose_description, context_txt)
        print(f'[创作] 期望心情: {mood or "（未指定）"}')
        print('[创作] 提示词已就绪')

        if typeindex == 1:
            create_work = gen_imgs("疗愈风格色彩明亮的山水", aug_txt)
        elif typeindex == 2:
            create_work = gen_anim(aug_txt)
        elif typeindex == 3:
            create_work = imggenimg_curl(aug_txt, img_path, 2)
        elif typeindex == 4:
            create_work = gen_3dimg(aug_txt, wait_for_completion=True, save_path="3d_output.mp4")
            # ⚠️ gen_3dimg 失败时不抛异常，而是返回带 Error 的 dict，
            #    这会骗过调用方的 `if result is None` 判断，导致：
            #    接口照样返回 success、数据库照样写一条指向不存在文件的记录
            #    —— 用户看到"创作完成"，画廊里却是个坏条目。这里提前拦住。
            if isinstance(create_work, dict):
                err = (create_work.get("Response") or {}).get("Error")
                if err:
                    code = err.get("Code", "")
                    msg = err.get("Message", "")
                    if code.startswith("AuthFailure") or not os.environ.get("TENCENT_SECRET_ID"):
                        raise Exception(
                            "3D 生成需要腾讯云密钥（TENCENT_SECRET_ID / TENCENT_SECRET_KEY），"
                            "当前未配置或无效，已跳过。其他四种创作类型不受影响。"
                            f"（服务端返回：{code}）")
                    raise Exception(f"3D 生成失败：{code} {msg}")
        else:
            create_work = genmusic(aug_txt)

        return create_work
    except Exception as e:
        # 原来只 print 不返回，调用方只能看到 None 并回一句笼统的"生成失败"，
        # 排障困难（例如 3D 缺密钥时完全看不出原因）。这里把原因一并返回。
        print(f"Error: {str(e)}")
        return {'__error__': str(e)}
