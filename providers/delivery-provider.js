import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";
import { Alert, Vibration, Platform, ToastAndroid,AppState } from "react-native";
import { Audio } from 'expo-av';
import { isNotificationSoundEnabled } from '../utils/notification-settings';
// Note: removed persistent local storage for accepted orders - using in-memory state only
import NetInfo from "@react-native-community/netinfo";
import io from "socket.io-client";
import { useAuth } from "./auth-provider";
import locationService from "../services/location-service";
import proximityService from "../services/proximity-service";
import orderNotificationService from "../services/order-notification-service";
import databaseService from "../services/database-service";
import smartOrderService from "../services/smart-order-service";
import { transformOrderLocations } from '../utils/location-utils';
import { logger } from '../utils/logger';
import * as DeliveryAPI from '../services/delivery-api';
import { setShowOrderModalCallback, setHasActiveOrderCallback } from '../services/delivery-api';
import DeliveryOrderModal from '../components/DeliveryOrderModal';
import { normalizeOrder } from "../utils/normalizeOrder";
import { upsertOrder } from "../db/ordersDb";
import { checkNearbyOrders } from "../services/orderProximityService";
import { initProximitySettings } from "../utils/proximity-settings";
import { initRejectedOrders, addRejectedOrder, isOrderRejected } from "../utils/rejected-orders";

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


// 💵 Helper function to format currency safely
const formatCurrency = (value) => {
  const num = extractNumber(value);
  return num.toFixed(2);
};

const DeliveryContext = createContext();
export const useDelivery = () => useContext(DeliveryContext);

