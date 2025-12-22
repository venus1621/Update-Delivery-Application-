import locationService from "./location-service";
import { getUnnotifiedOrders, markNotified, getAllOrders } from "../db/ordersDb";
import { getProximityRadiusSync, getProximityRadius } from "../utils/proximity-settings";
import { isOrderRejected } from "../utils/rejected-orders";

/**
 * Check for nearby orders based on user's current location
 * Compares user location with stored order restaurant locations
 * @param {Object} options - Options object
 * @param {Function} options.onNear - Callback when user is near an order
 */
export async function checkNearbyOrders({ onNear }) {
  const current = locationService.getCurrentLocation();
  if (!current) {
    console.log('📍 No current location available for proximity check');
    return;
  }

  // Get configurable radius (in km) - use async version for accuracy
  let radiusKm = getProximityRadiusSync();
  try {
    radiusKm = await getProximityRadius();
  } catch (e) {
    // Use cached value
  }

  console.log(`📍 Proximity check: User at (${current.latitude.toFixed(4)}, ${current.longitude.toFixed(4)}), Radius: ${radiusKm}km`);

  try {
    const orders = await getUnnotifiedOrders();
    
    if (orders.length === 0) {
      console.log('📍 No unnotified orders in database');
      // Log total orders for debugging
      const allOrders = await getAllOrders();
      console.log(`📍 Total orders in database: ${allOrders.length}`);
      return;
    }

    console.log(`📍 Found ${orders.length} unnotified orders to check`);

    for (const order of orders) {
      // Skip rejected orders
      if (isOrderRejected(order.order_id)) {
        console.log(`🚫 Skipping rejected order: ${order.order_code}`);
        continue;
      }

      // Skip orders without valid coordinates
      if (!order.restaurant_lat || !order.restaurant_lng) {
        console.log(`⚠️ Order ${order.order_code} has no coordinates, skipping`);
        continue;
      }

      const distance = locationService.calculateDistance(
        current.latitude,
        current.longitude,
        order.restaurant_lat,
        order.restaurant_lng
      );

      console.log(`📍 Order ${order.order_code}: ${distance.toFixed(2)}km away (restaurant at ${order.restaurant_lat}, ${order.restaurant_lng})`);

      if (distance <= radiusKm) {
        console.log(`🔔 MATCH! User is within ${radiusKm}km of order ${order.order_code}! (${distance.toFixed(2)}km)`);
        
        // Mark as notified first to prevent duplicate notifications
        await markNotified(order.order_id);
        
        // Trigger notification callback
        if (onNear) {
          console.log('🔔 Triggering notification callback...');
          onNear(order, distance);
        }
        
        // Only notify for one order per cycle to avoid notification spam
        break;
      }
    }
  } catch (error) {
    console.error('❌ Error checking nearby orders:', error);
  }
}

/**
 * Get distance to a specific order's restaurant
 * @param {Object} order - Order with restaurant_lat and restaurant_lng
 * @returns {number|null} Distance in km or null if unavailable
 */
export function getDistanceToOrder(order) {
  const current = locationService.getCurrentLocation();
  if (!current || !order.restaurant_lat || !order.restaurant_lng) {
    return null;
  }

  return locationService.calculateDistance(
    current.latitude,
    current.longitude,
    order.restaurant_lat,
    order.restaurant_lng
  );
}

/**
 * Check if user is within proximity radius of an order
 * @param {Object} order - Order with restaurant location
 * @returns {boolean}
 */
export function isNearOrder(order) {
  const distance = getDistanceToOrder(order);
  if (distance === null) return false;
  
  const radiusKm = getProximityRadiusSync();
  return distance <= radiusKm;
}
