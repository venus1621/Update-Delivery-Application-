# Socket-Based Location Tracking Integration

## Overview
Real-time location tracking has been integrated into the delivery application using Socket.IO. This allows admins and customers to request and receive live location updates from delivery personnel.

## Features Implemented

### 1. **Location Update Request Listener** (`requestLocationUpdate`)
The app now listens for location requests from the server and responds with current location data.

**How it works:**
- Server emits `requestLocationUpdate` event with metadata (requestType, requestedBy, customerId, orderId)
- App retrieves current location from location service
- App emits `locationUpdate` event back with location + metadata

**Request Types Supported:**
- `adminAll` - Admin requesting all delivery personnel locations
- `customerOne` - Customer requesting their delivery person's location
- Custom types as needed

### 2. **Periodic Location Updates** (Customer-Triggered)
The app sends location updates every 3 minutes **only when a customer requests tracking**.

**How it works (NEW & FINAL):**
1. Customer opens tracking in their app
2. Server emits `startPeriodicTracking` event with `{ customerId, orderId, requestId }`
3. App immediately starts sending location updates every 3 minutes automatically
4. Updates continue until:
   - Customer closes tracking (server sends `stopPeriodicTracking`)
   - Delivery is completed
   - Socket disconnects

**What's sent:**
- Current GPS coordinates (latitude, longitude)
- Location accuracy
- Timestamp
- Delivery person ID and name
- Active order ID and status
- Customer ID (who requested tracking)
- Request type: `periodic` (heartbeat)

**When it runs:**
- ONLY when customer actively requests location tracking
- Only when location tracking is enabled
- Only when socket is connected
- Stops when customer closes tracking or server sends `stopLocationTracking` event

**Additional Features:**
- Proximity checks run every 5 seconds independently (for safety alerts when near destination)
- Location socket updates run every 3 minutes (battery optimization)
- Both use the same location tracking service

### 3. **Manual Location Update Function** (`sendLocationUpdateViaSocket`)
A new helper function that can be called manually to send location updates.

**Usage:**
```javascript
import { useDelivery } from './providers/delivery-provider';

function MyComponent() {
  const { sendLocationUpdateViaSocket } = useDelivery();
  
  // Send location update with custom metadata
  const handleSendLocation = async () => {
    const success = await sendLocationUpdateViaSocket({
      requestType: 'manual',
      event: 'orderPickedUp'
    });
  };
}
```

## Socket Events

### Listening For (NEW & FINAL):
- ✅ `startPeriodicTracking` - Customer starts tracking, begins sending location every 3 minutes
- ✅ `stopPeriodicTracking` - Customer stops tracking, stops sending periodic updates
- ✅ `requestLocationUpdate` - Force immediate location update (optional, for instant feedback)

### Emitting:
- ✅ `locationUpdate` - Location data sent to server

## Payload Structure

### Location Update Payload
```javascript
{
  location: {
    latitude: number,
    longitude: number,
    accuracy: number,
    timestamp: number,
    requestType: 'periodic' | 'adminAll' | 'customerOne' | 'manual',
    requestedBy?: string,     // adminId (if admin request)
    customerId?: string,       // customerId (if customer request)
    orderId?: string,          // orderId (if order-specific)
  },
  deliveryPersonId: string,
  deliveryPersonName: string,
  activeOrderId: string | null,
  orderStatus: string | null,
}
```

## Integration Points

### Updated Files:
1. **`providers/delivery-provider.js`**
   - Added `requestLocationUpdate` socket listener
   - Modified location interval to emit periodic updates
   - Added `sendLocationUpdateViaSocket` helper function
   - Exposed function in DeliveryContext

### Key Functions:
```javascript
// Available in useDelivery() hook:
const {
  sendLocationUpdateViaSocket,  // Manually send location
  getCurrentLocation,            // Get current location (no socket)
  getCurrentLocationAsync,       // Get current location async (no socket)
  calculateDistanceToLocation,   // Calculate distance
} = useDelivery();
```

## Usage Examples

### 1. Customer Tracking Flow (NEW & FINAL)
```javascript
// Customer opens tracking → Server starts periodic updates
socket.emit('startPeriodicTracking', {
  customerId: '12345',
  orderId: 'ORD-67890',
  requestId: 'unique-request-id'
});

// Delivery app starts sending location every 3 minutes automatically
// Server receives via 'locationUpdate' event

// Customer closes tracking → Server stops periodic updates
socket.emit('stopPeriodicTracking', {
  customerId: '12345'
});
```

