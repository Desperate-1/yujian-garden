from flask import (Blueprint, render_template, request, redirect, url_for,
                   flash, jsonify, session)
from flask_login import login_required, current_user
from models.mysqldb_alt import db
from services.sentiment import analyze_journal
from services.journal_companion import sprite_persona_for, companion_reply
from collections import Counter
from jieba import cut_for_search

journal_bp = Blueprint('journal', __name__)

@journal_bp.route('/journal', methods=['GET'])
@login_required
def index():
    journals = db.get_user_journals(current_user.id)
    # 危机提示：写日记时若命中危机信号，在这里显示一次
    # （用 session.pop 取出即清，刷新页面不会重复出现）
    crisis_message = session.pop('crisis_message', None)
    crisis_level = session.pop('crisis_level', None)
    return render_template('journal/index.html', journals=journals,
                           crisis_message=crisis_message,
                           crisis_level=crisis_level)

@journal_bp.route('/journal/create', methods=['GET', 'POST'])
@login_required
def create():
    if request.method == 'POST':
        content = request.form.get('content', '').strip()
        if not content:
            flash('先写下想记录的内容，再收进树洞')
            return redirect(url_for('journal.create'))

        # 大模型结构化分析：分数 + 情绪标签 + 判断理由 + 风险等级
        # （详见 services/sentiment.py 的说明）
        result = analyze_journal(content)
        emotion_score = result['score']
        db.create_journal(
            current_user.id, content, emotion_score,
            emotion_tags=','.join(result['tags']) if result['tags'] else None,
            emotion_reason=result['reason'] or None,
            risk_level=result['risk'],
        )

        # 危机提示不能走 flash：它含多行和热线号码，flash 的气泡样式会挤成一团。
        # 用 session 传一次性消息，由页面渲染成专门的提示块。
        if result['crisis']:
            session['crisis_message'] = result['crisis_message']
            session['crisis_level'] = result['crisis_level']
            return redirect(url_for('journal.index'))

        flash(f'日记已保存 · 情绪指数 {emotion_score:.2f}')
        return redirect(url_for('journal.index'))

    # 小精灵陪伴：最近剧本里的角色来陪写；没剧本时是默认小精灵「小栖」
    sprite = sprite_persona_for(current_user.id)
    return render_template('journal/create.html', sprite=sprite)


@journal_bp.route('/journal/companion', methods=['POST'])
@login_required
def companion():
    """小精灵陪伴：写日记中途停笔时，角色轻声回应一句。"""
    data = request.get_json(silent=True) or {}
    draft = (data.get('draft') or '')[:1200]
    if not draft.strip():
        return jsonify({'ok': False, 'msg': '内容为空'}), 400
    return jsonify(companion_reply(current_user.id, draft))


@journal_bp.route('/journal/dismiss-crisis', methods=['POST'])
@login_required
def dismiss_crisis():
    """用户关掉危机提示后清除，避免每次进日记页都弹。"""
    session.pop('crisis_message', None)
    session.pop('crisis_level', None)
    return jsonify({'ok': True})

@journal_bp.route('/journal/<int:id>')
@login_required
def detail(id):
    journal = db.get_journal_by_id(id, current_user.id)
    if journal is None:
        flash('无权访问')
        return redirect(url_for('journal.index'))

    return render_template('journal/detail.html', journal=journal)

@journal_bp.route('/api/emotion-data')
@login_required
def emotion_data():
   #  使用pymysql
    journals = db.get_user_journals(current_user.id)

    journals = list(journals)
    
    # Sort by date ascending (pymysql returns descending by default)
    journals.sort(key=lambda x: x['created_at'])
    

    # Generate word cloud data with filtering
    all_content = " ".join(j['content'] for j in journals)
    
    # Use jieba with proper filtering
    words = [word for word in cut_for_search(all_content) 
             if len(word) > 1 and word.strip()]  # Filter short words
    word_freq = Counter(words)
    
    # Return journal IDs for interactivity
    journal_ids = [j['id'] for j in journals]

    return jsonify({
        'dates': [j['created_at'].strftime('%Y-%m-%d') for j in journals],
        'scores': [j['emotion_score'] for j in journals],
        'journal_ids': journal_ids,
        # 情绪标签与理由：让用户知道"这个分数是怎么来的"
        # 旧数据没有这两列时为 None，前端要能兼容
        'tags': [(j.get('emotion_tags') or '') for j in journals],
        'reasons': [(j.get('emotion_reason') or '') for j in journals],
        'risks': [(j.get('risk_level') or 'none') for j in journals],
        'wordCloudData': [{"name": word, "value": freq}
                          for word, freq in word_freq.most_common(50)]
    })

@journal_bp.route('/api/journals')
@login_required
def get_journals_api():
    """API endpoint to get paginated journals"""
    try:
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 5, type=int)

        journals, total = db.get_journals_with_pagination(current_user.id, page, per_page)
        return jsonify({
            'journals': journals,
            'total': total,
            'page': page,
            'per_page': per_page
        })
    except Exception as e:
        print(f"Error in get_journals_api: {e}")
        return jsonify({'error': str(e)}), 500

@journal_bp.route('/api/journals/batch-delete', methods=['POST'])
@login_required
def batch_delete_journals():
    """API endpoint for batch deleting journals"""
    try:
        data = request.get_json()
        journal_ids = data.get('journal_ids', [])

        if not journal_ids:
            return jsonify({'success': False, 'message': '未选择日记'})

        success = db.delete_journals_by_ids(current_user.id, journal_ids)
        if success:
            return jsonify({'success': True, 'message': '删除成功'})
        else:
            return jsonify({'success': False, 'message': '删除失败'})

    except Exception as e:
        print(f"Error in batch_delete_journals: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

# Add teardown handler for journal routes
@journal_bp.teardown_request
def teardown_request(exception=None):
    db.close()
