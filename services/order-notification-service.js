import * as Notifications from "expo-notifications";
import { Platform, Vibration } from "react-native";
import { Audio } from "expo-av";
import { isNotificationSoundEnabled } from "../utils/notification-settings";
import { logger } from "../utils/logger";

// Configure how notifications should be handled when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

class OrderNotificationService {
  constructor() {
    this.soundObjectRef = null;
    this.notificationChannel = null;
    this.initNotifications();
  }

  // Initialize notifications
  async initNotifications() {
    try {
      // Request notification permissions
      const { status } = await Notifications.requestPermissionsAsync();
      
      if (status !== "granted") {
        logger.warn("Notification permission not granted");
        return false;
      }

      // Set up Android notification channel (required for Android 8+)
      if (Platform.OS === "android") {
        this.notificationChannel = await Notifications.setNotificationChannelAsync(
          "new-orders",
          {
            name: "New Orders",
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: "#667eea",
            sound: "default",
            enableVibrate: true,
            showBadge: true,
            lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
          }
        );
        logger.log("✅ Android notification channel created:", this.notificationChannel);
      }

      // Configure audio for background playback
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: true,
        interruptionModeIOS: 1,
        interruptionModeAndroid: 1,
      });

      logger.log("✅ Order notification service initialized");
      return true;
    } catch (error) {
      logger.error("Failed to initialize notifications:", error);
      return false;
    }
  }

  // Play notification sound (works in background)
  async playNotificationSound() {
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

      // Play notification sound - using multiple fallback options
      const soundUrls = [
        'https://cdn.pixabay.com/audio/2022/03/10/audio_c0856b19d7.mp3',
        'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3',
        'https://freesound.org/data/previews/320/320655_5260872-lq.mp3',
      ];

      for (const soundUrl of soundUrls) {
        try {
          const { sound } = await Audio.Sound.createAsync(
            { uri: soundUrl },
            {
              shouldPlay: true,
              isLooping: false,
              volume: 1.0,
            }
          );

          this.soundObjectRef = sound;
          
          // Auto-cleanup after 3 seconds
          setTimeout(async () => {
            if (this.soundObjectRef) {
              await this.soundObjectRef.unloadAsync();
              this.soundObjectRef = null;
            }
          }, 3000);

          break; // Successfully loaded
        } catch (err) {
          continue;
        }
      }
    } catch (error) {
      logger.error("Error playing notification sound:", error);
    }
  }

  // Show new order notification (works even when app is in background)
  async showNewOrderNotification(orderData) {
    try {
      const orderCode = orderData?.orderCode || "New Order";
      const restaurantName = orderData?.restaurantName || "Restaurant";
      const deliveryFee = orderData?.deliveryFee?.$numberDecimal || orderData?.deliveryFee || "0";
      const tip = orderData?.tip?.$numberDecimal || orderData?.tip || "0";
      
      // Calculate total earnings
      const totalEarnings = parseFloat(deliveryFee) + parseFloat(tip);

      // Schedule local notification
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "🆕 New Delivery Order!",
          body: `${orderCode} from ${restaurantName}\n💰 Earnings: $${totalEarnings.toFixed(2)}`,
          data: { 
            orderId: orderData?.orderId || orderData?._id,
            orderCode,
            type: "new-order" 
          },
          sound: true,
          priority: Notifications.AndroidNotificationPriority.MAX,
          vibrate: [0, 250, 250, 250],
          badge: 1,
        },
        trigger: null, // Show immediately
      });

      // Play custom sound (in addition to notification sound)
      await this.playNotificationSound();

      // Vibrate
      Vibration.vibrate([0, 500, 200, 500]);

      logger.log("✅ New order notification shown:", orderCode);
      return true;
    } catch (error) {
      logger.error("Failed to show notification:", error);
      // Fallback to just sound and vibration
      await this.playNotificationSound();
      Vibration.vibrate([0, 500, 200, 500]);
      return false;
    }
  }

  // Show simple notification with custom title and body
  async showNotification(title, body, data = {}) {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data: { ...data, timestamp: Date.now() },
          sound: true,
          priority: Notifications.AndroidNotificationPriority.HIGH,
        },
        trigger: null,
      });

      logger.log(`✅ Notification shown: ${title}`);
      return true;
    } catch (error) {
      logger.error("Failed to show notification:", error);
      return false;
    }
  }

  // Cancel all notifications
  async cancelAllNotifications() {
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
      logger.log("✅ All notifications cancelled");
    } catch (error) {
      logger.error("Failed to cancel notifications:", error);
    }
  }

  // Get notification badge count
  async getBadgeCount() {
    try {
      return await Notifications.getBadgeCountAsync();
    } catch (error) {
      logger.error("Failed to get badge count:", error);
      return 0;
    }
  }

  // Set notification badge count
  async setBadgeCount(count) {
    try {
      await Notifications.setBadgeCountAsync(count);
    } catch (error) {
      logger.error("Failed to set badge count:", error);
    }
  }

  // Clear badge
  async clearBadge() {
    await this.setBadgeCount(0);
  }

  // Cleanup
  async cleanup() {
    if (this.soundObjectRef) {
      await this.soundObjectRef.unloadAsync();
      this.soundObjectRef = null;
    }
    await this.cancelAllNotifications();
  }
}

export default new OrderNotificationService();

