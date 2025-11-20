import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Dimensions,
  Platform,
  Linking,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, MapPin, Navigation, RefreshCw, Play, Pause, Trash2 } from 'lucide-react-native';
import { useLocalSearchParams, router } from 'expo-router';
import * as Location from 'expo-location';
import { useLocationTracking } from '../services/location-service';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';

const { width, height } = Dimensions.get('window');
const ASPECT_RATIO = width / height;
const ROUTE_RECALC_DEBOUNCE = 5000; // ms
const MAX_MOVEMENT_POINTS = 500;

export default function MapScreen() {
  const { restaurantLocation } = useLocalSearchParams();
  const {
    location: currentLocation,
    error: locationError,
    startTracking,
    calculateDistance,
  } = useLocationTracking();

  const [isLoadingRoute, setIsLoadingRoute] = useState(false);
  const [locationPermission, setLocationPermission] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [routeCoordinates, setRouteCoordinates] = useState([]);
  const [movementPath, setMovementPath] = useState([]);
  const [distance, setDistance] = useState(0);
  const [eta, setEta] = useState(0); // in minutes
  const [isTrackingMovement, setIsTrackingMovement] = useState(false);

  const movementPathRef = useRef([]);
  const mapRef = useRef(null);
  const isCalculatingRef = useRef(false);
  const lastRouteCalcRef = useRef(0);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Parse restaurant location safely
  const restaurant = useMemo(() => {
    if (!restaurantLocation) return null;
    try {
      const parsed = JSON.parse(restaurantLocation);
      if (typeof parsed.lat !== 'number' || typeof parsed.lng !== 'number') {
        throw new Error('Invalid coordinates');
      }
      return parsed;
    } catch (error) {
      console.error('Invalid restaurant location:', error);
      Alert.alert('Error', 'Invalid restaurant data.');
      return null;
    }
  }, [restaurantLocation]);

  // Initialize location
  useEffect(() => {
    initializeLocation();
  }, []);

  // Recalculate route when location or restaurant changes
  useEffect(() => {
    if (currentLocation && restaurant) {
      const now = Date.now();
      if (now - lastRouteCalcRef.current > ROUTE_RECALC_DEBOUNCE) {
        calculateRoute();
        lastRouteCalcRef.current = now;
      }
    }
  }, [currentLocation, restaurant]);

  // Update movement path
  useEffect(() => {
    if (currentLocation && isTrackingMovement) {
      const newPoint = {
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
        timestamp: Date.now(),
      };

      // Avoid duplicates
      const last = movementPathRef.current[movementPathRef.current.length - 1];
      if (!last || calculateDistance(last.latitude, last.longitude, newPoint.latitude, newPoint.longitude) > 0.005) {
        movementPathRef.current = [...movementPathRef.current.slice(-MAX_MOVEMENT_POINTS), newPoint];
        setMovementPath(movementPathRef.current);
      }
    }
  }, [currentLocation, isTrackingMovement]);

  // Show errors
  useEffect(() => {
    if (locationError) {
      Alert.alert('Location Error', locationError);
    }
  }, [locationError]);

  // Fit map to route
  useEffect(() => {
    if (routeCoordinates.length > 1 && mapRef.current) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();

      mapRef.current.fitToCoordinates(routeCoordinates, {
        edgePadding: { top: 80, right: 80, bottom: 200, left: 80 },
        animated: true,
      });
    }
  }, [routeCoordinates]);

  const initializeLocation = async () => {
    try {
      setIsInitializing(true);
      await startTracking();
      setLocationPermission(true);
    } catch (error) {
      Alert.alert(
        'Location Required',
        'Enable location to use navigation.',
        [
          { text: 'Cancel', onPress: () => router.back() },
          { text: 'Retry', onPress: initializeLocation },
        ]
      );
    } finally {
      setIsInitializing(false);
    }
  };

  const calculateRoute = async () => {
    if (!currentLocation || !restaurant || isCalculatingRef.current) return;

    isCalculatingRef.current = true;
    setIsLoadingRoute(true);

    try {
      const routeData = await getRouteCoordinates(
        currentLocation.latitude,
        currentLocation.longitude,
        restaurant.lat,
        restaurant.lng
      );

      if (routeData?.coordinates?.length > 0) {
        setRouteCoordinates(routeData.coordinates);
        setDistance(routeData.distance / 1000); // meters → km
        setEta(Math.round(routeData.duration / 60)); // seconds → minutes
      } else {
        fallbackRoute();
      }
    } catch (error) {
      console.error('Route error:', error);
      fallbackRoute();
    } finally {
      setIsLoadingRoute(false);
      isCalculatingRef.current = false;
    }
  };

  const fallbackRoute = () => {
    const coords = [
      { latitude: currentLocation.latitude, longitude: currentLocation.longitude },
      { latitude: restaurant.lat, longitude: restaurant.lng },
    ];
    setRouteCoordinates(coords);
    const dist = calculateDistance(
      currentLocation.latitude,
      currentLocation.longitude,
      restaurant.lat,
      restaurant.lng
    );
    setDistance(dist);
    setEta(Math.round(dist / 5)); // ~5 km/h walking
  };

  const getRouteCoordinates = async (startLat, startLng, endLat, endLng) => {
    try {
      const url = `http://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson&steps=true`;
      const response = await fetch(url);

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      const route = data.routes?.[0];

      if (!route) return null;

      const coords = route.geometry.coordinates.map(([lng, lat]) => ({
        latitude: lat,
        longitude: lng,
      }));

      return {
        coordinates: coords,
        distance: route.distance,
        duration: route.duration,
      };
    } catch (error) {
      console.error('OSRM failed:', error);
      return null;
    }
  };

  const toggleTracking = () => {
    if (isTrackingMovement) {
      setIsTrackingMovement(false);
    } else {
      movementPathRef.current = [];
      setMovementPath([]);
      setIsTrackingMovement(true);
    }
  };

  const clearPath = () => {
    movementPathRef.current = [];
    setMovementPath([]);
  };

  const openInMaps = async () => {
    if (!currentLocation || !restaurant) return;

    const latLng = `${restaurant.lat},${restaurant.lng}`;
    const label = encodeURIComponent(restaurant.name || 'Restaurant');
    const currentLatLng = `${currentLocation.latitude},${currentLocation.longitude}`;

    // Use Google Maps directions URL format with current location as origin for all platforms
    const url = Platform.select({
      ios: `http://maps.apple.com/?saddr=${currentLatLng}&daddr=${latLng}&dirflg=d`,
      android: `https://www.google.com/maps/dir/?api=1&origin=${currentLatLng}&destination=${latLng}&travelmode=driving`,
      default: `https://www.google.com/maps/dir/?api=1&origin=${currentLatLng}&destination=${latLng}&travelmode=driving`,
    });

    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      }
    } catch (error) {
      console.error('Error opening maps:', error);
      Alert.alert('Error', 'Cannot open maps app.');
    }
  };

  if (isInitializing) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <ArrowLeft color="#1F2937" size={24} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Navigation</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1E40AF" />
          <Text style={styles.loadingText}>Getting your location...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!currentLocation || !restaurant) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <ArrowLeft color="#1F2937" size={24} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Navigation</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.errorContainer}>
          <MapPin color="#EF4444" size={48} />
          <Text style={styles.errorTitle}>Location Unavailable</Text>
          <Text style={styles.errorMessage}>
            We couldn't get your location. Please check permissions and try again.
          </Text>
          <TouchableOpacity style={styles.retryButton} onPress={initializeLocation}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ArrowLeft color="#1F2937" size={24} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Navigation</Text>
        <TouchableOpacity style={styles.refreshButton} onPress={calculateRoute}>
          <RefreshCw color="#1E40AF" size={20} />
        </TouchableOpacity>
      </View>

      {/* Map */}
      <View style={styles.mapContainer}>
        {Platform.OS === 'web' ? (
          <iframe
            title="Map"
            src={`https://www.openstreetmap.org/export/embed.html?bbox=${
              Math.min(currentLocation.longitude, restaurant.lng) - 0.02
            },${Math.min(currentLocation.latitude, restaurant.lat) - 0.02},${
              Math.max(currentLocation.longitude, restaurant.lng) + 0.02
            },${Math.max(currentLocation.latitude, restaurant.lat) + 0.02}&layer=mapnik&marker=${currentLocation.latitude},${currentLocation.longitude}&marker=${restaurant.lat},${restaurant.lng}`}
            style={{ width: '100%', height: '100%', border: 0 }}
          />
        ) : (
          <MapView
            ref={mapRef}
            style={styles.nativeMapContainer}
            provider={PROVIDER_GOOGLE}
            showsUserLocation
            showsMyLocationButton
            initialRegion={{
              latitude: (currentLocation.latitude + restaurant.lat) / 2,
              longitude: (currentLocation.longitude + restaurant.lng) / 2,
              latitudeDelta: Math.abs(currentLocation.latitude - restaurant.lat) * 3 || 0.02,
              longitudeDelta: Math.abs(currentLocation.longitude - restaurant.lng) * 3 * ASPECT_RATIO || 0.02,
            }}
          >
            <Marker coordinate={currentLocation} title="You are here" pinColor="#1E40AF" />
            <Marker coordinate={{ latitude: restaurant.lat, longitude: restaurant.lng }} title={restaurant.name || 'Restaurant'} pinColor="#EF4444" />

            {routeCoordinates.length > 0 && (
              <Polyline coordinates={routeCoordinates} strokeColor="#1E40AF" strokeWidth={4} />
            )}

            {movementPath.length > 1 && (
              <Polyline coordinates={movementPath} strokeColor="#10B981" strokeWidth={3} lineDashPattern={[5, 5]} />
            )}
          </MapView>
        )}

        {isLoadingRoute && (
          <Animated.View style={[styles.loadingOverlay, { opacity: fadeAnim }]}>
            <ActivityIndicator size="small" color="#1E40AF" />
            <Text style={styles.loadingOverlayText}>Updating route...</Text>
          </Animated.View>
        )}
      </View>

      {/* Bottom Panel */}
      <View style={styles.infoPanel}>
        <LinearGradient colors={['#FFFFFF', '#F8FAFC']} style={styles.infoGradient}>
          <View style={styles.infoContent}>
            {/* Distance & ETA */}
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>Distance</Text>
                <Text style={styles.statValue}>{distance.toFixed(2)} km</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>ETA</Text>
                <Text style={styles.statValue}>{eta} min</Text>
              </View>
            </View>

            {/* Action Buttons */}
            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.actionButton} onPress={toggleTracking}>
                {isTrackingMovement ? <Pause color="#DC2626" size={20} /> : <Play color="#10B981" size={20} />}
                <Text style={[styles.actionText, isTrackingMovement && styles.activeText]}>
                  {isTrackingMovement ? 'Stop' : 'Track'} Path
                </Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionButton} onPress={clearPath} disabled={movementPath.length === 0}>
                <Trash2 color={movementPath.length > 0 ? "#EF4444" : "#9CA3AF"} size={20} />
                <Text style={[styles.actionText, movementPath.length > 0 && styles.dangerText]}>Clear</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.openMapsButton} onPress={openInMaps}>
                <LinearGradient colors={['#1E40AF', '#1D4ED8']} style={styles.openMapsGradient}>
                  <Navigation color="#FFFFFF" size={20} />
                  <Text style={styles.openMapsText}>Open in Maps</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </LinearGradient>
      </View>
    </SafeAreaView>
  );
}

