import * as SQLite from 'expo-sqlite';
import { logger } from '../utils/logger';
import { initOrderDB } from '../db/ordersDb';

class DatabaseService {
  constructor() {
    this.db = null;
  }

  // Initialize database
  async init() {
    try {
      this.db = await SQLite.openDatabaseAsync('bahiran_delivery.db');
      await this.createTables();
      
      // Initialize orders database (used for proximity notifications)
      await initOrderDB();
      
      logger.log('✅ Database initialized successfully');
      return true;
    } catch (error) {
      logger.error('❌ Database initialization error:', error);
      return false;
    }
  }

  // Create necessary tables
  async createTables() {
    try {
      // Orders table
      await this.db.execAsync(`
        CREATE TABLE IF NOT EXISTS orders (
          id TEXT PRIMARY KEY,
          order_code TEXT,
          order_status TEXT,
          restaurant_name TEXT,
          restaurant_location_lat REAL,
          restaurant_location_lng REAL,
          destination_location_lat REAL,
          destination_location_lng REAL,
          customer_name TEXT,
          customer_phone TEXT,
          delivery_fee REAL,
          tip REAL,
          total_amount REAL,
          items TEXT,
          created_at INTEGER,
          updated_at INTEGER,
          synced INTEGER DEFAULT 0
        );

        CREATE INDEX IF NOT EXISTS idx_order_status ON orders(order_status);
        CREATE INDEX IF NOT EXISTS idx_synced ON orders(synced);
        CREATE INDEX IF NOT EXISTS idx_created_at ON orders(created_at);
      `);

      // Notifications log table
      await this.db.execAsync(`
        CREATE TABLE IF NOT EXISTS notification_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          order_id TEXT,
          notification_type TEXT,
          message TEXT,
          created_at INTEGER,
          FOREIGN KEY (order_id) REFERENCES orders(id)
        );

        CREATE INDEX IF NOT EXISTS idx_notif_order ON notification_log(order_id);
        CREATE INDEX IF NOT EXISTS idx_notif_created ON notification_log(created_at);
      `);

      logger.log('✅ Database tables created successfully');
    } catch (error) {
      logger.error('❌ Error creating tables:', error);
    }
  }

