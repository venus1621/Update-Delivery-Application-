import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { logger } from "../utils/logger";

const BACKGROUND_LOCATION_TASK = "BACKGROUND_LOCATION_UPDATES";

// Store callback references
let proximityCheckCallback = null;

// Register the background task
TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    logger.error("Background location error:", error);
    return;
  }

  if (data) {
    const { locations } = data;
    
    if (locations && locations.length > 0) {
      const location = locations[0];
      logger.log("📍 Background location update:", {
        lat: location.coords.latitude,
        lng: location.coords.longitude,
      });

      // Call the proximity check callback if registered
      if (proximityCheckCallback) {
        try {
          await proximityCheckCallback({
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            timestamp: location.timestamp,
          });
        } catch (err) {
          logger.error("Proximity check error in background:", err);
        }
      }
    }
  }
});

// Start background location tracking
export async function startBackgroundLocationUpdates(callback) {
  try {
    // Request background location permissions
    const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
    
    if (foregroundStatus !== "granted") {
      logger.error("Foreground location permission not granted");
      return false;
    }

    const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
    
    if (backgroundStatus !== "granted") {
      logger.warn("Background location permission not granted");
      return false;
    }

    // Store the callback
    proximityCheckCallback = callback;

    // Check if task is already registered
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
    
    if (isRegistered) {
      logger.log("Background location task already registered");
    } else {
      // Start location updates
      await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
        accuracy: Location.Accuracy.Balanced,
        distanceInterval: 50, // Update every 50 meters
        timeInterval: 5000, // Update every 5 seconds
        foregroundService: {
          notificationTitle: "Bahiran Delivery Active",
          notificationBody: "Tracking your location for delivery updates",
          notificationColor: "#667eea",
        },
        pausesUpdatesAutomatically: false,
        showsBackgroundLocationIndicator: true,
      });
      
      logger.log("✅ Background location tracking started");
    }

    return true;
  } catch (error) {
    logger.error("Failed to start background location:", error);
    return false;
  }
}

// Stop background location tracking
export async function stopBackgroundLocationUpdates() {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
    
    if (isRegistered) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      logger.log("🛑 Background location tracking stopped");
    }
    
    proximityCheckCallback = null;
    return true;
  } catch (error) {
    logger.error("Failed to stop background location:", error);
    return false;
  }
}

// Check if background location is running
export async function isBackgroundLocationRunning() {
  try {
    return await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
  } catch (error) {
    logger.error("Failed to check background location status:", error);
    return false;
  }
}

export { BACKGROUND_LOCATION_TASK };