// Styles (updated)
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: { padding: 8 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#1F2937' },
  refreshButton: { padding: 8 },
  placeholder: { width: 40 },
  mapContainer: { flex: 1, position: 'relative' },
  nativeMapContainer: { width: '100%', height: '100%' },
  loadingOverlay: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  loadingOverlayText: { marginLeft: 8, fontWeight: '600', color: '#1E40AF' },
  infoPanel: { borderTopWidth: 1, borderTopColor: '#E5E7EB' },
  infoGradient: { padding: 20 },
  infoContent: { gap: 16 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around' },
  statItem: { alignItems: 'center' },
  statLabel: { fontSize: 14, color: '#6B7280' },
  statValue: { fontSize: 20, fontWeight: 'bold', color: '#1E40AF', marginTop: 4 },
  actionRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    gap: 8,
  },
  actionText: { fontSize: 14, fontWeight: '600', color: '#374151' },
  activeText: { color: '#DC2626' },
  dangerText: { color: '#EF4444' },
  openMapsButton: { flex: 1.5, borderRadius: 12, overflow: 'hidden' },
  openMapsGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, gap: 8 },
  openMapsText: { color: '#FFF', fontWeight: 'bold', fontSize: 15 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 16, fontSize: 16, color: '#6B7280' },
  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  errorTitle: { fontSize: 20, fontWeight: 'bold', color: '#1F2937', marginTop: 16 },
  errorMessage: { fontSize: 16, color: '#6B7280', textAlign: 'center', lineHeight: 24, marginVertical: 16 },
  retryButton: { backgroundColor: '#1E40AF', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  retryButtonText: { color: '#FFF', fontWeight: '600' },
});
