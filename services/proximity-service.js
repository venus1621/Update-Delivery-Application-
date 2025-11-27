import { Alert, Vibration, Linking } from "react-native";
import { Audio } from "expo-av";
import { isNotificationSoundEnabled } from "../utils/notification-settings";
import locationService from "./location-service";
import { logger } from "../utils/logger";

class ProximityService {
  constructor() {
    this.notifiedOrders = new Set();
    this.CHECK_INTERVAL = 5000; // 5 seconds
    this.THRESHOLD = 200; // meters
    this.RESET_DISTANCE = 300;
    this.intervalRef = null;
    this.soundObjectRef = null;
    this.vibrationIntervalRef = null;
    
    // Initialize audio mode
    this.initAudio();
  }

  // Initialize audio settings
  async initAudio() {
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      });
    } catch (e) {
      logger.error("Audio init error:", e);
    }
  }

  // ---------------------------
  // 🔊 Play Alert Sound
  // ---------------------------
  playAlertSound = async () => {
    try {
      const soundEnabled = await isNotificationSoundEnabled();
      
      if (!soundEnabled) {
        return;
      }

      // Stop any existing sound
      if (this.soundObjectRef) {
        await this.soundObjectRef.stopAsync();
        await this.soundObjectRef.unloadAsync();
        this.soundObjectRef = null;
      }

      // Play alert sound
      const { sound } = await Audio.Sound.createAsync(
        { uri: "https://actions.google.com/sounds/v1/alarms/beep_short.ogg" },
        {
          shouldPlay: true,
          isLooping: true,
          volume: 1.0,
        }
      );

      this.soundObjectRef = sound;
    } catch (e) {
      logger.error("Alert sound error:", e);
    }
  };

  // ---------------------------
  // 🔇 Stop Alert Sound
  // ---------------------------
  stopAlertSound = async () => {
    try {
      if (this.soundObjectRef) {
        await this.soundObjectRef.stopAsync();
        await this.soundObjectRef.unloadAsync();
        this.soundObjectRef = null;
      }
    } catch (e) {
      logger.error("Stop sound error:", e);
    }
  };

  // ---------------------------
  // 🔔 Show Alert Notification
  // ---------------------------
  showAlertNotification = async (title, body, orderId, phone = null) => {
    try {
      // Play sound
      await this.playAlertSound();

      // Vibrate
      Vibration.vibrate([500, 1000, 500]);

      // Show alert dialog
      const buttons = [];
      
      if (phone) {
        buttons.push({
          text: "📞 Call Customer",
          onPress: () => {
            this.stopAlertSound();
            Linking.openURL(`tel:${phone}`);
          },
        });
      }
      
      buttons.push({
        text: "Got it!",
        onPress: () => this.stopAlertSound(),
        style: "cancel",
      });

      Alert.alert(title, body, buttons, {
        cancelable: false,
        onDismiss: () => this.stopAlertSound(),
      });
    } catch (e) {
      logger.error("Alert notification error:", e);
    }
  };

  extractLatLng = (obj) => {
    if (!obj) return null;

    if (obj.type === "Point" && Array.isArray(obj.coordinates)) {
      return {
        lat: obj.coordinates[1],
        lng: obj.coordinates[0],
      };
    }

    if (obj.lat && obj.lng) return obj;

    return null;
  };

  // ----------------------------------------
  // 🔍 Main Proximity Logic For One Location
  // ----------------------------------------
  async checkOneLocation(order, currentLocation, target, isDestination, orderId) {
    const dist = locationService.calculateDistance(
      currentLocation.latitude,
      currentLocation.longitude,
      target.lat,
      target.lng
    );

    const meters = dist * 1000;

    // Reset logic when driver moves away
    if (meters > this.RESET_DISTANCE) {
      this.notifiedOrders.delete(orderId + "_" + (isDestination ? "dest" : "rest"));
      return;
    }

    // Already notified?
    const key = orderId + "_" + (isDestination ? "dest" : "rest");
    if (this.notifiedOrders.has(key)) return;

    // Trigger notification
    if (meters <= this.THRESHOLD) {
      this.notifiedOrders.add(key);

      if (isDestination) {
        // Destination proximity → CALL CUSTOMER notification
        const phone = order.phone || order.customerPhone || order.userPhone || null;
        
        await this.showAlertNotification(
          "📍 Approaching Customer!",
          `You are ${Math.round(meters)} meters from customer.\n\nOrder: ${order.orderCode || orderId}\nCustomer: ${order.userName || "Customer"}`,
          orderId,
          phone
        );
      } else {
        // Restaurant proximity
        await this.showAlertNotification(
          `🏪 Near Restaurant`,
          `You are ${Math.round(meters)} meters from ${order.restaurantName || "restaurant"}.\n\nOrder: ${order.orderCode || orderId}\n\nArrive & pick up the order.`,
          orderId,
          null
        );
      }
    }
  }

  // -----------------------------------------
  // 🚀 Entry Point — Check both locations
  // -----------------------------------------
  async checkProximity(order, currentLocation) {
    const orderId = order.id || order._id;

    // Restaurant location check (when cooked)
    if (order.orderStatus === "Cooked") {
      const rest = this.extractLatLng(order.restaurantLocation);
      if (rest) {
        await this.checkOneLocation(order, currentLocation, rest, false, orderId);
      }
    }

    // Destination location check (when delivering)
    if (
      ["Delivering", "OnTheWay", "On Delivery"].includes(order.orderStatus)
    ) {
      const dest = this.extractLatLng(order.destinationLocation);
      if (dest) {
        await this.checkOneLocation(order, currentLocation, dest, true, orderId);
      }
    }
  }

  // ------------------------------------------------
  // 🔁 Global Proximity Loop — runs every 5 seconds
  // ------------------------------------------------
  startProximityLoop(getActiveOrders, getCurrentLocation) {
    if (this.intervalRef) clearInterval(this.intervalRef);

    this.intervalRef = setInterval(async () => {
      const location = getCurrentLocation();
      if (!location) return;

      const orders = getActiveOrders();
      if (!orders || orders.length === 0) return;

      logger.log("🔍 Checking proximity for", orders.length, "order(s)");

      for (const order of orders) {
        await this.checkProximity(order, location);
      }
    }, this.CHECK_INTERVAL);
  }

  stopProximityLoop() {
    if (this.intervalRef) {
      clearInterval(this.intervalRef);
      this.intervalRef = null;
    }
  }

  // Alias for backward compatibility
  stopProximityChecking() {
    this.stopProximityLoop();
  }

  // Alias for backward compatibility
  startProximityChecking(getActiveOrders, getCurrentLocation) {
    this.startProximityLoop(getActiveOrders, getCurrentLocation);
  }

  // Stop alarm and vibration
  stopProximityAlarm = async () => {
    await this.stopAlertSound();
    Vibration.cancel();
  };

  reset() {
    this.notifiedOrders.clear();
    this.stopProximityLoop();
  }

  // Cleanup all resources
  cleanup = async () => {
    this.stopProximityLoop();
    await this.stopProximityAlarm();
    this.notifiedOrders.clear();
  };
}

export default new ProximityService();
