// Safe check for development mode
const isDevelopment = (function() {
  try {
    return typeof __DEV__ !== 'undefined' ? __DEV__ : false;
  } catch (e) {
    return false;
  }
})();

// Export logger as a plain object (not from a function)
// This ensures the object is always available immediately when imported
export const logger = {
  log: (...args) => {
    try {
      if (isDevelopment && typeof console !== 'undefined' && console.log) {
        console.log(...args);
      }
    } catch (e) {
      // Silent fail
    }
  },
  
  error: (...args) => {
    try {
      // Always log errors, even in production
      if (typeof console !== 'undefined' && console.error) {
        console.error(...args);
      }
    } catch (e) {
      // Silent fail - nothing we can do if console.error doesn't work
    }
  },
  
  warn: (...args) => {
    try {
      if (isDevelopment && typeof console !== 'undefined' && logger.warn) {
        logger.warn(...args);
      }
    } catch (e) {
      // Silent fail
    }
  },
  
  info: (...args) => {
    try {
      if (isDevelopment && typeof console !== 'undefined' && console.info) {
        console.info(...args);
      }
    } catch (e) {
      // Silent fail
    }
  },
  
  debug: (...args) => {
    try {
      if (isDevelopment && typeof console !== 'undefined' && console.debug) {
        console.debug(...args);
      }
    } catch (e) {
      // Silent fail
    }
  },
};

// Also export as default for flexibility
export default logger;
