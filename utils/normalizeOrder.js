// Helper to extract number from various formats (including MongoDB Decimal128)
function extractNumber(value) {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return parseFloat(value) || 0;
  if (typeof value === 'object' && value.$numberDecimal) {
    return parseFloat(value.$numberDecimal) || 0;
  }
  return 0;
}

// Helper to extract restaurant location from various formats
function extractLocation(location) {
  if (!location) return { latitude: null, longitude: null };
  
  // Format: { latitude, longitude }
  if (location.latitude !== undefined && location.longitude !== undefined) {
    return {
      latitude: extractNumber(location.latitude),
      longitude: extractNumber(location.longitude),
    };
  }
  
  // Format: { lat, lng }
  if (location.lat !== undefined && location.lng !== undefined) {
    return {
      latitude: extractNumber(location.lat),
      longitude: extractNumber(location.lng),
    };
  }
  
  // Format: GeoJSON { type: "Point", coordinates: [lng, lat] }
  if (location.type === 'Point' && Array.isArray(location.coordinates)) {
    return {
      latitude: extractNumber(location.coordinates[1]),
      longitude: extractNumber(location.coordinates[0]),
    };
  }
  
  // Format: { coordinates: [lng, lat] }
  if (Array.isArray(location.coordinates)) {
    return {
      latitude: extractNumber(location.coordinates[1]),
      longitude: extractNumber(location.coordinates[0]),
    };
  }
  
  return { latitude: null, longitude: null };
}

export function normalizeOrder(raw) {
  if (!raw) return null;
  
  // Handle if raw is wrapped in data property
  const data = raw.data || raw;
  
  const orderId = data.orderId || data.id || data._id;
  const orderCode = data.orderCode || data.code || data.order_code;
  
  // Extract pricing values (handle MongoDB Decimal128)
  const deliveryFee = extractNumber(data.deliveryFee || data.delivery_fee);
  const tip = extractNumber(data.tip);
  const grandTotal = extractNumber(data.grandTotal || data.total || data.grand_total);
  
  const normalized = {
    // Core identifiers
    id: orderId,
    orderId: orderId,
    _id: orderId,
    code: orderCode,
    orderCode: orderCode,
    
    // Restaurant info
    restaurantName: data.restaurantName || data.restaurant_name || 'Unknown Restaurant',
    restaurantLocation: extractLocation(data.restaurantLocation || data.restaurant_location),

    // Delivery info
    deliveryLocation: extractLocation(data.deliveryLocation || data.delivery_location),
    phone: data.phone || data.customerPhone || data.customer_phone || '',
    userName: data.userName || data.user_name || data.customerName || '',

    // Pricing
    deliveryFee: deliveryFee,
    tip: tip,
    total: grandTotal || (deliveryFee + tip),
    grandTotal: grandTotal || (deliveryFee + tip),
    
    // Metadata
    createdAt: data.createdAt || data.created_at || new Date().toISOString(),
    fromSponsore: data.fromSponsore || data.from_sponsore || false,
    orderStatus: data.orderStatus || data.order_status || data.status || 'Cooked',
  };
  
  console.log('📦 Normalized order:', {
    orderCode: normalized.orderCode,
    restaurantName: normalized.restaurantName,
    deliveryFee: normalized.deliveryFee,
    tip: normalized.tip,
    grandTotal: normalized.grandTotal,
  });
  
  return normalized;
}
