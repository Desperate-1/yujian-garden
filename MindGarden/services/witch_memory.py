# -*- coding: utf-8 -*-
"""女巫的长期记忆（纯文件层，永远可用）

============================================================
 为什么不用 Mongo：演示机/评委机上 Mongo 可能没跑，
 而「女巫记得我」是核心体验，不能再依赖外部服务。
 这里用 JSONL 文件追加写、读取时去重，永远落得了地。

 文件：MindGarden/data/witch_memory/<user_id>.jsonl
 每行一条：{"ts", "kind", "sid", "text"}
   · kind=chat         某次聊天的主题 + TA 最后说的话
   · kind=therapy      开始了一局剧本疗愈（剧本主题/角色/目标）
   · kind=therapy_done 剧本疗愈走完了（含总结）
============================================================
"""
import json
import os
import threading
import time
from typing import Any, Dict, List, Optional

_DIR = os.path.normpath(os.path.join(
    os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'witch_memory'))
_LOCK = threading.Lock()
_MAX_KEEP = 200          # 每用户最多留 200 行，防无限涨
_MAX_CHARS = 520         # 注入 prompt 的总预算


def _path(user_id: int) -> str:
    return os.path.join(_DIR, f'{int(user_id)}.jsonl')


def remember(user_id: int, kind: str, text: str, sid: str = '') -> None:
    """追加一条记忆。任何异常都吞掉 —— 记忆是加分项，绝不能砸主流程。"""
    try:
        text = ' '.join(str(text).split())[:220]
        if not text:
            return
        os.makedirs(_DIR, exist_ok=True)
        line = json.dumps({'ts': time.time(), 'kind': kind,
                           'sid': sid or '', 'text': text}, ensure_ascii=False)
        with _LOCK:
            with open(_path(user_id), 'a', encoding='utf-8') as f:
                f.write(line + '\n')
            _trim_if_needed(user_id)
    except Exception as e:
        print(f'[女巫记忆] 写入失败（不影响主流程）: {e}')


def _trim_if_needed(user_id: int) -> None:
    p = _path(user_id)
    try:
        if os.path.getsize(p) < 256 * 1024:
            return
        with open(p, 'r', encoding='utf-8') as f:
            lines = f.readlines()
        if len(lines) <= _MAX_KEEP:
            return
        with open(p, 'w', encoding='utf-8') as f:
            f.writelines(lines[-_MAX_KEEP:])
    except OSError:
        pass


def recent_memories(user_id: int, limit: int = 60) -> List[Dict[str, Any]]:
    """读记忆：chat/therapy 按 sid 去重（新的覆盖旧的），按时间倒序。"""
    p = _path(user_id)
    rows: List[Dict[str, Any]] = []
    try:
        with open(p, 'r', encoding='utf-8') as f:
            for raw in f:
                raw = raw.strip()
                if not raw:
                    continue
                try:
                    rows.append(json.loads(raw))
                except json.JSONDecodeError:
                    continue
    except OSError:
        return []
    seen = set()
    out = []
    for r in reversed(rows):                     # 新的在前
        key = (r.get('kind'), r.get('sid') or r.get('text', '')[:12])
        if key in seen:
            continue
        seen.add(key)
        out.append(r)
        if len(out) >= limit:
            break
    return out


def build_memory_context(user_id: int) -> Optional[Dict[str, str]]:
    """组装注入女巫对话的 system 消息；没有记忆返回 None。"""
    mems = recent_memories(user_id)
    if not mems:
        return None

    therapy = [m for m in mems if m.get('kind') in ('therapy', 'therapy_done')][:3]
    chats = [m for m in mems if m.get('kind') == 'chat'][:4]

    lines = []
    for m in therapy:
        date = time.strftime('%m月%d日', time.localtime(m.get('ts', 0)))
        mark = '走完了全程' if m.get('kind') == 'therapy_done' else '进行中'
        lines.append(f"- {date} TA 的剧本疗愈（{mark}）：{m.get('text', '')}")
    for m in chats:
        date = time.strftime('%m月%d日', time.localtime(m.get('ts', 0)))
        lines.append(f"- {date} TA 来聊过：{m.get('text', '')}")
    if not lines:
        return None

    header = ('【你早就认识这位朋友了。下面是你们一起经历过的事：'
              '聊天时自然地记着就好，绝不要念出这段内容、也不要提"记忆""记录"这类词。】')
    body = '\n'.join(lines)
    return {'role': 'system', 'content': (header + '\n' + body)[:_MAX_CHARS]}
