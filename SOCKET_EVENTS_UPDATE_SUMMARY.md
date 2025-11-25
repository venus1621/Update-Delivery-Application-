# Socket Events Update - Final Version

## ✅ Changes Completed

### 1. **Removed Old Events** (Outdated request-based system)
❌ Removed:
- `requestLocationUpdate` (old version with metadata)
- `stopLocationTracking` (old version)

### 2. **Added New Events** (Final & Correct System)
✅ Added:
- `startPeriodicTracking` - Starts 3-minute periodic location updates
- `stopPeriodicTracking` - Stops periodic location updates
- `requestLocationUpdate` (new version) - Force immediate location update only

---

## 📋 New Event Details

### Event 1: `startPeriodicTracking`
**When:** Customer opens tracking in their app  
**Payload from server:**
```javascript
{
  customerId: string,
  orderId: string,
  requestId: string
}
```

**What happens:**
1. Delivery app receives event
2. Immediately starts sending location every 3 minutes
3. First location sent immediately
4. Continues until stopped or disconnected

**Code in app:**
```javascript
socket.on('startPeriodicTracking', ({ customerId, orderId, requestId }) => {
  logger.log(`Customer ${customerId} started tracking order ${orderId}`);
  startPeriodicLocationUpdates(customerId, orderId);
});
```

---

### Event 2: `stopPeriodicTracking`
**When:** Customer closes tracking or leaves the page  
**Payload from server:**
```javascript
{
  customerId: string
}
```

**What happens:**
1. Delivery app receives event
2. Stops periodic location updates immediately
3. Clears interval
4. No more location updates sent

**Code in app:**
```javascript
socket.on('stopPeriodicTracking', ({ customerId }) => {
  logger.log(`Customer ${customerId} stopped tracking`);
  stopPeriodicLocationUpdates();
});
```

---

### Event 3: `requestLocationUpdate` (NEW VERSION)
**When:** Need instant location (optional, for better UX)  
**Payload from server:**
```javascript
{
  reason: 'customerStartedTracking' | 'orderAccepted' | string
}
```

**What happens:**
1. Sends location immediately (one-time)
2. Does NOT start periodic updates
3. Used for instant feedback when customer opens map

**Code in app:**
```javascript
socket.on('requestLocationUpdate', ({ reason }) => {
  if (reason === 'customerStartedTracking' || reason === 'orderAccepted') {
    const currentLocation = locationService.getCurrentLocation();
    if (currentLocation && socketRef.current?.connected) {
      socketRef.current.emit('locationUpdate', {
        location: {
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude,
          accuracy: currentLocation.accuracy || 10,
          timestamp: currentLocation.timestamp,
        },
      });
    }
  }
});
```

---

## 🔄 Complete Flow

### Customer Starts Tracking:
```
1. Customer opens tracking page
   ↓
2. Customer app → Server: "startTracking" event
   ↓
3. Server → Delivery app: "startPeriodicTracking" event
   ↓
4. Delivery app starts sending location every 3 minutes
   ↓
5. (Optional) Server → Delivery app: "requestLocationUpdate" for instant feedback
   ↓
6. Customer sees real-time location on map
```

### Customer Stops Tracking:
```
1. Customer closes tracking page
   ↓
2. Customer app → Server: "stopTracking" event
   ↓
3. Server → Delivery app: "stopPeriodicTracking" event
   ↓
4. Delivery app stops sending location updates
```

---

## 📊 Server-Side Implementation Example

### Customer App Side:
```javascript
// When customer opens tracking
socket.emit('startTracking', { orderId: 'ORD-12345' });

// When customer closes tracking
socket.emit('stopTracking', { orderId: 'ORD-12345' });
```

### Server Side:
```javascript
// Customer starts tracking
socket.on('startTracking', async ({ orderId }) => {
  const order = await getOrder(orderId);
  const deliveryPersonSocket = getDeliveryPersonSocket(order.deliveryPersonId);
  
  // Tell delivery person to start periodic updates
  deliveryPersonSocket.emit('startPeriodicTracking', {
    customerId: socket.userId,
    orderId: orderId,
    requestId: `track-${Date.now()}`
  });
  
  // Optional: Request immediate location for instant feedback
  deliveryPersonSocket.emit('requestLocationUpdate', {
    reason: 'customerStartedTracking'
  });
});

// Customer stops tracking
socket.on('stopTracking', ({ orderId }) => {
  const deliveryPersonSocket = getDeliveryPersonSocket(order.deliveryPersonId);
  
  deliveryPersonSocket.emit('stopPeriodicTracking', {
    customerId: socket.userId
  });
});
```

### Delivery App Side (Already Implemented):
```javascript
// Listen for start tracking
socket.on('startPeriodicTracking', ({ customerId, orderId }) => {
  // Send location every 3 minutes (180000ms)
  startPeriodicLocationUpdates(customerId, orderId);
});

// Listen for stop tracking
socket.on('stopPeriodicTracking', ({ customerId }) => {
  stopPeriodicLocationUpdates();
});

// Listen for immediate location request
socket.on('requestLocationUpdate', ({ reason }) => {
  // Send location immediately (one-time)
  if (reason === 'customerStartedTracking' || reason === 'orderAccepted') {
    sendLocationImmediately();
  }
});
```

---

## 🎯 Key Benefits

1. **Clear Intent:** Event names clearly indicate start/stop actions
2. **Efficient:** Only sends location when customer is actively tracking
3. **Battery Friendly:** 3-minute interval + stops when not needed
4. **Better UX:** Optional immediate update for instant feedback
5. **Robust:** Auto-stops on disconnect

---

## 🔒 Security Notes

- Always verify customer authorization before starting tracking
- Check if order belongs to requesting customer
- Track active sessions to prevent abuse
- Auto-cleanup on disconnect
- Rate limit tracking requests

---

## 📝 Migration Checklist

✅ Delivery App (Mobile):
- [x] Removed old `requestLocationUpdate` handler
- [x] Removed old `stopLocationTracking` handler
- [x] Added `startPeriodicTracking` handler
- [x] Added `stopPeriodicTracking` handler
- [x] Added new `requestLocationUpdate` handler (optional)
- [x] Updated socket cleanup to remove old events

⏳ Server (Backend):
- [ ] Implement `startTracking` handler (customer side)
- [ ] Implement `stopTracking` handler (customer side)
- [ ] Send `startPeriodicTracking` to delivery person
- [ ] Send `stopPeriodicTracking` to delivery person
- [ ] Handle location updates forwarding
- [ ] Track active tracking sessions

⏳ Customer App (Optional):
- [ ] Add "Track Delivery" button
- [ ] Emit `startTracking` when button clicked
- [ ] Emit `stopTracking` when page closed
- [ ] Display real-time location on map

---

## 🚀 Ready to Use!

The delivery app is now ready with the **final and correct** socket event system. The server just needs to implement the corresponding handlers to start/stop tracking sessions.

**Next Steps:**
1. Implement server-side handlers (see `BACKEND_SERVER_IMPLEMENTATION.md`)
2. Test with customer app
3. Monitor location update frequency
4. Optimize interval based on usage data

