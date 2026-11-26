# -*- coding: utf-8 -*-
"""MindGarden AI 链路诊断：逐段验证，定位到底哪一环不通。

用法（在项目目录下）：
    .venv\\Scripts\\python.exe ..\\工具\\AI链路诊断.py
"""
import sys, os, time, json
sys.stdout.reconfigure(encoding="utf-8")

PROJ = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "MindGarden"))
os.chdir(PROJ)
sys.path.insert(0, PROJ)

import requests
from config import Config

OK, BAD, WARN = "[OK]", "[!!]", "[..]"


def section(t):
    print("\n" + "=" * 64)
    print(" " + t)
    print("=" * 64)


section("0. 配置总览")
print(f"  VISION_PROVIDER      = {Config.VISION_PROVIDER}")
print(f"  DEEPSEEK_ENDPOINT    = {Config.DEEPSEEK_ENDPOINT}")
print(f"  DEEPSEEK_MODEL       = {Config.DEEPSEEK_MODEL}")
print(f"  GLM_ENDPOINT         = {Config.GLM_ENDPOINT}")
print(f"  GLM_VISION_MODEL     = {Config.GLM_VISION_MODEL}")
print(f"  DEEPSEEK_API_KEY     = {'已配置(长度%d)' % len(Config.DEEPSEEK_API_KEY) if Config.DEEPSEEK_API_KEY else '【缺失】'}")
print(f"  GLM_API_KEY          = {'已配置(长度%d)' % len(Config.GLM_API_KEY) if Config.GLM_API_KEY else '【缺失】'}")
print(f"  KIMI_API_KEY         = {'已配置' if Config.KIMI_API_KEY else '未配置'}")
print(f"  TENCENT_SECRET_ID    = {'已配置' if os.environ.get('TENCENT_SECRET_ID') else '未配置（3D 生成会失败）'}")
print(f"  IFLYTEK_APP_ID       = {'已配置' if os.environ.get('IFLYTEK_APP_ID') else '未配置（语音会失败）'}")

# ---------- 1. DeepSeek ----------
section("1. DeepSeek 连接测试")
if not Config.DEEPSEEK_API_KEY:
    print(f"  {BAD} 未配置 DEEPSEEK_API_KEY，跳过。")
    print("       PowerShell: $env:DEEPSEEK_API_KEY = \"sk-你的key\"")
else:
    H = {"Authorization": f"Bearer {Config.DEEPSEEK_API_KEY}", "Content-Type": "application/json"}
    # 1a 列出可用模型（最权威的校验：既能验 key 又能看模型名）
    print(f"  {WARN} 调用 /models 列出可用模型 ...")
    try:
        r = requests.get("https://api.deepseek.com/models", headers=H, timeout=30)
        if r.ok:
            ids = [m.get("id") for m in r.json().get("data", [])]
            print(f"  {OK} Key 有效。可用模型: {ids}")
            if Config.DEEPSEEK_MODEL not in ids:
                print(f"  {BAD} 配置的模型 '{Config.DEEPSEEK_MODEL}' 不在列表中，请改用上面某个名字")
        else:
            print(f"  {BAD} HTTP {r.status_code}")
    except Exception as e:
        print(f"  {BAD} {type(e).__name__}: {e}")

    # 1b 纯文本对话
    print(f"  {WARN} 测试对话（model={Config.DEEPSEEK_MODEL}）...")
    try:
        t0 = time.time()
        r = requests.post(Config.DEEPSEEK_ENDPOINT, headers=H, timeout=90, json={
            "model": Config.DEEPSEEK_MODEL,
            "messages": [{"role": "user", "content": "用一句话介绍你自己"}],
            "max_tokens": 100,
        })
        dt = time.time() - t0
        if r.ok:
            d = r.json()
            print(f"  {OK} {dt:.1f}s -> {d['choices'][0]['message'].get('content', '')[:120]}")
            print(f"      usage={d.get('usage')}")
        else:
            print(f"  {BAD} HTTP {r.status_code}")
    except Exception as e:
        print(f"  {BAD} {type(e).__name__}: {e}")

    # 1c 余额（有些平台支持，不支持也无所谓）
    print(f"  {WARN} 查询余额 ...")
    try:
        r = requests.get("https://api.deepseek.com/user/balance", headers=H, timeout=30)
        if r.ok:
            print(f"  {OK} {r.json()}")
        else:
            print(f"      HTTP {r.status_code}（该接口可能不可用，不影响使用）")
    except Exception as e:
        print(f"      跳过: {type(e).__name__}")

