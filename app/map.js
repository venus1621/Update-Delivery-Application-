import React, { useState, useEffect, useRef, useMemo } from 'react';
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
import { ArrowLeft, Navigation, RefreshCw, Play, Pause, Trash2 } from 'lucide-react-native';
import { useLocalSearchParams, router } from 'expo-router';
import MapView, { Polyline, Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { useLocationTracking } from '../services/location-service';

const { width, height } = Dimensions.get('window');

export default function MapScreen() {
  const { restaurantLocation } = useLocalSearchParams();
  const {
    location: currentLocation,
    error: locationError,
    startTracking,
    calculateDistance,
  } = useLocationTracking();

  const [isLoadingRoute, setIsLoadingRoute] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [routeCoordinates, setRouteCoordinates] = useState([]);
  const [movementPath, setMovementPath] = useState([]);
  const [distance, setDistance] = useState(0);
  const [eta, setEta] = useState(0);
  const [isTrackingMovement, setIsTrackingMovement] = useState(false);

  const mapRef = useRef(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const lastRouteCalcRef = useRef(0);
  const ROUTE_RECALC_DEBOUNCE = 5000;

  const restaurant = useMemo(() => {
    if (!restaurantLocation) return null;
    try {
      const parsed = JSON.parse(restaurantLocation);
      if (typeof parsed.lat === 'number' && typeof parsed.lng === 'number') {
        return { latitude: parsed.lat, longitude: parsed.lng, ...parsed };
      }
    } catch (e) {
      console.error('Invalid restaurant location:', e);
      Alert.alert('Error', 'Invalid restaurant data.');
    }
    return null;
  }, [restaurantLocation]);

  useEffect(() => {
    initializeLocation();
  }, []);

  useEffect(() => {
    if (currentLocation && restaurant) {
      const now = Date.now();
      if (now - lastRouteCalcRef.current > ROUTE_RECALC_DEBOUNCE) {
        calculateRoute();
        lastRouteCalcRef.current = now;
      }
    }
  }, [currentLocation, restaurant]);

  useEffect(() => {
    if (currentLocation && isTrackingMovement) {
      const newPoint = {
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
      };
      setMovementPath(prev => {
        const last = prev[prev.length - 1];
        if (!last || calculateDistance(last.latitude, last.longitude, newPoint.latitude, newPoint.longitude) > 0.01) {
          return [...prev.slice(-500), newPoint];
        }
        return prev;
      });
    }
  }, [currentLocation, isTrackingMovement]);

  useEffect(() => {
    if (locationError) Alert.alert('Location Error', locationError);
  }, [locationError]);

  const initializeLocation = async () => {
    setIsInitializing(true);
    try {
      await startTracking();
    } catch (err) {
      Alert.alert('Location Required', 'Enable location to use navigation.', [
        { text: 'Cancel', onPress: () => router.back() },
        { text: 'Retry', onPress: initializeLocation },
      ]);
    } finally {
      setIsInitializing(false);
  }
  };

  const calculateRoute = async () => {
    if (!currentLocation || !restaurant) return;

    setIsLoadingRoute(true);
    Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();

    try {
      const routeData = await getRouteFromOSRM(
        currentLocation.latitude,
        currentLocation.longitude,
        restaurant.latitude,
        restaurant.longitude
      );

      if (routeData?.coordinates?.length > 0) {
        setRouteCoordinates(routeData.coordinates);
        setDistance(routeData.distance / 1000);
        setEta(Math.round(routeData.duration / 60));
      } else {
        fallbackStraightLine();
      }
    } catch (err) {
      console.error(err);
      fallbackStraightLine();
    } finally {
      setIsLoadingRoute(false);
    }
  };

  const fallbackStraightLine = () => {
    const line = [
      { latitude: currentLocation.latitude, longitude: currentLocation.longitude },
      { latitude: restaurant.latitude, longitude: restaurant.longitude },
    ];
    setRouteCoordinates(line);
    const distKm = calculateDistance(currentLocation.latitude, currentLocation.longitude, restaurant.latitude, restaurant.longitude);
    setDistance(distKm);
    setEta(Math.round(distKm / 5 * 60)); // ~5 km/h walking
  };

  const getRouteFromOSRM = async (startLat, startLng, endLat, endLng) => {
    try {
      const url = `http://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('OSRM error');
      const data = await res.json();
      const route = data.routes[0];
      const coords = route.geometry.coordinates.map(([lng, lat]) => ({
        latitude: lat,
        longitude: lng,
      }));
      return {
        coordinates: coords,
        distance: route.distance,
        duration: route.duration,
      };
    } catch (e) {
      return null;
    }
  };

  const animateToRoute = () => {
    if (routeCoordinates.length < 2 || !mapRef.current) return;

    mapRef.current.fitToCoordinates(routeCoordinates, {
      edgePadding: { top: 100, right: 100, bottom: 300, left: 100 },
      animated: true,
    });
  };

  useEffect(() => {
    if (routeCoordinates.length > 1) animateToRoute();
  }, [routeCoordinates]);

  const toggleTracking = () => {
    setIsTrackingMovement(prev => {
      if (!prev) setMovementPath([]); // clear on start
      return !prev;
    });
  };

  const openInMaps = async () => {
    if (!currentLocation || !restaurant) return;

    const scheme = Platform.select({
      ios: 'maps:0,0?q=',
      android: 'geo:0,0?q=',
    });
    const latLng = `${restaurant.latitude},${restaurant.longitude}`;
    const label = encodeURIComponent(restaurant.name || 'Restaurant');
    const url = `${scheme}${latLng}(${label})@` + (Platform.OS === 'android'
      ? `${restaurant.latitude},${restaurant.longitude}`
      : '');

    // Fallback to Google Maps directions
    const googleUrl = `https://www.google.com/maps/dir/?api=1&origin=${currentLocation.latitude},${currentLocation.longitude}&destination=${restaurant.latitude},${restaurant.longitude}&travelmode=driving`;

    try {
      const supported = await Linking.canOpenURL(googleUrl);
      await Linking.openURL(supported ? googleUrl : url);
    } catch (e) {
      Alert.alert('Error', 'Cannot open maps app');
    }
  };

  if (isInitializing || !currentLocation || !restaurant) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <ArrowLeft color="#1F2937" size={24} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Navigation</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1E40AF" />
          <Text style={styles.loadingText}>
            {isInitializing ? 'Getting your location...' : 'Location unavailable'}
          </Text>
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

      {/* Native Map */}
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        provider={PROVIDER_GOOGLE} // Looks better than default on both platforms
        showsUserLocation
        followsUserLocation={false}
        showsMyLocationButton={true}
        loadingEnabled
        onMapReady={() => animateToRoute()}
      >
        {/* Restaurant Marker */}
        <Marker
          coordinate={{ latitude: restaurant.latitude, longitude: restaurant.longitude }}
          title={restaurant.name || "Restaurant"}
          pinColor="#EF4444"
        />

        {/* Route Polyline */}
        {routeCoordinates.length > 1 && (
          <Polyline
            coordinates={routeCoordinates}
            strokeColor="#1E40AF"
            strokeWidth={5}
          />
        )}

        {/* Tracked Movement Path */}
        {movementPath.length > 1 && (
          <Polyline
            coordinates={movementPath}
            strokeColor="#10B981"
            strokeWidth={4}
            lineDashPattern={[10, 10]}
          />
        )}
      </MapView>

      {/* Loading Overlay */}
      {isLoadingRoute && (
        <Animated.View style={[styles.loadingOverlay, { opacity: fadeAnim }]}>
          <ActivityIndicator size="small" color="#1E40AF" />
          <Text style={styles.loadingOverlayText}>Updating route...</Text>
        </Animated.View>
      )}

      {/* Bottom Panel */}
      <View style={styles.infoPanel}>
        <LinearGradient colors={["#FFFFFF", "#F8FAFC"]} style={styles.infoGradient}>
          <View style={styles.infoContent}>
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

            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.actionButton} onPress={toggleTracking}>
                {isTrackingMovement ? <Pause color="#DC2626" size={20} /> : <Play color="#10B981" size={20} />}
                <Text style={[styles.actionText, isTrackingMovement && styles.activeText]}>
                  {isTrackingMovement ? 'Stop' : 'Track'} Path
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => setMovementPath([])}
                disabled={movementPath.length === 0}
              >
                <Trash2 color={movementPath.length > 0 ? "#EF4444" : "#9CA3AF"} size={20} />
                <Text style={[styles.actionText, movementPath.length > 0 && styles.dangerText]}>Clear</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.openMapsButton} onPress={openInMaps}>
                <LinearGradient colors={["#1E40AF", "#1D4ED8"]} style={styles.openMapsGradient}>
                  <Navigation color="#FFF" size={20} />
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

// Same styles as before (only small changes)
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
    zIndex: 10,
  },
  backButton: { padding: 8 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#1F2937' },
  refreshButton: { padding: 8 },
  loadingOverlay: {
    position: 'absolute',
    top: 100,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 10,
  },
  loadingOverlayText: { marginLeft: 8, fontWeight: '600', color: '#1E40AF' },
  infoPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  infoGradient: { padding: 20, paddingBottom: Platform.OS === 'ios' ? 34 : 20 },
  infoContent: { gap: 16 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around' },
  statItem: { alignItems: 'center' },
  statLabel: { fontSize: 14, color: '#6B7280' },
  statValue: { fontSize: 20, fontWeight: 'bold', color: '#1E40AF', marginTop: 4 },
  actionRow: { flexDirection: 'row', gap: 12 },
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
});