  // Save order to database
  async saveOrder(order) {
    try {
      const restaurantLocation = this.extractLatLng(order.restaurantLocation);
      const destinationLocation = this.extractLatLng(order.destinationLocation);

      const orderId = order.id || order._id || order.orderId;
      const now = Date.now();

      await this.db.runAsync(
        `INSERT OR REPLACE INTO orders (
          id, order_code, order_status, restaurant_name,
          restaurant_location_lat, restaurant_location_lng,
          destination_location_lat, destination_location_lng,
          customer_name, customer_phone,
          delivery_fee, tip, total_amount, items,
          created_at, updated_at, synced
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          orderId,
          order.orderCode || '',
          order.orderStatus || '',
          order.restaurantName || '',
          restaurantLocation?.lat || null,
          restaurantLocation?.lng || null,
          destinationLocation?.lat || null,
          destinationLocation?.lng || null,
          order.userName || order.customerName || '',
          order.phone || order.customerPhone || '',
          this.extractNumber(order.deliveryFee),
          this.extractNumber(order.tip),
          this.extractNumber(order.totalAmount || order.grandTotal),
          JSON.stringify(order.items || []),
          order.createdAt || now,
          now,
          1
        ]
      );

      logger.log(`✅ Order ${orderId} saved to database`);
      return true;
    } catch (error) {
      logger.error('❌ Error saving order:', error);
      return false;
    }
  }

  // Get all active orders (Cooked or Delivering status)
  async getActiveOrders() {
    try {
      const result = await this.db.getAllAsync(
        `SELECT * FROM orders 
         WHERE order_status IN ('Cooked', 'Delivering', 'OnTheWay', 'On Delivery', 'Picked Up')
         ORDER BY created_at DESC`
      );

      return result.map(row => this.mapRowToOrder(row));
    } catch (error) {
      logger.error('❌ Error getting active orders:', error);
      return [];
    }
  }

  // Get order by ID
  async getOrderById(orderId) {
    try {
      const result = await this.db.getFirstAsync(
        'SELECT * FROM orders WHERE id = ?',
        [orderId]
      );

      return result ? this.mapRowToOrder(result) : null;
    } catch (error) {
      logger.error('❌ Error getting order:', error);
      return null;
    }
  }

  // Update order status
  async updateOrderStatus(orderId, newStatus) {
    try {
      await this.db.runAsync(
        'UPDATE orders SET order_status = ?, updated_at = ? WHERE id = ?',
        [newStatus, Date.now(), orderId]
      );

      logger.log(`✅ Order ${orderId} status updated to ${newStatus}`);
      return true;
    } catch (error) {
      logger.error('❌ Error updating order status:', error);
      return false;
    }
  }

  // Delete order
  async deleteOrder(orderId) {
    try {
      await this.db.runAsync('DELETE FROM orders WHERE id = ?', [orderId]);
      logger.log(`✅ Order ${orderId} deleted from database`);
      return true;
    } catch (error) {
      logger.error('❌ Error deleting order:', error);
      return false;
    }
  }

  // Log notification
  async logNotification(orderId, type, message) {
    try {
      await this.db.runAsync(
        'INSERT INTO notification_log (order_id, notification_type, message, created_at) VALUES (?, ?, ?, ?)',
        [orderId, type, message, Date.now()]
      );

      logger.log(`✅ Notification logged: ${type} for order ${orderId}`);
      return true;
    } catch (error) {
      logger.error('❌ Error logging notification:', error);
      return false;
    }
  }

  // Get notification history for order
  async getNotificationHistory(orderId) {
    try {
      const result = await this.db.getAllAsync(
        'SELECT * FROM notification_log WHERE order_id = ? ORDER BY created_at DESC',
        [orderId]
      );

      return result;
    } catch (error) {
      logger.error('❌ Error getting notification history:', error);
      return [];
    }
  }

  // Clear old completed orders (older than 7 days)
  async clearOldOrders() {
    try {
      const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
      
      const result = await this.db.runAsync(
        `DELETE FROM orders 
         WHERE order_status IN ('Delivered', 'Cancelled', 'Rejected') 
         AND updated_at < ?`,
        [sevenDaysAgo]
      );

      logger.log(`✅ Cleared ${result.changes} old orders from database`);
      return result.changes;
    } catch (error) {
      logger.error('❌ Error clearing old orders:', error);
      return 0;
    }
  }

  // Get database statistics
  async getStats() {
    try {
      const totalOrders = await this.db.getFirstAsync(
        'SELECT COUNT(*) as count FROM orders'
      );

      const activeOrders = await this.db.getFirstAsync(
        `SELECT COUNT(*) as count FROM orders 
         WHERE order_status IN ('Cooked', 'Delivering', 'OnTheWay', 'On Delivery', 'Picked Up')`
      );

      const totalNotifications = await this.db.getFirstAsync(
        'SELECT COUNT(*) as count FROM notification_log'
      );

      return {
        totalOrders: totalOrders.count,
        activeOrders: activeOrders.count,
        totalNotifications: totalNotifications.count,
      };
    } catch (error) {
      logger.error('❌ Error getting database stats:', error);
      return { totalOrders: 0, activeOrders: 0, totalNotifications: 0 };
    }
  }

  // Helper: Extract lat/lng from various formats
  extractLatLng(obj) {
    if (!obj) return null;

    if (obj.type === 'Point' && Array.isArray(obj.coordinates)) {
      return {
        lat: obj.coordinates[1],
        lng: obj.coordinates[0],
      };
    }

    if (obj.lat && obj.lng) return obj;

    return null;
  }

  // Helper: Extract number from various formats
  extractNumber(value) {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return value;
    if (typeof value === 'string') return parseFloat(value) || 0;
    if (typeof value === 'object' && value.$numberDecimal) {
      return parseFloat(value.$numberDecimal) || 0;
    }
    return 0;
  }

  // Helper: Map database row to order object
  mapRowToOrder(row) {
    return {
      id: row.id,
      _id: row.id,
      orderId: row.id,
      orderCode: row.order_code,
      orderStatus: row.order_status,
      restaurantName: row.restaurant_name,
      restaurantLocation: row.restaurant_location_lat && row.restaurant_location_lng ? {
        lat: row.restaurant_location_lat,
        lng: row.restaurant_location_lng,
      } : null,
      destinationLocation: row.destination_location_lat && row.destination_location_lng ? {
        lat: row.destination_location_lat,
        lng: row.destination_location_lng,
      } : null,
      userName: row.customer_name,
      customerName: row.customer_name,
      phone: row.customer_phone,
      customerPhone: row.customer_phone,
      deliveryFee: row.delivery_fee,
      tip: row.tip,
      totalAmount: row.total_amount,
      grandTotal: row.total_amount,
      items: row.items ? JSON.parse(row.items) : [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      synced: row.synced === 1,
    };
  }

  // Close database
  async close() {
    try {
      if (this.db) {
        // SQLite in expo-sqlite doesn't need explicit closing
        this.db = null;
        logger.log('✅ Database closed');
      }
    } catch (error) {
      logger.error('❌ Error closing database:', error);
    }
  }
}

export default new DatabaseService();



