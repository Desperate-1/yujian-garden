from models.mysqldb_alt import db
from flask_login import current_user

class WorkInteractionService:
    
    @staticmethod
    def toggle_like(work_id):
        """切换点赞状态"""
        if not current_user.is_authenticated:
            return {'success': False, 'message': '请先登录'}
            
        try:
            result = db.toggle_like(current_user.id, work_id)
            result['success'] = True
            return result
        except Exception as e:
            return {'success': False, 'message': str(e)}
    
    @staticmethod
    def toggle_collection(work_id):
        """切换收藏状态"""
        if not current_user.is_authenticated:
            return {'success': False, 'message': '请先登录'}
            
        try:
            result = db.toggle_collection(current_user.id, work_id)
            result['success'] = True
            return result
        except Exception as e:
            return {'success': False, 'message': str(e)}
    
    @staticmethod
    def get_user_interaction_status(work_id):
        """获取用户对作品的交互状态"""
        if not current_user.is_authenticated:
            return {'liked': False, 'collected': False}
            
        try:
            return db.get_user_interaction_status(current_user.id, work_id)
        except Exception as e:
            return {'liked': False, 'collected': False}
    
    @staticmethod
    def get_work_stats(work_id):
        """获取作品的统计信息"""
        try:
            return db.get_work_stats(work_id)
        except Exception as e:
            return {'like_count': 0, 'collection_count': 0}

    @staticmethod
    def delete_artwork(artwork_id):
        """删除作品"""
        if not current_user.is_authenticated:
            return {'success': False, 'message': '请先登录'}
            
        try:
            success = db.delete_artwork(artwork_id, current_user.id)
            if success:
                return {'success': True, 'message': '删除成功'}
            else:
                return {'success': False, 'message': '删除失败或无权操作'}
        except Exception as e:
            print(f"删除作品错误: {e}")
            return {'success': False, 'message': '删除失败'}