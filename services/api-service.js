import { cacheStorage } from '../utils/cache-storage';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE_URL = 'https://gebeta-delivery1.onrender.com/api/v1';

class ApiService {
  constructor() {
    this.pendingRequests = new Map();
  }

  async getAuthToken() {
    return await AsyncStorage.getItem('authToken');
  }

  async request(endpoint, options = {}, cacheConfig = {}) {
    const {
      useCache = false,
      cacheExpiry = 30,
      forceRefresh = false
    } = cacheConfig;

    const cacheKey = `api_${endpoint}_${JSON.stringify(options)}`;

    if (useCache && !forceRefresh) {
      const cachedData = await cacheStorage.get(cacheKey);
      if (cachedData) {
        return cachedData;
      }
    }

    if (this.pendingRequests.has(cacheKey)) {
      return this.pendingRequests.get(cacheKey);
    }

    const token = await this.getAuthToken();
    
    const requestPromise = fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        ...options.headers,
      },
    })
      .then(async (response) => {
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText || 'Request failed'}`);
        }
        return response.json();
      })
      .then(async (data) => {
        if (useCache && data) {
          await cacheStorage.set(cacheKey, data, cacheExpiry);
        }
        this.pendingRequests.delete(cacheKey);
        return data;
      })
      .catch((error) => {
        this.pendingRequests.delete(cacheKey);
        throw error;
      });

    this.pendingRequests.set(cacheKey, requestPromise);
    return requestPromise;
  }

  async get(endpoint, cacheConfig = {}) {
    return this.request(endpoint, { method: 'GET' }, cacheConfig);
  }

  async post(endpoint, data, cacheConfig = {}) {
    return this.request(
      endpoint,
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
      cacheConfig
    );
  }

  async put(endpoint, data, cacheConfig = {}) {
    return this.request(
      endpoint,
      {
        method: 'PUT',
        body: JSON.stringify(data),
      },
      cacheConfig
    );
  }

  async patch(endpoint, data, cacheConfig = {}) {
    return this.request(
      endpoint,
      {
        method: 'PATCH',
        body: JSON.stringify(data),
      },
      cacheConfig
    );
  }

  async clearCache() {
    await cacheStorage.clearAll();
  }
}

export default new ApiService();
