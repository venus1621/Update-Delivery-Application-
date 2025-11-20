import { initializeApp, getApps, getApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';
import { logger } from './utils/logger';

let app;
let database;
let sendDurationInSeconds = 3; // Default to 3 seconds if not provided by backend

export const initFirebaseForActiveOrder = async (authToken) => {
  try {
    if (!authToken) {
      throw new Error('❌ Authentication token is required for Firebase initialization');
    }

    logger.log('🔄 Fetching Firebase configuration from backend...');
    
    const response = await fetch(
      'https://gebeta-delivery1.onrender.com/api/v1/config/getFirebaseConfig',
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
      }
    );

    // Handle network errors
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`❌ HTTP ${response.status}: ${errorText || 'Failed to load Firebase config from backend'}`);
    }

    const data = await response.json();
    logger.log('✅ Firebase config response received:', { status: data.status });

    if (data.status !== "success") {
      throw new Error(`❌ Backend error: ${data.message || 'Failed to load Firebase config'}`);
    }

    // The API returns firebaseConfig nested inside data.data
    if (!data.data || !data.data.firebaseConfig) {
      throw new Error('❌ Firebase configuration missing in response');
    }

    const firebaseConfig = data.data.firebaseConfig;
    
    // Extract and store the send duration from config
    if (firebaseConfig.sendDurationInSeconds) {
      sendDurationInSeconds = parseFloat(firebaseConfig.sendDurationInSeconds) || 3;
      logger.log(`⏱️ Location update interval set to ${sendDurationInSeconds} seconds`);
    } else {
      logger.log(`⏱️ Using default location update interval: ${sendDurationInSeconds} seconds`);
    }
    
    // Validate required Firebase config fields
    const requiredFields = ['apiKey', 'authDomain', 'databaseURL', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
    const missingFields = requiredFields.filter(field => !firebaseConfig[field]);
    
    if (missingFields.length > 0) {
      throw new Error(`❌ Missing required Firebase config fields: ${missingFields.join(', ')}`);
    }

    logger.log('✅ Firebase configuration validated successfully');
    logger.log('🔥 Initializing Firebase app...');

    // ✅ Check if Firebase app already exists using getApps()
    const existingApps = getApps();
    if (existingApps.length > 0) {
      // Firebase app already initialized, get existing instance
      app = getApp();
      logger.log('ℹ️ Firebase app already initialized, reusing existing instance');
    } else {
      // Initialize new Firebase app
      app = initializeApp(firebaseConfig);
      logger.log('✅ Firebase app initialized');
    }

    // Initialize Realtime Database (always safe to call, reuses if exists)
    if (!database) {
      database = getDatabase(app);
      logger.log('✅ Firebase Realtime Database initialized');
    } else {
      logger.log('ℹ️ Firebase database already initialized, reusing existing instance');
    }
    
    logger.log('✅ Firebase initialization complete for active order');
    return { app, database, sendDurationInSeconds };
  } catch (error) {
    logger.error('🔥 Firebase initialization error for active order:', error);
    
    // Provide user-friendly error messages
    if (error.message.includes('Network request failed') || error.message.includes('Failed to fetch')) {
      throw new Error('❌ Network error: Unable to reach server. Please check your internet connection.');
    } else if (error.message.includes('401') || error.message.includes('403')) {
      throw new Error('❌ Authentication error: Your session may have expired. Please log in again.');
    } else {
      throw error;
    }
  }
};

// Export getter for sendDuration
export const getSendDuration = () => sendDurationInSeconds;

export { app, database };