export const DeliveryProvider = ({ children }) => {
  const { userId, token, user } = useAuth();

  const [state, setState] = useState({
    availableOrders: [],
    deliveryHistory:[],
    availableOrdersCount: 0,
    activeOrder: null,
    pendingOrderPopup: null,
    showOrderModal: false,
    isConnected: false,
    isOnline: true,
    orderHistory: [],
    socket: null,
    broadcastMessages: [],
    newOrderNotification: false, // Track if there's a new order notification
    isLoadingOrders: false, // Loading state for API calls
    ordersError: null, // Error state for API calls
    acceptedOrder: null, // Store accepted order information (in-memory only)
    deliveryAnalytics: null, // Analytics data for delivery history
    isLoadingHistory: false, // Loading state for history API
    historyError: null, // Error state for history API
    isLoadingActiveOrder: false, // Loading state for active order API
    activeOrderError: null, // Error state for active order API
    currentLocation: null, // Current delivery guy location
    isLocationTracking: false, // Location tracking status
    locationError: null, // Location error state
    socketError: null, // Last socket connection error (user friendly)
    showDeliveryModal: false, // Show delivery order modal
    currentDeliveryOrder: null, // Current delivery order to display in modal
    
    // 🗄️ Cache Management
    dataCache: {
      availableOrders: { data: null, timestamp: null, fetched: false },
      activeOrder: { data: null, timestamp: null, fetched: false },
      deliveryHistory: { data: null, timestamp: null, fetched: false },
    },
    cacheExpiry: 5 * 60 * 1000, // 5 minutes cache expiry
  });

  const socketRef = useRef(null);
  const locationUnsubscribeRef = useRef(null);
  const periodicLocationIntervalRef = useRef(null); // Ref for periodic location updates (customer tracking)
  const notificationSoundRef = useRef(null); // Ref for new order notification sound
  const isPeriodicTrackingActive = useRef(false); // Track if customer is actively tracking
  const appState = useRef(AppState.currentState); // Track app state for background/foreground transitions
  const activeOrderRef = useRef(null); // Track active order for callback access

  // 🗄️ Cache Utility Functions
  const isCacheValid = useCallback((cacheKey) => {
    const cache = state.dataCache[cacheKey];
    if (!cache || !cache.fetched || !cache.timestamp) {
      return false;
    }
    const now = Date.now();
    const isValid = (now - cache.timestamp) < state.cacheExpiry;
    return isValid;
  }, [state.dataCache, state.cacheExpiry]);

  const updateCache = useCallback((cacheKey, data) => {
    setState(prev => ({
      ...prev,
      dataCache: {
        ...prev.dataCache,
        [cacheKey]: {
          data,
          timestamp: Date.now(),
          fetched: true,
        },
      },
    }));
  }, []);

  const clearCache = useCallback((cacheKey = null) => {
    if (cacheKey) {
      // Clear specific cache
      setState(prev => ({
        ...prev,
        dataCache: {
          ...prev.dataCache,
          [cacheKey]: { data: null, timestamp: null, fetched: false },
        },
      }));
    } else {
      // Clear all caches
      setState(prev => ({
        ...prev,
        dataCache: {
          availableOrders: { data: null, timestamp: null, fetched: false },
          activeOrder: { data: null, timestamp: null, fetched: false },
          deliveryHistory: { data: null, timestamp: null, fetched: false },
        },
      }));
    }
  }, []);

  // 🔔 Play new order notification sound
  const playNewOrderNotification = useCallback(async () => {
    try {
      // Check if notification sounds are enabled
      const soundEnabled = await isNotificationSoundEnabled();
      
      if (!soundEnabled) {
        Vibration.vibrate([0, 400, 200, 400]); // Two short bursts
        return;
      }

      // Configure audio to play in silent mode
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: true,
      });

      // Stop any existing notification sound
      if (notificationSoundRef.current) {
        await notificationSoundRef.current.unloadAsync();
        notificationSoundRef.current = null;
      }

      // Create notification sound - using a reliable notification tone
      // Try multiple sound sources with fallback
      const soundUrls = [
        'https://cdn.pixabay.com/audio/2022/03/10/audio_c0856b19d7.mp3', // Pleasant notification
        'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3', // Positive notification
        'https://freesound.org/data/previews/320/320655_5260872-lq.mp3', // Simple bell
      ];

      let soundLoaded = false;
      
      for (const soundUrl of soundUrls) {
        try {
          const { sound } = await Audio.Sound.createAsync(
            { uri: soundUrl },
            { 
              shouldPlay: true,
              isLooping: false, // Play once
              volume: 1.0
            }
          );
          
          notificationSoundRef.current = sound;
          soundLoaded = true;
          break; // Successfully loaded, exit loop
        } catch (err) {
          continue;
        }
      }

      // Vibrate to get attention (short pattern)
      Vibration.vibrate([0, 400, 200, 400]); // Two short bursts

      // Unload sound after it finishes playing
      if (soundLoaded) {
        setTimeout(async () => {
          if (notificationSoundRef.current) {
            await notificationSoundRef.current.unloadAsync();
            notificationSoundRef.current = null;
          }
        }, 3000);
      }
      
    } catch (err) {
      logger.error('❌ Error playing notification sound:', err);
      // Fallback to vibration only
      Vibration.vibrate([0, 400, 200, 400]);
    }
  }, []);


  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(net => {
      const online =
        !!net.isConnected &&
        (net.isInternetReachable === null || net.isInternetReachable === true);

      setState((prev) => ({ ...prev, isOnline: online }));
      logger.log(`🌐 Network: ${online ? "ONLINE" : "OFFLINE"}`);
    });

    // Set up callback for showing order modal from delivery-api proximity check
    setShowOrderModalCallback((order) => {
      logger.log('📦 Showing order modal from proximity check:', order.orderCode || order.orderId);
      setState(prev => ({
        ...prev,
        showDeliveryModal: true,
        currentDeliveryOrder: order,
      }));
    });

    // Set up callback for checking if driver has active order
    setHasActiveOrderCallback(() => {
      const activeOrder = activeOrderRef.current;
      if (activeOrder) {
        const orders = Array.isArray(activeOrder) ? activeOrder : [activeOrder];
        return orders.length > 0 && orders[0] != null;
      }
      return false;
    });

    return () => unsubscribe();
  }, []);

  // Keep activeOrderRef in sync with state
  useEffect(() => {
    activeOrderRef.current = state.activeOrder;
  }, [state.activeOrder]);

    useEffect(() => {
    const subscription = AppState.addEventListener("change", nextState => {
      const wasBackground = appState.current.match(/inactive|background/);
      appState.current = nextState;

      if (wasBackground && nextState === "active") {
        logger.log("📱 App returned to foreground — checking socket...");

        if (state.isOnline && socketRef.current && !socketRef.current.connected) {
          logger.log("♻️ Reconnecting socket...");
          socketRef.current.connect();
        }
      }
    });

    return () => subscription.remove();
  }, [state.isOnline]);

  // Reference for proximity check interval
  const proximityCheckIntervalRef = useRef(null);

  // 🔔 Handle nearby order found from proximity check
  const handleNearbyOrderFound = async (orderRow, distanceKm) => {
    const orderId = orderRow.order_id;
    
    // Check if driver has an active order - skip notification
    if (state.activeOrder) {
      const activeOrders = Array.isArray(state.activeOrder) ? state.activeOrder : [state.activeOrder];
      if (activeOrders.length > 0 && activeOrders[0]) {
        logger.log(`🚫 Skipping notification - driver has active order: ${activeOrders[0].orderCode || activeOrders[0].orderId}`);
        return;
      }
    }
    
    // Check if order was previously rejected - skip notification
    if (isOrderRejected(orderId)) {
      logger.log(`🚫 Skipping rejected order: ${orderRow.order_code}`);
      return;
    }
    
    logger.log(`🔔 Found nearby order: ${orderRow.order_code} at ${distanceKm.toFixed(2)}km`);
    
    // Create order payload for notification
    const order = {
      orderId: orderId,
      orderCode: orderRow.order_code,
      restaurantName: orderRow.restaurant_name,
      restaurantLocation: {
        latitude: orderRow.restaurant_lat,
        longitude: orderRow.restaurant_lng,
      },
      deliveryLocation: {
        latitude: orderRow.delivery_lat,
        longitude: orderRow.delivery_lng,
      },
      deliveryFee: orderRow.delivery_fee,
      tip: orderRow.tip,
      total: orderRow.total,
      createdAt: orderRow.created_at,
      distanceKm,
    };
    
    // Show notification with sound
    await orderNotificationService.showNewOrderNotification(order);
    
    // Play notification sound
    await playNewOrderNotification();
    
    // Show order modal
    setState(prev => ({
      ...prev,
      showDeliveryModal: true,
      currentDeliveryOrder: order,
    }));
    
    logger.log('✅ Nearby order notification shown and modal opened');
  };

  // 📍 Initialize location tracking, database, and audio
  useEffect(() => {
    const initializeLocationTracking = async () => {
      try {
        // Initialize database first
        await databaseService.init();
        logger.log('✅ Database initialized');

        // Configure audio mode for maximum compatibility
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          staysActiveInBackground: true,
          shouldDuckAndroid: true,
        });

        // Subscribe to location updates (for state updates only, not for sending)
        locationUnsubscribeRef.current = locationService.subscribe((location) => {
          setState((prev) => ({ 
            ...prev, 
            currentLocation: location,
            isLocationTracking: true,
            locationError: null
          }));
        });

        // Start location tracking
        await locationService.startLocationTracking();

        // Initialize notification service for background notifications
        await orderNotificationService.initNotifications();
        logger.log('✅ Order notification service initialized');

        // Initialize proximity settings (load saved radius)
        const radius = await initProximitySettings();
        logger.log(`📍 Proximity radius loaded: ${radius}km`);

        // Initialize rejected orders list
        await initRejectedOrders();
        logger.log('📦 Rejected orders list initialized');

        // 🔔 Start periodic proximity check for nearby orders
        logger.log('🚀 Starting periodic proximity check (every 15 seconds)');
        
        // Initial check after 5 seconds
        setTimeout(() => {
          logger.log('📍 Running initial proximity check...');
          checkNearbyOrders({
            onNear: handleNearbyOrderFound
          });
        }, 5000);

        // Periodic check every 15 seconds
        proximityCheckIntervalRef.current = setInterval(() => {
          logger.log('📍 Running periodic proximity check...');
          checkNearbyOrders({
            onNear: handleNearbyOrderFound
          });
        }, 15000);

      } catch (err) {
        const message = err?.message || String(err) || 'Unknown error';
        logger.error('Error initializing location tracking:', err);
        setState(prev => ({
          ...prev,
          locationError: message,
          isLocationTracking: false
        }));
      }
    };

    initializeLocationTracking();

    // Cleanup on unmount
    return () => {
      if (locationUnsubscribeRef.current) {
        locationUnsubscribeRef.current();
      }
      if (proximityCheckIntervalRef.current) {
        clearInterval(proximityCheckIntervalRef.current);
      }
      // Stop alarm and vibration
      proximityService.stopProximityAlarm();
      
      // Clean up notification service
      orderNotificationService.cleanup();
      
      // Clean up smart order service
      smartOrderService.cleanup();
      
      // Clean up notification sound
      if (notificationSoundRef.current) {
        notificationSoundRef.current.unloadAsync().catch(console.error);
        notificationSoundRef.current = null;
      }
    };
  }, [userId]);

  // 🎯 Start/stop smart order monitoring based on online status
  useEffect(() => {
    if (state.isOnline) {
      logger.log('🟢 Going online - starting smart order monitoring');
      
      // Sync pending orders from database
      smartOrderService.syncFromDatabase();
      
      // Start monitoring location against pending orders
      smartOrderService.startMonitoring(
        () => locationService.getCurrentLocation(),
        (order) => {
          // Show order modal when driver is near
          setState(prev => ({
            ...prev,
            showDeliveryModal: true,
            currentDeliveryOrder: order,
          }));
        }
      );
    } else {
      logger.log('🔴 Going offline - stopping smart order monitoring');
      smartOrderService.stopMonitoring();
    }

    // Cleanup when component unmounts or isOnline changes
    return () => {
      if (!state.isOnline) {
        smartOrderService.stopMonitoring();
      }
    };
  }, [state.isOnline]);

  // 🚨 Force online and location on when there's ANY active order
  useEffect(() => {
    const checkAndForceDeliveryMode = async () => {
      if (!state.activeOrder) return;
  
      const hasActiveOrder = Array.isArray(state.activeOrder) 
        ? state.activeOrder.length > 0 
        : true;
  
      if (hasActiveOrder) {
        let needsAlert = false;
        let alertMessage = '';
  
        // Force online
        if (!state.isOnline) {
          needsAlert = true;
          alertMessage += '📶 Going ONLINE for active order\n';
          setState((prev) => ({ ...prev, isOnline: true }));
        }
  
        // Force location tracking
        if (!state.isLocationTracking) {
          needsAlert = true;
          alertMessage += '📍 Enabling LOCATION for order tracking\n';
          try {
            await locationService.startLocationTracking();
            setState((prev) => ({ 
              ...prev, 
              isLocationTracking: true,
              locationError: null
            }));
          } catch (err) {
            logger.error('Error forcing location:', err);
  
            // Still show important alert if location fails
            Alert.alert(
              "⚠️ Location Required",
              "Please enable location permissions from Settings.",
              [{ text: 'OK' }]
            );
          }
        }
  
        // Instead of Alert.alert, use Toast
        if (needsAlert && alertMessage) {
          if (Platform.OS === 'android') {
            ToastAndroid.show(
              alertMessage.replace(/\n/g, '  '),
              ToastAndroid.LONG
            );
          } else {
            // iOS fallback: no blocking alert
            console.log("INFO:", alertMessage);
          }
        }
      }
    };
  
    checkAndForceDeliveryMode();
  }, [state.activeOrder, state.isOnline, state.isLocationTracking]);

  // 📍 Proximity checking using proximity service (BACKGROUND MODE)
  useEffect(() => {
    // Helper function to get active orders as array
    const getActiveOrders = () => {
      const activeOrders = Array.isArray(state.activeOrder) 
        ? state.activeOrder 
        : (state.activeOrder ? [state.activeOrder] : []);
      return activeOrders;
    };

    // Helper function to get current location
    const getCurrentLocation = () => {
      return locationService.getCurrentLocation();
    };

    if (!userId || !state.isLocationTracking || !state.activeOrder) {
      // Stop proximity checking if not tracking or no active order
      proximityService.stopBackgroundTracking();
      return;
    }

    // Start background proximity tracking (works even when app is minimized/screen off)
    const startTracking = async () => {
      try {
        const success = await proximityService.startBackgroundTracking(
          getActiveOrders, 
          getCurrentLocation
        );
        
        if (success) {
          logger.log('✅ Background proximity tracking started');
        } else {
          logger.warn('⚠️ Background tracking failed, falling back to foreground mode');
          // Fallback to foreground-only tracking
          proximityService.startProximityChecking(getActiveOrders, getCurrentLocation);
        }
      } catch (error) {
        logger.error('❌ Error starting background tracking:', error);
        // Fallback to foreground-only tracking
        proximityService.startProximityChecking(getActiveOrders, getCurrentLocation);
      }
    };

    startTracking();

    // Cleanup on unmount or dependency change
    return () => {
      proximityService.stopBackgroundTracking();
      proximityService.stopProximityChecking();
    };
  }, [userId, state.isLocationTracking, state.activeOrder]);

  // 🔄 Start periodic location updates (called when customer requests tracking)
  const startPeriodicLocationUpdates = useCallback((customerId, orderId) => {
    // Stop any existing periodic updates first
    stopPeriodicLocationUpdates();

    logger.log(`🔄 Starting periodic location updates for customer ${customerId}, order ${orderId}`);
    isPeriodicTrackingActive.current = true;

    const locationUpdateIntervalMs = 10000; // 10 seconds (adjust as needed)

    // Send location immediately and periodically
    const sendPeriodicLocation = () => {
      const currentLocation = locationService.getCurrentLocation();
      if (!currentLocation) {
        logger.warn('⚠️ No location available for periodic update');
        return;
      }

      if (!socketRef.current || !socketRef.current.connected) {
        logger.warn('⚠️ Socket not connected, stopping periodic updates');
        stopPeriodicLocationUpdates();
        return;
      }

      const payload = {
        location: {
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude,
          accuracy: currentLocation.accuracy || 10,
          timestamp: currentLocation.timestamp,
          orderId: orderId,
          customerId: customerId,
          deliveryPersonId: userId,
          deliveryPersonName: user?.firstName && user?.lastName 
            ? `${user.firstName} ${user.lastName}` 
            : 'Delivery Person',
        },
      };

      // Send location update to customer via backend
      socketRef.current.emit('locationUpdateFromCustomerTracking', payload);
     
      logger.log(`📍 Periodic location update sent for order ${orderId}`);
    };

    // Send first location immediately
    sendPeriodicLocation();
    
    // Set up interval for periodic updates
    periodicLocationIntervalRef.current = setInterval(sendPeriodicLocation, locationUpdateIntervalMs);
    
    logger.log(`✅ Periodic location updates started (${locationUpdateIntervalMs / 1000}s interval)`);
  }, [userId, user]);




  // 🛑 Stop periodic location updates
  const stopPeriodicLocationUpdates = useCallback(() => {
    if (periodicLocationIntervalRef.current) {
      clearInterval(periodicLocationIntervalRef.current);
      periodicLocationIntervalRef.current = null;
      isPeriodicTrackingActive.current = false;
      logger.log('🛑 Periodic location updates stopped');
    }
  }, []);





  // 🔌 Connect to socket server with authentication
  // Socket connects ONLY when user is ONLINE
  useEffect(() => {
    if (!token || !userId) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setState(prev => ({ ...prev, isConnected: false, socket: null }));
      }
      return;
    }

    // Offline? Disconnect (unless active order)
    if (!state.isOnline) {
      if (!state.activeOrder) {
        if (socketRef.current) {
          socketRef.current.disconnect();
          socketRef.current = null;
        }
        setState(prev => ({ ...prev, isConnected: false, socket: null }));
        return;
      }

      // If rider has active order → force stay online
      setState(prev => ({ ...prev, isOnline: true }));
      return;
    }

    // If we already have a connected socket, do nothing
    if (socketRef.current?.connected) return;

    // Create socket (with reconnection config)
    const socket = io("https://api.bahirandelivery.cloud", {
      transports: ["websocket"],
      auth: { token },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 4000,
    });

    socketRef.current = socket;

    /***********************************************************
     * 🔌 Connection Events
     ***********************************************************/
    socket.on("connect", () => {
      setState(prev => ({ ...prev, isConnected: true }));
      logger.log("🟢 Socket connected");
    });

    socket.on("disconnect", async () => {
      setState(prev => ({ ...prev, isConnected: false }));
      stopPeriodicLocationUpdates();
      await proximityService.stopBackgroundTracking();
      proximityService.stopProximityChecking();
      logger.log("🔴 Socket disconnected");
    });

    socket.on("reconnect_attempt", attempt => {
      logger.log(`♻️ Socket reconnect attempt #${attempt}`);
    });

    socket.on("reconnect", () => {
      logger.log("🎉 Socket successfully reconnected");
      setState(prev => ({ ...prev, isConnected: true }));
    });

    /***********************************************************
     * 📦 Delivery Order Message
     ***********************************************************/
