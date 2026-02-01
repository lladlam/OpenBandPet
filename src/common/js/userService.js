// src/common/js/userService.js
import device from '@system.device';
import storage from '@system.storage';
import ApiService from './api-service.js';
import { CONFIG } from './config.js';

/**
 * A service to handle silent user registration and data retrieval.
 */
class UserService {
  
  /**
   * Promisified helper for storage.get.
   * @param {string} key - The key to retrieve.
   * @returns {Promise<any>} The value from storage, or null if not found.
   */
  _storageGet(key) {
    return new Promise((resolve) => {
      storage.get({
        key: key,
        success: (data) => resolve(data),
        fail: () => resolve(null),
      });
    });
  }

  /**
   * Promisified helper for storage.set.
   * @param {string} key - The key to set.
   * @param {string} value - The value to store.
   * @returns {Promise<void>}
   */
  _storageSet(key, value) {
    return new Promise((resolve, reject) => {
      storage.set({
        key: key,
        value: value,
        success: resolve,
        fail: (err, code) => reject(new Error(`Storage.set failed for '${key}': ${err} (${code})`)),
      });
    });
  }

  /**
   * Retrieves the raw device identifier, using a fallback for simulators.
   * It also saves the raw ID to storage for future use.
   * @returns {Promise<string|null>} The raw device ID or null on failure.
   */
  _getRawDeviceId() {
    return new Promise((resolve) => {
      device.getSerial({
        success: async (data) => {
          let serial = data ? data.serial : null;
          if (serial === 'NA') {
            console.warn("Device serial is 'NA', using a fixed test serial.");
            serial = 'TESTVM-SN-0123456789';
          }

          if (!serial) {
            console.error('Failed to get a valid device serial.');
            resolve(null);
            return;
          }

          try {
            // Save the raw ID for other services that might need it (e.g., API calls)
            await this._storageSet(CONFIG.STORAGE_KEYS.DEVICE_ID, serial);
            console.log('Saved raw device ID:', serial);
            resolve(serial);
          } catch (e) {
            console.error('Failed to save raw device ID to storage:', e);
            resolve(null);
          }
        },
        fail: (err, code) => {
          console.error(`Connection is invalid`);
          resolve(null);
        },
      });
    });
  }

  /**
   * Saves the user information to local storage.
   * @param {object} userInfo - The user info object received from the server.
   * @returns {Promise<object>} The user info that was saved.
   */
  async _saveUserInfo(userInfo) {
    if (!userInfo || (!userInfo.id && !userInfo.user_number)) {
      throw new Error("User info is invalid, cannot save.");
    }
    
    const userInfoToSave = {
      id: userInfo.id || userInfo.user_number,
      user_number: userInfo.user_number,
      pet_name: userInfo.pet_name,
      total_clicks: userInfo.total_clicks || 0
    };

    await this._storageSet(CONFIG.STORAGE_KEYS.USER_INFO, JSON.stringify(userInfoToSave));
    console.log("Successfully saved user info to storage:", userInfoToSave);
    return userInfoToSave;
  }

