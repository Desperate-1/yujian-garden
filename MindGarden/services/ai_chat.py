import requests
import json
from config import Config
import datetime

import jieba
from collections import Counter
import re

def get_deepseek_response(messages, user_context=None):
    headers = {
        "Authorization": f"Bearer {Config.DEEPSEEK_API_KEY}",
        "Content-Type": "application/json"
    }
    
    # 只序列化必要字段，移除timestamp等可能引起问题的字段
    serializable_messages = []
    for msg in messages:
        serializable_msg = {
            "role": msg["role"],
            "content": msg["content"]
        }
        serializable_messages.append(serializable_msg)
    
    payload = {
        "model": "deepseek-flash",
        "messages": serializable_messages,  # Use converted messages
        "temperature": 0.7,
        "max_tokens": 8192,
        # 关思维链必须是顶层字段（原生 REST 调用）；extra_body 是 OpenAI SDK 写法，REST 不识别。
        # 不关的话每轮白付推理 token，且 temperature 不生效。
        "thinking": {"type": "disabled"},
        "user_context": "你是一位专业的心理咨询师，根据最近一次用户对话内容区分判断，按需使用温暖、支持性的语言与用户交流。"
    }
    
    try:
        response = requests.post(
            Config.DEEPSEEK_ENDPOINT,
            headers=headers,
            data=json.dumps(payload),
            timeout=60
        )
        if response.status_code != 200:
            # 关键：401/403 的真正原因在响应体里（无效key/已撤销/无余额/平台不对），
            # 只打 raise_for_status 的 str(e) 会把这些信息全丢掉，只剩一句 "401"。
            print(f"DeepSeek API error: HTTP {response.status_code}")
        response.raise_for_status()
        return response.json()['choices'][0]['message']['content']
    except Exception as e:
        print(f"DeepSeek API error: {str(e)}")
        return "抱歉，我现在无法回应。请稍后再试。"

def extract_topic(conversation_text):
    """
    从对话文本中提取主题（使用jieba库）
    """
    try:
        # 只提取assistant角色的内容
        assistant_matches = re.findall(r'assistant:\s*(.*?)(?=user:|assistant:|system:|$)', conversation_text, re.DOTALL)
        assistant_text = ' '.join(assistant_matches)
        
        if not assistant_text:
            return "心理对话"
        
        # 清理文本
        cleaned_text = re.sub(r'[^\w\s]', ' ', assistant_text)
        cleaned_text = re.sub(r'\s+', ' ', cleaned_text).strip()
        
        # 如果文本太短，直接返回
        if len(cleaned_text) < 10:
            return "心理支持"

        # 使用TextRank算法提取关键词作为主题
        import jieba.analyse  # 按需导入：首次加载较慢
        topics = jieba.analyse.extract_tags(
            cleaned_text, 
            topK=5,           # 提取前2个主题词
            withWeight=False,
            allowPOS=('n', 'vn', 'v', 'a')  # 只保留名词、动名词、动词、形容词
        )
        
        if topics:
            return ' '.join(topics)
        else:
            # 备选方案：使用高频词
            words = jieba.lcut(cleaned_text)
            filtered_words = [
                word for word in words 
                if len(word) > 1 and word not in stop_words
            ]
            if filtered_words:
                word_freq = Counter(filtered_words)
                top_words = [word for word, _ in word_freq.most_common(2)]
                return '、'.join(top_words)
            else:
                return "心理对话"
        
    except Exception as e:
        print(f"主题提取错误: {e}")
        return "对话记录"

# 中文停用词列表
stop_words = {
    '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '一个', '上', '也', '很', '到', '说', '要', '去', '你',
    '会', '着', '没有', '看', '好', '自己', '这', '那', '他', '她', '它', '我们', '你们', '他们', '这个', '那个', '这样', '那样',
    '什么', '怎么', '为什么', '如何', '可以', '可能', '应该', '需要', '因为', '所以', '但是', '然后', '现在', '今天', '明天', '昨天',
    '觉得', '知道', '感觉', '真的', '就是', '还是', '一些', '一点', '一下', '这种', '那种', '这种', '那种', '时候', '事情', '问题'
}