// src/common/js/update-manager.js
import storage from '@system.storage';
import ApiService from './api-service.js';
import prompt from '@system.prompt';
import router from '@system.router';
import { CONFIG } from './config.js';

class UpdateManager {
  constructor() {
    this.checkInterval = CONFIG.APP.CHECK_UPDATE_INTERVAL || 360000; // 
  }
  
  // 检查更新（带频率限制）
  async checkUpdate(forceCheck = false) {
    console.log('[UpdateManager] checkUpdate called with forceCheck:', forceCheck);
    
    try {
      // 1. 检查是否需要进行更新检查
      if (!forceCheck) {
        const shouldCheck = await this.shouldCheckUpdate();
        console.log('[UpdateManager] shouldCheckUpdate result:', shouldCheck);
        
        if (!shouldCheck) {
          console.log('[UpdateManager] Skipping update check - not time yet');
          return {
            success: true,
            skipped: true,
            message: '未到检查时间'
          };
        }
      }
      
      // 2. 获取当前版本号
      const currentVersionCode = CONFIG.APP.VERSION_CODE;
      console.log('[UpdateManager] Current version code:', currentVersionCode);
      
      // 3. 调用API检查更新
      console.log('[UpdateManager] Calling ApiService.checkAppUpdate...');
      const result = await ApiService.checkAppUpdate(currentVersionCode);
      
      console.log('[UpdateManager] ApiService.checkAppUpdate result:', JSON.stringify(result));
      
      if (result.success) {
        console.log('[UpdateManager] Update check successful');
        
        // 4. 记录本次检查时间
        await this.recordUpdateCheck();
        
        // 5. 处理更新信息
        if (result.hasUpdate) {
          console.log('[UpdateManager] Update available!');
          const updateInfo = result.updateInfo;
          console.log('[UpdateManager] Update info:', JSON.stringify(updateInfo));
          
          // 检查用户是否已经忽略此版本
          const ignored = await this.isVersionIgnored(updateInfo.version_code);
          console.log('[UpdateManager] Version ignored:', ignored);
          
          // 如果是强制更新，无论是否忽略都保存更新信息
          if (result.isForceUpdate) {
            await this.saveUpdateInfo(updateInfo);
            console.log('[UpdateManager] Saved update info to storage (force update):', JSON.stringify(updateInfo));
          } else if (!ignored) {
            // 非强制更新且未忽略，保存更新信息
            await this.saveUpdateInfo(updateInfo);
            console.log('[UpdateManager] Saved update info to storage:', JSON.stringify(updateInfo));
          } else {
            // 非强制更新且已忽略，不保存更新信息
            console.log('[UpdateManager] Version ignored, not saving update info');
          }
          
          return {
            ...result,
            ignored: ignored
          };
        } else {
          console.log('[UpdateManager] No update available');
        }
      } else {
        console.log('[UpdateManager] Update check failed:', result.error);
      }
      
      return result;
      
    } catch (error) {
      console.error('[UpdateManager] checkUpdate error:', error);
      console.error('[UpdateManager] checkUpdate error message:', error.message);
      console.error('[UpdateManager] checkUpdate error stack:', error.stack);
      return {
        success: false,
        error: error.message,
        hasUpdate: false
      };
    }
  }
  
  // 判断是否应该检查更新
  async shouldCheckUpdate() {
    try {
      const result = await storage.get({
        key: CONFIG.STORAGE_KEYS.LAST_UPDATE_CHECK_TIME
      });
      
      if (!result || !result.value) {
        return true; // 从未检查过
      }
      
      const lastCheckTime = new Date(result.value).getTime();
      const now = Date.now();
      
      return (now - lastCheckTime) >= this.checkInterval;
      
    } catch (error) {
      console.error('检查更新时间失败:', error);
      return true;
    }
  }
  
  // 记录更新检查时间
  async recordUpdateCheck() {
    try {
      await storage.set({
        key: CONFIG.STORAGE_KEYS.LAST_UPDATE_CHECK_TIME,
        value: new Date().toISOString()
      });
    } catch (error) {
      console.error('记录更新时间失败:', error);
    }
  }
  
  // 保存更新信息到本地存储
  async saveUpdateInfo(updateInfo) {
    try {
      await storage.set({
        key: CONFIG.STORAGE_KEYS.CACHED_UPDATE_INFO,
        value: JSON.stringify(updateInfo)
      });
      console.log('[UpdateManager] Saved update info to storage');
    } catch (error) {
      console.error('保存更新信息失败:', error);
    }
  }
  
  // 从本地存储获取更新信息
  async getSavedUpdateInfo() {
    try {
      const result = await storage.get({
        key: CONFIG.STORAGE_KEYS.CACHED_UPDATE_INFO
      });
      
      if (result && result.value) {
        console.log('[UpdateManager] Retrieved update info from storage');
        return JSON.parse(result.value);
      }
      
      console.log('[UpdateManager] No update info found in storage');
      return null;
    } catch (error) {
      console.error('获取更新信息失败:', error);
      return null;
    }
  }
  
