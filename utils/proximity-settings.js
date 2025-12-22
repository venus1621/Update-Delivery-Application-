import AsyncStorage from '@react-native-async-storage/async-storage';

const PROXIMITY_RADIUS_KEY = '@proximity_radius_km';
const DEFAULT_RADIUS = 2; // Default 2km

// Available radius options
export const RADIUS_OPTIONS = [
  { value: 0.5, label: '500m' },
  { value: 1, label: '1 km' },
  { value: 2, label: '2 km' },
  { value: 3, label: '3 km' },
  { value: 5, label: '5 km' },
  { value: 10, label: '10 km' },
];

/**
 * Get the saved proximity radius in kilometers
 * @returns {Promise<number>} Radius in km
 */
export async function getProximityRadius() {
  try {
    const value = await AsyncStorage.getItem(PROXIMITY_RADIUS_KEY);
    if (value !== null) {
      return parseFloat(value);
    }
    return DEFAULT_RADIUS;
  } catch (error) {
    console.error('Error getting proximity radius:', error);
    return DEFAULT_RADIUS;
  }
}

/**
 * Save the proximity radius
 * @param {number} radiusKm - Radius in kilometers
 */
export async function setProximityRadius(radiusKm) {
  try {
    await AsyncStorage.setItem(PROXIMITY_RADIUS_KEY, radiusKm.toString());
    return true;
  } catch (error) {
    console.error('Error saving proximity radius:', error);
    return false;
  }
}

/**
 * Get proximity radius synchronously (returns cached value or default)
 * Use getProximityRadius() for accurate value
 */
let cachedRadius = DEFAULT_RADIUS;

export function getProximityRadiusSync() {
  return cachedRadius;
}

/**
 * Initialize and cache the radius setting
 */
export async function initProximitySettings() {
  cachedRadius = await getProximityRadius();
  return cachedRadius;
}

/**
 * Update cached radius (call after saving new value)
 */
export function updateCachedRadius(radiusKm) {
  cachedRadius = radiusKm;
}

