import { Alert } from "react-native";
import databaseService from "./database-service";
import locationService from "./location-service";
import orderNotificationService from "./order-notification-service";
import { logger } from "../utils/logger";
import { upsertOrder } from "../db/ordersDb";
import { getProximityRadiusSync, initProximitySettings } from "../utils/proximity-settings";

class SmartOrderService {
  constructor() {
    this.checkInterval = null;
    this.CHECK_FREQUENCY = 30000; // Check every 30 seconds
    this.pendingOrders = new Map(); // In-memory cache of pending orders
    this.notifiedOrders = new Set(); // Track which orders we've already notified about
    
    // Initialize proximity settings
    initProximitySettings();
  }

  // Get proximity threshold in meters from settings
  getProximityThreshold() {
    const radiusKm = getProximityRadiusSync();
    return radiusKm * 1000; // Convert km to meters
  }

  // Calculate distance between two points
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
    const dLat = this.deg2rad(lat2 - lat1);
    const dLon = this.deg2rad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.deg2rad(lat1)) *
        Math.cos(this.deg2rad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c; // Distance in km
    return distance * 1000; // Convert to meters
  }

  deg2rad(deg) {
    return deg * (Math.PI / 180);
  }

  // Extract location from order
  extractRestaurantLocation(order) {
    const restaurantLocation = order.restaurantLocation;
    
    if (!restaurantLocation) return null;

    // Handle GeoJSON format
    if (restaurantLocation.type === 'Point' && Array.isArray(restaurantLocation.coordinates)) {
      return {
        lat: restaurantLocation.coordinates[1],
        lng: restaurantLocation.coordinates[0],
      };
    }

    // Handle direct lat/lng format
    if (restaurantLocation.lat && restaurantLocation.lng) {
      return restaurantLocation;
    }

    return null;
  }

  // Check if driver is near restaurant
  isDriverNearRestaurant(currentLocation, restaurantLocation) {
    if (!currentLocation || !restaurantLocation) return false;

    const distance = this.calculateDistance(
      currentLocation.latitude,
      currentLocation.longitude,
      restaurantLocation.lat,
      restaurantLocation.lng
    );

    return distance <= this.getProximityThreshold();
  }

  // Handle new order arrival
  async handleNewOrder(order, currentLocation, showOrderModal) {
    try {
      const orderId = order.id || order._id || order.orderId;
      const restaurantLocation = this.extractRestaurantLocation(order);

      // Always save order to SQLite for proximity checking later
      try {
        await upsertOrder(order, "socket");
        logger.log(`💾 Order ${orderId} saved to SQLite for proximity tracking`);
      } catch (dbError) {
        logger.error('❌ Error saving order to SQLite:', dbError);
      }

      if (!restaurantLocation) {
        logger.warn('⚠️ Order has no restaurant location, showing notification anyway');
        // Show notification anyway if no location data
        await this.showOrderNotification(order, showOrderModal);
        return;
      }

      // Check if driver is near restaurant
      if (currentLocation) {
        const isNear = this.isDriverNearRestaurant(currentLocation, restaurantLocation);
        const distance = this.calculateDistance(
          currentLocation.latitude,
          currentLocation.longitude,
          restaurantLocation.lat,
          restaurantLocation.lng
        );

        const radiusKm = getProximityRadiusSync();
        logger.log(`📍 New order ${orderId}: Distance = ${Math.round(distance)}m, Radius = ${radiusKm}km`);

        if (isNear) {
          // Driver is near - show notification immediately
          logger.log(`✅ Driver is within ${radiusKm}km (${Math.round(distance)}m) - showing notification`);
          await this.showOrderNotification(order, showOrderModal);
          
          // Log to database
          await databaseService.logNotification(
            orderId,
            'order_immediate',
            `Order notification shown immediately - driver ${Math.round(distance)}m from restaurant`
          );
        } else {
          // Driver is far - save to database for later
          logger.log(`💾 Driver is outside ${radiusKm}km radius (${Math.round(distance)}m) - will notify when nearby`);
          await databaseService.saveOrder(order);
          this.pendingOrders.set(orderId, order);
          
          // Log to database
          await databaseService.logNotification(
            orderId,
            'order_stored',
            `Order stored for later - driver ${Math.round(distance)}m from restaurant (radius: ${radiusKm}km)`
          );
        }
      } else {
        // No location available - save to database
        logger.log('📍 No current location - saving order to database');
        await databaseService.saveOrder(order);
        this.pendingOrders.set(orderId, order);
      }
    } catch (error) {
      logger.error('❌ Error handling new order:', error);
    }
  }

  // Show order notification
  async showOrderNotification(order, showOrderModal) {
    try {
      const orderId = order.id || order._id || order.orderId;

      // Show system notification
      await orderNotificationService.showNewOrderNotification(order);

      // Show modal if callback provided
      if (showOrderModal) {
        showOrderModal(order);
      }

      // Mark as notified
      this.notifiedOrders.add(orderId);

      logger.log(`✅ Order notification shown: ${orderId}`);
    } catch (error) {
      logger.error('❌ Error showing order notification:', error);
    }
  }

  // Check pending orders against current location
  async checkPendingOrders(currentLocation, showOrderModal) {
    try {
      if (!currentLocation) return;

      // Check if database is initialized
      if (!databaseService.db) {
        logger.log('⏳ Database not yet initialized, skipping pending orders check');
        return;
      }

      // Get pending orders from database
      const dbOrders = await databaseService.getActiveOrders();
      
      // Update in-memory cache
      for (const order of dbOrders) {
        const orderId = order.id || order._id;
        if (!this.pendingOrders.has(orderId)) {
          this.pendingOrders.set(orderId, order);
        }
      }

      // Check each pending order
      for (const [orderId, order] of this.pendingOrders.entries()) {
        // Skip if already notified
        if (this.notifiedOrders.has(orderId)) {
          continue;
        }

        // Skip if order is not in acceptable status
        if (!['Cooked', 'Ready', 'Pending'].includes(order.orderStatus)) {
          this.pendingOrders.delete(orderId);
          continue;
        }

        const restaurantLocation = this.extractRestaurantLocation(order);
        if (!restaurantLocation) continue;

        // Check if driver is now near restaurant
        const isNear = this.isDriverNearRestaurant(currentLocation, restaurantLocation);
        
        if (isNear) {
          const distance = this.calculateDistance(
            currentLocation.latitude,
            currentLocation.longitude,
            restaurantLocation.lat,
            restaurantLocation.lng
          );

          logger.log(`📍 Driver is now near restaurant for order ${orderId} (${Math.round(distance)}m)!`);

          // Show notification
          await this.showOrderNotification(order, showOrderModal);

          // Update database
          await databaseService.logNotification(
            orderId,
            'order_proximity',
            `Order notification shown when driver came near - ${Math.round(distance)}m from restaurant`
          );

          // Remove from pending orders
          this.pendingOrders.delete(orderId);
        }
      }
    } catch (error) {
      logger.error('❌ Error checking pending orders:', error);
    }
  }

  // Start monitoring location for pending orders
  startMonitoring(getCurrentLocation, showOrderModal) {
    // Stop existing monitoring
    this.stopMonitoring();

    logger.log('🔄 Started monitoring location for pending orders');

    // Check immediately
    const currentLocation = getCurrentLocation();
    if (currentLocation) {
      this.checkPendingOrders(currentLocation, showOrderModal);
    }

    // Check periodically
    this.checkInterval = setInterval(async () => {
      const location = getCurrentLocation();
      if (location) {
        await this.checkPendingOrders(location, showOrderModal);
      }
    }, this.CHECK_FREQUENCY);
  }

  // Stop monitoring
  stopMonitoring() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      logger.log('🛑 Stopped monitoring location for pending orders');
    }
  }

  // Remove order from pending list (when accepted/rejected)
  removeOrder(orderId) {
    this.pendingOrders.delete(orderId);
    this.notifiedOrders.delete(orderId);
    logger.log(`🗑️ Removed order ${orderId} from pending list`);
  }

  // Get pending orders count
  getPendingOrdersCount() {
    return this.pendingOrders.size;
  }

  // Get all pending orders
  getPendingOrders() {
    return Array.from(this.pendingOrders.values());
  }

  // Clear all pending orders
  clearPendingOrders() {
    this.pendingOrders.clear();
    this.notifiedOrders.clear();
    logger.log('🗑️ Cleared all pending orders');
  }

  // Sync pending orders from database
  async syncFromDatabase() {
    try {
      // Check if database is initialized
      if (!databaseService.db) {
        logger.log('⏳ Database not yet initialized, skipping sync');
        return;
      }

      const orders = await databaseService.getActiveOrders();
      
      for (const order of orders) {
        const orderId = order.id || order._id;
        if (!this.notifiedOrders.has(orderId)) {
          this.pendingOrders.set(orderId, order);
        }
      }

      logger.log(`📥 Synced ${orders.length} orders from database`);
    } catch (error) {
      logger.error('❌ Error syncing from database:', error);
    }
  }

  // Cleanup
  async cleanup() {
    this.stopMonitoring();
    this.clearPendingOrders();
  }
}

export default new SmartOrderService();




