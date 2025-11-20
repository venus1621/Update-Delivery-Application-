import React, { useState } from 'react';
import { Alert, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useDelivery } from '../providers/delivery-provider';

const DeliveryStatusManager = ({ orderId, currentStatus, onStatusUpdate }) => {
  const { updateDeliveryStatus, sendLocationUpdate } = useDelivery();
  const [isUpdating, setIsUpdating] = useState(false);

  const statusOptions = [
    { key: 'Accepted', label: 'Order Accepted', color: '#4CAF50' },
    { key: 'PickedUp', label: 'Picked Up', color: '#FF9800' },
    { key: 'InTransit', label: 'In Transit', color: '#2196F3' },
    { key: 'Delivered', label: 'Delivered', color: '#4CAF50' },
  ];

  const handleStatusUpdate = async (newStatus) => {
    if (isUpdating) return;
    
    setIsUpdating(true);
    try {
      const additionalData = {};
      
      // Add specific data based on status
      switch (newStatus) {
        case 'PickedUp':
          additionalData.pickedUpAt = new Date().toISOString();
          break;
        case 'InTransit':
          additionalData.inTransitAt = new Date().toISOString();
          break;
        case 'Delivered':
          additionalData.deliveredAt = new Date().toISOString();
          break;
      }

      const success = await updateDeliveryStatus(orderId, newStatus, additionalData);
      
      if (success) {
        Alert.alert(
          "✅ Status Updated",
          `Order status updated to: ${statusOptions.find(s => s.key === newStatus)?.label}`,
          [{ text: 'OK' }]
        );
        
        // Send immediate location update
        await sendLocationUpdate(orderId);
        
        if (onStatusUpdate) {
          onStatusUpdate(newStatus);
        }
      } else {
        Alert.alert("❌ Error", "Failed to update status. Please try again.");
      }
    } catch (error) {
      console.error('Error updating status:', error);
      Alert.alert("❌ Error", "An error occurred while updating status.");
    } finally {
      setIsUpdating(false);
    }
  };

  const getNextStatus = (currentStatus) => {
    switch (currentStatus) {
      case 'Accepted':
        return 'PickedUp';
      case 'PickedUp':
        return 'InTransit';
      case 'InTransit':
        return 'Delivered';
      default:
        return null;
    }
  };

  const nextStatus = getNextStatus(currentStatus);
  const nextStatusOption = statusOptions.find(s => s.key === nextStatus);

  if (!nextStatusOption) {
    return (
      <View style={styles.container}>
        <Text style={styles.completedText}>✅ Order Completed</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.currentStatus}>
        Current Status: {statusOptions.find(s => s.key === currentStatus)?.label || currentStatus}
      </Text>
      
      <TouchableOpacity
        style={[styles.statusButton, { backgroundColor: nextStatusOption.color }]}
        onPress={() => handleStatusUpdate(nextStatus)}
        disabled={isUpdating}
      >
        <Text style={styles.buttonText}>
          {isUpdating ? 'Updating...' : `Mark as ${nextStatusOption.label}`}
        </Text>
      </TouchableOpacity>
      
      <TouchableOpacity
        style={styles.locationButton}
        onPress={() => sendLocationUpdate(orderId)}
        disabled={isUpdating}
      >
        <Text style={styles.locationButtonText}>📍 Send Location Update</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    margin: 8,
  },
  currentStatus: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  statusButton: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  locationButton: {
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#9C27B0',
    alignItems: 'center',
  },
  locationButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  completedText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#4CAF50',
    textAlign: 'center',
  },
});

export default DeliveryStatusManager;
