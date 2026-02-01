// src/common/js/back-interceptor.js
import router from '@system.router';
import prompt from '@system.prompt';

class BackInterceptor {
  constructor() {
    this.isBlocking = false;
    this.blockReason = '';
    this.originalBack = null;
  }
  
  // 启用拦截
  enable(reason = '请先完成应用更新') {
    this.isBlocking = true;
    this.blockReason = reason;
    
    // 保存原始back方法
    if (!this.originalBack) {
      this.originalBack = router.back;
    }
    
    // 重写back方法
    router.back = () => {
      if (this.isBlocking) {
        prompt.showToast({
          message: this.blockReason,
          duration: 2000
        });
        return;
      }
      
      // 恢复原始back方法
      if (this.originalBack) {
        this.originalBack.call(router);
      }
    };
    
    console.log('返回拦截器启用:', reason);
  }
  
  // 禁用拦截
  disable() {
    this.isBlocking = false;
    this.blockReason = '';
    
    // 恢复原始back方法
    if (this.originalBack) {
      router.back = this.originalBack;
      this.originalBack = null;
    }
    
    console.log('返回拦截器禁用');
  }
  
  // 拦截返回按钮
  intercept(reason) {
    this.enable(reason);
  }
  
  // 恢复原始返回功能
  restore() {
    this.disable();
  }
}

export default new BackInterceptor();