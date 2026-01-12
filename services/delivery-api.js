// Delivery API Service
// Handles all HTTP API calls for delivery operations

import { logger } from '../utils/logger';
import { Vibration } from 'react-native';
import { transformOrderLocations } from '../utils/location-utils';
import { normalizeOrder } from "../utils/normalizeOrder";
import { upsertOrder } from "../db/ordersDb";
import locationService from "./location-service";
import orderNotificationService from "./order-notification-service";
import { getProximityRadius } from "../utils/proximity-settings";
import { isOrderRejected } from "../utils/rejected-orders";

const API_BASE_URL = 'https://api.bahirandelivery.cloud/api/v1';

// Callback for showing order modal (set by delivery-provider)
let showOrderModalCallback = null;

// Callback to check if driver has active order
let hasActiveOrderCallback = null;

/**
 * Set the callback for showing order modal
 */
export const setShowOrderModalCallback = (callback) => {
  showOrderModalCallback = callback;
};

/**
 * Set the callback for checking active order status
 */
export const setHasActiveOrderCallback = (callback) => {
  hasActiveOrderCallback = callback;
};

/**
 * Check orders against current location and notify if within radius
 * @param {Array} orders - Normalized orders to check
 */
const checkOrdersProximity = async (orders) => {
  try {
    // Check if driver has an active order - skip all notifications
    if (hasActiveOrderCallback && hasActiveOrderCallback()) {
      logger.log('🚫 Skipping proximity check - driver has active order');
      return;
    }

    const currentLocation = locationService.getCurrentLocation();
    if (!currentLocation) {
      logger.log('📍 No current location for proximity check');
      return;
    }

    const radiusKm = await getProximityRadius();
    logger.log(`📍 Checking ${orders.length} orders against ${radiusKm}km radius`);

    for (const order of orders) {
      const orderId = order.orderId || order.id || order._id;
      
      // Skip rejected orders
      if (isOrderRejected(orderId)) {
        logger.log(`🚫 Skipping rejected order: ${order.orderCode}`);
        continue;
      }

      // Get restaurant coordinates
      let restLat, restLng;
      if (order.restaurantLocation) {
        restLat = order.restaurantLocation.latitude || order.restaurantLocation.lat;
        restLng = order.restaurantLocation.longitude || order.restaurantLocation.lng;
      }

      if (!restLat || !restLng) {
        continue;
      }

      const distance = locationService.calculateDistance(
        currentLocation.latitude,
        currentLocation.longitude,
        restLat,
        restLng
      );

      logger.log(`📍 Order ${order.orderCode}: ${distance.toFixed(2)}km away`);

      if (distance <= radiusKm) {
        logger.log(`🔔 Order ${order.orderCode} is within ${radiusKm}km! Showing notification...`);
        
        // Show notification with sound
        await orderNotificationService.showNewOrderNotification(order);
        
        // Vibrate
        Vibration.vibrate([0, 500, 200, 500, 200, 500]);
        
        // Show modal if callback is set
        if (showOrderModalCallback) {
          showOrderModalCallback(order);
        }
        
        // Only notify for first matching order to avoid spam
        break;
      }
    }
  } catch (error) {
    logger.error('❌ Error in proximity check:', error);
  }
};

// 💰 Helper function to extract number from various formats (including MongoDB Decimal128)
const extractNumber = (value) => {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return parseFloat(value) || 0;
  if (typeof value === 'object' && value.$numberDecimal) {
    return parseFloat(value.$numberDecimal) || 0;
  }
  return 0;
};

/**
 * Fetch orders by delivery person with specific status
 * @param {string} status - Order status (e.g., 'Cooked', 'Delivering', 'Completed')
 * @param {string} token - JWT authentication token
 * @returns {Promise<Object>} - { success, data, error }
 */
