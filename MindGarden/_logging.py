# -*- coding: utf-8 -*-
"""日志输出：写到文件时**每次写完立即关闭**，不长期占用文件句柄。

为什么不用重定向：
    PowerShell 的 -RedirectStandardOutput / subprocess 的 stdout=文件对象，
    都会让日志文件在整个进程生命周期内保持打开。结果是应用运行期间，
    压缩、复制、备份这些操作都会失败：
        "无法打开 _app_out.log：另一个程序正在使用此文件"

这里换成"按需打开 -> 写 -> 立即关闭"，句柄不会跨操作持有。

设计要点：
    - 同时写控制台和文件：前台运行时看得到，后台运行时也能事后排查
    - 日志文件超过上限时自动轮转一次，避免无限增长
    - 任何写入异常都吞掉：日志失败绝不能影响主流程
"""
import os
import sys
import datetime

ROOT = os.path.dirname(os.path.abspath(__file__))
LOG_PATH = os.path.join(ROOT, "_app_out.log")
MAX_BYTES = 512 * 1024          # 超过 512 KB 就轮转，只保留一份旧日志


class Tee:
    """把写入同时送到控制台和日志文件；文件每次写入后立刻关闭。"""

    def __init__(self, log_path=LOG_PATH, max_bytes=MAX_BYTES):
        self.log_path = log_path
        self.max_bytes = max_bytes
        self._stdout = sys.__stdout__

    def _rotate_if_needed(self):
        try:
            if os.path.exists(self.log_path) and os.path.getsize(self.log_path) > self.max_bytes:
                bak = self.log_path + ".1"
                if os.path.exists(bak):
                    os.remove(bak)
                os.replace(self.log_path, bak)
        except Exception:
            pass

    def _write(self, text, also_console=True):
        if not text:
            return
        # 控制台：失败也不管（可能根本没有控制台）
        if also_console:
            try:
                if self._stdout and not self._stdout.closed:
                    self._stdout.write(text)
                    self._stdout.flush()
            except Exception:
                pass
        # 文件：写完立即关闭，句柄不跨操作
        try:
            self._rotate_if_needed()
            with open(self.log_path, "a", encoding="utf-8", errors="replace") as f:
                f.write(text)
        except Exception:
            pass

    def write(self, text):
        self._write(text)

    def flush(self):
        try:
            if self._stdout and not self._stdout.closed:
                self._stdout.flush()
        except Exception:
            pass

    def isatty(self):
        try:
            return bool(self._stdout and self._stdout.isatty())
        except Exception:
            return False

    def fileno(self):
        # 有些库会调用 fileno()，转发给真实 stdout
        if self._stdout:
            return self._stdout.fileno()
        raise OSError("no stdout")

    def writable(self):
        return True

    def readable(self):
        return False

    def seekable(self):
        return False


def install(prefix=""):
    """把 stdout / stderr 换成 Tee。返回 Tee 实例。"""
    tee = Tee()
    if prefix:
        tee._write(f"\n===== {prefix} {datetime.datetime.now():%Y-%m-%d %H:%M:%S} =====\n")
    else:
        tee._write(f"\n===== start {datetime.datetime.now():%Y-%m-%d %H:%M:%S} =====\n")
    sys.stdout = tee
    sys.stderr = tee
    return tee
