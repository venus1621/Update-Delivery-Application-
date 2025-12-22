import AsyncStorage from '@react-native-async-storage/async-storage';

const REJECTED_ORDERS_KEY = '@rejected_orders';

// In-memory cache for faster access
let rejectedOrdersCache = new Set();

/**
 * Initialize the rejected orders cache from AsyncStorage
 */
export async function initRejectedOrders() {
  try {
    const stored = await AsyncStorage.getItem(REJECTED_ORDERS_KEY);
    if (stored) {
      const orderIds = JSON.parse(stored);
      rejectedOrdersCache = new Set(orderIds);
      console.log(`📦 Loaded ${rejectedOrdersCache.size} rejected orders from storage`);
    }
    return rejectedOrdersCache;
  } catch (error) {
    console.error('Error loading rejected orders:', error);
    return new Set();
  }
}

/**
 * Add an order to the rejected list
 * @param {string} orderId - Order ID to reject
 */
export async function addRejectedOrder(orderId) {
  try {
    if (!orderId) return;
    
    rejectedOrdersCache.add(orderId);
    
    // Save to AsyncStorage
    const orderIds = Array.from(rejectedOrdersCache);
    await AsyncStorage.setItem(REJECTED_ORDERS_KEY, JSON.stringify(orderIds));
    
    console.log(`🚫 Order ${orderId} added to rejected list (total: ${rejectedOrdersCache.size})`);
  } catch (error) {
    console.error('Error saving rejected order:', error);
  }
}

/**
 * Check if an order is rejected
 * @param {string} orderId - Order ID to check
 * @returns {boolean}
 */
export function isOrderRejected(orderId) {
  return rejectedOrdersCache.has(orderId);
}

/**
 * Get all rejected order IDs
 * @returns {Set<string>}
 */
export function getRejectedOrders() {
  return rejectedOrdersCache;
}

/**
 * Remove an order from the rejected list (if user wants to see it again)
 * @param {string} orderId - Order ID to remove
 */
export async function removeRejectedOrder(orderId) {
  try {
    rejectedOrdersCache.delete(orderId);
    
    const orderIds = Array.from(rejectedOrdersCache);
    await AsyncStorage.setItem(REJECTED_ORDERS_KEY, JSON.stringify(orderIds));
    
    console.log(`✅ Order ${orderId} removed from rejected list`);
  } catch (error) {
    console.error('Error removing rejected order:', error);
  }
}

/**
 * Clear all rejected orders (reset)
 */
export async function clearRejectedOrders() {
  try {
    rejectedOrdersCache.clear();
    await AsyncStorage.removeItem(REJECTED_ORDERS_KEY);
    console.log('🗑️ All rejected orders cleared');
  } catch (error) {
    console.error('Error clearing rejected orders:', error);
  }
}

/**
 * Clean up old rejected orders (older than 24 hours)
 * This should be called periodically to prevent the list from growing too large
 */
export async function cleanupOldRejectedOrders() {
  // For now, we keep all rejected orders
  // In the future, we could store timestamps and clean up old ones
  console.log(`📦 Current rejected orders count: ${rejectedOrdersCache.size}`);
}