socket.on("deliveryMessage", async (message) => {
  logger.log("📦 Raw socket message received:", JSON.stringify(message).substring(0, 500));
  
  let raw = message;
  if (typeof raw === "string") {
    try { raw = JSON.parse(raw); } catch {}
  }
  if (Array.isArray(raw)) raw = raw[0];

  const order = normalizeOrder(raw);
  
  if (!order) {
    logger.error("❌ Failed to normalize order from socket");
    return;
  }

  logger.log("📦 New delivery order received:", order.orderCode);
  logger.log(`   Restaurant: ${order.restaurantName}`);
  logger.log(`   Delivery Fee: ${order.deliveryFee}, Tip: ${order.tip}, Total: ${order.grandTotal}`);
  
  // Check if driver has an active order - skip notification
  if (state.activeOrder) {
    const activeOrders = Array.isArray(state.activeOrder) ? state.activeOrder : [state.activeOrder];
    if (activeOrders.length > 0 && activeOrders[0]) {
      logger.log(`🚫 Skipping socket order - driver has active order: ${activeOrders[0].orderCode || activeOrders[0].orderId}`);
      return;
    }
  }
  
  // Check if order is rejected
  if (isOrderRejected(order.orderId)) {
    logger.log(`🚫 Skipping rejected order from socket: ${order.orderCode}`);
    return;
  }

  // Get current location
  const currentLocation = locationService.getCurrentLocation();

  // Use smart order service to handle proximity checking
  await smartOrderService.handleNewOrder(
    order,
    currentLocation,
    (orderToShow) => {
      // Callback to show order modal when driver is near
      setState(prev => ({
        ...prev,
        showDeliveryModal: true,
        currentDeliveryOrder: orderToShow,
      }));
    }
  );

});

    /***********************************************************
     * 🔥 Location Requests (Server & Admin)
     ***********************************************************/
    socket.on("requestLocationUpdate", ({ reason }) => {
      logger.log(`📡 Server requested location (${reason})`);

      const loc = locationService.getCurrentLocation();
      if (!loc || !socketRef.current?.connected) return;

      const act = state.activeOrder;
      const firstOrder = Array.isArray(act) ? act[0] : act;

      if (firstOrder) {
        socketRef.current.emit("locationUpdateFromCustomerTracking", {
          location: {
            latitude: loc.latitude,
            longitude: loc.longitude,
            accuracy: loc.accuracy || 10,
            timestamp: loc.timestamp,
            orderId: firstOrder._id || firstOrder.orderId,
            customerId: firstOrder.userId || firstOrder.customerId,
            deliveryPersonId: userId,
          },
        });
      }
    });

    socket.on("requestLocationUpdateForAdmin", ({ requestedBy, reason }) => {
      logger.log(`👨‍💼 Admin ${requestedBy} requested location (${reason})`);

      const loc = locationService.getCurrentLocation();
      if (!loc || !socketRef.current?.connected) return;

      socketRef.current.emit("locationUpdateForAdmin", {
        requestedBy,
        deliveryPersonId: userId,
        deliveryPersonName: user?.firstName + " " + user?.lastName,
        deliveryPersonPhone: user?.phone,
        location: {
          latitude: loc.latitude,
          longitude: loc.longitude,
          accuracy: loc.accuracy || 10,
          timestamp: loc.timestamp,
        },
      });
    });

    /***********************************************************
     * Customer Tracking (Start / Stop)
     ***********************************************************/
    socket.on("startPeriodicTracking", ({ customerId, orderId }) => {
      logger.log(`👤 Customer started tracking order ${orderId}`);
      startPeriodicLocationUpdates(customerId, orderId);
    });

    socket.on("stopPeriodicTracking", () => {
      logger.log(`👤 Customer stopped tracking`);
      stopPeriodicLocationUpdates();
    });

    /***********************************************************
     * Cleanup
     ***********************************************************/
    return () => {
      socket.off();
      socket.disconnect();
      stopPeriodicLocationUpdates();
    };
  }, [
    token,
    userId,
    user,
    state.isOnline,
    state.activeOrder,
  ]);







  
  // Note: persistent local storage for accepted orders has been removed.