export const fetchOrdersByStatus = async (status, token) => {
  if (!status || !token) {
    return { 
      success: false, 
      error: 'Status and token are required' 
    };
  }

  try {
    const response = await fetch(
      `${API_BASE_URL}/orders/get-orders-by-DeliveryMan?status=${status}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    let data;
    try {
      data = await response.json();
    } catch (jsonError) {
      throw new Error(`Failed to parse server response: ${jsonError?.message || jsonError?.toString() || 'Unknown error'}`);
    }

    if (response.ok && data && data.status === "success") {
      // Transform locations and normalize data
      const normalizedOrders = Array.isArray(data.data) 
        ? data.data.map(order => {
            const transformedOrder = transformOrderLocations(order);
            return {
              ...transformedOrder,
              deliveryFee: extractNumber(order.deliveryFee),
              tip: extractNumber(order.tip),
              userPhone: order.phoneNumber || order.userPhone || null,
            };
          })
        : [];

      return {
        success: true,
        data: normalizedOrders,
        count: normalizedOrders.length
      };
    } else {
      const serverMessage =
        data?.message ||
        data?.error ||
        data?.errors?.[0]?.msg ||
        "Failed to fetch orders";
      
      return {
        success: false,
        error: serverMessage
      };
    }
  } catch (err) {
    const errorMessage = err?.message === 'Failed to fetch' || err?.message?.includes('Network request failed')
      ? "Unable to connect to server. Please check your internet connection."
      : (err?.message || "Something went wrong. Please try again later.");
    
    logger.error('❌ Error fetching orders by status:', err);
    return {
      success: false,
      error: errorMessage
    };
  }
};

/**
 * Fetch all active orders (Cooked + Delivering)
 * @param {string} token - JWT authentication token
 * @returns {Promise<Object>} - { success, data, error }
 */
export const fetchAllActiveOrders = async (token) => {
  if (!token) {
    return { 
      success: false, 
      error: 'Token is required' 
    };
  }

  try {
    logger.log('🌐 Fetching all active orders from API');
    
    // Fetch both statuses in parallel
    const [cookedResponse, deliveringResponse] = await Promise.all([
      fetch(
        `${API_BASE_URL}/orders/get-orders-by-DeliveryMan?status=Cooked`,
        { headers: { Authorization: `Bearer ${token}` } }
      ),
      fetch(
        `${API_BASE_URL}/orders/get-orders-by-DeliveryMan?status=Delivering`,
        { headers: { Authorization: `Bearer ${token}` } }
      ),
    ]);
    
    // Safely parse JSON responses
    let cookedData = null;
    let deliveringData = null;
    
    try {
      cookedData = await cookedResponse.json();
    } catch (jsonError) {
      logger.error('Failed to parse cooked orders response:', jsonError);
    }
    
    try {
      deliveringData = await deliveringResponse.json();
    } catch (jsonError) {
      logger.error('Failed to parse delivering orders response:', jsonError);
    }
    
    let allActiveOrders = [];
    
    // Process Cooked orders
    if (cookedResponse.ok && cookedData && cookedData.status === 'success' && Array.isArray(cookedData.data)) {
      const normalized = cookedData.data.map(order => {
        const transformedOrder = transformOrderLocations(order);
        return {
          ...transformedOrder,
          deliveryFee: extractNumber(order.deliveryFee),
          tip: extractNumber(order.tip),
          userPhone: order.phoneNumber || order.userPhone || null,
        };
      });
      allActiveOrders = [...allActiveOrders, ...normalized];
    }
    
    // Process Delivering orders
    if (deliveringResponse.ok && deliveringData && deliveringData.status === 'success' && Array.isArray(deliveringData.data)) {
      const normalized = deliveringData.data.map(order => {
        const transformedOrder = transformOrderLocations(order);
        return {
          ...transformedOrder,
          deliveryFee: extractNumber(order.deliveryFee),
          tip: extractNumber(order.tip),
          userPhone: order.phoneNumber || order.userPhone || null,
        };
      });
      allActiveOrders = [...allActiveOrders, ...normalized];
    }
    
    return {
      success: true,
      data: allActiveOrders.length > 0 ? allActiveOrders : null,
      count: allActiveOrders.length
    };
  } catch (err) {
    logger.error('❌ Error fetching all active orders:', err);
    return {
      success: false,
      error: 'Failed to fetch active orders'
    };
  }
};

/**
 * Fetch available cooked orders (orders ready for pickup)
 * @param {string} token - JWT authentication token
 * @returns {Promise<Object>} - { success, data, count, error }
 */
export const fetchAvailableOrders = async (token) => {
  if (!token) {
    return { 
      success: false, 
      error: "Authentication required. Please log in again." 
    };
  }

  try {
    logger.log('🌐 Fetching fresh available orders from API');

    const response = await fetch(
      `${API_BASE_URL}/orders/available-cooked`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      }
    );

    let data;
    
    try {
      data = await response.json();
    } catch (jsonError) {
      throw new Error(`Failed to parse server response: ${jsonError?.message || jsonError?.toString() || 'Unknown error'}`);
    }
 
   if (response.ok && data?.status === "success") {
  const normalizedOrders = [];

  logger.log(`📥 Received ${data.data?.length || 0} orders from API`);

  for (const raw of data.data) {
    const order = normalizeOrder(raw);
    normalizedOrders.push(order);

    // ✅ Save every API order to SQLite for proximity notifications
    try {
      await upsertOrder(order, "api");
      logger.log(`💾 Saved order ${order.orderCode} to SQLite`);
    } catch (dbError) {
      logger.error(`❌ Failed to save order ${order.orderCode} to SQLite:`, dbError);
    }
  }

  // ✅ Immediately check proximity for all fetched orders
  if (normalizedOrders.length > 0) {
    logger.log('🔍 Checking orders proximity immediately after fetch...');
    checkOrdersProximity(normalizedOrders);
  }

  return {
    success: true,
    data: normalizedOrders,
    count: normalizedOrders.length,
  };
}
     else {
      const serverMessage =
        data?.message ||
        data?.error ||
        data?.errors?.[0]?.msg ||
        "Failed to fetch available orders";
      
      return {
        success: false,
        error: serverMessage
      };
    }
  } catch (err) {
    logger.error('❌ Error fetching available orders:', err);
    const errorMessage = err?.message === 'Failed to fetch' || err?.message?.includes('Network request failed')
      ? "Unable to connect to server. Please check your internet connection."
      : (err?.message || "Something went wrong. Please try again later.");
    
    return {
      success: false,
      error: errorMessage
    };
  }
};

/**
 * Fetch delivery history (completed orders)
 * @param {string} token - JWT authentication token
 * @returns {Promise<Object>} - { success, data, count, error }
 */
export const fetchDeliveryHistory = async (token) => {
  if (!token) {
    return { 
      success: false, 
      error: null, // Don't show error when not authenticated
      data: []
    };
  }

  try {
    logger.log('🌐 Fetching fresh delivery history from API');

    const response = await fetch(
      `${API_BASE_URL}/orders/get-orders-by-DeliveryMan?status=Completed`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      }
    );

    let data;
    try {
      data = await response.json();
    } catch (jsonError) {
      throw new Error(`Failed to parse server response: ${jsonError?.message || jsonError?.toString() || 'Unknown error'}`);
    }

    if (!response.ok || !data || data.status !== "success") {
      throw new Error(data?.message || `HTTP ${response.status}: Failed to fetch orders`);
    }

    if (!data.data || !Array.isArray(data.data) || typeof data.count !== "number") {
      throw new Error("Invalid response format: missing data array or count");
    }

    const normalizedHistory = data.data
      .map((order) => {
        if (!order._id && !order.id) {
          logger.warn("Skipping invalid order:", order);
          return null;
        }

        // Extract numbers from MongoDB Decimal128 format
        const deliveryFee = extractNumber(order.deliveryFee);
        const tip = extractNumber(order.tip);
        const totalEarnings = deliveryFee + tip;

        return {
          id: order._id || order.id,
          restaurantName: order.restaurantName || "Unknown Restaurant",
          deliveryFee: deliveryFee,
          tip: tip,
          totalEarnings: totalEarnings,
          grandTotal: totalEarnings,
          orderStatus: order.orderStatus || "",
          orderCode: order.orderCode || "",
          updatedAt: order.updatedAt ? new Date(order.updatedAt).toISOString() : null,
          createdAt: order.createdAt ? new Date(order.createdAt).toISOString() : null,
        };
      })
      .filter(Boolean); // Remove any nulls

    return {
      success: true,
      data: normalizedHistory,
      count: normalizedHistory.length
    };
  } catch (error) {
    logger.error('❌ Error fetching delivery history:', error);
    return {
      success: false,
      error: error?.message?.includes("Failed to fetch")
        ? "Unable to connect to server. Please try again later."
        : error?.message || "An unexpected error occurred.",
      data: []
    };
  }
};

/**
 * Verify delivery with verification code
 * @param {string} orderId - Order ID
 * @param {string} verificationCode - Verification code
 * @param {string} token - JWT authentication token
 * @returns {Promise<Object>} - { success, data, error, message }
 */
export const verifyDelivery = async (orderId, verificationCode, token) => {
  if (!token) {
    return {
      success: false,
      error: "Authentication required. Please log in again."
    };
  }

  try {
    const response = await fetch(
      `${API_BASE_URL}/orders/verify-delivery`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ 
          order_id: orderId, 
          verification_code: verificationCode 
        }),
      }
    );

    let data;
    try {
      data = await response.json();
    } catch (jsonError) {
      throw new Error(`Failed to parse server response: ${jsonError?.message || jsonError?.toString() || 'Unknown error'}`);
    }

    if (response.ok && data && data.status === "success") {
      return { 
        success: true, 
        data: data.data,
        message: data.message
      };
    }

    // Handle different error response formats
    let errorMessage = "Please try again.";
    
    if (data && data?.error) {
      if (typeof data?.error === 'string') {
        errorMessage = data?.error;
      } else if (typeof data?.error === 'object' && data?.error.message) {
        errorMessage = data?.error.message;
      }
    } else if (data && data.message) {
      errorMessage = data.message;
    }
    
    return { 
      success: false, 
      error: errorMessage 
    };
  } catch (error) {
    logger.error('❌ Error verifying delivery:', error);
    
    const errorMessage = error?.message === 'Failed to fetch' || error?.message?.includes('Network request failed')
      ? "Unable to connect to server. Please check your internet connection and try again."
      : "Something went wrong. Please try again later.";
    
    return { 
      success: false, 
      error: errorMessage 
    };
  }
};

export default {
  fetchOrdersByStatus,
  fetchAllActiveOrders,
  fetchAvailableOrders,
  fetchDeliveryHistory,
  verifyDelivery,
};