  // 从本地存储获取更新信息（兼容命名，别名）
  async getCachedUpdateInfo() {
    return this.getSavedUpdateInfo();
  }
  
  // 忽略某个版本
  async ignoreVersion(versionCode) {
    try {
      await storage.set({
        key: CONFIG.STORAGE_KEYS.IGNORED_VERSION,
        value: versionCode.toString()
      });
    } catch (error) {
      console.error('忽略版本失败:', error);
    }
  }
  
  // 检查是否忽略某个版本
  async isVersionIgnored(versionCode) {
    try {
      const result = await storage.get({
        key: CONFIG.STORAGE_KEYS.IGNORED_VERSION
      });
      
      if (result && result.value) {
        return parseInt(result.value) === versionCode;
      }
      
      return false;
    } catch (error) {
      console.error('检查忽略版本失败:', error);
      return false;
    }
  }
  
  // 显示更新对话框（示例）
  async showUpdateDialog(updateInfo, isForceUpdate = false) {
    return new Promise((resolve) => {
      if (isForceUpdate) {
        // 强制更新，直接跳转到强制更新页面
        router.push({
          uri: '/force-update',
          params: {
            updateInfo: updateInfo,
            isForceUpdate: true
          }
        });
        resolve('force_update');
        return;
      }
      
      // 非强制更新，跳转到普通更新页面
      router.push({
        uri: '/update',
        params: {
          updateInfo: updateInfo,
          isForceUpdate: false
        }
      });
      resolve('normal_update');
    });
  }
  
  // 新增：检查并处理强制更新
  async checkAndHandleForceUpdate() {
    try {
      // 强制检查，忽略时间限制
      const result = await this.checkUpdate(true);
      
      if (result.success && result.hasUpdate && result.updateInfo) {
        // 【修复】检查用户是否已忽略此版本
        const ignored = await this.isVersionIgnored(result.updateInfo.version_code);
        const isForceUpdate = result.isForceUpdate;
        
        console.log('[UpdateManager] Version check result: ignored=' + ignored + ', isForceUpdate=' + isForceUpdate);
        
        // 如果版本被忽略且不是强制更新，则不进行任何操作
        if (ignored && !isForceUpdate) {
          console.log('[UpdateManager] Version was ignored by user, skipping');
          return {
            hasForceUpdate: false
          };
        }
        
        // 如果是强制更新
        if (isForceUpdate) {
          // 标记需要强制更新
          await this.markForceUpdateRequired();
          
          // 跳转到强制更新页面（用户无法返回）
          router.push({
            uri: '/force-update',
            params: {
              updateInfo: result.updateInfo,
              isForceUpdate: true
            }
          });
          
          return {
            hasForceUpdate: true,
            updateInfo: result.updateInfo
          };
        }
      }
      
      return {
        hasForceUpdate: false
      };
      
    } catch (error) {
      console.error('强制更新检查失败:', error);
      return {
        hasForceUpdate: false,
        error: error.message
      };
    }
  }
  
  // 标记需要强制更新
  async markForceUpdateRequired() {
    try {
      await storage.set({
        key: CONFIG.STORAGE_KEYS.FORCE_UPDATE_REQUIRED,
        value: 'true'
      });
    } catch (error) {
      console.error('标记强制更新失败:', error);
    }
  }
  
  // 清除强制更新标记
  async clearForceUpdateMark() {
    try {
      await storage.delete({
        key: CONFIG.STORAGE_KEYS.FORCE_UPDATE_REQUIRED
      });
    } catch (error) {
      console.error('清除强制更新标记失败:', error);
    }
  }
  
  // 检查是否需要强制更新
  async isForceUpdateRequired() {
    try {
      const result = await storage.get({
        key: CONFIG.STORAGE_KEYS.FORCE_UPDATE_REQUIRED
      });
      
      return result && result.value === 'true';
    } catch (error) {
      console.error('检查强制更新状态失败:', error);
      return false;
    }
  }
  
  // 清除更新缓存
  async clearUpdateCache() {
    try {
      await storage.delete({
        key: CONFIG.STORAGE_KEYS.CACHED_UPDATE_INFO
      });
      
      await storage.delete({
        key: CONFIG.STORAGE_KEYS.IGNORED_VERSION
      });
      
      await storage.delete({
        key: CONFIG.STORAGE_KEYS.FORCE_UPDATE_REQUIRED
      });
      
      console.log('[UpdateManager] Cleared update cache');
    } catch (error) {
      console.error('清除更新缓存失败:', error);
    }
  }
}

export default new UpdateManager();
