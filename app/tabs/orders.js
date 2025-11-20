import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { 
  MapPin, 
  Clock, 
  DollarSign, 
  Truck,
  RefreshCw,
  Filter,
  Navigation,
  Zap,
  Building,
  Map
} from 'lucide-react-native';
import { useDelivery } from '../../providers/delivery-provider';
import { useAuth } from '../../providers/auth-provider';
import { router } from 'expo-router';

const { width } = Dimensions.get('window');

// Haversine formula to calculate distance between two coordinates in kilometers
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distance = R * c;
  return distance;
};

export default function OrdersScreen() {
  const { 
    availableOrders,
    fetchAvailableOrders,
    isLoadingOrders,
    ordersError,
    isConnected,
    isOnline,
    acceptOrder,
    fetchActiveOrder
  } = useDelivery();
  
  const { userId } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [filterBy, setFilterBy] = useState('active');
  const [showFilters, setShowFilters] = useState(true);
  const [fadeAnim] = useState(new Animated.Value(0));
  const [userLocation, setUserLocation] = useState(null);

  // Fetch orders regardless of online status (API works independently)
  useEffect(() => {
    fetchAvailableOrders();
    // Simulate user location for distance calculation (Addis Ababa)
    setUserLocation({ latitude: 9.0100, longitude: 38.7600 });
  }, [fetchAvailableOrders]);

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: showFilters ? 1 : 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [showFilters]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchAvailableOrders();
    setRefreshing(false);
  };

  // 📦 Accept order - Requires being ONLINE (socket connection)
  const handleAcceptOrder = async (order) => {
    // Check if user is online and connected to socket
    if (!isOnline) {
      Alert.alert(
        'Go Online First',
        'You need to be ONLINE to accept orders. Please go to Dashboard and switch to Online mode.',
        [{ text: 'OK', style: 'default' }]
      );
      return;
    }

    if (!isConnected) {
      Alert.alert(
        'Not Connected',
        'Not connected to server. Please wait while we establish connection, then try again.',
        [{ text: 'OK', style: 'default' }]
      );
      return;
    }

    const totalEarnings = (order.deliveryFee || 0) + (order.tip || 0);
    
    Alert.alert(
      'Accept Order',
      `Do you want to accept this order?\n\nOrder: ${order.code}\nRestaurant: ${order.restaurantName}\nDistance: ${getOrderDistance(order)} km\nEarnings: ${formatCurrency(totalEarnings)}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Accept',
          style: 'default',
          onPress: async () => {
            try {
              const success = await acceptOrder(order.id, userId);
              if (success) {
                // Fetch all updated data
                await Promise.all([
                  fetchAvailableOrders(),
                  fetchActiveOrder('Cooked'),
                  fetchActiveOrder('Delivering'),
                ]);
                
                // Automatically redirect to dashboard without prompt
                router.push('/tabs/dashboard');
              }
            } catch (error) {
              console.error('Error accepting order:', error);
              Alert.alert('Error', 'Failed to accept order. Please ensure you are online and try again.');
            }
          },
        },
      ]
    );
  };

const getTimeAgo = (dateString) => {
  try {
    if (!dateString) return 'Recently';

    // Attempt native parsing first
    let date = new Date(dateString);

    // If invalid, handle "11/3/2025, 10:49:44 AM" or similar
    if (isNaN(date.getTime())) {
      // Remove hidden Unicode spaces (e.g. \u202F)
      const cleanString = dateString.replace(/\u202F/g, ' ').trim();

      const [datePart, timePartRaw] = cleanString.split(',');
      if (!datePart || !timePartRaw) return 'Recently';

      const [month, day, year] = datePart.split('/').map(Number);
      const timePieces = timePartRaw.trim().split(' ');
      const timePart = timePieces[0];
      const ampm = timePieces[1]?.toUpperCase();

      if (!timePart) return 'Recently';
      const [hourStr, minuteStr, secondStr] = timePart.split(':');

      let hour = parseInt(hourStr);
      const minute = parseInt(minuteStr);
      const second = parseInt(secondStr) || 0;

      if (ampm === 'PM' && hour < 12) hour += 12;
      if (ampm === 'AM' && hour === 12) hour = 0;

      date = new Date(year, month - 1, day, hour, minute, second);
    }

    return isNaN(date.getTime()) ? 'Recently' : formatTimeAgo(date);
  } catch (error) {
    console.error("❌ Error parsing date:", error);
    return 'Recently';
  }
};

const formatTimeAgo = (date) => {
  const now = new Date();
  const diffInSeconds = Math.floor((now - date) / 1000);

  if (diffInSeconds < 5) return 'Just now';
  if (diffInSeconds < 60) return `${diffInSeconds}s ago`;
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
  return date.toLocaleDateString(); // fallback to readable date after a week
};

const getOrderPriority = (order) => {
  try {
    if (!order?.createdAt) return { label: 'NORMAL', color: '#10B981', icon: Clock };

    const date = new Date(order.createdAt);
    if (isNaN(date.getTime())) return { label: 'NORMAL', color: '#10B981', icon: Clock };

    const now = new Date();
    const hoursDiff = (now - date) / (1000 * 60 * 60);

    if (hoursDiff > 2) return { label: 'URGENT', color: '#EF4444', icon: Zap };
    if (hoursDiff > 1) return { label: 'HIGH', color: '#F59E0B', icon: Clock };
    return { label: 'NORMAL', color: '#10B981', icon: Clock };
  } catch {
    return { label: 'NORMAL', color: '#10B981', icon: Clock };
  }
};


  // Calculate distance for an order using coordinates
  const getOrderDistance = (order) => {
    if (!userLocation) {
      return 'N/A';
    }
    
    try {
      // Use transformed restaurantLocation object first, fallback to coordinates array
      let restLat, restLng;
      
      if (order.restaurantLocation && order.restaurantLocation.lat && order.restaurantLocation.lng) {
        // Use transformed location object {lat, lng}
        restLat = order.restaurantLocation.lat;
        restLng = order.restaurantLocation.lng;
      } else if (order.restaurantCoordinates && order.restaurantCoordinates.length >= 2) {
        // Fallback to coordinates array [lng, lat] format from backend
        restLng = order.restaurantCoordinates[0];
        restLat = order.restaurantCoordinates[1];
      } else {
        return 'N/A';
      }
      
      const distance = calculateDistance(
        userLocation.latitude,
        userLocation.longitude,
        restLat,
        restLng
      );
      
      return distance.toFixed(1);
    } catch (error) {
      console.error('Error calculating distance:', error);
      return 'N/A';
    }
  };



  // Get orders data from API response
  const getOrdersData = () => {
    if (Array.isArray(availableOrders)) {
      return availableOrders;
    } else if (availableOrders && availableOrders.data) {
      return availableOrders.data;
    }
    return [];
  };

  const ordersData = getOrdersData();

  const filteredOrders = ordersData.filter(order => {
    const totalEarnings = (order.deliveryFee || 0) + (order.tip || 0);
    const priority = getOrderPriority(order);
    const distance = parseFloat(getOrderDistance(order));
    
    switch (filterBy) {
      case 'active':
        // Show all active listed orders (default - all available orders are active)
        return true;
      case 'nearby':
        return !isNaN(distance) && distance <= 1;
      case 'high-value':
        return totalEarnings >= 200;
      case 'urgent':
        return priority.label === 'URGENT';
      case 'all':
        return true;
      default:
        return true;
    }
  });

  const FilterBar = () => (
    <Animated.View style={[styles.filterBar, { opacity: fadeAnim }]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
        {[
          { key: 'active', label: 'Active Listed', icon: Truck },
          { key: 'nearby', label: 'Nearby (<1km)', icon: Navigation },
          { key: 'high-value', label: 'High Value', icon: DollarSign },
          { key: 'urgent', label: 'Urgent', icon: Zap },
          { key: 'all', label: 'All Orders', icon: Building }
        ].map((filter) => (
          <TouchableOpacity
            key={filter.key}
            style={[
              styles.filterChip,
              filterBy === filter.key && styles.filterChipActive
            ]}
            onPress={() => setFilterBy(filter.key)}
          >
            <filter.icon 
              size={14} 
              color={filterBy === filter.key ? '#FFFFFF' : '#6B7280'} 
            />
            <Text style={[
              styles.filterChipText,
              filterBy === filter.key && styles.filterChipTextActive
            ]}>
              {filter.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </Animated.View>
  );

  // Format currency for Ethiopian Birr
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-ET', {
      style: 'currency',
      currency: 'ETB'
    }).format(amount || 0);
  };

  // Note: Removed offline check - users can VIEW orders while offline
  // but cannot ACCEPT them (handled in handleAcceptOrder function)

  if (isLoadingOrders && !refreshing) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1E40AF" />
          <Text style={styles.loadingText}>Loading available orders...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (ordersError) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <View style={styles.errorIcon}>
            <Text style={styles.errorEmoji}>😕</Text>
          </View>
          <Text style={styles.errorTitle}>Unable to Load Orders</Text>
          <Text style={styles.errorMessage}>{ordersError}</Text>
          <TouchableOpacity 
            style={styles.retryButton}
            onPress={handleRefresh}
          >
            <LinearGradient
              colors={['#1E40AF', '#3730A3']}
              style={styles.buttonGradient}
            >
              <RefreshCw color="#FFFFFF" size={16} />
              <Text style={styles.retryButtonText}>Try Again</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerMain}>
          <View>
            <Text style={styles.title}>Available Orders</Text>
            <Text style={styles.subtitle}>
              {filteredOrders.length} order{filteredOrders.length !== 1 ? 's' : ''} available
              {ordersData.length > 0 && ` (${ordersData.length} total)`}
            </Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity 
              style={[styles.headerButton, showFilters && styles.headerButtonActive]}
              onPress={() => setShowFilters(!showFilters)}
            >
              <Filter color={showFilters ? "#FFFFFF" : "#1E40AF"} size={20} />
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.headerButton}
              onPress={handleRefresh}
            >
              <RefreshCw color="#1E40AF" size={20} />
            </TouchableOpacity>
          </View>
        </View>
        
        {/* Filter Bar */}
        {showFilters && <FilterBar />}
      </View>

      {/* Offline Status Warning */}
      {!isOnline && (
        <View style={styles.offlineWarning}>
          <Text style={styles.offlineWarningText}>
            📴 You are OFFLINE - You can view orders but must go ONLINE to accept them.
          </Text>
        </View>
      )}

      {/* Connection Status Warning (when online but not connected) */}
      {isOnline && !isConnected && (
        <View style={styles.connectionWarning}>
          <Text style={styles.connectionWarningText}>
            🔴 Connecting to server... Orders may not update in real-time.
          </Text>
        </View>
      )}

      {/* Orders List */}
      <ScrollView 
        style={styles.ordersList}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={['#1E40AF']}
            tintColor="#1E40AF"
          />
        }
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.ordersContent}
      >
        {filteredOrders.length === 0 ? (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIcon}>
              <MapPin color="#9CA3AF" size={48} />
            </View>
            <Text style={styles.emptyTitle}>
              {ordersData.length === 0 ? 'No Orders Available' : 'No Orders Match Filter'}
            </Text>
            <Text style={styles.emptyMessage}>
              {ordersData.length === 0 
                ? "There are currently no available orders. Check back later."
                : `No orders match your "${filterBy}" filter. Try changing the filter.`
              }
            </Text>
            {ordersData.length > 0 && filterBy !== 'active' && (
              <TouchableOpacity 
                style={styles.showAllButton}
                onPress={() => setFilterBy('active')}
              >
                <Text style={styles.showAllButtonText}>Show Active Listed</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity 
              style={styles.refreshButton}
              onPress={handleRefresh}
            >
              <RefreshCw color="#1E40AF" size={16} />
              <Text style={styles.refreshButtonText}>Refresh Orders</Text>
            </TouchableOpacity>
          </View>
        ) : (
          filteredOrders.map((order, index) => {
            const priority = getOrderPriority(order);
            const PriorityIcon = priority.icon;
            const totalEarnings = (order.deliveryFee || 0) + (order.tip || 0);
            const distance = getOrderDistance(order);
            
            return (
              <View key={order.id || `order-${index}`} style={styles.orderCard}>
                {/* Order Header with Priority */}
                <View style={styles.orderHeader}>
                  <View style={styles.orderInfo}>
                    <View style={styles.orderIdRow}>
                      <Text style={styles.orderId}>{order.code}</Text>
                      <View style={[styles.priorityBadge, { backgroundColor: priority.color }]}>
                        <PriorityIcon color="#FFFFFF" size={12} />
                        <Text style={styles.priorityText}>{priority.label}</Text>
                      </View>
                    </View>
                    <Text style={styles.orderTime}>
                      {getTimeAgo(order.createdAt)}
                    </Text>
                  </View>
                  <View style={styles.orderEarnings}>
                    <Text style={styles.earningsAmount}>
                      {formatCurrency(totalEarnings)}
                    </Text>
                    <Text style={styles.earningsLabel}>Total Earnings</Text>
                  </View>
                </View>

                {/* Distance Indicator */}
                <View style={styles.distanceContainer}>
                  <View style={styles.distanceBadge}>
                    <Map color="#1E40AF" size={14} />
                    <Text style={styles.distanceText}>{distance} km away</Text>
                  </View>
                </View>

                {/* Order Details */}
                <View style={styles.orderDetails}>
                  <View style={styles.detailRow}>
                    <View style={styles.detailIcon}>
                      <Building color="#6B7280" size={14} />
                    </View>
                    <View style={styles.detailContent}>
                      <Text style={styles.detailLabel}>Restaurant</Text>
                      <Text style={styles.detailText} numberOfLines={1}>
                        {order.restaurantName}
                      </Text>
                    </View>
                  </View>
                  
                  <View style={styles.detailRow}>
                    {/* <View style={styles.detailIcon}>
                      <MapPin color="#6B7280" size={14} />
                    </View>
                    <View style={styles.detailContent}>
                      <Text style={styles.detailLabel}>Pickup Location</Text>
                      <Text style={styles.detailText} numberOfLines={1}>
                        {formatCoordinates(order.restaurantCoordinates)}
                      </Text>
                    </View> */}
                  </View>
                  

                </View>

                {/* Earnings Breakdown */}
                <View style={styles.earningsBreakdown}>
                  <View style={styles.breakdownItem}>
                    <Text style={styles.breakdownLabel}>Delivery Fee</Text>
                    <Text style={styles.breakdownValue}>{formatCurrency(order.deliveryFee || 0)}</Text>
                  </View>
                  <View style={styles.breakdownDivider} />
                  <View style={styles.breakdownItem}>
                    <Text style={styles.breakdownLabel}>Tip</Text>
                    <Text style={styles.breakdownValue}>{formatCurrency(order.tip || 0)}</Text>
                  </View>
                  <View style={styles.breakdownDivider} />
                  <View style={styles.breakdownItem}>
                    <Text style={[styles.breakdownLabel, styles.breakdownTotalLabel]}>Total</Text>
                    <Text style={[styles.breakdownValue, styles.breakdownTotalValue]}>
                      {formatCurrency(totalEarnings)}
                    </Text>
                  </View>
                </View>

                {/* Accept Button - Disabled when offline */}
                <TouchableOpacity 
                  style={[styles.acceptButton, !isOnline && styles.acceptButtonDisabled]}
                  onPress={() => handleAcceptOrder(order)}
                  disabled={!isOnline}
                >
                  <LinearGradient
                    colors={!isOnline ? ['#9CA3AF', '#6B7280'] : ['#10B981', '#059669']}
                    style={styles.acceptButtonGradient}
                  >
                    <Truck color="#FFFFFF" size={18} />
                    <Text style={styles.acceptButtonText}>
                      {!isOnline ? 'Go Online to Accept' : 'Accept Order'}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    paddingBottom: 8,
  },
  headerMain: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  headerButton: {
    padding: 10,
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  headerButtonActive: {
    backgroundColor: '#1E40AF',
    borderColor: '#1E40AF',
  },
  filterBar: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  filterScroll: {
    paddingRight: 16,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 6,
  },
  filterChipActive: {
    backgroundColor: '#1E40AF',
    borderColor: '#1E40AF',
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6B7280',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  offlineWarning: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#FECACA',
  },
  offlineWarningText: {
    fontSize: 14,
    color: '#991B1B',
    textAlign: 'center',
    fontWeight: '600',
  },
  connectionWarning: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#FDE68A',
  },
  connectionWarningText: {
    fontSize: 14,
    color: '#92400E',
    textAlign: 'center',
  },
  ordersList: {
    flex: 1,
  },
  ordersContent: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  orderCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  orderInfo: {
    flex: 1,
  },
  orderIdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 8,
  },
  orderId: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111827',
  },
  priorityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  priorityText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textTransform: 'uppercase',
  },
  orderTime: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
  },
  orderEarnings: {
    alignItems: 'flex-end',
  },
  earningsAmount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#10B981',
  },
  earningsLabel: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 2,
  },
  distanceContainer: {
    marginBottom: 12,
  },
  distanceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    alignSelf: 'flex-start',
    gap: 4,
  },
  distanceText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1E40AF',
  },
  orderDetails: {
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  detailIcon: {
    width: 20,
    alignItems: 'center',
    marginTop: 2,
  },
  detailContent: {
    flex: 1,
    marginLeft: 8,
  },
  detailLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 2,
  },
  detailText: {
    fontSize: 14,
    color: '#4B5563',
    fontWeight: '500',
  },
  earningsBreakdown: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  breakdownItem: {
    flex: 1,
    alignItems: 'center',
  },
  breakdownLabel: {
    fontSize: 11,
    color: '#6B7280',
    marginBottom: 2,
  },
  breakdownTotalLabel: {
    fontWeight: '600',
    color: '#374151',
  },
  breakdownValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  breakdownTotalValue: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#10B981',
  },
  breakdownDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#E5E7EB',
  },
  grandTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  grandTotalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#065F46',
  },
  grandTotalValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#065F46',
  },
  acceptButton: {
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  acceptButtonDisabled: {
    opacity: 0.6,
    shadowColor: '#6B7280',
  },
  acceptButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    gap: 8,
  },
  acceptButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  // Empty and Loading States
  offlineContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  offlineIcon: {
    padding: 20,
    backgroundColor: '#F3F4F6',
    borderRadius: 50,
    marginBottom: 16,
  },
  offlineTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 8,
    textAlign: 'center',
  },
  offlineMessage: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  onlineButton: {
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#1E40AF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 14,
    gap: 8,
  },
  onlineButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6B7280',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  errorIcon: {
    marginBottom: 16,
  },
  errorEmoji: {
    fontSize: 48,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 8,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  retryButton: {
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#1E40AF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  emptyIcon: {
    padding: 20,
    backgroundColor: '#F3F4F6',
    borderRadius: 50,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyMessage: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  showAllButton: {
    backgroundColor: '#1E40AF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  showAllButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 6,
  },
  refreshButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E40AF',
  },
});
