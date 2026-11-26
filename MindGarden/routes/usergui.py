from flask import Blueprint, jsonify
from services.user_interact import WorkInteractionService
from flask_login import login_required

work_interaction_bp = Blueprint('work_interaction', __name__)

@work_interaction_bp.route('/like/<int:work_id>', methods=['POST'])
@login_required
def toggle_like(work_id):
    """切换点赞状态"""
    try:
        result = WorkInteractionService.toggle_like(work_id)
        return jsonify(result)
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@work_interaction_bp.route('/collect/<int:work_id>', methods=['POST'])
@login_required
def toggle_collection(work_id):
    """切换收藏状态"""
    try:
        result = WorkInteractionService.toggle_collection(work_id)
        return jsonify(result)
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@work_interaction_bp.route('/status/<int:work_id>', methods=['GET'])
def get_interaction_status(work_id):
    """获取交互状态"""
    try:
        user_status = WorkInteractionService.get_user_interaction_status(work_id)
        work_stats = WorkInteractionService.get_work_stats(work_id)
        
        return jsonify({
            'success': True,
            'user_status': user_status,
            'work_stats': work_stats
        })
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@work_interaction_bp.route('/delete/<int:artwork_id>', methods=['DELETE'])
@login_required
def delete_artwork(artwork_id):
    result = WorkInteractionService.delete_artwork(artwork_id)
    return jsonify(result)