### 2. Periodic Updates (Customer-Triggered)
When a customer requests location tracking:
- First location sent immediately
- Subsequent locations sent every 3 minutes automatically
- Proximity alerts checked every 5 seconds independently
- Includes order status and delivery person info
- Stops when customer closes tracking or delivery is completed

### 3. Manual Update (On-Demand)
```javascript
// In your component
const { sendLocationUpdateViaSocket } = useDelivery();

// When order is picked up
const handlePickup = async () => {
  await sendLocationUpdateViaSocket({
    event: 'orderPickedUp',
    requestType: 'manual'
  });
};

// When delivery starts
const handleStartDelivery = async () => {
  await sendLocationUpdateViaSocket({
    event: 'deliveryStarted',
    requestType: 'manual'
  });
};
```

## Security & Privacy

### Location Sent Only When:
1. ✅ User is authenticated (JWT token)
2. ✅ Socket is connected
3. ✅ Location tracking is enabled
4. ✅ Location permissions granted

### Active Order Protection:
- Cannot go offline during active order
- Cannot disable location during active order
- Automatic re-enablement if needed

## Server-Side Requirements

The backend server should:

1. **Handle `locationUpdate` event:**
```javascript
socket.on('locationUpdate', (data) => {
  const { location, deliveryPersonId, activeOrderId } = data;
  
  // Forward to admin dashboard
  io.to('admins').emit('deliveryPersonLocation', data);
  
  // Forward to specific customer
  if (location.customerId) {
    io.to(`customer-${location.customerId}`).emit('deliveryLocation', data);
  }
  
  // Store in database if needed
  // ...
});
```

2. **Emit `requestLocationUpdate` when needed:**
```javascript
// Admin requests all delivery personnel locations
io.to('deliveryGroup').emit('requestLocationUpdate', {
  requestType: 'adminAll',
  requestedBy: adminId
});

// Customer requests their delivery person's location
io.to(`delivery-${deliveryPersonId}`).emit('requestLocationUpdate', {
  requestType: 'customerOne',
  customerId: customerId,
  orderId: orderId
});
```

## Testing

### Test Scenarios:
1. ✅ Admin requests location → Delivery app responds
2. ✅ Customer requests location → Delivery app responds
3. ✅ Active order → Periodic updates every 5 seconds
4. ✅ No active order → No periodic updates
5. ✅ Socket disconnected → No updates sent (safe)
6. ✅ Location disabled → No updates sent

### Logging:
All location events are logged via the logger utility:
- `📍 Location update requested`
- `✅ Location update sent to server`
- `📍 Periodic location update sent`
- `⚠️ Socket not connected, cannot send location update`
- `⚠️ No location available`

## Performance Considerations

### Smart Dual-Interval System
**Proximity Checks: 5 seconds**
- Frequent checks for safety alerts when approaching destination
- Ensures timely notifications for delivery personnel

**Location Updates: 3 minutes (180 seconds)**
- Optimized for battery life while maintaining tracking capability
- Reduces network traffic and server load
- Sufficient for real-time tracking visualization

### Location Service:
- Uses existing `locationService` (no duplicate tracking)
- Efficient getCurrentLocation() (cached)
- No additional battery drain
- Only active during active orders

## Next Steps

### Current Implementation:
✅ **Dual-interval system implemented:**
   - Proximity checks: 5 seconds (safety alerts)
   - Location updates: 3 minutes (battery optimization)

### Recommended Enhancements:
1. **Dynamic interval based on status:**
   - Cooked: 5 minutes
   - Delivering: 3 minutes (current)
   - Near destination: 1 minute (when within 1km)

2. **Battery optimization:**
   - Reduce accuracy when far from destination
   - Increase interval when stationary
   - Pause updates when battery < 10%

3. **Offline handling:**
   - Queue location updates
   - Send when connection restored
   - Store locally with timestamps

4. **Analytics:**
   - Track location update success rate
   - Monitor battery impact
   - Optimize intervals based on data

## Summary

✅ Socket-based location tracking fully integrated
✅ Request-response system working
✅ Periodic updates during active orders
✅ Manual update function available
✅ Secure and privacy-conscious
✅ Battery-efficient design

The delivery app now provides real-time location tracking for admins and customers while maintaining security, privacy, and battery efficiency.

