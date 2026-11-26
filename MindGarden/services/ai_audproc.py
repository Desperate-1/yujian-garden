import base64
import hashlib
import hmac
import json
from urllib.parse import urlencode
import time
import ssl
from wsgiref.handlers import format_date_time
from datetime import datetime
from time import mktime
import websocket
import subprocess
import tempfile
import os

# 讯飞API配置（环境变量读取，见 config.py 顶部注释；终端 export IFLYTEK_APP_ID/IFLYTEK_API_KEY/IFLYTEK_API_SECRET）
#
# ⚠️ 不要在这里用模块级常量存密钥！
#    原实现是 `IFLYTEK_APP_ID = os.environ.get(...)`，在 **import 时**求值一次。
#    如果应用启动时环境变量还没设好（例如手动启动、或启动脚本漏了这几项），
#    即使之后补上，进程里也永远是空字符串，语音功能就一直是 401，
#    而且报错信息只有 "HMAC signature cannot be verified"，极难定位。
#    改成每次调用时读取，彻底消除这个启动顺序依赖。
def _iflytek_creds():
    """每次调用时读取讯飞凭据，返回 (app_id, api_key, api_secret)。"""
    return (
        os.environ.get('IFLYTEK_APP_ID', '').strip(),
        os.environ.get('IFLYTEK_API_KEY', '').strip(),
        os.environ.get('IFLYTEK_API_SECRET', '').strip(),
    )


def _require_iflytek_creds():
    """取凭据；缺失时抛出人能看懂的提示，而不是让请求带着空签名去撞 401。"""
    app_id, api_key, api_secret = _iflytek_creds()
    missing = [n for n, v in (('IFLYTEK_APP_ID', app_id),
                              ('IFLYTEK_API_KEY', api_key),
                              ('IFLYTEK_API_SECRET', api_secret)) if not v]
    if missing:
        raise Exception(
            "语音功能缺少讯飞配置：" + "、".join(missing) +
            "。请在讯飞控制台（console.xfyun.cn）应用详情页复制"
            "APPID / APIKey / APISecret，设置后重启应用。")
    return app_id, api_key, api_secret


def _build_iflytek_url(host, path):
    """生成讯飞 WebSocket 鉴权 URL。

    ⚠️ 关键点：签名里的 "host:" 和 "GET <path> HTTP/1.1" 必须与实际请求
    的 host 和 path 完全一致，否则讯飞会返回
        401 HMAC signature cannot be verified:
            enforced header 'host' not used for signature creation
    原代码这里写死了 "ws-api.xfyun.cn"，而实际连的是 iat-api / tts-api，
    所以语音功能一直是坏的。这里改为按实际 host 动态生成。
    """
    app_id, api_key, api_secret = _require_iflytek_creds()
    now = datetime.now()
    date = format_date_time(mktime(now.timetuple()))

    signature_origin = f"host: {host}\n"
    signature_origin += f"date: {date}\n"
    signature_origin += f"GET {path} HTTP/1.1"

    signature_sha = hmac.new(api_secret.encode('utf-8'),
                             signature_origin.encode('utf-8'),
                             digestmod=hashlib.sha256).digest()
    signature_sha = base64.b64encode(signature_sha).decode(encoding='utf-8')

    authorization_origin = ('api_key="%s", algorithm="%s", headers="%s", signature="%s"'
                            % (api_key, "hmac-sha256",
                               "host date request-line", signature_sha))
    authorization = base64.b64encode(authorization_origin.encode('utf-8')).decode(encoding='utf-8')

    params = {"authorization": authorization, "date": date, "host": host}
    return f"wss://{host}{path}?" + urlencode(params)