# ---------- 2. 姿态识别 ----------
section("2. 姿态识别（vision_analyze_pose）")
img = os.path.join(PROJ, "output.png")
if not os.path.exists(img):
    print(f"  {BAD} 找不到测试图片 output.png")
else:
    try:
        from services.ai_art import vision_analyze_pose
        t0 = time.time()
        desc = vision_analyze_pose(img)
        print(f"  {OK} {time.time()-t0:.1f}s")
        print(f"      描述: {desc}")
    except Exception as e:
        print(f"  {BAD} {type(e).__name__}: {e}")

# ---------- 3. 提示词生成 ----------
section("3. 提示词生成（augment_with_deepseek）")
if not Config.DEEPSEEK_API_KEY:
    print(f"  {BAD} 需要 DEEPSEEK_API_KEY，跳过。")
else:
    try:
        from services.ai_art import augment_with_deepseek
        ctx = "你是一位极具创意的视觉艺术创作专家，请根据人物姿态描述，结合疗愈风格，给出一句文字描述，不多于50字。"
        t0 = time.time()
        out = augment_with_deepseek("一位老人手扶后腰，眉头紧锁", ctx)
        print(f"  {OK} {time.time()-t0:.1f}s")
        print(f"      提示词: {out}")
    except Exception as e:
        print(f"  {BAD} {type(e).__name__}: {e}")

# ---------- 4. AI 聊天 ----------
section("4. AI 心理对话（ai_chat）")
if not Config.DEEPSEEK_API_KEY:
    print(f"  {BAD} 需要 DEEPSEEK_API_KEY，跳过。")
else:
    try:
        from services.ai_chat import get_deepseek_response
        msgs = [{"role": "user", "content": "我最近工作压力好大，晚上睡不着"}]
        t0 = time.time()
        reply = get_deepseek_response(msgs)
        print(f"  {OK} {time.time()-t0:.1f}s")
        print(f"      回复: {reply[:200]}")
    except Exception as e:
        print(f"  {BAD} {type(e).__name__}: {e}")

# ---------- 5. 本地生成模型 ----------
section("5. 本地生成模型（仅检查能否加载，不实际生成，很慢）")
for name, imp in [("diffusers", "import diffusers"),
                  ("transformers", "import transformers"),
                  ("torch", "import torch")]:
    try:
        exec(imp)
        print(f"  {OK} {name}")
    except Exception as e:
        print(f"  {BAD} {name}: {e}")

# ---------- 6. 调用日志 ----------
section("6. AI 调用日志")
logp = os.path.join(PROJ, "logs", "ai_call_log.jsonl")
if os.path.exists(logp):
    lines = [l for l in open(logp, encoding="utf-8").read().strip().split("\n") if l]
    print(f"  {OK} {logp}")
    print(f"      记录条数: {len(lines)}")
    sites = {}
    for l in lines:
        try:
            r = json.loads(l)
            k = f"{r.get('site')}/{r.get('provider')}/{r.get('model')}"
            sites[k] = sites.get(k, 0) + 1
        except Exception:
            pass
    print("      按环节统计:")
    for k, v in sorted(sites.items()):
        print(f"        {k}: {v} 次")
else:
    print(f"  {WARN} 还没有日志（跑过任意 AI 功能后会生成）")

section("诊断结束")