// ✅ API FUNCTIONS BELOW WORK INDEPENDENTLY OF SOCKET/ONLINE STATUS
// These functions use direct HTTP calls and work whether you're online or offline

// 📦 Fetch active orders - WORKS WITHOUT SOCKET CONNECTION
const fetchActiveOrder = useCallback(
  async (status) => {
    if (!status || !token) return;

    setState(prev => ({ 
      ...prev, 
      isLoadingActiveOrder: true, 
      activeOrderError: null,
    }));

    const result = await DeliveryAPI.fetchOrdersByStatus(status, token);
    
    if (result.success) {
      setState(prev => ({
        ...prev,
        isLoadingActiveOrder: false,
        activeOrder: result.data.length > 0 ? result.data : null,
      }));
    } else {
      setState(prev => ({
        ...prev,
        isLoadingActiveOrder: false,
        activeOrderError: result.error,
      }));
    }
  },
  [token]
);

// 🔄 Fetch all active orders (Cooked + Delivering) - Helper function for refresh
const fetchAllActiveOrders = useCallback(async (forceRefresh = false) => {
  if (!token) return;
  
  // 🗄️ Check cache first (skip if forceRefresh)
  if (!forceRefresh && isCacheValid('activeOrder')) {
    const cachedData = state.dataCache.activeOrder.data;
    logger.log('📦 Using cached active orders');
    setState(prev => ({
      ...prev,
      activeOrder: cachedData,
      isLoadingActiveOrder: false,
    }));
    return;
  }
  
  // Clear active orders first
  setState(prev => ({ 
    ...prev, 
    isLoadingActiveOrder: true, 
    activeOrderError: null,
    activeOrder: null // Clear old data
  }));

  const result = await DeliveryAPI.fetchAllActiveOrders(token);
  
  if (result.success) {
    // 🗄️ Update state and cache
    updateCache('activeOrder', result.data);
    
    setState(prev => ({
      ...prev,
      isLoadingActiveOrder: false,
      activeOrder: result.data,
    }));
  } else {
    setState(prev => ({
      ...prev,
      isLoadingActiveOrder: false,
      activeOrderError: result.error,
    }));
  }
}, [token, isCacheValid, updateCache, state.dataCache]);

