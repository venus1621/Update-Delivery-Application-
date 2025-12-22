import * as SQLite from "expo-sqlite";

let db = null;

async function getDatabase() {
  if (!db) {
    db = await SQLite.openDatabaseAsync("orders.db");
  }
  return db;
}

export async function initOrderDB() {
  const database = await getDatabase();
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT UNIQUE,
      order_code TEXT,
      restaurant_name TEXT,
      restaurant_lat REAL,
      restaurant_lng REAL,
      delivery_lat REAL,
      delivery_lng REAL,
      delivery_fee REAL,
      tip REAL,
      total REAL,
      created_at TEXT,
      source TEXT,
      notified INTEGER DEFAULT 0
    )
  `);
}

export async function saveOrder(order) {
  const database = await getDatabase();
  await database.runAsync(
    `
    INSERT OR IGNORE INTO orders (
      order_id, order_code, restaurant_name,
      restaurant_lat, restaurant_lng,
      delivery_lat, delivery_lng,
      delivery_fee, tip, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      order.orderId,
      order.orderCode,
      order.restaurantName,
      order.restaurantLocation.latitude,
      order.restaurantLocation.longitude,
      order.deliveryLocation.latitude,
      order.deliveryLocation.longitude,
      order.deliveryFee,
      order.tip,
      order.createdAt
    ]
  );
}

export async function getUnnotifiedOrders() {
  const database = await getDatabase();
  return await database.getAllAsync(`SELECT * FROM orders WHERE notified = 0`);
}

export async function markNotified(orderId) {
  const database = await getDatabase();
  await database.runAsync(
    `UPDATE orders SET notified = 1 WHERE order_id = ?`,
    [orderId]
  );
}

export async function upsertOrder(order, source) {
  const database = await getDatabase();
  
  // Extract restaurant coordinates - handle multiple formats
  let restLat = null, restLng = null;
  if (order.restaurantLocation) {
    if (order.restaurantLocation.latitude !== undefined) {
      restLat = order.restaurantLocation.latitude;
      restLng = order.restaurantLocation.longitude;
    } else if (order.restaurantLocation.lat !== undefined) {
      restLat = order.restaurantLocation.lat;
      restLng = order.restaurantLocation.lng;
    } else if (order.restaurantLocation.coordinates) {
      // GeoJSON format [lng, lat]
      restLng = order.restaurantLocation.coordinates[0];
      restLat = order.restaurantLocation.coordinates[1];
    }
  }
  
  // Extract delivery coordinates - handle multiple formats
  let delLat = null, delLng = null;
  if (order.deliveryLocation) {
    if (order.deliveryLocation.latitude !== undefined) {
      delLat = order.deliveryLocation.latitude;
      delLng = order.deliveryLocation.longitude;
    } else if (order.deliveryLocation.lat !== undefined) {
      delLat = order.deliveryLocation.lat;
      delLng = order.deliveryLocation.lng;
    } else if (order.deliveryLocation.coordinates) {
      // GeoJSON format [lng, lat]
      delLng = order.deliveryLocation.coordinates[0];
      delLat = order.deliveryLocation.coordinates[1];
    }
  }
  
  await database.runAsync(
    `
    INSERT INTO orders (
      order_id, order_code, restaurant_name,
      restaurant_lat, restaurant_lng,
      delivery_lat, delivery_lng,
      delivery_fee, tip, total,
      created_at, source, notified
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    ON CONFLICT(order_id) DO UPDATE SET
      source = excluded.source,
      restaurant_lat = excluded.restaurant_lat,
      restaurant_lng = excluded.restaurant_lng,
      delivery_lat = excluded.delivery_lat,
      delivery_lng = excluded.delivery_lng,
      notified = 0
    `,
    [
      order.orderId || order.id || order._id,
      order.orderCode || order.code,
      order.restaurantName,
      restLat,
      restLng,
      delLat,
      delLng,
      order.deliveryFee || 0,
      order.tip || 0,
      order.total || order.grandTotal || 0,
      order.createdAt || new Date().toISOString(),
      source,
    ]
  );
  
  console.log(`💾 Order ${order.orderCode || order.orderId} saved to SQLite (source: ${source})`);
}

// Get all orders (for debugging)
export async function getAllOrders() {
  const database = await getDatabase();
  return await database.getAllAsync(`SELECT * FROM orders ORDER BY created_at DESC`);
}

// Reset all notified flags (useful for testing)
export async function resetAllNotifications() {
  const database = await getDatabase();
  await database.runAsync(`UPDATE orders SET notified = 0`);
  console.log('🔄 Reset all order notifications');
}

// Delete all orders (useful for testing)
export async function clearAllOrders() {
  const database = await getDatabase();
  await database.runAsync(`DELETE FROM orders`);
  console.log('🗑️ Cleared all orders from database');
}
