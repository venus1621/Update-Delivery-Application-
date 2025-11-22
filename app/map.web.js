import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Dimensions,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, MapPin, Navigation, ExternalLink } from 'lucide-react-native';
import { useLocalSearchParams, router } from 'expo-router';
import * as Location from 'expo-location';
import { useLocationTracking } from '../services/location-service';

const { width } = Dimensions.get('window');

export default function MapScreen() {
  const { restaurantLocation } = useLocalSearchParams();
  const {
    location: currentLocation,
    error: locationError,
    startTracking,
    calculateDistance,
  } = useLocationTracking();

  const [isInitializing, setIsInitializing] = useState(true);
  const [locationPermission, setLocationPermission] = useState(false);
  const [distance, setDistance] = useState(0);

  const restaurant = React.useMemo(() => {
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

  useEffect(() => {
    initializeLocation();
  }, []);

  useEffect(() => {
    if (currentLocation && restaurant) {
      const dist = calculateDistance(
        currentLocation.latitude,
        currentLocation.longitude,
        restaurant.lat,
        restaurant.lng
      );
      setDistance(dist);
    }
  }, [currentLocation, restaurant]);

  const initializeLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location permission is required for navigation.');
        setIsInitializing(false);
        return;
      }
      setLocationPermission(true);
      await startTracking();
      setIsInitializing(false);
    } catch (error) {
      console.error('Location init error:', error);
      Alert.alert('Error', 'Failed to initialize location services.');
      setIsInitializing(false);
    }
  };

  const openInGoogleMaps = () => {
    if (!currentLocation || !restaurant) {
      Alert.alert('Error', 'Location data not available.');
      return;
    }

    const url = `https://www.google.com/maps/dir/?api=1&origin=${currentLocation.latitude},${currentLocation.longitude}&destination=${restaurant.lat},${restaurant.lng}&travelmode=driving`;
    Linking.openURL(url).catch(() => {
      Alert.alert('Error', 'Could not open Google Maps.');
    });
  };

  if (isInitializing) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#667eea" />
          <Text style={styles.loadingText}>Initializing location...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!locationPermission) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <MapPin size={48} color="#ef4444" />
          <Text style={styles.errorTitle}>Location Permission Required</Text>
          <Text style={styles.errorText}>
            Please enable location permissions to use navigation.
          </Text>
          <TouchableOpacity style={styles.retryButton} onPress={initializeLocation}>
            <Text style={styles.retryButtonText}>Request Permission</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!restaurant) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>Invalid Location Data</Text>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <ArrowLeft size={24} color="#FFFFFF" />
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Navigation</Text>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.mapPlaceholder}>
        <MapPin size={64} color="#667eea" />
        <Text style={styles.placeholderTitle}>Maps Not Available on Web</Text>
        <Text style={styles.placeholderText}>
          Interactive maps are only available in the mobile app.
          Use the button below to open Google Maps for navigation.
        </Text>
      </View>

      <View style={styles.infoContainer}>
        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>Current Location</Text>
          <Text style={styles.infoValue}>
            {currentLocation
              ? `${currentLocation.latitude.toFixed(6)}, ${currentLocation.longitude.toFixed(6)}`
              : 'Loading...'}
          </Text>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>Destination</Text>
          <Text style={styles.infoValue}>
            {`${restaurant.lat.toFixed(6)}, ${restaurant.lng.toFixed(6)}`}
          </Text>
        </View>

        {currentLocation && (
          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>Distance</Text>
            <Text style={styles.infoValue}>
              {distance < 1 ? `${(distance * 1000).toFixed(0)} m` : `${distance.toFixed(2)} km`}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={openInGoogleMaps}
          disabled={!currentLocation}
        >
          <LinearGradient
            colors={['#667eea', '#764ba2']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.gradientButton}
          >
            <Navigation size={20} color="#FFFFFF" />
            <Text style={styles.primaryButtonText}>Open in Google Maps</Text>
            <ExternalLink size={16} color="#FFFFFF" />
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#667eea',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  placeholder: {
    width: 40,
  },
  backButtonText: {
    color: '#FFFFFF',
    marginLeft: 8,
    fontSize: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 16,
    color: '#333',
  },
  errorText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
  },
  retryButton: {
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#667eea',
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  mapPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#FFFFFF',
    margin: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  placeholderTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 16,
    color: '#333',
    textAlign: 'center',
  },
  placeholderText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  infoContainer: {
    padding: 16,
    gap: 12,
  },
  infoCard: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  infoLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  infoValue: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  buttonContainer: {
    padding: 16,
    paddingBottom: 24,
  },
  primaryButton: {
    borderRadius: 8,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  gradientButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    gap: 8,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