// 📋 Fetch available orders - WORKS WITHOUT SOCKET CONNECTION
const fetchAvailableOrders = useCallback(async (forceRefresh = false) => {
  if (!token) {
    setState((prev) => ({
      ...prev,
      isLoadingOrders: false,
      ordersError: "Authentication required. Please log in again.",
    }));
    return;
  }

  // 🗄️ Check cache first (skip if forceRefresh)
  if (!forceRefresh && isCacheValid('availableOrders')) {
    const cachedData = state.dataCache.availableOrders.data;
    logger.log('📦 Using cached available orders');
    setState((prev) => ({
      ...prev,
      availableOrders: cachedData.orders || [],
      availableOrdersCount: cachedData.count || 0,
      isLoadingOrders: false,
    }));
    return;
  }

  // Clear existing available orders before fetching new data
  setState((prev) => ({
    ...prev,
    isLoadingOrders: true,
    ordersError: null,
    availableOrders: [], // Clear old data first
    availableOrdersCount: 0,
  }));

  const result = await DeliveryAPI.fetchAvailableOrders(token);
  
  if (result.success) {
    // 🗄️ Update state and cache
    const cacheData = {
      orders: result.data,
      count: result.count,
    };
    
    updateCache('availableOrders', cacheData);
    
    setState((prev) => ({
      ...prev,
      availableOrders: result.data,
      availableOrdersCount: result.count,
      isLoadingOrders: false,
    }));
  } else {
    setState((prev) => ({
      ...prev,
      isLoadingOrders: false,
      ordersError: result.error,
    }));
  }
}, [token, isCacheValid, updateCache, state.dataCache]);
  // 📦 Accept order function - REQUIRES SOCKET CONNECTION (only works when ONLINE)
  const acceptOrder = useCallback(async (orderId, deliveryPersonId) => {
    if (!socketRef.current) {
      Alert.alert("Error", "Not connected to server. Please go ONLINE to accept orders.");
      return false;
    }

    if (!socketRef.current.connected) {
      Alert.alert("Error", "Socket not connected to server. Please go ONLINE to accept orders.");
      return false;
    }

    if (!deliveryPersonId) {
      Alert.alert("Error", "Delivery person ID not found");
      return false;
    }

    return new Promise((resolve) => {
    try {
      
        
        // Emit acceptOrder event to socket server
        socketRef.current.emit('acceptOrder', { orderId, deliveryPersonId }, (response) => {
          
          if (response && response.status === 'success') {
            
            // Transform locations from backend response
            const transformedResponseData = transformOrderLocations(response.data || {});
            
            // Store accepted order information using server response data
        const acceptedOrderData = {
          orderId: orderId,
          deliveryPersonId: deliveryPersonId,
              orderCode: response.data?.orderCode || `ORD-${orderId.slice(-6)}`,
              pickUpVerification: response.data?.pickUpVerification || 'N/A',
              message: response.message || 'Order accepted successfully',
          acceptedAt: new Date().toISOString(),
              // Additional order details from server (with transformed locations)
              restaurantLocation: transformedResponseData.restaurantLocation,
              deliveryLocation: transformedResponseData.deliveryLocation || transformedResponseData.deliverLocation,
              destinationLocation: transformedResponseData.destinationLocation || transformedResponseData.deliverLocation,
              deliveryFee: extractNumber(response.data?.deliveryFee),
              tip: extractNumber(response.data?.tip),
              distanceKm: response.data?.distanceKm || 0,
              description: response.data?.description || '',
              status: response.data?.status || 'Accepted',
        };

        const activeOrderData = {
          orderId,
          deliveryPersonId,
          orderCode: response.data?.orderCode || `ORD-${orderId.slice(-6)}`,
          deliveryVerificationCode: response.data?.pickUpVerification || 'N/A',
          restaurantLocation: transformedResponseData.restaurantLocation,
          deliveryLocation: transformedResponseData.deliveryLocation || transformedResponseData.deliverLocation,
          destinationLocation: transformedResponseData.destinationLocation || transformedResponseData.deliverLocation,
          deliveryFee: extractNumber(response.data?.deliveryFee),
          tip: extractNumber(response.data?.tip),
          distanceKm: response.data?.distanceKm || 0,
          description: response.data?.description || '',
          status: response.data?.status || 'Accepted',
        };

        setState((prev) => ({
          ...prev,
          acceptedOrder: acceptedOrderData,
          activeOrder: activeOrderData,
          availableOrders: prev.availableOrders.filter(
            (o) => o.orderId !== orderId
          ),
          availableOrdersCount: Math.max(0, prev.availableOrdersCount - 1),
          showOrderModal: false,
          pendingOrderPopup: null,
        }));

      
            // Calculate total earnings (handle MongoDB Decimal128 format)
            const deliveryFee = extractNumber(response.data?.deliveryFee);
            const tip = extractNumber(response.data?.tip);
            const totalEarnings = deliveryFee + tip;

        // Immediately fetch active orders to update the state
        fetchActiveOrder('Cooked').catch(e => logger.error('Error fetching cooked orders:', e));
        fetchActiveOrder('Delivering').catch(e => logger.error('Error fetching delivering orders:', e));

        // Remove order from smart order service pending list
        smartOrderService.removeOrder(orderId);
        logger.log(`🗑️ Removed order ${orderId} from smart order service`);

        // Log success details to console (no blocking alert)
        
        // Show quick toast notification on Android (non-blocking)
        if (Platform.OS === 'android') {
          ToastAndroid.show(
            `✅ Order ${response.data?.orderCode || 'N/A'} accepted!`,
            ToastAndroid.SHORT
          );
        }
        
            resolve(true);
      } else {            
            // Handle error response from socket (matches server error format)
            const errorMessage = response.message || 'Failed to accept order';
            
            if (errorMessage.includes('You already have an active order')) {
              Alert.alert(
                "🚫 Active Order Conflict",
                "⚠️ You already have an active order in progress!\n\n💡 Please complete or cancel your current order before accepting a new one.",
                [
                  { text: 'Got it', style: 'default' }
                ]
              );
            } else if (errorMessage.includes('Order is not available for acceptance')) {
              Alert.alert(
                "😔 Order No Longer Available",
                "❌ This order is no longer available for acceptance.\n\n👥 It may have been taken by another delivery person.\n\n🔄 Please refresh the orders list to see new available orders.",
                [
                  { text: 'OK', style: 'default' }
                ]
              );
            } else if (errorMessage.includes('Order ID is required')) {
              Alert.alert(
                "⚠️ Invalid Request",
                "❌ Order ID is missing from your request.\n\n🔄 Please try again or contact support if the issue persists.",
                [
                  { text: 'Try Again', style: 'default' }
                ]
              );
            } else if (errorMessage.includes('Invalid order ID')) {
              Alert.alert(
                "⚠️ Invalid Order ID",
                "❌ The order ID provided is not valid.\n\n🔄 Please try again or contact support if the issue persists.",
                [
                  { text: 'Try Again', style: 'default' }
                ]
              );
            } else {
            Alert.alert(
                "❌ Order Acceptance Failed",
                `⚠️ ${errorMessage}\n\n🔄 Please try again or contact support if the issue persists.`,
                [
                  { text: 'Try Again', style: 'default' }
                ]
              );
            }
            
            resolve(false);
          }
        });
        
        // Add timeout to handle cases where server doesn't respond
        setTimeout(() => {
          Alert.alert(
            "⏰ Request Timeout",
            "The server didn't respond in time. Please check your connection and try again.",
            [
              { text: 'OK', style: 'default' }
            ]
          );
          resolve(false);
        }, 10000); // 10 second timeout
      } catch (err) {
        logger.error("❌ Error accepting order:", err);
            Alert.alert(
          "🌐 Connection Error",
          "❌ Unable to send order acceptance request.\n\n📶 Please check your connection and try again.",
          [
            { text: 'Try Again', style: 'default' }
          ]
        );
        resolve(false);
      }
    });
  }, [fetchActiveOrder]);

  // 🚨 Check if there's ANY active order (regardless of status)
  const hasActiveDelivery = useCallback(() => {
    if (!state.activeOrder) return false;
    
    // If activeOrder exists and is not null/undefined, return true
    if (Array.isArray(state.activeOrder)) {
      return state.activeOrder.length > 0;
    }
    
    // Single order object exists
    return true;
  }, [state.activeOrder]);

  // Toggle online status with active order check
  const toggleOnlineStatus = useCallback(() => {
    // Check if trying to go offline while having an active order
    if (state.isOnline && hasActiveDelivery()) {
      Alert.alert(
        "⚠️ Cannot Go Offline",
        "You have an active order. You must complete or cancel the order before going offline.\n\n📦 Complete your current order first.",
        [{ text: 'OK', style: 'default' }]
      );
      return;
    }
    
    setState((prev) => ({ ...prev, isOnline: !prev.isOnline }));
  }, [state.isOnline, hasActiveDelivery]);

  const showOrderModalFn = useCallback((order) => {
    setState((prev) => ({
      ...prev,
      pendingOrderPopup: order,
      showOrderModal: true,
    }));
  }, []);

  const hideOrderModal = useCallback(() => {
    setState((prev) => ({ 
      ...prev, 
      showOrderModal: false, 
      pendingOrderPopup: null,
      newOrderNotification: false // Clear notification when modal is closed
    }));
  }, []);

  const acceptOrderFromModal = useCallback(
    async (order, onSuccessCallback) => {
      const success = await acceptOrder(order.orderId, userId);
      if (success) {
        hideOrderModal();
        
        // Fetch active orders to refresh the state
        await Promise.all([
          fetchActiveOrder('Cooked'),
          fetchActiveOrder('Delivering'),
        ]);
        
        // Call success callback if provided (for navigation)
        if (onSuccessCallback) {
          onSuccessCallback();
        }
      }
    },
    [acceptOrder, userId, hideOrderModal, fetchActiveOrder]
  );

  const declineOrder = useCallback((order) => {
    // Remove order from smart order service
    const orderId = order.orderId || order.id || order._id;
    if (orderId) {
      smartOrderService.removeOrder(orderId);
      logger.log(`🗑️ Removed declined order ${orderId} from smart order service`);
    }

    setState((prev) => ({
      ...prev,
      availableOrders: prev.availableOrders.filter(
        (o) => o.orderId !== order.orderId
      ),
      availableOrdersCount: Math.max(0, prev.availableOrdersCount - 1),
      showOrderModal: false,
      pendingOrderPopup: null,
    }));
  }, []);

  const handleAcceptDeliveryOrder = useCallback(async () => {
    const order = state.currentDeliveryOrder;
    if (!order || !order.orderId) {
      logger.error('No order to accept');
      return;
    }
    
    logger.log('Accepting delivery order:', order.orderId);
    
    // Close the modal first
    setState((prev) => ({
      ...prev,
      showDeliveryModal: false,
    }));
    
    // Accept the order
    const success = await acceptOrder(order.orderId, userId);
    
    if (success) {
      // Fetch active orders to refresh the state
      await Promise.all([
        fetchActiveOrder('Cooked'),
        fetchActiveOrder('Delivering'),
      ]);
      
      Alert.alert(
        '✅ Order Accepted',
        `You have successfully accepted order ${order.orderCode}`,
        [{ text: 'OK' }]
      );
    }
    
    // Clear the current delivery order
    setState((prev) => ({
      ...prev,
      currentDeliveryOrder: null,
    }));
  }, [state.currentDeliveryOrder, acceptOrder, userId, fetchActiveOrder]);

  const handleDeclineDeliveryOrder = useCallback(async () => {
    logger.log('Declining delivery order');
    
    // Remove order from smart order service and add to rejected list
    if (state.currentDeliveryOrder) {
      const orderId = state.currentDeliveryOrder.orderId || state.currentDeliveryOrder.id || state.currentDeliveryOrder._id;
      if (orderId) {
        smartOrderService.removeOrder(orderId);
        
        // Add to rejected orders list so it won't show notification again
        await addRejectedOrder(orderId);
        
        logger.log(`🚫 Order ${orderId} declined and added to rejected list`);
      }
    }
    
    setState((prev) => ({
      ...prev,
      showDeliveryModal: false,
      currentDeliveryOrder: null,
    }));
    
    // Optionally show a toast or message
    if (Platform.OS === 'android') {
      ToastAndroid.show('Order declined - won\'t notify again', ToastAndroid.SHORT);
    }
  }, [state.currentDeliveryOrder]);

  const joinDeliveryMethod = useCallback((method) => {
  }, []);

  const clearBroadcastMessages = useCallback(() => {
    setState((prev) => ({ ...prev, broadcastMessages: [] }));
  }, []);

  const clearNewOrderNotification = useCallback(() => {
    setState((prev) => ({ ...prev, newOrderNotification: false }));
  }, []);

  // 🧹 Clear all delivery data (for logout)
  const clearDeliveryData = useCallback(async () => {
    try {
      
      // Disconnect socket
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      
      // Clear periodic location updates
      stopPeriodicLocationUpdates();
      
      // Stop proximity alarm and vibration
      await proximityService.stopProximityAlarm();
      
      // Clean up notification sound
      if (notificationSoundRef.current) {
        await notificationSoundRef.current.unloadAsync();
        notificationSoundRef.current = null;
      }
      
      // Clear stored order data
      // persistent storage for orders removed; nothing to clear
      
      // Reset state
      setState((prev) => ({
        ...prev,
        availableOrders: [],
        availableOrdersCount: 0,
        activeOrder: null,
        pendingOrderPopup: null,
        showOrderModal: false,
        isConnected: false,
        isOnline: false,
        orderHistory: [],
        socket: null,
        broadcastMessages: [],
        newOrderNotification: false,
        isLoadingOrders: false,
        ordersError: null,
        acceptedOrder: null,
        // storedOrder and related persistent flags removed
        deliveryAnalytics: null,
        isLoadingHistory: false,
        historyError: null,
        isLoadingActiveOrder: false,
        activeOrderError: null,
      }));
      
    } catch (error) {
      logger.error('❌ Error clearing delivery data:', error);
    }
  }, [stopPeriodicLocationUpdates]);

  // 🔁 Attempt to reconnect the socket (exposed to UI)
  const reconnectSocket = useCallback(() => {
    try {
      // Clear previous socket error in UI while attempting reconnect
      setState((prev) => ({ ...prev, socketError: null }));

      if (socketRef.current) {
        // If socket exists, try to reconnect
        socketRef.current.connect();
        return true;
      }

      // If no socket instance exists, attempt to create one (minimal setup)
      if (!token || !userId) {
        setState((prev) => ({ ...prev, socketError: 'Authentication required to connect.' }));
        return false;
      }

      const s = io("https://api.bahirandelivery.cloud", {
        transports: ["websocket"],
        auth: { token }
      });
      socketRef.current = s;

      s.on('connect', () => {
        setState((prev) => ({ ...prev, isConnected: true, socket: s, socketError: null }));
      });

      s.on('connect_error', (err) => {
        const message = err?.message || String(err);
        setState((prev) => ({ ...prev, socketError: message, isConnected: false }));
      });

      return true;
    } catch (err) {
      setState((prev) => ({ ...prev, socketError: 'Reconnect failed: ' + (err.message || String(err)) }));
      return false;
    }
  }, [token, userId]);

  const calculateDistance = useCallback((lat1, lon1, lat2, lon2) => {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) *
        Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }, []);

  // 📍 Manually send location update via socket
  const sendLocationUpdateViaSocket = useCallback(async (additionalData = {}) => {
    try {
      // Check if socket is connected
      if (!socketRef.current || !socketRef.current.connected) {
        logger.warn('⚠️ Socket not connected, cannot send location update');
        return false;
      }

      // Get current location
      const currentLocation = locationService.getCurrentLocation();
      if (!currentLocation) {
        logger.warn('⚠️ No location available');
        return false;
      }

      // Build payload
      const payload = {
        location: {
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude,
          accuracy: currentLocation.accuracy,
          timestamp: currentLocation.timestamp,
          ...additionalData, // Allow custom metadata
        },
        deliveryPersonId: userId,
        deliveryPersonName: user?.firstName && user?.lastName 
          ? `${user.firstName} ${user.lastName}` 
          : 'Unknown User',
        activeOrderId: state.activeOrder?.orderId || state.activeOrder?.[0]?.orderId || null,
        orderStatus: state.activeOrder?.status || state.activeOrder?.[0]?.status || null,
      };

      // Emit location update
      socketRef.current.emit('locationUpdate', payload);
      logger.log('✅ Manual location update sent');
      return true;
      
    } catch (err) {
      logger.error('❌ Error sending manual location update:', err);
      return false;
    }
  }, [userId, user, state.activeOrder]);

  // 📊 Fetch delivery person order history - WORKS WITHOUT SOCKET CONNECTION
