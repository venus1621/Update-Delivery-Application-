import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_PREFIX = '@delivery_cache_';
const CACHE_EXPIRY_KEY = '@cache_expiry_';

export const cacheStorage = {
  async set(key, data, expiryMinutes = 60) {
    try {
      const cacheKey = CACHE_PREFIX + key;
      const expiryKey = CACHE_EXPIRY_KEY + key;
      const expiryTime = Date.now() + (expiryMinutes * 60 * 1000);
      
      await AsyncStorage.multiSet([
        [cacheKey, JSON.stringify(data)],
        [expiryKey, expiryTime.toString()]
      ]);
      
      return true;
    } catch (error) {
      console.error('Cache set error:', error);
      return false;
    }
  },

  async get(key) {
    try {
      const cacheKey = CACHE_PREFIX + key;
      const expiryKey = CACHE_EXPIRY_KEY + key;
      
      const [[, cachedData], [, expiryTime]] = await AsyncStorage.multiGet([cacheKey, expiryKey]);
      
      if (!cachedData || !expiryTime) {
        return null;
      }
      
      if (Date.now() > parseInt(expiryTime, 10)) {
        await this.remove(key);
        return null;
      }
      
      return JSON.parse(cachedData);
    } catch (error) {
      console.error('Cache get error:', error);
      return null;
    }
  },

  async remove(key) {
    try {
      const cacheKey = CACHE_PREFIX + key;
      const expiryKey = CACHE_EXPIRY_KEY + key;
      
      await AsyncStorage.multiRemove([cacheKey, expiryKey]);
      return true;
    } catch (error) {
      console.error('Cache remove error:', error);
      return false;
    }
  },

  async clearAll() {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const cacheKeys = keys.filter(key => 
        key.startsWith(CACHE_PREFIX) || key.startsWith(CACHE_EXPIRY_KEY)
      );
      
      if (cacheKeys.length > 0) {
        await AsyncStorage.multiRemove(cacheKeys);
      }
      
      return true;
    } catch (error) {
      console.error('Cache clear error:', error);
      return false;
    }
  },

  async isValid(key) {
    try {
      const expiryKey = CACHE_EXPIRY_KEY + key;
      const expiryTime = await AsyncStorage.getItem(expiryKey);
      
      if (!expiryTime) {
        return false;
      }
      
      return Date.now() <= parseInt(expiryTime, 10);
    } catch (error) {
      console.error('Cache validity check error:', error);
      return false;
    }
  }
};