  /**
   * The main public method. It ensures that user information is present in storage.
   * If not, it silently gets a device ID, checks with the server, and either
   * retrieves existing user data or registers a new user.
   * @returns {Promise<object|null>} The user info, or null if the process fails.
   */
  async ensureUserIsRegistered(forceSync = false) {
    // 1. Check if user info already exists and is valid.
    console.log('[UserService] Checking for existing user info in storage...');
    const existingUserInfoJSON = await this._storageGet(CONFIG.STORAGE_KEYS.USER_INFO);
    if (existingUserInfoJSON) {
      try {
        const userInfo = JSON.parse(existingUserInfoJSON);
        if (userInfo && userInfo.id) {
          if (forceSync) {
            console.log('[UserService] Force sync enabled. Attempting to sync latest data from server...');
            try {
              const syncResult = await ApiService.syncFromServer(userInfo.id);
              if (syncResult && syncResult.success) {
                console.log('[UserService] Successfully synced from server.');
                return await this._saveUserInfo(syncResult.userInfo);
              } else {
                console.warn('[UserService] Sync from server failed, will use stale local data. Error:', syncResult ? syncResult.error : 'Unknown error');
                return userInfo; // Return stale data if sync fails
              }
            } catch (syncError) {
              console.error('[UserService] A critical error occurred during server sync:', syncError);
              return userInfo; // Return stale data on critical sync failure
            }
          } else {
            console.log('[UserService] User is already registered. Found info:', userInfo);
            return userInfo;
          }
        }
      } catch (e) {
        // Malformed JSON, proceed with registration.
        console.warn('[UserService] User info in storage is malformed. Proceeding with registration.');
      }
    }

    console.log('[UserService] User not found locally. Starting silent registration process...');

    // 2. Get Device ID
    const deviceId = await this._getRawDeviceId();
    if (!deviceId) {
      console.error('[UserService] CRITICAL: Cannot proceed with registration: failed to get device ID.');
      return null;
    }
    console.log(`[UserService] Got device ID: ${deviceId}`);

    try {
      // 3. Check if the device is already registered on the server
      console.log('[UserService] Checking device registration with server...');
      const regResult = await ApiService.checkDeviceRegistration(deviceId);
      console.log('[UserService] Server registration check response:', JSON.stringify(regResult));


      if (regResult && regResult.is_registered && regResult.userInfo) {
        // Device is known, save the info and we're done.
        console.log('[UserService] Device is already registered on server. Restoring user info.');
        return await this._saveUserInfo(regResult.userInfo);
      }
      
      // 4. If not registered, create a new user record.
      console.log('[UserService] Device not registered. Attempting to register a new user...');
      const newRegResult = await ApiService.registerAndGetUserId(deviceId);
      console.log('[UserService] Server new user registration response:', JSON.stringify(newRegResult));


      if (newRegResult && newRegResult.success && newRegResult.userInfo) {
        console.log('[UserService] Successfully registered new user.');
        return await this._saveUserInfo(newRegResult.userInfo);
      } else {
        console.error('[UserService] CRITICAL: Failed to register new user.', newRegResult ? newRegResult.message : 'No result from server');
        return null;
      }
    } catch (e) {
      console.error('[UserService] CRITICAL: An error occurred during the silent registration API calls:', e);
      return null;
    }
  }

  /**
   * Updates the number of pending clicks by a given amount.
   * This is the centralized method for all click modifications.
   * @param {number} amount - The number to add to pending clicks. Can be negative.
   * @returns {Promise<number|null>} The new number of pending clicks, or null on failure.
   */
  async updatePendingClicks(amount) {
    if (typeof amount !== 'number' || isNaN(amount)) {
      console.warn('[UserService] updatePendingClicks received an invalid amount:', amount);
      return null;
    }

    try {
      const pendingClicksData = await this._storageGet(CONFIG.STORAGE_KEYS.PENDING_CLICKS);
      let currentClicks = parseInt(pendingClicksData) || 0;
      
      const newClicks = currentClicks + amount;
      
      await this._storageSet(CONFIG.STORAGE_KEYS.PENDING_CLICKS, newClicks.toString());
      
      console.log(`[UserService] Pending clicks updated by ${amount}. New value: ${newClicks}`);
      return newClicks;
    } catch (e) {
      console.error('[UserService] Failed to update pending clicks in storage:', e);
      return null;
    }
  }

