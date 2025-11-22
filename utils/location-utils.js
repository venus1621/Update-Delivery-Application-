export const transformOrderLocations = (order) => {
  if (!order) return order;
  
  const transformed = { ...order };
  
  if (order.pickup_location && typeof order.pickup_location === 'string') {
    try {
      const coords = order.pickup_location.split(',').map(c => parseFloat(c.trim()));
      if (coords.length === 2 && !isNaN(coords[0]) && !isNaN(coords[1])) {
        transformed.pickup_location = {
          latitude: coords[0],
          longitude: coords[1]
        };
      }
    } catch (e) {
      console.error('Error parsing pickup_location:', e);
    }
  }
  
  if (order.delivery_location && typeof order.delivery_location === 'string') {
    try {
      const coords = order.delivery_location.split(',').map(c => parseFloat(c.trim()));
      if (coords.length === 2 && !isNaN(coords[0]) && !isNaN(coords[1])) {
        transformed.delivery_location = {
          latitude: coords[0],
          longitude: coords[1]
        };
      }
    } catch (e) {
      console.error('Error parsing delivery_location:', e);
    }
  }
  
  return transformed;
};

export const transformOrdersLocations = (orders) => {
  if (!Array.isArray(orders)) return orders;
  return orders.map(order => transformOrderLocations(order));
};
