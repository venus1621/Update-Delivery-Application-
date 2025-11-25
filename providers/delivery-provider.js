import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";
import { Alert, Vibration, Platform, ToastAndroid } from "react-native";
import { Audio } from 'expo-av';
import { isNotificationSoundEnabled } from '../utils/notification-settings';
// Note: removed persistent local storage for accepted orders - using in-memory state only
import io from "socket.io-client";
import { useAuth } from "./auth-provider";
import locationService from "../services/location-service";
import { ref, update, push, set } from 'firebase/database';
import { database, initFirebaseForActiveOrder, getSendDuration } from '../firebase';
import { transformOrderLocations } from '../utils/location-utils';
import { logger } from '../utils/logger';

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

// 🔥 Helper function to remove undefined values from objects (Firebase doesn't accept undefined)
// Note: Firebase accepts null values, so we only remove undefined
const removeUndefinedFields = (obj) => {
  if (!obj || typeof obj !== 'object') return obj;
  
  const cleaned = {};
  for (const key in obj) {
    const value = obj[key];
    
    // Skip undefined values but keep null
    if (value === undefined) {
      continue;
    }
    
    // Recursively clean nested objects (but not arrays)
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      const cleanedNested = removeUndefinedFields(value);
      // Only add if the cleaned object has properties
      if (Object.keys(cleanedNested).length > 0) {
        cleaned[key] = cleanedNested;
      }
    } else if (Array.isArray(value)) {
      // Keep arrays as is (coordinates arrays, etc.)
      cleaned[key] = value;
    } else {
      // Keep all other values including null
      cleaned[key] = value;
    }
  }
  return cleaned;
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
    isOnline: false,
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
    sendDurationInSeconds: 3, // Dynamic interval from Firebase config (default 3 seconds)
    
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
  const locationIntervalRef = useRef(null); // Ref for location sending interval
  const locationUpdateIntervalRef = useRef(null); // Ref for dynamic interval management
  const proximityNotifiedRef = useRef(new Set()); // Track which orders have been notified
  const soundObjectRef = useRef(null); // Ref for alarm sound object
  const notificationSoundRef = useRef(null); // Ref for new order notification sound
  const vibrationIntervalRef = useRef(null); // Ref for continuous vibration
  const firebaseInitializedRef = useRef(false); // Prevent duplicate Firebase initialization

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
  
  // 📳 Start continuous vibration
  const startContinuousVibration = useCallback(() => {
    // Clear any existing vibration interval
    if (vibrationIntervalRef.current) {
      clearInterval(vibrationIntervalRef.current);
    }

    // Vibrate immediately
    Vibration.vibrate(1000);

    // Set up continuous vibration (every 2 seconds)
    vibrationIntervalRef.current = setInterval(() => {
      Vibration.vibrate(1000);
    }, 2000);
  }, []);

  // 🔇 Stop proximity alarm and vibration
  const stopProximityAlarm = useCallback(async () => {
    try {
      // Stop sound
      if (soundObjectRef.current) {
        await soundObjectRef.current.stopAsync();
        await soundObjectRef.current.unloadAsync();
        soundObjectRef.current = null;
      }

      // Stop vibration
      if (vibrationIntervalRef.current) {
        clearInterval(vibrationIntervalRef.current);
        vibrationIntervalRef.current = null;
      }
      Vibration.cancel(); // Cancel any ongoing vibration
      
    } catch (err) {
      logger.error('❌ Error stopping alarm:', err);
    }
  }, []);

  // 🔊 Play continuous alarm sound (ringing)
  const playProximityAlarm = useCallback(async () => {
    try {
      // Check if notification sounds are enabled
      const soundEnabled = await isNotificationSoundEnabled();
      
      if (!soundEnabled) {
        startContinuousVibration();
        return;
      }

      // Stop any existing sound
      await stopProximityAlarm();

      // Create alarm sound - using system default notification sound
      const { sound } = await Audio.Sound.createAsync(
        { uri: 'https://actions.google.com/sounds/v1/alarms/beep_short.ogg' }, // Default alarm sound
        { 
          shouldPlay: true,
          isLooping: true, // Continuous ringing
          volume: 1.0
        }
      );
      
      soundObjectRef.current = sound;

      // Start continuous vibration pattern
      startContinuousVibration();
      
    } catch (err) {
      logger.error('❌ Error playing alarm:', err);
      // Fallback to continuous vibration only
      startContinuousVibration();
    }
  }, [stopProximityAlarm, startContinuousVibration]);

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

  // 📍 Initialize location tracking and audio
  useEffect(() => {
    const initializeLocationTracking = async () => {
      try {
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
      // Clear location sending interval
      if (locationIntervalRef.current) {
        clearInterval(locationIntervalRef.current);
        locationIntervalRef.current = null;
      }
      // Stop alarm and vibration
      stopProximityAlarm();
      
      // Clean up notification sound
      if (notificationSoundRef.current) {
        notificationSoundRef.current.unloadAsync().catch(console.error);
        notificationSoundRef.current = null;
      }
    };
  }, [userId]);

  // 🔔 Proximity Alert Function - Play alarm when near destination
  const checkProximityAndAlert = useCallback(async (order, currentLocation, orderId) => {
    try {
      // Get destination location
      const destination = order.destinationLocation || order.deliveryLocation || order.deliverLocation || order.customerLocation;
      
      if (!destination || !destination.lat || !destination.lng) {
        return; // No destination available
      }

      // Calculate distance to destination
      const distance = locationService.calculateDistance(
        currentLocation.latitude,
        currentLocation.longitude,
        destination.lat,
        destination.lng
      );

      const distanceInMeters = distance * 1000; // Convert km to meters
      const PROXIMITY_THRESHOLD = 200; // 200 meters

      // Check if we're within proximity threshold
      if (distanceInMeters <= PROXIMITY_THRESHOLD) {
        // Check if we've already notified for this order
        if (proximityNotifiedRef.current.has(orderId)) {
          return; // Already notified
        }

        // Mark as notified
        proximityNotifiedRef.current.add(orderId);
        

        // Play continuous ringing alarm sound
        await playProximityAlarm();

        // Show alert dialog with stop alarm on dismiss
        Alert.alert(
          "🎯 Approaching Destination!",
          `You are ${Math.round(distanceInMeters)} meters away from the delivery location.\n\nOrder: ${order.orderCode || orderId}\nCustomer: ${order.userName || 'Customer'}`,
          [
            {
              text: "Got it!",
              onPress: () => {
                stopProximityAlarm();
              }
            }
          ],
          { 
            cancelable: false,
            onDismiss: () => {
              stopProximityAlarm();
            }
          }
        );
      } else {
        // If distance is more than threshold, allow future notifications
        if (distanceInMeters > PROXIMITY_THRESHOLD * 1.5) {
          proximityNotifiedRef.current.delete(orderId);
        }
      }
    } catch (err) {
      logger.error('❌ Error checking proximity:', err);
    }
  }, []);


  // 📍 Send location updates every 3 seconds - WORKS INDEPENDENTLY OF SOCKET STATUS
  // Firebase location tracking works when there's an active order being delivered
  useEffect(() => {
    if (!userId || !state.isLocationTracking || !state.activeOrder) {
      // Clear interval if not tracking or no active order
      if (locationIntervalRef.current) {
        clearInterval(locationIntervalRef.current);
        locationIntervalRef.current = null;
      }
      return;
    }

    // Get the dynamic interval from state (in seconds) and convert to milliseconds
    const intervalInMs = (state.sendDurationInSeconds || 3) * 1000;

    // Start interval to send location based on dynamic duration from backend
    locationIntervalRef.current = setInterval(async () => {
      const currentLocation = locationService.getCurrentLocation();
      if (currentLocation) {
        
        // Check if activeOrder is an array (from dashboard) or single object (from state)
        // Define this early so we can use it in multiple places
        const activeOrders = Array.isArray(state.activeOrder) ? state.activeOrder : 
                             (state.activeOrder ? [state.activeOrder] : []);

        // ✅ Check if there's an active order before attempting Firebase update
        if (activeOrders.length === 0 || !state.activeOrder) {
          // Silently skip - no need to log or warn when there's no active order
          return;
        }

        // ✅ Check if Firebase database is initialized
        if (!database) {
          logger.warn('⚠️ Firebase database not initialized, skipping location update');
          return;
        }

        // ALWAYS send to Firebase - direct delivery guy location tracking
        try {
          const deliveryGuyRef = ref(database, `deliveryGuys/${userId}`);
          const locationHistoryRef = ref(database, `deliveryGuys/${userId}/locationHistory`);
        
        // Update current location for delivery guy
        const locationData = {
          currentLocation: {
            latitude: currentLocation.latitude,
            longitude: currentLocation.longitude,
            accuracy: currentLocation.accuracy,
            timestamp: currentLocation.timestamp
          },
          lastLocationUpdate: new Date().toISOString(),
          deliveryPerson: {
            id: userId,
            name: user?.firstName && user?.lastName ? `${user.firstName} ${user.lastName}` : 'Unknown User',
            phone: user?.phone || 'N/A',
            deliveryMethod: user?.deliveryMethod || 'N/A'
          },
          isOnline: state.isOnline,
          isTracking: state.isLocationTracking,
          activeOrderIds: activeOrders.map(o => o._id || o.id || o.orderId || o.orderCode).filter(Boolean),
          status: activeOrders.length > 0 ? 'Delivering' : 'Available'
        };
        
        // Add to location history
        const historyEntry = {
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude,
          accuracy: currentLocation.accuracy,
          timestamp: currentLocation.timestamp,
          status: state.activeOrder?.status || 'Available',
          recordedAt: new Date().toISOString(),
          activeOrderId: state.activeOrder?.orderId || null
        };
        
        // Update delivery guy data and add to history
        // Clean undefined values before sending to Firebase
        const cleanedLocationData = removeUndefinedFields(locationData);
        const cleanedHistoryEntry = removeUndefinedFields(historyEntry);
        
          await Promise.all([
            update(deliveryGuyRef, cleanedLocationData),
            push(locationHistoryRef, cleanedHistoryEntry)
          ]);
        } catch (err) {
          // Silently handle Firebase permission errors - they don't affect core functionality
          if (err.message?.includes('PERMISSION_DENIED') || err.message?.includes('permission_denied')) {
            // Permission denied - Firebase rules may need updating on backend
            // This is expected if Firebase rules are not configured yet
          } else {
            logger.warn('⚠️ Could not update delivery guy location in Firebase:', err);
          }
        }
       
        // SEND TO ORDER-SPECIFIC FIREBASE PATH (for customer tracking)
        // This works INDEPENDENTLY of socket status - if there's an active order, send location
        if (activeOrders.length > 0) {
          
          // Send location for each active order
          const locationUpdatePromises = activeOrders.map(async (order) => {
            // Log available order fields to debug
              
            // Priority: Use MongoDB _id first (for customer app compatibility)
            // The API might return the MongoDB ID in different fields
            const mongoId = order._id || order.id;
            const orderId = mongoId || order.orderId || order.orderCode;
            
            if (!orderId) {
             logger.warn('⚠️ Order missing _id, id, orderId and orderCode:', order);
              return;
            }
            
           
            const orderRef = ref(database, `deliveryOrders/${orderId}`);
            const orderLocationHistoryRef = ref(database, `deliveryOrders/${orderId}/locationHistory`);
            
            // Update current location for specific order
            // ✅ Match backend Firebase structure format
            const orderLocationData = {
              orderId: orderId.toString(),
              userId: order.userId?._id?.toString() || order.userId?.toString() || order.customerId?.toString() || 'unknown',
              deliveryPersonId: userId.toString(),
              orderCode: order.orderCode || `ORD-${orderId.slice(-6)}`,
              orderStatus: order.orderStatus || order.status || 'Delivering',
              
              // Current delivery person location
              currentDeliveryLocation: {
                latitude: currentLocation.latitude,
                longitude: currentLocation.longitude,
                accuracy: currentLocation.accuracy,
                timestamp: currentLocation.timestamp
              },
              
              // Restaurant location in GeoJSON format
              restaurantLocation: order.restaurantLocation ? {
                type: order.restaurantLocation.type || 'Point',
                coordinates: order.restaurantLocation.coordinates || [
                  order.restaurantLocation.lng || order.restaurantLocation.longitude || 0,
                  order.restaurantLocation.lat || order.restaurantLocation.latitude || 0
                ]
              } : null,
              
              // Destination location in GeoJSON format
              destinationLocation: order.destinationLocation ? {
                type: order.destinationLocation.type || 'Point',
                coordinates: order.destinationLocation.coordinates || [
                  order.destinationLocation.lng || order.destinationLocation.longitude || 0,
                  order.destinationLocation.lat || order.destinationLocation.latitude || 0
                ]
              } : (order.deliveryLocation ? {
                type: order.deliveryLocation.type || 'Point',
                coordinates: order.deliveryLocation.coordinates || [
                  order.deliveryLocation.lng || order.deliveryLocation.longitude || 0,
                  order.deliveryLocation.lat || order.deliveryLocation.latitude || 0
                ]
              } : null),
              
              deliveryVehicle: order.deliveryVehicle || user?.deliveryMethod || 'Unknown',
              pickUpVerification: order.pickUpVerificationCode || order.pickUpVerification || null,
              
              lastLocationUpdate: new Date().toISOString(),
              deliveryPerson: {
                id: userId,
                name: user?.firstName && user?.lastName ? `${user.firstName} ${user.lastName}` : 'Unknown User',
                phone: user?.phone || 'N/A',
                deliveryMethod: user?.deliveryMethod || 'N/A'
              },
              trackingEnabled: true,
              deliveryFee: extractNumber(order.deliveryFee),
              tip: extractNumber(order.tip),
            };
            
            // Add optional fields only if they exist
            if (order.restaurantName) {
              orderLocationData.restaurantName = order.restaurantName;
            }
            if (order.userName) {
              orderLocationData.customerName = order.userName;
            }
            if (order.phone) {
              orderLocationData.customerPhone = order.phone;
            }
            if (order.description) {
              orderLocationData.description = order.description;
            }
            
            // Add to order-specific location history
            const orderHistoryEntry = {
              latitude: currentLocation.latitude,
              longitude: currentLocation.longitude,
              accuracy: currentLocation.accuracy,
              timestamp: currentLocation.timestamp,
              status: order.orderStatus || order.status || 'Delivering',
              recordedAt: new Date().toISOString()
            };
            
            // Update order data and add to history
            try {
              // Clean undefined values before sending to Firebase
              const cleanedOrderLocationData = removeUndefinedFields(orderLocationData);
              const cleanedOrderHistoryEntry = removeUndefinedFields(orderHistoryEntry);
              
              await Promise.all([
                update(orderRef, cleanedOrderLocationData),
                push(orderLocationHistoryRef, cleanedOrderHistoryEntry)
              ]);
              
              // Silently succeed - location tracking is working
             
              // Check proximity to destination and trigger alarm if close
              await checkProximityAndAlert(order, currentLocation, orderId);
            } catch (err) {
              // Silently handle Firebase permission errors - they don't affect core functionality
              if (err.message?.includes('PERMISSION_DENIED') || err.message?.includes('permission_denied')) {
                // Permission denied - Firebase rules may need updating on backend
                // This is expected if Firebase rules are not configured yet
              } else {
               logger.warn('⚠️ Could not update order location in Firebase:', orderId);
              }
            }
          });
          
          // Wait for all updates to complete
          Promise.all(locationUpdatePromises).then(() => {
            // Silently succeed - location tracking is working for active orders
          }).catch(error => {
            // Silently handle Firebase permission errors
            if (!error.message?.includes('PERMISSION_DENIED') && !error.message?.includes('permission_denied')) {
              logger.warn('⚠️ Could not update location in Firebase batch');
            }
          });
          
        } else {
        }
      }
    }, intervalInMs); // Dynamic interval from backend (in milliseconds)

    // Cleanup interval on unmount or dependency change
    return () => {
      if (locationIntervalRef.current) {
        clearInterval(locationIntervalRef.current);
        locationIntervalRef.current = null;
      }
    };
  }, [userId, state.isLocationTracking, state.isOnline, state.activeOrder, user, checkProximityAndAlert, state.sendDurationInSeconds]);

  // 🔥 Monitor activeOrder changes and send "Delivering" orders to Firebase
  useEffect(() => {
    const checkAndSendToFirebase = async () => {
      if (!state.activeOrder || !userId) {
        return;
      }

      // Initialize Firebase for active order (only once)
      if (state.activeOrder && token && !firebaseInitializedRef.current) {
        try {
          const { database: firebaseDb, sendDurationInSeconds } = await initFirebaseForActiveOrder(token);
          
          if (!firebaseDb) {
            throw new Error('Failed to initialize Firebase database');
          }
          
          // Mark as initialized
          firebaseInitializedRef.current = true;
          
          
          // Update state with the dynamic send duration
          setState(prev => ({
            ...prev,
            sendDurationInSeconds: sendDurationInSeconds || 3
          }));
        } catch (err) {
          const message = err?.message || String(err) || 'Unknown error';
          logger.error('❌ Failed to initialize Firebase for active order:', err);
          logger.error('Error details:', message);
          setState(prev => ({
            ...prev,
            locationError: 'Firebase connection failed - location tracking may not work'
          }));
          return; // Don't proceed if Firebase init fails
        }
      } else if (firebaseInitializedRef.current) {
      }

      // Handle both array and single object
      const orders = Array.isArray(state.activeOrder) ? state.activeOrder : [state.activeOrder];

      // Filter for "Delivering" status orders
      const deliveringOrders = orders.filter(order => {
        const status = order.orderStatus || order.status || '';
        return status.toLowerCase() === 'delivering';
      });

      if (deliveringOrders.length > 0) {
        try {
          await sendOrderStatusToFirebase(deliveringOrders);
        } catch (err) {
          const message = err?.message || String(err) || 'Unknown error';
          logger.error('❌ Failed to send orders to Firebase:', err);
          logger.error('Error details:', message);
        }
      }
    };

    checkAndSendToFirebase();
  }, [state.activeOrder, userId, sendOrderStatusToFirebase, token]);






  // 🔌 Connect to socket server with authentication
  // Socket connects ONLY when user is ONLINE
  useEffect(() => {
    if (!token || !userId) {
      // Clear socket connection if no token/userId
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setState((prev) => ({ ...prev, isConnected: false, socket: null }));
      }
      return;
    }

    // Check if user is online - only connect when online
    if (!state.isOnline) {
      // Disconnect socket if user goes offline
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setState((prev) => ({ ...prev, isConnected: false, socket: null }));
      }
      return;
    }

    const socket = io("https://gebeta-delivery1.onrender.com", {
      transports: ["websocket"],
      auth: {
        token: token // Send JWT token for authentication
      }
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      
      setState((prev) => ({ ...prev, isConnected: true, socket }));
    });

    socket.on("message", (message) => {
    });

    socket.on("deliveryMessage", (message) => {
    });

    socket.on("errorMessage", (error) => {
      // Store a user-friendly socket error in state so UI can show a reconnect option
      const message = typeof error === 'string' ? error : (error?.message || JSON.stringify(error));
      setState((prev) => ({ ...prev, socketError: message, isConnected: false }));
    });

    socket.on("connect_error", (error) => {
      const message = error?.message || String(error);
      setState((prev) => ({ ...prev, socketError: message, isConnected: false }));
      if (message.includes('Authentication error')) {
        Alert.alert("Authentication Error", "Please log in again");
        // You might want to trigger logout here
      }
    });

    // Clear any previous socket error when we successfully connect
    socket.on('connect', () => {
      setState((prev) => ({ ...prev, socketError: null }));
    });

    // 🍲 New order notifications from backend (based on your notifyDeliveryGroup function)
    socket.on("deliveryMessage", (orderData) => {
      
      // Play notification sound and vibrate
      playNewOrderNotification();
      
      // Extract MongoDB Decimal128 values
      const deliveryFee = extractNumber(orderData.deliveryFee);
      const tip = extractNumber(orderData.tip);
      
      // Transform locations from backend [lng, lat] format to app {lat, lng} format
      const transformedOrderData = transformOrderLocations(orderData);
      
      const transformedOrder = {
        orderId: orderData.orderId,
        order_id: orderData.orderCode, // Map orderCode to order_id for consistency
        orderCode: orderData.orderCode,
        restaurantLocation: transformedOrderData.restaurantLocation || {
          name: orderData.restaurantName,
          address: 'Restaurant Location',
          lat: 0,
          lng: 0,
        },
        deliveryLocation: transformedOrderData.deliveryLocation || transformedOrderData.destinationLocation || {
          lat: 0,
          lng: 0,
          address: 'Delivery Location',
        },
        deliveryFee: deliveryFee,
        tip: tip,
        grandTotal: deliveryFee + tip,
        createdAt: orderData.createdAt || new Date().toISOString(),
        customer: {
          name: 'Customer',
          phone: 'N/A',
        },
        items: [
          { name: 'Order Items', quantity: 1 }
        ],
        specialInstructions: 'Please handle with care',
      };


      setState((prev) => ({
        ...prev,
        availableOrders: [...prev.availableOrders, transformedOrder],
        availableOrdersCount: prev.availableOrdersCount + 1,
        // Automatically show the order modal for new orders
        pendingOrderPopup: transformedOrder,
        showOrderModal: true,
        newOrderNotification: true, // Set notification flag
      }));
    });

    // 📊 Orders count updates (if backend sends this)
    socket.on("available-orders-count", ({ count }) => {
      setState((prev) => ({ ...prev, availableOrdersCount: count }));
    });

    // 🍲 New cooked orders (from backend updateOrderStatus)
    socket.on("order:cooked", (order) => {
      
      // Play notification sound and vibrate
      playNewOrderNotification();
      
      // Transform locations from backend [lng, lat] format and normalize data
      const transformedOrder = transformOrderLocations(order);
      const normalizedOrder = {
        ...transformedOrder,
        deliveryFee: extractNumber(order.deliveryFee),
        tip: extractNumber(order.tip),
      };
      
      setState((prev) => ({
        ...prev,
        availableOrders: [...prev.availableOrders, normalizedOrder],
        availableOrdersCount: prev.availableOrdersCount + 1,
        // Automatically show the order modal for new orders
        pendingOrderPopup: normalizedOrder,
        showOrderModal: true,
        newOrderNotification: true, // Set notification flag
      }));
    });

    // 📦 When an order is accepted by ANY driver
    socket.on("order:accepted", (order) => {
      setState((prev) => ({
        ...prev,
        availableOrders: prev.availableOrders.filter(
          (o) => o.orderId !== order.orderId
        ),
        availableOrdersCount: Math.max(0, prev.availableOrdersCount - 1),
      }));
    });

    socket.on("disconnect", () => {
      setState((prev) => ({ ...prev, isConnected: false }));
      // Clear location interval on disconnect
      if (locationIntervalRef.current) {
        clearInterval(locationIntervalRef.current);
        locationIntervalRef.current = null;
      }
    });

    return () => {
      socket.off("connect");
      socket.off("message");
      socket.off("deliveryMessage");
      socket.off("errorMessage");
      socket.off("connect_error");
      socket.off("available-orders-count");
      socket.off("order:cooked");
      socket.off("order:accepted");
      socket.off("disconnect");
      socket.disconnect();
    };
  }, [token, userId, state.isOnline, playNewOrderNotification]);

  // Note: persistent local storage for accepted orders has been removed.