  /**
   * Reads pending clicks from storage and syncs them with the server.
   * This is a self-contained, fire-and-forget method.
   * @returns {Promise<boolean>} True on success, false on failure or if no sync was needed.
   */
  async triggerClickSync() {
    console.log('[UserService] Triggering click sync...');
    
    // 1. Get user info
    const userInfoJSON = await this._storageGet(CONFIG.STORAGE_KEYS.USER_INFO);
    if (!userInfoJSON) {
      console.warn('[UserService] Sync aborted: User info not found in storage.');
      return false;
    }
    
    let userInfo;
    try {
      userInfo = JSON.parse(userInfoJSON);
      if (!userInfo || !userInfo.id) {
        console.warn('[UserService] Sync aborted: User ID is invalid.');
        return false;
      }
    } catch(e) {
      console.warn('[UserService] Sync aborted: Could not parse user info.');
      return false;
    }

    // 2. Get pending clicks
    const pendingClicksData = await this._storageGet(CONFIG.STORAGE_KEYS.PENDING_CLICKS);
    const clicksToSync = parseInt(pendingClicksData);

    if (isNaN(clicksToSync)) {
      console.log('[UserService] No pending clicks to sync (value is NaN).');
      return true; // Nothing to do, so it's a "success"
    }

    console.log(`[UserService] Found ${clicksToSync} pending clicks for user ${userInfo.id}. Syncing...`);

    // 3. Call API
    const result = await ApiService.syncClicks(userInfo.id, clicksToSync);

    // 4. Update storage on success
    if (result.success) {
      console.log('[UserService] Sync successful.');
      
      // 【修复】同步成功后，先把待上传数量加到本地总点击数，再清空待上传
      const currentTotalClicks = parseInt(await this._storageGet(CONFIG.STORAGE_KEYS.TOTAL_CLICKS)) || 0;
      const updatedTotalClicks = currentTotalClicks + clicksToSync;
      await this._storageSet(CONFIG.STORAGE_KEYS.TOTAL_CLICKS, updatedTotalClicks.toString());
      console.log(`[UserService] Added pending clicks to total: ${currentTotalClicks} + ${clicksToSync} = ${updatedTotalClicks}`);
      
      // 清空待上传数量
      await this._storageSet(CONFIG.STORAGE_KEYS.PENDING_CLICKS, '0');
      console.log('[UserService] Resetting pending clicks to 0');
      
      return true;
    } else {
      console.error('[UserService] Sync failed:', result.error);
      return false;
    }
  }

  /**
   * Fetches the latest user data from the server and overwrites local storage.
   * This method runs the full registration/login flow to ensure data is consistent.
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async forceSyncFromServer() {
    console.log('[UserService] Starting force sync from server...');
    
    try {
      // 1. Force a sync of any pending clicks FIRST.
      console.log('[UserService] Step 1: Syncing local pending clicks before fetching server data.');
      const clickSyncSuccess = await this.triggerClickSync();

      if (!clickSyncSuccess) {
        // If the click sync fails, we should not proceed, as we might overwrite the local state
        // with stale server data, causing the user to lose their pending clicks.
        const errorMsg = '无法同步本地点击数据，已取消从服务器更新，以防数据丢失。';
        console.error(`[UserService] ${errorMsg}`);
        return { success: false, message: errorMsg };
      }
      console.log('[UserService] Step 1: Local pending clicks synced successfully.');


      // 2. Now, run the full get/register user flow to get the latest state from the server.
      console.log('[UserService] Step 2: Fetching latest user data from server.');
      const userInfo = await this.ensureUserIsRegistered(true);

      if (userInfo && userInfo.id) {
        console.log('[UserService] Step 2: Successfully fetched and updated user info. UserInfo:', userInfo);
        
        // 【修复】同步成功后，将服务器的 total_clicks 覆盖到本地
        if (userInfo.total_clicks !== undefined) {
          await this._storageSet(CONFIG.STORAGE_KEYS.TOTAL_CLICKS, userInfo.total_clicks.toString());
          console.log(`[UserService] Updated local total_clicks to server value: ${userInfo.total_clicks}`);
        }
        
        console.log('[UserService] Force sync complete. Local storage is now up-to-date.');
        return { success: true, message: '同步成功！' };
      } else {
        const errorMsg = '无法从服务器获取最新用户数据。';
        console.error(`[UserService] ${errorMsg}`);
        return { success: false, message: errorMsg };
      }
    } catch (e) {
      console.error('[UserService] An error occurred during the force sync process:', e);
      return { success: false, message: '同步失败，发生未知错误' };
    }
  }
}

export default new UserService();
