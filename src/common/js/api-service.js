// api-service.js
import fetch from '@system.fetch';
import router from '@system.router';
import storage from '@system.storage';
import prompt from '@system.prompt';
import { CONFIG } from './config.js';

class ApiService {
  constructor() {
    // 中转服务器地址 - 从 config.js 读取
    this.baseUrl = CONFIG.SERVER.BASE_URL;
    this.baseHeaders = {
      'Content-Type': 'application/json',
    }
  }

  // 通用请求方法 - 通过中转服务器转发
  async request(action, data = {}) {
    const url = `${this.baseUrl}/api`;
    
    const options = {
      url,
      method: 'POST',
      header: this.baseHeaders,
      responseType: 'json'
    };

    options.data = JSON.stringify({ action, ...data });

    return new Promise((resolve, reject) => {
      fetch.fetch({
        ...options,
        success: (response) => {
          const responseData = response.data || {};

          if (response.code >= 200 && response.code < 300) {
            resolve(responseData)
          } else {
            console.error(`HTTP Error: ${response.code}`, response);
            reject(new Error(`HTTP ${response.code}: ${JSON.stringify(responseData)}`))
          }
        },
        fail: (error, code) => {
          // DETAILED LOGGING FOR NETWORK FAILURES
          console.error(`[ApiService] Request Failed. Code: ${code}, Error: ${JSON.stringify(error)}`);
          reject(new Error(`Request failed: ${error.data || 'Connection is invalid'}`))
        }
      })
    })
  }

  // 获取排行榜
  async getRankings(limit = 10) {
    try {
      const result = await this.request('get_rankings', {
        limit: limit
      })
      return {
        success: true,
        rankings: result.rankings || []
      }
    } catch (error) {
      console.error('获取排行榜失败:', error)
      return {
        success: false,
        rankings: [],
        error: error.message
      }
    }
  }

  // 上报点击次数
  async syncClicks(userId, clickCount) {
    try {
      await this.request('sync_clicks', {
        user_id: userId,
        click_count: clickCount
      })
      return { success: true }
    } catch (error) {
      console.error('上报点击次数失败:', error)
      return { success: false, error: error.message };
    }
  }

  // 从服务器同步数据
  async syncFromServer(userId) {
    try {
      const result = await this.request('sync_from_server', {
        user_id: userId
      });
      
      if (result && result.success) {
        console.log('从服务器同步数据成功:', result.userInfo);
        return { success: true, userInfo: result.userInfo };
      } else {
        console.error('同步数据失败:', result ? result.error : '未知错误');
        return { success: false, error: (result ? result.error : '服务器未返回成功状态') };
      }
    } catch (error) {
      console.error('从服务器同步数据时发生网络错误:', error);
      return { success: false, error: error.message };
    }
  }

  // 检查宠物名是否可用
  async checkPetNameAvailability(petName) {
    try {
      const result = await this.request('check_pet_name', {
        pet_name: petName
      });
      return { success: true, ...result };
    } catch (error) {
      console.error('检查宠物名可用性时发生网络错误:', error);
      return { success: false, error: error.message, isAvailable: false };
    }
  }

  // 修改宠物名
  async setPetName(userId, newName) {
    try {
      const result = await this.request('set_pet_name', {
        user_id: userId,
        new_name: newName
      });
      return result;
    } catch (error) {
      console.error('修改宠物名失败:', error);
      return { success: false, error: error.message };
    }
  }

  // 预激活检查
  async checkDeviceRegistration(deviceId) {
    try {
      const result = await this.request('check_registration', {
        device_id: deviceId
      });
      console.log('预激活检查成功:', result);
      // 直接返回服务器的原始响应，UI层期望的是扁平结构
      return result;
    } catch (error) {
      console.error('预激活检查时发生网络错误:', error);
      // 返回一个兼容的错误对象，避免UI层崩溃
      return { is_registered: false, can_auto_activate: false, error: error.message };
    }
  }

  // 注册设备并获取用户ID
  async registerAndGetUserId(deviceId) {
    try {
      // Pass the server response directly to the UI layer
      return await this.request('register_device_and_get_id', {
        device_id: deviceId
      });
    } catch (error) {
      console.error('注册或获取用户ID时发生网络错误:', error);
      // Return a compatible error object
      return { success: false, message: error.message };
    }
  }

  // 获取公告列表
  async getAnnouncements(limit = 10) {
    try {
      const result = await this.request('get_announcements', {
        limit: limit
      });
      console.log('Original announcement result from server:', JSON.stringify(result));
      
      return {
        success: result.success || false,
        announcements: result.announcements || [],
        count: result.count || 0,
        timestamp: result.timestamp,
        error: result.error
      };
    } catch (error) {
      console.error('获取公告失败:', error);
      return {
        success: false,
        error: error.message,
        announcements: [],
        count: 0
      };
    }
  }

  // 检查应用更新
  async checkAppUpdate(currentVersionCode) {
    console.log('[ApiService] checkAppUpdate called with currentVersionCode:', currentVersionCode);
    
    try {
      const result = await this.request('check_update', {
        current_version_code: currentVersionCode
      });
      
      console.log('[ApiService] checkAppUpdate raw result:', JSON.stringify(result));
      console.log('[ApiService] checkAppUpdate has_update:', result.has_update);
      console.log('[ApiService] checkAppUpdate update_info:', JSON.stringify(result.update_info));
      console.log('[ApiService] checkAppUpdate is_force_update:', result.is_force_update);
      
      // 确保 updateInfo 包含所有必要字段
      let updateInfo = null;
      if (result.update_info) {
        updateInfo = {
          version_name: result.update_info.version_name || '',
          version_code: result.update_info.version_code || 0,
          title: result.update_info.title || '发现新版本',
          changelog: result.update_info.changelog || '',
          download_url: result.update_info.download_url || '',
          force_update: result.update_info.force_update || false,
          min_required_version: result.update_info.min_required_version || 0,
          release_time: result.update_info.release_time || ''
        };
        console.log('[ApiService] checkAppUpdate updateInfo constructed:', JSON.stringify(updateInfo));
      } else {
        console.log('[ApiService] checkAppUpdate update_info is null or undefined');
      }
      
      const returnResult = {
        success: result.success || false,
        hasUpdate: result.has_update || false,
        updateInfo: updateInfo,
        isForceUpdate: result.is_force_update || false,
        currentVersionCode: result.current_version_code || currentVersionCode,
        latestVersionCode: result.latest_version_code || currentVersionCode,
        error: result.error
      };
      
      console.log('[ApiService] checkAppUpdate return result:', JSON.stringify(returnResult));
      
      return returnResult;
    } catch (error) {
      console.error('[ApiService] checkAppUpdate error:', error);
      console.error('[ApiService] checkAppUpdate error message:', error.message);
      console.error('[ApiService] checkAppUpdate error stack:', error.stack);
      return {
        success: false,
        error: error.message,
        hasUpdate: false,
        isForceUpdate: false
      };
    }
  }
}

export default new ApiService()