// ✅ API FUNCTIONS BELOW WORK INDEPENDENTLY OF SOCKET/ONLINE STATUS
// These functions use direct HTTP calls and work whether you're online or offline

// 🔥 Send order status to Firebase immediately - Enhanced for Delivering status
// Matches backend Firebase structure format
const sendOrderStatusToFirebase = useCallback(async (orders) => {
  if (!orders || !Array.isArray(orders) || orders.length === 0) {
    return;
  }

  const currentLocation = locationService.getCurrentLocation();
  
  for (const order of orders) {
    try {
      const mongoId = order._id || order.id;
      const orderId = mongoId ? mongoId.toString() : (order.orderId || order.orderCode).toString();
      
      if (!orderId) {
        logger.warn('⚠️ Order missing ID, skipping Firebase update:', order);
        continue;
      }

      const orderStatus = order.orderStatus || order.status || 'Delivering';
      const orderRef = ref(database, `deliveryOrders/${orderId}`);
      
      // ✅ Match backend Firebase structure format
      const orderData = {
        orderId: orderId,
        userId: order.userId?._id?.toString() || order.userId?.toString() || order.customerId?.toString() || 'unknown',
        deliveryPersonId: userId.toString(),
        orderStatus: orderStatus,
        orderCode: order.orderCode || `ORD-${orderId.slice(-6)}`,
        
        // Restaurant location in GeoJSON format
        restaurantLocation: order.restaurantLocation ? {
          type: order.restaurantLocation.type || 'Point',
          coordinates: order.restaurantLocation.coordinates || [
            order.restaurantLocation.lng || order.restaurantLocation.longitude || 0,
            order.restaurantLocation.lat || order.restaurantLocation.latitude || 0
          ]
        } : null,
        
        // Destination location in GeoJSON format
        destinationLocation: order.destinationLocation ? {
          type: order.destinationLocation.type || 'Point',
          coordinates: order.destinationLocation.coordinates || [
            order.destinationLocation.lng || order.destinationLocation.longitude || 0,
            order.destinationLocation.lat || order.destinationLocation.latitude || 0
          ]
        } : (order.deliveryLocation ? {
          type: order.deliveryLocation.type || 'Point',
          coordinates: order.deliveryLocation.coordinates || [
            order.deliveryLocation.lng || order.deliveryLocation.longitude || 0,
            order.deliveryLocation.lat || order.deliveryLocation.latitude || 0
          ]
        } : null),
        
        deliveryVehicle: order.deliveryVehicle || user?.deliveryMethod || 'Unknown',
        pickUpVerification: order.pickUpVerificationCode || order.pickUpVerification || null,
        
        // Additional tracking info
        deliveryPerson: {
          id: userId,
          name: user?.firstName && user?.lastName ? `${user.firstName} ${user.lastName}` : 'Unknown User',
          phone: user?.phone || 'N/A',
          deliveryMethod: user?.deliveryMethod || 'N/A'
        },
        
        trackingEnabled: true,
        deliveryFee: extractNumber(order.deliveryFee),
        tip: extractNumber(order.tip),
        
        createdAt: order.createdAt || new Date().toISOString(),
        lastStatusUpdate: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Add optional fields
      if (order.restaurantName) orderData.restaurantName = order.restaurantName;
      if (order.userName) orderData.customerName = order.userName;
      if (order.phone) orderData.customerPhone = order.phone;
      if (order.description) orderData.description = order.description;

      // Add current delivery person location if available
      if (currentLocation) {
        orderData.currentDeliveryLocation = {
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude,
          accuracy: currentLocation.accuracy,
          timestamp: currentLocation.timestamp
        };
        orderData.lastLocationUpdate = new Date().toISOString();
      } else {
      }

      // Clean undefined and null values before sending to Firebase
      const cleanedOrderData = removeUndefinedFields(orderData);
      
      // Use set() for complete replacement to ensure structure is correct
      await set(orderRef, cleanedOrderData);
      
    } catch (err) {
      // Silently handle Firebase errors
      if (!err.message?.includes('PERMISSION_DENIED') && !err.message?.includes('permission_denied')) {
        logger.warn(`⚠️ Could not send order ${order.orderCode || 'unknown'} to Firebase`);
      }
    }
  }
}, [userId, user]);

// 📦 Fetch active orders - WORKS WITHOUT SOCKET CONNECTION
const fetchActiveOrder = useCallback(
  async (status) => {
    if (!status || !token) return;

    try {
      setState(prev => ({ 
        ...prev, 
        isLoadingActiveOrder: true, 
        activeOrderError: null,
      }));
      

      const response = await fetch(
        `https://gebeta-delivery1.onrender.com/api/v1/orders/get-orders-by-DeliveryMan?status=${status}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      let data;
      try {
        data = await response.json();
      } catch (jsonError) {
        throw new Error(`Failed to parse server response: ${jsonError?.message || jsonError?.toString() || 'Unknown error'}`);
      }
      
      console.log('Fetched active orders data:', data);
      if (response.ok && data && data.status === "success") {
        // Transform locations and normalize active order data to handle MongoDB Decimal128
        const normalizedActiveOrders = Array.isArray(data.data) 
          ? data.data.map(order => {
              const transformedOrder = transformOrderLocations(order);
              return {
                ...transformedOrder,
                deliveryFee: extractNumber(order.deliveryFee),
                tip: extractNumber(order.tip),
              };
            })
          : [];
        
        
        // 🔥 If status is "Delivering", immediately send to Firebase
        if (status === 'Delivering' && normalizedActiveOrders.length > 0) {
          await sendOrderStatusToFirebase(normalizedActiveOrders);
        }
        
        // Replace activeOrder completely with the new data
        // When refreshing, we want fresh data only, not merged data
        setState(prev => ({
          ...prev,
          isLoadingActiveOrder: false,
          activeOrder: normalizedActiveOrders.length > 0 ? normalizedActiveOrders : null,
        }));
      } else {
        // Display server error message - safely access properties
        const serverMessage =
          data?.message ||
          data?.error ||
          data?.errors?.[0]?.msg ||
          "Failed to fetch orders";
        setState(prev => ({
          ...prev,
          isLoadingActiveOrder: false,
          activeOrderError: serverMessage,
        }));
      }

    } catch (err) {
      // Check if it's a network error or something else
      const errorMessage = err?.message === 'Failed to fetch' || err?.message?.includes('Network request failed')
        ? "Unable to connect to server. Please check your internet connection."
        : (err?.message || "Something went wrong. Please try again later.");
      
      setState(prev => ({
        ...prev,
        isLoadingActiveOrder: false,
        activeOrderError: errorMessage,
      }));
    }
  },
  [token, sendOrderStatusToFirebase]
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
  
  try {
    // Clear active orders first
    setState(prev => ({ 
      ...prev, 
      isLoadingActiveOrder: true, 
      activeOrderError: null,
      activeOrder: null // Clear old data
    }));
    
    logger.log('🌐 Fetching fresh active orders from API');
    
    // Fetch both statuses in parallel
    const [cookedResponse, deliveringResponse] = await Promise.all([
      fetch(
        'https://gebeta-delivery1.onrender.com/api/v1/orders/get-orders-by-DeliveryMan?status=Cooked',
        { headers: { Authorization: `Bearer ${token}` } }
      ),
      fetch(
        'https://gebeta-delivery1.onrender.com/api/v1/orders/get-orders-by-DeliveryMan?status=Delivering',
        { headers: { Authorization: `Bearer ${token}` } }
      ),
    ]);
    
    // Safely parse JSON responses
    let cookedData = null;
    let deliveringData = null;
    
    try {
      cookedData = await cookedResponse.json();
    
    } catch (jsonError) {
      logger.error('Failed to parse cooked orders response:', jsonError);
    }
    
    try {
      deliveringData = await deliveringResponse.json();
    } catch (jsonError) {
      logger.error('Failed to parse delivering orders response:', jsonError);
    }
    
    let allActiveOrders = [];
    
    // Process Cooked orders
    if (cookedResponse.ok && cookedData && cookedData.status === 'success' && Array.isArray(cookedData.data)) {
      const normalized = cookedData.data.map(order => {
        const transformedOrder = transformOrderLocations(order);
        return {
          ...transformedOrder,
          deliveryFee: extractNumber(order.deliveryFee),
          tip: extractNumber(order.tip),
        };
      });
      allActiveOrders = [...allActiveOrders, ...normalized];
    }
    
    // Process Delivering orders
    if (deliveringResponse.ok && deliveringData && deliveringData.status === 'success' && Array.isArray(deliveringData.data)) {
      const normalized = deliveringData.data.map(order => {
        const transformedOrder = transformOrderLocations(order);
        return {
          ...transformedOrder,
          deliveryFee: extractNumber(order.deliveryFee),
          tip: extractNumber(order.tip),
        };
      });
      allActiveOrders = [...allActiveOrders, ...normalized];
      
      // Send Delivering orders to Firebase
      if (normalized.length > 0) {
        await sendOrderStatusToFirebase(normalized);
      }
    }
    
    // 🗄️ Update state and cache
    const activeOrderData = allActiveOrders.length > 0 ? allActiveOrders : null;
    updateCache('activeOrder', activeOrderData);
    
    setState(prev => ({
      ...prev,
      isLoadingActiveOrder: false,
      activeOrder: activeOrderData,
    }));
    
    
  } catch (err) {
    logger.error('❌ Error fetching all active orders:', err);
    setState(prev => ({
      ...prev,
      isLoadingActiveOrder: false,
      activeOrderError: 'Failed to fetch active orders',
    }));
  }
}, [token, sendOrderStatusToFirebase, isCacheValid, updateCache, state.dataCache]);

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

  try {
    // Clear existing available orders before fetching new data
    setState((prev) => ({
      ...prev,
      isLoadingOrders: true,
      ordersError: null,
      availableOrders: [], // Clear old data first
      availableOrdersCount: 0,
    }));
    
    logger.log('🌐 Fetching fresh available orders from API');

    const response = await fetch(
      "https://gebeta-delivery1.onrender.com/api/v1/orders/available-cooked",
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      }
    );

    let data;
    try {
      data = await response.json();
    } catch (jsonError) {
      throw new Error(`Failed to parse server response: ${jsonError?.message || jsonError?.toString() || 'Unknown error'}`);
    }
 
    if (response.ok && data && data.status === "success") {
      // ✅ Transform locations and normalize the response into a simple, clean list
      const normalizedOrders = data.data.map((order) => {
        const transformedOrder = transformOrderLocations(order);
        return {
          id: order.orderId,
          code: order.orderCode,
          restaurantName: order.restaurantName,
          restaurantLocation: transformedOrder.restaurantLocation,
          deliveryLocation: transformedOrder.deliveryLocation || transformedOrder.destinationLocation,
          // Keep coordinates for backward compatibility (now in [lng, lat] format)
          restaurantCoordinates: order.restaurantLocation?.coordinates || [],
          deliveryCoordinates: order.deliveryLocation?.coordinates || [],
          deliveryFee: order.deliveryFee,
          tip: order.tip,
          total: order.grandTotal,
          createdAt: new Date(order.createdAt).toLocaleString(),
        };
      });


      // 🗄️ Update state and cache
      const cacheData = {
        orders: normalizedOrders,
        count: normalizedOrders.length,
      };
      
      updateCache('availableOrders', cacheData);
      
      setState((prev) => ({
        ...prev,
        availableOrders: normalizedOrders,
        availableOrdersCount: normalizedOrders.length,
        isLoadingOrders: false,
      }));

       } else {
      // Display server error message - safely access properties
      const serverMessage =
        data?.message ||
        data?.error ||
        data?.errors?.[0]?.msg ||
        "Failed to fetch available orders";
      setState((prev) => ({
        ...prev,
        isLoadingOrders: false,
        ordersError: serverMessage,
      }));
    }
  } catch (err) {
    // Check if it's a network error or something else
    logger.error('❌ Error fetching available orders:', err);
    const errorMessage = err?.message === 'Failed to fetch' || err?.message?.includes('Network request failed')
      ? "Unable to connect to server. Please check your internet connection."
      : (err?.message || "Something went wrong. Please try again later.");
    
    setState((prev) => ({
      ...prev,
      isLoadingOrders: false,
      ordersError: errorMessage,
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

        // Initialize Firebase tracking for the accepted order
        initializeOrderTracking(activeOrderData).catch(error => {
          logger.error('❌ Error initializing Firebase tracking:', error);
        });
      
            // Calculate total earnings (handle MongoDB Decimal128 format)
            const deliveryFee = extractNumber(response.data?.deliveryFee);
            const tip = extractNumber(response.data?.tip);
            const totalEarnings = deliveryFee + tip;

        // Immediately fetch active orders to update the state
        fetchActiveOrder('Cooked').catch(e => logger.error('Error fetching cooked orders:', e));
        fetchActiveOrder('Delivering').catch(e => logger.error('Error fetching delivering orders:', e));

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

  // Mock functions to prevent errors
  const toggleOnlineStatus = useCallback(() => {
    setState((prev) => ({ ...prev, isOnline: !prev.isOnline }));
  }, []);

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
      
      // Clear location interval
      if (locationIntervalRef.current) {
        clearInterval(locationIntervalRef.current);
        locationIntervalRef.current = null;
      }
      
      // Clear dynamic location interval
      if (locationUpdateIntervalRef.current) {
        clearInterval(locationUpdateIntervalRef.current);
        locationUpdateIntervalRef.current = null;
      }
      
      // Stop proximity alarm and vibration
      await stopProximityAlarm();
      
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
  }, []);

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

      const s = io("https://gebeta-delivery1.onrender.com", {
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

  try {
    // Clear existing history before fetching new data
    setState((prev) => ({
      ...prev,
      isLoadingHistory: true,
      historyError: null,
      deliveryHistory: [], // Clear old data first
      orderHistory: [],
    }));
    
    logger.log('🌐 Fetching fresh delivery history from API');

    const response = await fetch(
      "https://gebeta-delivery1.onrender.com/api/v1/orders/get-orders-by-DeliveryMan?status=Completed",
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      }
    );

    let data;
    try {
      data = await response.json();
      console.log(data);
    } catch (jsonError) {
      throw new Error(`Failed to parse server response: ${jsonError?.message || jsonError?.toString() || 'Unknown error'}`);
    }

    if (!response.ok || !data || data.status !== "success") {
      throw new Error(data?.message || `HTTP ${response.status}: Failed to fetch orders`);
    }

    if (!data.data || !Array.isArray(data.data) || typeof data.count !== "number") {
      throw new Error("Invalid response format: missing data array or count");
    }

    const normalizedHistory = data.data
      .map((order) => {
        if (!order._id && !order.id) {
          logger.warn("Skipping invalid order:", order);
          return null;
        }

        // Extract numbers from MongoDB Decimal128 format
        const deliveryFee = extractNumber(order.deliveryFee);
        const tip = extractNumber(order.tip);
        const totalEarnings = deliveryFee + tip;

        return {
          id: order._id || order.id,
          restaurantName: order.restaurantName || "Unknown Restaurant",
          deliveryFee: deliveryFee,
          tip: tip,
          totalEarnings: totalEarnings,
          grandTotal: totalEarnings, // For compatibility with dashboard
          orderStatus: order.orderStatus || "",
          orderCode: order.orderCode || "",
          updatedAt: order.updatedAt ? new Date(order.updatedAt).toISOString() : null,
          createdAt: order.createdAt ? new Date(order.createdAt).toISOString() : null,
        };
      })
      .filter(Boolean); // Remove any nulls

    setState((prev) => ({
      ...prev,
      isLoadingHistory: false,
      deliveryHistory: normalizedHistory,
      orderHistory: normalizedHistory, // Also store as orderHistory for dashboard compatibility
     
    }));

    // 🗄️ Update cache
    updateCache('deliveryHistory', { history: normalizedHistory });

  } catch (error) {
   
    setState((prev) => ({
      ...prev,
      isLoadingHistory: false,
      historyError:
        error?.message?.includes("Failed to fetch")
          ? "Unable to connect to server. Please try again later."
          : error?.message || "An unexpected error occurred.",
    }));
  }
}, [token, isCacheValid, updateCache, state.dataCache]);



  // ✅ Verify delivery function - WORKS WITHOUT SOCKET CONNECTION
  const verifyDelivery = useCallback(async (orderId, verificationCode) => {
    if (!token) {
      Alert.alert("Error", "Authentication required. Please log in again.");
      return;
    }
  
    try {
      const response = await fetch(
        "https://gebeta-delivery1.onrender.com/api/v1/orders/verify-delivery",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ order_id: orderId, verification_code: verificationCode }),
        }
      );

  
      let data;
      try {
        data = await response.json();
      } catch (jsonError) {
        throw new Error(`Failed to parse server response: ${jsonError?.message || jsonError?.toString() || 'Unknown error'}`);
      }

      if (response.ok && data && data.status === "success") {
        // Update Firebase status to "Delivered"
        await updateDeliveryStatus(orderId, "Delivered", {
          deliveredAt: new Date().toISOString(),
          verificationCode: verificationCode
        });
        
        setState((prev) => ({ ...prev, activeOrder: null, acceptedOrder: null }));
        
        // Fetch updated delivery history to show the completed order
        fetchDeliveryHistory().catch(e => logger.error('Error fetching delivery history:', e));
        
        // Fetch active orders to clear the completed one
        fetchAllActiveOrders().catch(e => logger.error('Error fetching active orders:', e));
        
        Alert.alert("🎉 Delivery Verified!", data.message);
        return { success: true, data: data.data };
      }
  
      // Handle different error response formats - safely access properties
      let errorMessage = "Please try again.";
      
      if (data && data?.error) {
        if (typeof data?.error === 'string') {
          errorMessage = data?.error;
        } else if (typeof data?.error === 'object' && data?.error.message) {
          errorMessage = data?.error.message;
        }
      } else if (data && data.message) {
        errorMessage = data.message;
      }
      
      Alert.alert("❌ Verification Failed", errorMessage);
      return { success: false, error: errorMessage };
    } catch (error) {
      logger.error('❌ Error verifying delivery:', error);
      
      // Check if it's a network error or something else
      const errorMessage = error?.message === 'Failed to fetch' || error?.message?.includes('Network request failed')
        ? "Unable to connect to server. Please check your internet connection and try again."
        : "Something went wrong. Please try again later.";
      
      Alert.alert("Error", errorMessage);
      return { success: false, error: errorMessage };
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

  const stopLocationTracking = useCallback(() => {
    locationService.stopLocationTracking();
    setState((prev) => ({ 
      ...prev, 
      isLocationTracking: false
    }));
    // Clear interval when stopping tracking
    if (locationIntervalRef.current) {
      clearInterval(locationIntervalRef.current);
      locationIntervalRef.current = null;
    }
  }, []);

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

  // 📍 Update delivery status in Firebase
  const updateDeliveryStatus = useCallback(async (orderId, status, additionalData = {}) => {
    if (!state.activeOrder || state.activeOrder.orderId !== orderId) {
    logger.warn('No active order found for status update');
      return false;
    }

    try {
      const orderRef = ref(database, `deliveryOrders/${orderId}`);
      const statusUpdate = {
        status: status,
        statusUpdatedAt: new Date().toISOString(),
        ...additionalData
      };

      // Clean undefined values before sending to Firebase
      const cleanedStatusUpdate = removeUndefinedFields(statusUpdate);
      
      await update(orderRef, cleanedStatusUpdate);
      
      // Update local state
      setState((prev) => ({
        ...prev,
        activeOrder: {
          ...prev.activeOrder,
          status: status,
          ...additionalData
        }
      }));

      // Update location tracking interval based on new status
      updateLocationTrackingInterval(status);

      return true;
    } catch (error) {
      logger.error('❌ Error updating delivery status:', error);
      return false;
    }
  }, [state.activeOrder]);

  // 📍 Send location update to Firebase (can be called manually)
  const sendLocationUpdate = useCallback(async (orderId) => {
    if (!orderId) {
      logger.warn('Order ID required for location update');
      return false;
    }

    const currentLocation = locationService.getCurrentLocation();
    if (!currentLocation) {
     logger.warn('No current location available');
      return false;
    }

    try {
      const orderRef = ref(database, `deliveryOrders/${orderId}`);
      const locationData = {
        deliveryLocation: {
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude,
          accuracy: currentLocation.accuracy,
          timestamp: currentLocation.timestamp
        },
        lastLocationUpdate: new Date().toISOString(),
        deliveryPerson: {
          id: userId,
          name: user?.firstName && user?.lastName ? `${user.firstName} ${user.lastName}` : 'Unknown User',
          phone: user?.phone || 'N/A',
          deliveryMethod: user?.deliveryMethod || 'N/A'
        }
      };

      // Clean undefined values before sending to Firebase
      const cleanedLocationData = removeUndefinedFields(locationData);
      
      await update(orderRef, cleanedLocationData);
      return true;
    } catch (error) {
      logger.error('❌ Error sending location update:', error);
      return false;
    }
  }, [userId, user]);

  // 📍 Initialize order tracking in Firebase when order is accepted
  const initializeOrderTracking = useCallback(async (orderData) => {
    if (!orderData || !orderData.orderId) {
      return false;
    }

    try {
      const orderRef = ref(database, `deliveryOrders/${orderData.orderId}`);
      
      // Get current location for initial tracking
      const currentLocation = locationService.getCurrentLocation();
      
      const initialData = {
        orderId: orderData.orderId,
        orderCode: orderData.orderCode || `ORD-${orderData.orderId.slice(-6)}`,
        status: orderData.status || 'Accepted',
        acceptedAt: new Date().toISOString(),
        deliveryPerson: {
          id: userId,
          name: user?.firstName && user?.lastName ? `${user.firstName} ${user.lastName}` : 'Unknown User',
          phone: user?.phone || 'N/A',
          deliveryMethod: user?.deliveryMethod || 'N/A'
        },
        restaurantLocation: orderData.restaurantLocation,
        customerLocation: orderData.deliveryLocation, // Customer destination
        trackingEnabled: true,
        lastLocationUpdate: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        // Add initial delivery location if available
        ...(currentLocation && {
          deliveryLocation: {
            latitude: currentLocation.latitude,
            longitude: currentLocation.longitude,
            accuracy: currentLocation.accuracy,
            timestamp: currentLocation.timestamp
          }
        })
      };

      // Clean undefined values before sending to Firebase
      const cleanedInitialData = removeUndefinedFields(initialData);
      
      await update(orderRef, cleanedInitialData);
      return true;
    } catch (error) {
      logger.error('❌ Error initializing order tracking:', error);
      logger.error('❌ Error details:', error?.message || error?.toString() || 'Unknown error');
      return false;
    }
  }, [userId, user]);

  // 📍 Send delivery guy location directly to Firebase (manual trigger)
  const sendDeliveryGuyLocationToFirebase = useCallback(async () => {
    if (!userId) {
      logger.warn('User ID required for location update');
      return false;
    }

    const currentLocation = locationService.getCurrentLocation();
    if (!currentLocation) {
     logger.warn('No current location available');
      return false;
    }

    try {
      const deliveryGuyRef = ref(database, `deliveryGuys/${userId}`);
      const locationHistoryRef = ref(database, `deliveryGuys/${userId}/locationHistory`);
      
      const locationData = {
        currentLocation: {
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude,
          accuracy: currentLocation.accuracy,
          timestamp: currentLocation.timestamp
        },
        lastLocationUpdate: new Date().toISOString(),
        deliveryPerson: {
          id: userId,
          name: user?.firstName && user?.lastName ? `${user.firstName} ${user.lastName}` : 'Unknown User',
          phone: user?.phone || 'N/A',
          deliveryMethod: user?.deliveryMethod || 'N/A'
        },
        isOnline: state.isOnline,
        isTracking: state.isLocationTracking,
        activeOrderId: state.activeOrder?.orderId || null,
        status: state.activeOrder?.status || 'Available'
      };
      
      const historyEntry = {
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
        accuracy: currentLocation.accuracy,
        timestamp: currentLocation.timestamp,
        status: state.activeOrder?.status || 'Available',
        recordedAt: new Date().toISOString(),
        activeOrderId: state.activeOrder?.orderId || null
      };
      
      // Clean undefined values before sending to Firebase
      const cleanedLocationData = removeUndefinedFields(locationData);
      const cleanedHistoryEntry = removeUndefinedFields(historyEntry);
      
      await Promise.all([
        update(deliveryGuyRef, cleanedLocationData),
        push(locationHistoryRef, cleanedHistoryEntry)
      ]);
      
      // Silently succeed - location sent successfully
      return true;
    } catch (error) {
      // Silently handle Firebase permission errors - they don't affect core functionality
      if (error.message?.includes('PERMISSION_DENIED') || error.message?.includes('permission_denied')) {
        // Permission denied - Firebase rules may need updating on backend
        return false;
      }
     logger.warn('⚠️ Could not send delivery guy location to Firebase');
      return false;
    }
  }, [userId, user, state.isOnline, state.isLocationTracking, state.activeOrder]);

  // 📍 Get optimal location update interval based on delivery status
  const getLocationUpdateInterval = useCallback((status) => {
    switch (status) {
      case 'Accepted':
        return 10000; // 10 seconds - driver heading to restaurant
      case 'PickedUp':
        return 5000;  // 5 seconds - driver heading to customer
      case 'InTransit':
        return 3000;  // 3 seconds - actively delivering
      case 'Delivered':
        return 0;     // Stop updates
      default:
        return 10000; // Default 10 seconds
    }
  }, []);

  // 📍 Update location tracking interval based on status
  const updateLocationTrackingInterval = useCallback((status) => {
    const interval = getLocationUpdateInterval(status);
    
    // Clear existing interval
    if (locationUpdateIntervalRef.current) {
      clearInterval(locationUpdateIntervalRef.current);
      locationUpdateIntervalRef.current = null;
    }
    
    // If interval is 0, stop tracking
    if (interval === 0) {
      return;
    }
    
    // Set new interval
    locationUpdateIntervalRef.current = setInterval(() => {
      const currentLocation = locationService.getCurrentLocation();
      if (currentLocation && state.activeOrder) {
        // Send location update
        const orderRef = ref(database, `deliveryOrders/${state.activeOrder.orderId}`);
        const locationHistoryRef = ref(database, `deliveryOrders/${state.activeOrder.orderId}/locationHistory`);
        
        const locationData = {
          deliveryLocation: {
            latitude: currentLocation.latitude,
            longitude: currentLocation.longitude,
            accuracy: currentLocation.accuracy,
            timestamp: currentLocation.timestamp
          },
          lastLocationUpdate: new Date().toISOString(),
          status: status
        };
        
        const historyEntry = {
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude,
          accuracy: currentLocation.accuracy,
          timestamp: currentLocation.timestamp,
          status: status,
          recordedAt: new Date().toISOString()
        };
        
        Promise.all([
          update(orderRef, locationData),
          push(locationHistoryRef, historyEntry)
        ]).catch(error => {
          // Silently handle Firebase permission errors
          if (!error.message?.includes('PERMISSION_DENIED') && !error.message?.includes('permission_denied')) {
           logger.warn('⚠️ Could not update location in Firebase');
          }
        });
        
        // Silently succeed - location tracking interval working
      }
    }, interval);
    
    // Silently update location tracking interval
  }, [state.activeOrder, getLocationUpdateInterval]);

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
        // Firebase tracking functions
        updateDeliveryStatus,
        sendLocationUpdate,
        initializeOrderTracking,
        sendDeliveryGuyLocationToFirebase,
        sendOrderStatusToFirebase,
        getLocationUpdateInterval,
        updateLocationTrackingInterval,
        // Cleanup functions
        clearDeliveryData,
        // Socket helpers
        reconnectSocket,
      }}
    >
      {children}
    </DeliveryContext.Provider>
  );
};
