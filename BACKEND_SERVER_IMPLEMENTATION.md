# Backend Server Implementation Guide

## Socket-Based Location Tracking - Server Side

This document explains how to implement the backend server to work with the integrated location tracking system.

## Server Setup

### 1. Basic Socket.IO Server

```javascript
// server.js
const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const jwt = require('jsonwebtoken');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Middleware to authenticate socket connections
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  
  if (!token) {
    return next(new Error('Authentication error: No token provided'));
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    socket.userId = decoded.userId;
    socket.userRole = decoded.role; // 'delivery', 'admin', 'customer'
    next();
  } catch (err) {
    next(new Error('Authentication error: Invalid token'));
  }
});

server.listen(3000, () => {
  console.log('Server running on port 3000');
});
```

## Location Tracking Implementation

### 2. Handle Location Updates from Delivery Personnel

```javascript
// Track online delivery personnel
const activeDeliveryPersons = new Map(); // deliveryPersonId -> socket

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.userId} (${socket.userRole})`);

  // Store delivery person socket
  if (socket.userRole === 'delivery') {
    activeDeliveryPersons.set(socket.userId, {
      socketId: socket.id,
      socket: socket,
      lastLocation: null,
      activeOrderId: null,
      connectedAt: new Date()
    });
    console.log(`Delivery person ${socket.userId} is now tracked`);
  }

  // Handle location updates from delivery personnel
  socket.on('locationUpdate', async (data) => {
    console.log('Location update received:', {
      deliveryPersonId: data.deliveryPersonId,
      location: data.location,
      orderId: data.activeOrderId
    });

    const {
      location,
      deliveryPersonId,
      deliveryPersonName,
      activeOrderId,
      orderStatus
    } = data;

    // Update delivery person's last known location
    if (activeDeliveryPersons.has(deliveryPersonId)) {
      const dpData = activeDeliveryPersons.get(deliveryPersonId);
      dpData.lastLocation = location;
      dpData.activeOrderId = activeOrderId;
      dpData.lastUpdate = new Date();
    }

    // Store in database (optional but recommended)
    try {
      await storeLocationInDatabase({
        deliveryPersonId,
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy: location.accuracy,
        timestamp: location.timestamp,
        orderId: activeOrderId,
        orderStatus: orderStatus,
        requestType: location.requestType
      });
    } catch (err) {
      console.error('Error storing location:', err);
    }

    // Forward location to relevant parties
    await forwardLocationUpdate(data, socket);
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.userId}`);
    if (socket.userRole === 'delivery') {
      activeDeliveryPersons.delete(socket.userId);
      console.log(`Delivery person ${socket.userId} removed from tracking`);
    }
  });
});
```

### 3. Forward Location to Admin Dashboard

```javascript
// Forward location updates to admin dashboard
async function forwardLocationUpdate(data, senderSocket) {
  const { location, deliveryPersonId, activeOrderId } = data;

  // 1. Forward to ALL admins (live map view)
  io.to('admins').emit('deliveryPersonLocation', {
    deliveryPersonId,
    deliveryPersonName: data.deliveryPersonName,
    location: {
      lat: location.latitude,
      lng: location.longitude,
      accuracy: location.accuracy,
      timestamp: location.timestamp
    },
    activeOrderId,
    orderStatus: data.orderStatus,
    requestType: location.requestType
  });

  // 2. If this is for a specific customer request
  if (location.customerId) {
    const customerRoom = `customer-${location.customerId}`;
    io.to(customerRoom).emit('deliveryLocation', {
      deliveryPersonName: data.deliveryPersonName,
      location: {
        lat: location.latitude,
        lng: location.longitude,
        accuracy: location.accuracy,
        timestamp: location.timestamp
      },
      orderId: location.orderId || activeOrderId,
      estimatedArrival: calculateETA(location, activeOrderId) // Your function
    });
  }

  // 3. If this is for a specific order tracking
  if (activeOrderId) {
    const orderRoom = `order-${activeOrderId}`;
    io.to(orderRoom).emit('orderLocationUpdate', {
      location: {
        lat: location.latitude,
        lng: location.longitude,
        accuracy: location.accuracy,
        timestamp: location.timestamp
      },
      orderStatus: data.orderStatus
    });
  }

  // 4. Broadcast to monitoring systems (analytics, etc.)
  if (location.requestType === 'periodic') {
    io.to('monitoring').emit('deliveryHeartbeat', {
      deliveryPersonId,
      location: {
        lat: location.latitude,
        lng: location.longitude
      },
      timestamp: location.timestamp
    });
  }
}
```

### 4. Customer Tracking (NEW & FINAL)

```javascript
// Track active tracking sessions
const activeTrackingSessions = new Map(); // customerId -> { orderId, deliveryPersonId, startTime }

io.on('connection', (socket) => {
  
  // Customer starts tracking their delivery
  socket.on('startTracking', async ({ orderId }) => {
    if (socket.userRole !== 'customer') {
      return socket.emit('error', { message: 'Unauthorized' });
    }

    console.log(`Customer ${socket.userId} started tracking order ${orderId}`);

    // Get order details
    const order = await getOrderById(orderId);
    
    if (!order || order.customerId !== socket.userId) {
      return socket.emit('error', { message: 'Order not found or unauthorized' });
    }

    const deliveryPersonId = order.deliveryPersonId;
    
    if (!deliveryPersonId) {
      return socket.emit('error', { message: 'No delivery person assigned yet' });
    }

    // Store tracking session
    activeTrackingSessions.set(socket.userId, {
      orderId,
      deliveryPersonId,
      startTime: new Date(),
      customerSocketId: socket.id
    });

    // Tell delivery person to start sending periodic updates
    const dpData = activeDeliveryPersons.get(deliveryPersonId);
    if (dpData && dpData.socket && dpData.socket.connected) {
      dpData.socket.emit('startPeriodicTracking', {
        customerId: socket.userId,
        orderId: orderId,
        requestId: `track-${Date.now()}`
      });

      // Also send immediate location if available
      if (dpData.lastLocation) {
        socket.emit('deliveryLocation', {
          location: dpData.lastLocation,
          orderId: orderId,
          lastUpdate: dpData.lastUpdate,
          deliveryPersonId: deliveryPersonId
        });
      } else {
        // Request immediate update for instant feedback
        dpData.socket.emit('requestLocationUpdate', {
          reason: 'customerStartedTracking'
        });
      }
    } else {
      // Delivery person offline, send last known location from DB
      const lastLocation = await getLastLocationFromDB(deliveryPersonId);
      socket.emit('deliveryLocation', {
        location: lastLocation,
        orderId: orderId,
        offline: true
      });
    }

    // Join order room for real-time updates
    socket.join(`order-${orderId}`);
    
    socket.emit('trackingStarted', { orderId });
  });

  // Customer stops tracking
  socket.on('stopTracking', async ({ orderId }) => {
    console.log(`Customer ${socket.userId} stopped tracking order ${orderId}`);

    const session = activeTrackingSessions.get(socket.userId);
    if (session && session.orderId === orderId) {
      // Tell delivery person to stop sending periodic updates
      const dpData = activeDeliveryPersons.get(session.deliveryPersonId);
      if (dpData && dpData.socket && dpData.socket.connected) {
        dpData.socket.emit('stopPeriodicTracking', {
          customerId: socket.userId
        });
      }

      activeTrackingSessions.delete(socket.userId);
    }

    socket.leave(`order-${orderId}`);
    socket.emit('trackingStopped', { orderId });
  });

  // Auto-stop tracking on disconnect
  socket.on('disconnect', () => {
    const session = activeTrackingSessions.get(socket.userId);
    if (session) {
      const dpData = activeDeliveryPersons.get(session.deliveryPersonId);
      if (dpData && dpData.socket && dpData.socket.connected) {
        dpData.socket.emit('stopPeriodicTracking', {
          customerId: socket.userId
        });
      }
      activeTrackingSessions.delete(socket.userId);
    }
  });
});
```

### 5. Room Management

```javascript
io.on('connection', (socket) => {
  // Join role-specific rooms
  if (socket.userRole === 'admin') {
    socket.join('admins');
    console.log(`Admin ${socket.userId} joined admins room`);
  }

  if (socket.userRole === 'delivery') {
    socket.join('deliveryGroup');
    socket.join(`delivery-${socket.userId}`);
    console.log(`Delivery person ${socket.userId} joined delivery rooms`);
  }

  if (socket.userRole === 'customer') {
    socket.join(`customer-${socket.userId}`);
    console.log(`Customer ${socket.userId} joined customer room`);
  }

  // Join order-specific room when order is active
  socket.on('joinOrder', ({ orderId }) => {
    socket.join(`order-${orderId}`);
    console.log(`User ${socket.userId} joined order room ${orderId}`);
  });

  socket.on('leaveOrder', ({ orderId }) => {
    socket.leave(`order-${orderId}`);
    console.log(`User ${socket.userId} left order room ${orderId}`);
  });
});
```

## Database Storage

### 6. Store Location Updates

```javascript
// MongoDB schema example
const LocationUpdateSchema = new mongoose.Schema({
  deliveryPersonId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DeliveryPerson',
    required: true,
    index: true
  },
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    index: true
  },
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: true
    }
  },
  accuracy: Number,
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  requestType: {
    type: String,
    enum: ['periodic', 'adminAll', 'customerOne', 'manual'],
    default: 'periodic'
  },
  orderStatus: String
});

// Geospatial index for location queries
LocationUpdateSchema.index({ location: '2dsphere' });

const LocationUpdate = mongoose.model('LocationUpdate', LocationUpdateSchema);

// Store location function
async function storeLocationInDatabase(data) {
  try {
    const locationUpdate = new LocationUpdate({
      deliveryPersonId: data.deliveryPersonId,
      orderId: data.orderId,
      location: {
        type: 'Point',
        coordinates: [data.longitude, data.latitude] // [lng, lat]
      },
      accuracy: data.accuracy,
      timestamp: new Date(data.timestamp),
      requestType: data.requestType,
      orderStatus: data.orderStatus
    });

    await locationUpdate.save();
    console.log(`Location stored for delivery person ${data.deliveryPersonId}`);
  } catch (err) {
    console.error('Error storing location:', err);
    throw err;
  }
}

// Get last location from database
async function getLastLocationFromDB(deliveryPersonId) {
  try {
    const lastUpdate = await LocationUpdate
      .findOne({ deliveryPersonId })
      .sort({ timestamp: -1 })
      .limit(1);

    if (!lastUpdate) return null;

    return {
      latitude: lastUpdate.location.coordinates[1],
      longitude: lastUpdate.location.coordinates[0],
      accuracy: lastUpdate.accuracy,
      timestamp: lastUpdate.timestamp.getTime()
    };
  } catch (err) {
    console.error('Error fetching last location:', err);
    return null;
  }
}
```

## API Endpoints

### 7. REST API for Location History

```javascript
// Get location history for a delivery person
app.get('/api/v1/delivery-persons/:id/location-history', async (req, res) => {
  try {
    const { id } = req.params;
    const { startDate, endDate, orderId } = req.query;

    const query = { deliveryPersonId: id };
    
    if (startDate && endDate) {
      query.timestamp = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    if (orderId) {
      query.orderId = orderId;
    }

    const locationHistory = await LocationUpdate
      .find(query)
      .sort({ timestamp: 1 })
      .limit(1000); // Limit results

    res.json({
      status: 'success',
      count: locationHistory.length,
      data: locationHistory.map(loc => ({
        latitude: loc.location.coordinates[1],
        longitude: loc.location.coordinates[0],
        accuracy: loc.accuracy,
        timestamp: loc.timestamp,
        orderId: loc.orderId,
        orderStatus: loc.orderStatus
      }))
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      message: err.message
    });
  }
});

// Get current location of all active delivery personnel
app.get('/api/v1/delivery-persons/locations/current', async (req, res) => {
  try {
    // Get from in-memory tracking
    const locations = Array.from(activeDeliveryPersons.entries())
      .filter(([_, dpData]) => dpData.lastLocation)
      .map(([deliveryPersonId, dpData]) => ({
        deliveryPersonId,
        location: {
          latitude: dpData.lastLocation.latitude,
          longitude: dpData.lastLocation.longitude,
          accuracy: dpData.lastLocation.accuracy,
          timestamp: dpData.lastLocation.timestamp
        },
        activeOrderId: dpData.activeOrderId,
        lastUpdate: dpData.lastUpdate,
        online: true
      }));

    res.json({
      status: 'success',
      count: locations.length,
      data: locations
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      message: err.message
    });
  }
});
```

## Testing

### 8. Test Socket Events

```javascript
// test-location-tracking.js
const io = require('socket.io-client');

// Test as delivery person
const deliverySocket = io('http://localhost:3000', {
  auth: {
    token: 'DELIVERY_PERSON_JWT_TOKEN'
  },
  transports: ['websocket']
});

deliverySocket.on('connect', () => {
  console.log('✅ Delivery person connected');

  // Listen for location requests
  deliverySocket.on('requestLocationUpdate', (data) => {
    console.log('📍 Location requested:', data);

    // Simulate sending location
    deliverySocket.emit('locationUpdate', {
      location: {
        latitude: 9.0320,
        longitude: 38.7469,
        accuracy: 10,
        timestamp: Date.now(),
        requestType: data.requestType,
        requestedBy: data.requestedBy,
        customerId: data.customerId
      },
      deliveryPersonId: 'test-delivery-person-id',
      deliveryPersonName: 'Test Driver',
      activeOrderId: 'test-order-id',
      orderStatus: 'Delivering'
    });

    console.log('✅ Location sent');
  });
});

// Test as admin
const adminSocket = io('http://localhost:3000', {
  auth: {
    token: 'ADMIN_JWT_TOKEN'
  },
  transports: ['websocket']
});

adminSocket.on('connect', () => {
  console.log('✅ Admin connected');

  // Request all delivery locations
  adminSocket.emit('requestAllDeliveryLocations', {});

  // Listen for location updates
  adminSocket.on('deliveryPersonLocation', (data) => {
    console.log('📍 Delivery person location received:', data);
  });

  adminSocket.on('deliveryLocationsSnapshot', (data) => {
    console.log('📊 Location snapshot:', data);
  });
});
```

## Complete Example

See the full implementation in `backend-location-tracking-complete.js` (example file).

## Security Considerations

1. **Authentication**: Always verify JWT tokens
2. **Authorization**: Check user roles before forwarding data
3. **Rate Limiting**: Prevent location spam
4. **Data Retention**: Implement cleanup policy for old locations
5. **Privacy**: Only share location with authorized users

## Monitoring

Add logging and monitoring:
- Track location update frequency
- Monitor socket connection stability
- Alert on missing location updates
- Track database write performance