def iflytek_speech_to_text(audio_file):
    """
    使用讯飞语音听写API将音频转换为文本
    """
    # 生成鉴权参数（host 必须与真实请求一致：iat-api.xfyun.cn）
    ws_url = _build_iflytek_url('iat-api.xfyun.cn', '/v2/iat')
    print("------>语音听写鉴权 URL 已生成")

    # 建立WebSocket连接
    websocket.enableTrace(False)
    ssl_context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    ssl_context.check_hostname = False
    ssl_context.verify_mode = ssl.CERT_NONE
    
    ws = websocket.create_connection(ws_url, sslopt={"context": ssl_context})
    print("------>已建立语音听写连接")

    webm_path = None
    pcm_path = None
    try:
        # 将前端上传的 WebM/Opus 用 ffmpeg 转为 PCM 16kHz（讯飞 API 要求的格式）
        with tempfile.NamedTemporaryFile(delete=False, suffix='.webm') as webm_file:
            audio_file.save(webm_file.name)
            webm_path = webm_file.name

        pcm_path = webm_path.replace('.webm', '.raw')

        webm_size = os.path.getsize(webm_path)
        print(f'WebM 文件大小: {webm_size} bytes')
        if webm_size == 0:
            raise Exception("录音文件为空，请重新录音")

        result = subprocess.run([
            'ffmpeg', '-i', webm_path,
            '-f', 's16le', '-acodec', 'pcm_s16le', '-ac', '1', '-ar', '16000',
            pcm_path, '-y'
        ], capture_output=True)
        if result.returncode != 0:
            err_msg = result.stderr.decode('utf-8', errors='replace')
            print(f'ffmpeg 转换失败:\n{err_msg}')
            raise Exception(f'音频转换失败: {err_msg[-200:]}')

        with open(pcm_path, 'rb') as f:
            audio_data = f.read()

        if len(audio_data) == 0:
            raise Exception("音频数据为空")

        print('音频长度：',len(audio_data))
        # 发送音频数据
        # 320 字节 = 16000Hz * 2字节 * 0.01秒，即每帧 10ms 音频。
        # 原代码 interval=0.04，等于每发一帧就等 40ms —— 把 10ms 音频当 40ms 发，
        # 整体慢了 4 倍（一条 5 秒录音要传 20 多秒）。讯飞并不要求实时发送，
        # 这里降到 0.01（与音频时长等价），并允许用环境变量微调。
        # 若遇到 11200 之类限流错误，把 IFLYTEK_STT_INTERVAL 调回 0.02~0.04。
        frame_size = 320
        interval = float(os.environ.get('IFLYTEK_STT_INTERVAL', '0.01'))
        status = 0
        
        for i in range(0, len(audio_data), frame_size): 
            buf = audio_data[i:i+frame_size]
            if status == 0:
                data = {
                    "common": {
                        "app_id": _iflytek_creds()[0]
                    },
                    "business": {
                        "language": "zh_cn",
                        "domain": "iat",
                        "accent": "mandarin",
                        #"pd":"health",
                        "vad_eos": 10000
                    },
                    "data": {
                        "status": 0,
                        "format": "audio/L16;rate=16000",
                        "audio": base64.b64encode(buf).decode('utf-8'),
                        "encoding": "raw"
                    }
                }
                ws.send(json.dumps(data))
                status = 1
            elif status == 1:
                d = {"data": {"status": 1, "format": "audio/L16;rate=16000",
                                "audio": str(base64.b64encode(buf), 'utf-8'),
                                "encoding": "raw"}}
                ws.send(json.dumps(d))
            time.sleep(interval)

        # 发送结束帧（status=2 告诉讯飞音频发送完毕，开始识别）
        end_frame = {"data": {"status": 2, "format": "audio/L16;rate=16000",
                              "audio": "", "encoding": "raw"}}
        ws.send(json.dumps(end_frame))

        print("------>发送语音数据完毕")

        # 接收识别结果
        result = ""
        while True:
            try:
                msg = ws.recv()
                if not msg:
                    continue

                print(f"Received raw message: {msg}")
                resp_data = json.loads(msg)
                print(resp_data)
                if resp_data["code"] != 0:
                    print(f"识别错误: {resp_data['message']}")
                    raise Exception(f"识别错误: {resp_data['message']}")
                else:
                    ws_result = resp_data["data"]["result"]["ws"]
                    for i in ws_result:
                        for w in i["cw"]:
                            result += w["w"]
                if resp_data["data"]["status"] == 2:
                    break
            except json.JSONDecodeError:
                print(f"Invalid JSON received: {msg}")
                continue
            except websocket.WebSocketConnectionClosedException:
                break
        print("------>识别结束:",result)
        return result

    except Exception as e:
        print(f"语音识别过程中发生错误: {str(e)}")
        raise e
    finally:
        # 清理临时文件
        for path in [webm_path, pcm_path]:
            if path and os.path.exists(path):
                os.unlink(path)
        ws.close()

def iflytek_text_to_speech(text):
    # 生成鉴权参数（host 必须与真实请求一致：tts-api.xfyun.cn）
    ws_url = _build_iflytek_url('tts-api.xfyun.cn', '/v2/tts')
    print("------>语音合成鉴权 URL 已生成")

    try:
        websocket.enableTrace(False)
        ws = websocket.create_connection(ws_url)
        print("------>已建立语音合成连接")

        # 构建请求数据
        data = {
            "common": {
                "app_id": _iflytek_creds()[0]
            },
            "business": {
                "aue": "lame",
                "sfl":1,
                "auf": "audio/L16;rate=16000",
                # 发音人（vcn）必须选账号已授权的，否则会返回 code=11200 "licc failed"。
                # 原代码用的 x4_yezi 属付费发音人，免费账号未授权 -> 一直失败。
                # xiaoyan 是讯飞默认免费女声，最适合疗愈对话场景；同账号下
                # aisjiuxu / aisxping / aisjinger / aisbabyxu 也可用。
                # 如需更换，设置环境变量 IFLYTEK_TTS_VOICE 即可，无需改代码。
                "vcn": os.environ.get('IFLYTEK_TTS_VOICE', 'xiaoyan'),
                "tte": "utf8"
            },
            "data": {
                "text": str(base64.b64encode(text.encode('utf-8')), "UTF8"),
                "status": 2
            }
        }
        
        # 发送请求
        print("------>开始发送文本数据")
        ws.send(json.dumps(data))
        
        # 接收音频数据
        audio_data = b''
        while True:
            try:
                msg = ws.recv()
                data = json.loads(msg)
                
                if data.get("code") != 0:
                    raise Exception(f"语音合成错误: {data.get('message')}")
                
                # 解码音频数据
                audio_chunk = base64.b64decode(data["data"]["audio"])
                audio_data += audio_chunk
                
                if data["data"]["status"] == 2:
                    break
            except websocket.WebSocketConnectionClosedException:
                break
        
        with open('./demo.mp3', 'ab') as f:
                f.write(audio_data)
        # 注意：上面这行只作调试留痕，用 'ab' 追加会把文件越写越大，
        # 所以下面额外写一份"本次"的完整音频，并把音频字节直接返回给调用方。
        # 路由 /chat/voice-output 用的是返回值，不依赖这个文件。
        return audio_data
        
    except Exception as e:
        raise Exception(f"语音合成失败: {str(e)}")
    finally:
        if 'ws' in locals() and ws.connected:
            ws.close()