const fetchDeliveryHistory = useCallback(async (forceRefresh = false) => {
  if (!token) {
    // Silently return if no token (user not logged in or logged out)
    setState((prev) => ({
      ...prev,
      isLoadingHistory: false,
      deliveryHistory: [],
      orderHistory: [],
      historyError: null, // Don't show error when not authenticated
    }));
    return;
  }

  // 🗄️ Check cache first (skip if forceRefresh)
  if (!forceRefresh && isCacheValid('deliveryHistory')) {
    const cachedData = state.dataCache.deliveryHistory.data;
    logger.log('📦 Using cached delivery history');
    setState((prev) => ({
      ...prev,
      deliveryHistory: cachedData.history || [],
      orderHistory: cachedData.history || [],
      isLoadingHistory: false,
    }));
    return;
  }

  // Clear existing history before fetching new data
  setState((prev) => ({
    ...prev,
    isLoadingHistory: true,
    historyError: null,
    deliveryHistory: [], // Clear old data first
    orderHistory: [],
  }));

  const result = await DeliveryAPI.fetchDeliveryHistory(token);
  
  if (result.success) {
    setState((prev) => ({
      ...prev,
      isLoadingHistory: false,
      deliveryHistory: result.data,
      orderHistory: result.data, // Also store as orderHistory for dashboard compatibility
    }));

    // 🗄️ Update cache
    updateCache('deliveryHistory', { history: result.data });
  } else {
    setState((prev) => ({
      ...prev,
      isLoadingHistory: false,
      historyError: result.error,
    }));
  }
}, [token, isCacheValid, updateCache, state.dataCache]);



  // ✅ Verify delivery function - WORKS WITHOUT SOCKET CONNECTION
  const verifyDelivery = useCallback(async (orderId, verificationCode) => {
    if (!token) {
      Alert.alert("Error", "Authentication required. Please log in again.");
      return;
    }

    const result = await DeliveryAPI.verifyDelivery(orderId, verificationCode, token);
    
    if (result.success) {
      setState((prev) => ({ ...prev, activeOrder: null, acceptedOrder: null }));
      
      // Fetch updated delivery history to show the completed order
      fetchDeliveryHistory().catch(e => logger.error('Error fetching delivery history:', e));
      
      // Fetch active orders to clear the completed one
      fetchAllActiveOrders().catch(e => logger.error('Error fetching active orders:', e));
      
      Alert.alert("🎉 Delivery Verified!", result.message);
      return { success: true, data: result.data };
    } else {
      Alert.alert("❌ Verification Failed", result.error);
      return { success: false, error: result.error };
    }
  }, [token, fetchDeliveryHistory, fetchAllActiveOrders]);
  
  // 🏁 Complete order function
  const completeOrder = useCallback(async (orderId) => {
    try {
      
      // Clear active order and fetch updated data
      setState((prev) => ({
        ...prev,
        activeOrder: null,
        acceptedOrder: null,
      }));
      
      // Fetch updated delivery history to include the completed order
      await Promise.all([
        fetchAllActiveOrders(), // Refresh active orders
        fetchDeliveryHistory(), // Refresh completed orders history
      ]);
      
      return true;
    } catch (error) {
      logger.error('❌ Error completing order:', error);
      return false;
    }
  }, [fetchAllActiveOrders, fetchDeliveryHistory]);

  // ❌ Cancel order function
  const cancelOrder = useCallback(async (orderId) => {
    try {
      
      // Clear active order and fetch updated data
      setState((prev) => ({
        ...prev,
        activeOrder: null,
        acceptedOrder: null,
      }));
      
      // Fetch updated active order (should be null if no more cooked orders)
      await fetchActiveOrder();
      
      return true;
    } catch (error) {
      logger.error('❌ Error cancelling order:', error);
      return false;
    }
  }, [fetchActiveOrder]);

  // 🔄 Refresh stored order (useful for checking order status)
  const refreshStoredOrder = useCallback(async () => {
    // Persistent stored order was removed; nothing to refresh.
  }, []);

  // 📍 Location tracking functions
  const startLocationTracking = useCallback(async () => {
    try {
      await locationService.startLocationTracking();
      setState((prev) => ({ 
        ...prev, 
        isLocationTracking: true,
        locationError: null
      }));
    } catch (error) {
      logger.error('Error starting location tracking:', error);
      setState((prev) => ({ 
        ...prev, 
        locationError: error?.message || error?.toString() || 'Unknown error',
        isLocationTracking: false
      }));
    }
  }, []);

  const stopLocationTracking = useCallback(async () => {
    // Check if trying to stop location while having an active order
    if (hasActiveDelivery()) {
      Alert.alert(
        "⚠️ Cannot Turn Off Location",
        "You have an active order. Location tracking is required for real-time order updates.\n\n📦 Complete your current order first.",
        [{ text: 'OK', style: 'default' }]
      );
      return;
    }
    
    locationService.stopLocationTracking();
    setState((prev) => ({ 
      ...prev, 
      isLocationTracking: false
    }));
    // Stop proximity checking when stopping tracking (both background and foreground)
    await proximityService.stopBackgroundTracking();
    proximityService.stopProximityChecking();
  }, [hasActiveDelivery]);

  const getCurrentLocation = useCallback(() => {
    return locationService.getCurrentLocation();
  }, []);

  const getCurrentLocationAsync = useCallback(async () => {
    try {
      return await locationService.getCurrentLocationAsync();
    } catch (error) {
      logger.error('Error getting current location:', error);
      throw error;
    }
  }, []);

  const calculateDistanceToLocation = useCallback((targetLat, targetLng) => {
    const currentLocation = locationService.getCurrentLocation();
    if (!currentLocation) return null;
    
    return locationService.calculateDistance(
      currentLocation.latitude,
      currentLocation.longitude,
      targetLat,
      targetLng
    );
  }, []);

  return (
    <DeliveryContext.Provider
      value={{
        ...state,
        acceptOrder,
        toggleOnlineStatus,
        showOrderModalFn,
        hideOrderModal,
        acceptOrderFromModal,
        declineOrder,
        handleAcceptDeliveryOrder,
        handleDeclineDeliveryOrder,
        joinDeliveryMethod,
        clearBroadcastMessages,
        clearNewOrderNotification,
        calculateDistance,
        fetchAvailableOrders,
        // Order management functions
        completeOrder,
        cancelOrder,
        verifyDelivery,
        // History and analytics functions
        fetchDeliveryHistory,
        // Cache management
        clearCache,
        isCacheValid,
        // Active order functions
        fetchActiveOrder,
        fetchAllActiveOrders,
        // Location tracking functions
        startLocationTracking,
        stopLocationTracking,
        getCurrentLocation,
        getCurrentLocationAsync,
        calculateDistanceToLocation,
        sendLocationUpdateViaSocket,
        // Cleanup functions
        clearDeliveryData,
        // Socket helpers
        reconnectSocket,
      }}
    >
      {children}
      <DeliveryOrderModal
        visible={state.showDeliveryModal}
        order={state.currentDeliveryOrder}
        onAccept={handleAcceptDeliveryOrder}
        onDecline={handleDeclineDeliveryOrder}
      />
    </DeliveryContext.Provider>
  );
};
