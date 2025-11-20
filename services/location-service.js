import * as Location from 'expo-location';
import { useState, useEffect, useRef } from 'react';
import { logger } from '../utils/logger';

class LocationService {
  constructor() {
    this.watchId = null;
    this.locationCallbacks = new Set();
    this.isTracking = false;
    this.currentLocation = null;
    this.lastUpdateTime = null;
  }

  // Subscribe to location updates
  subscribe(callback) {
    this.locationCallbacks.add(callback);
    
    // If we already have a location, call the callback immediately
    if (this.currentLocation) {
      callback(this.currentLocation);
    }
    
    // Start tracking if not already started
    if (!this.isTracking) {
      this.startLocationTracking();
    }
    
    // Return unsubscribe function
    return () => {
      this.locationCallbacks.delete(callback);
      if (this.locationCallbacks.size === 0) {
        this.stopLocationTracking();
      }
    };
  }

  // Start location tracking
  async startLocationTracking() {
    try {
      // Request permissions
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        throw new Error('Location permission not granted');
      }

      // Request background permissions for continuous tracking
      const backgroundStatus = await Location.requestBackgroundPermissionsAsync();
      logger.log('Background location permission:', backgroundStatus.status);

      this.isTracking = true;

      // Get initial location
      const initialLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      
      this.updateLocation({
        latitude: initialLocation.coords.latitude,
        longitude: initialLocation.coords.longitude,
        accuracy: initialLocation.coords.accuracy,
        timestamp: initialLocation.timestamp,
      });

      // Start watching location changes
      this.watchId = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 5000, // Update every 5 seconds
          // distanceInterval: 10, // Update every 10 meters
        },
        (location) => {
          this.updateLocation({
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            accuracy: location.coords.accuracy,
            timestamp: location.timestamp,
          });
        }
      );

      logger.log('📍 Location tracking started');
    } catch (error) {
      console.error('Error starting location tracking:', error);
      this.isTracking = false;
      throw error;
    }
  }

  // Stop location tracking
  async stopLocationTracking() {
    if (this.watchId) {
      try {
        // watchPositionAsync returns a subscription object with a `remove()` method.
        // stopLocationUpdatesAsync expects a string `taskName` used for
        // background location tasks (startLocationUpdatesAsync). Handle both.
        if (typeof this.watchId.remove === 'function') {
          this.watchId.remove();
        } else if (typeof this.watchId === 'string') {
          await Location.stopLocationUpdatesAsync(this.watchId);
        } else {
          // Unknown type; attempt to call remove if present, otherwise ignore.
          if (this.watchId && typeof this.watchId === 'object' && typeof this.watchId.remove === 'function') {
            this.watchId.remove();
          }
        }
      } catch (error) {
        console.warn('Error stopping location updates:', error);
      }

      this.watchId = null;
    }
    this.isTracking = false;
    logger.log('📍 Location tracking stopped');
  }

  // Update location and notify subscribers
  updateLocation(location) {
    this.currentLocation = location;
    this.lastUpdateTime = Date.now();
    
    // Notify all subscribers
    this.locationCallbacks.forEach(callback => {
      try {
        callback(location);
      } catch (error) {
        console.error('Error in location callback:', error);
      }
    });
  }

  // Get current location
  getCurrentLocation() {
    return this.currentLocation;
  }

  // Get location with promise
  async getCurrentLocationAsync() {
    if (this.currentLocation) {
      return this.currentLocation;
    }

    try {
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      
      return {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy,
        timestamp: location.timestamp,
      };
    } catch (error) {
      console.error('Error getting current location:', error);
      throw error;
    }
  }

  // Calculate distance between two points
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the Earth in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  // Check if location is recent (within last 30 seconds)
  isLocationRecent() {
    if (!this.lastUpdateTime) return false;
    return (Date.now() - this.lastUpdateTime) < 30000;
  }

  // Get location status
  getStatus() {
    return {
      isTracking: this.isTracking,
      hasLocation: !!this.currentLocation,
      isRecent: this.isLocationRecent(),
      subscriberCount: this.locationCallbacks.size,
    };
  }
}

// Create singleton instance
const locationService = new LocationService();

// React hook for using location service
export const useLocationTracking = () => {
  const [location, setLocation] = useState(locationService.getCurrentLocation());
  const [isTracking, setIsTracking] = useState(locationService.isTracking);
  const [error, setError] = useState(null);

  useEffect(() => {
    const unsubscribe = locationService.subscribe((newLocation) => {
      setLocation(newLocation);
      setIsTracking(locationService.isTracking);
      setError(null);
    });

    return unsubscribe;
  }, []);

  const startTracking = async () => {
    try {
      setError(null);
      await locationService.startLocationTracking();
    } catch (err) {
      setError(err.message);
    }
  };

  const stopTracking = () => {
    locationService.stopLocationTracking();
  };

  const getCurrentLocation = () => {
    return locationService.getCurrentLocation();
  };

  const getCurrentLocationAsync = () => {
    return locationService.getCurrentLocationAsync();
  };

  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    return locationService.calculateDistance(lat1, lon1, lat2, lon2);
  };

  return {
    location,
    isTracking,
    error,
    startTracking,
    stopTracking,
    getCurrentLocation,
    getCurrentLocationAsync,
    calculateDistance,
    status: locationService.getStatus(),
  };
};

export default locationService;
