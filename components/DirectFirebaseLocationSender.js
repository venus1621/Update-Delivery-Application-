import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useDelivery } from '../providers/delivery-provider';

const DirectFirebaseLocationSender = () => {
  const { 
    sendDeliveryGuyLocationToFirebase,
    currentLocation,
    isLocationTracking,
    userId,
    user
  } = useDelivery();
  
  const [isSending, setIsSending] = useState(false);
  const [lastSent, setLastSent] = useState(null);

  const handleSendLocation = async () => {
    if (!isLocationTracking) {
      Alert.alert('Location Not Available', 'Please enable location tracking first');
      return;
    }

    setIsSending(true);
    try {
      const success = await sendDeliveryGuyLocationToFirebase();
      if (success) {
        setLastSent(new Date().toLocaleTimeString());
        Alert.alert('Success', 'Location sent to Firebase successfully!');
      } else {
        Alert.alert('Error', 'Failed to send location to Firebase');
      }
    } catch (error) {
      Alert.alert('Error', 'An error occurred while sending location');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Direct Firebase Location Sender</Text>
      
      <View style={styles.infoContainer}>
        <Text style={styles.infoText}>User ID: {userId || 'Not logged in'}</Text>
        <Text style={styles.infoText}>Name: {user?.firstName} {user?.lastName}</Text>
        <Text style={styles.infoText}>Location Tracking: {isLocationTracking ? '✅ Active' : '❌ Inactive'}</Text>
        
        {currentLocation && (
          <>
            <Text style={styles.infoText}>Latitude: {currentLocation.latitude.toFixed(6)}</Text>
            <Text style={styles.infoText}>Longitude: {currentLocation.longitude.toFixed(6)}</Text>
            <Text style={styles.infoText}>Accuracy: {currentLocation.accuracy?.toFixed(2)}m</Text>
          </>
        )}
        
        {lastSent && (
          <Text style={styles.lastSentText}>Last sent: {lastSent}</Text>
        )}
      </View>

      <TouchableOpacity 
        style={[styles.button, isSending && styles.buttonDisabled]} 
        onPress={handleSendLocation}
        disabled={isSending || !isLocationTracking}
      >
        <Text style={styles.buttonText}>
          {isSending ? 'Sending...' : '📍 Send Location to Firebase'}
        </Text>
      </TouchableOpacity>

      <View style={styles.firebaseInfo}>
        <Text style={styles.firebaseTitle}>Firebase Structure:</Text>
        <Text style={styles.firebaseText}>deliveryGuys/{userId}/</Text>
        <Text style={styles.firebaseText}>├── currentLocation</Text>
        <Text style={styles.firebaseText}>├── deliveryPerson</Text>
        <Text style={styles.firebaseText}>├── isOnline</Text>
        <Text style={styles.firebaseText}>├── isTracking</Text>
        <Text style={styles.firebaseText}>└── locationHistory/</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
    color: '#333',
  },
  infoContainer: {
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 8,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  infoText: {
    fontSize: 16,
    marginBottom: 8,
    color: '#333',
  },
  lastSentText: {
    fontSize: 14,
    color: '#4CAF50',
    fontWeight: 'bold',
    marginTop: 10,
  },
  button: {
    backgroundColor: '#2196F3',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 20,
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  firebaseInfo: {
    backgroundColor: '#fff3e0',
    padding: 15,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#FF9800',
  },
  firebaseTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#E65100',
    marginBottom: 10,
  },
  firebaseText: {
    fontSize: 14,
    color: '#E65100',
    fontFamily: 'monospace',
    marginBottom: 2,
  },
});

export default DirectFirebaseLocationSender;
