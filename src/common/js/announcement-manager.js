// src/common/js/announcement-manager.js
import storage from '@system.storage';
import ApiService from './api-service.js';
import { CONFIG } from './config.js';

class AnnouncementManager {
  constructor() {
    this.cacheTime = CONFIG.APP.ANNOUNCEMENT_CACHE_TIME || 300000; // 5分钟
  }
  
  // 获取公告（带缓存）
  async getAnnouncements(forceRefresh = false) {
    try {
      // 1. 检查缓存
      if (!forceRefresh) {
        const cached = await this.getCachedAnnouncements();
        if (cached) {
          return {
            success: true,
            announcements: cached.data,
            cached: true,
            timestamp: cached.timestamp
          };
        }
      }
      
      // 2. 从服务器获取
      const result = await ApiService.getAnnouncements();
      
      if (result.success) {
        // 3. 缓存结果
        await this.cacheAnnouncements(result.announcements);
        return result;
      }
      
      // 4. 如果服务器失败，返回缓存数据
      const cached = await this.getCachedAnnouncements();
      if (cached) {
        return {
          success: true,
          announcements: cached.data,
          cached: true,
          fromCache: true,
          timestamp: cached.timestamp,
          serverError: result.error
        };
      }
      
      return result;
      
    } catch (error) {
      console.error('公告管理错误:', error);
      
      // 尝试返回缓存数据
      const cached = await this.getCachedAnnouncements();
      if (cached) {
        return {
          success: true,
          announcements: cached.data,
          cached: true,
          fromCache: true,
          timestamp: cached.timestamp,
          error: error.message
        };
      }
      
      return {
        success: false,
        error: error.message,
        announcements: [],
        count: 0
      };
    }
  }
  
  // 缓存公告
  async cacheAnnouncements(announcements) {
    try {
      const cacheData = {
        data: announcements,
        timestamp: new Date().toISOString()
      };
      
      await storage.set({
        key: CONFIG.STORAGE_KEYS.CACHED_ANNOUNCEMENTS,
        value: JSON.stringify(cacheData)
      });
      
      await storage.set({
        key: CONFIG.STORAGE_KEYS.LAST_ANNOUNCEMENT_FETCH_TIME,
        value: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('缓存公告失败:', error);
    }
  }
  
  // 获取缓存的公告
  async getCachedAnnouncements() {
    try {
      const result = await storage.get({
        key: CONFIG.STORAGE_KEYS.CACHED_ANNOUNCEMENTS
      });
      
      if (result && result.value) {
        const cacheData = JSON.parse(result.value);
        const cacheTime = new Date(cacheData.timestamp).getTime();
        const now = Date.now();
        
        // 检查缓存是否过期
        if (now - cacheTime < this.cacheTime) {
          return cacheData;
        }
      }
      
      return null;
    } catch (error) {
      console.error('获取缓存公告失败:', error);
      return null;
    }
  }
  
  // 清除公告缓存
  async clearCache() {
    try {
      await storage.delete({
        key: CONFIG.STORAGE_KEYS.CACHED_ANNOUNCEMENTS
      });
      
      await storage.delete({
        key: CONFIG.STORAGE_KEYS.LAST_ANNOUNCEMENT_FETCH_TIME
      });
    } catch (error) {
      console.error('清除缓存失败:', error);
    }
  }
}

export default new AnnouncementManager();