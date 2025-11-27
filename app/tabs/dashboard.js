import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  RefreshControl,
  Alert,
  ToastAndroid,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Truck, DollarSign, Clock, MapPin, Wifi, WifiOff, User, Award, RefreshCw, Scan } from 'lucide-react-native';
import { useDelivery } from '../../providers/delivery-provider';
import { useAuth } from '../../providers/auth-provider';
import { router } from 'expo-router';
import OrderModal from '../../components/OrderModal';
import VerificationModal from '../../components/VerificationModal';
import { logger } from '../../utils/logger';

const { width } = Dimensions.get('window');

// Helper function to format Ethiopian currency
const formatETB = (amount) => {
  return new Intl.NumberFormat('en-ET', {
    style: 'currency',
    currency: 'ETB'
  }).format(amount || 0);
};

export default function DashboardScreen() {
  const { 
    isConnected, 
    isOnline, 
    availableOrdersCount, 
    activeOrder, 
    toggleOnlineStatus,
    orderHistory,
    fetchActiveOrder,
    fetchAllActiveOrders,
    isLoadingActiveOrder,
    activeOrderError,
    verifyDelivery,
    availableOrders,
    pendingOrderPopup,
    showOrderModal: showOrderModalState,
    showOrderModalFn,
    hideOrderModal,
    acceptOrderFromModal,
    declineOrder,
    joinDeliveryMethod,
    clearNewOrderNotification,
    newOrderNotification,
    acceptedOrder,
    fetchAvailableOrders,
    fetchDeliveryHistory,
  } = useDelivery();

  const { user, checkAuthStatus } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [orderIdToVerify, setOrderIdToVerify] = useState(null);
  const [lastRefreshTime, setLastRefreshTime] = useState(null);

  // Show toast/alert message
  const showRefreshMessage = (message, success = true) => {
    if (Platform.OS === 'android') {
      ToastAndroid.show(message, ToastAndroid.SHORT);
    } else {
      // For iOS, you can use Alert or a custom toast component
    }
  };

  // 🔄 Enhanced Refresh Function - Force fetches fresh data (bypasses cache)
  const onRefresh = async () => {
    setRefreshing(true);
   
    try {
      // Step 1: Force refresh all data (bypass cache)
      // Pass forceRefresh=true to skip cache and get fresh data
      
      const refreshPromises = [
        // Delivery-related data - force fresh data
        fetchAvailableOrders(true).catch(e => logger.error('Error fetching available orders:', e)),
        fetchAllActiveOrders(true).catch(e => logger.error('Error fetching active orders:', e)),
        fetchDeliveryHistory(true).catch(e => logger.error('Error fetching delivery history:', e)),
      ];

      // Also refresh user authentication status
      if (checkAuthStatus) {
        refreshPromises.push(
          checkAuthStatus().catch(e => logger.error('Error checking auth status:', e))
        );
      }

      // Wait for all refresh operations to complete
      await Promise.allSettled(refreshPromises);
      
      // Update last refresh time
      const now = new Date();
      setLastRefreshTime(now.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        second: '2-digit'
      }));

      showRefreshMessage('✅ Data refreshed successfully!', true);
      
    } catch (error) {
      logger.error('❌ Error during refresh:', error);
      showRefreshMessage('⚠️ Some data failed to refresh', false);
    } finally {
      setRefreshing(false);
    }
  };

  // 📦 Initial data fetch on mount ONLY (uses cache automatically)
  useEffect(() => {
    // Fetch once on mount - subsequent calls will use cache unless forceRefresh=true
    fetchDeliveryHistory(); // Will use cache if available
    fetchAvailableOrders(); // Will use cache if available
    fetchAllActiveOrders();
    
    // Will use cache if available
  }, []); // Empty deps = runs once on mount

  // ⚠️ No auto-refresh when going online - user must manually refresh
  // This prevents unnecessary API calls when navigating

  // Handle complete order with verification
  const handleCompleteOrder = () => {
    if (activeOrder) {
     
      setOrderIdToVerify(activeOrder.orderId);
      setShowVerificationModal(true);
    }
  };
  
  // Handle verification code submission
  const handleVerifyDelivery = async (verificationCode) => {
    if (!orderIdToVerify) {
      return;
    }

    setIsVerifying(true);
    try {
      const result = await verifyDelivery(orderIdToVerify, verificationCode);
      if (result.success) {
        setShowVerificationModal(false);
        setOrderIdToVerify(null);
        // Note: verifyDelivery already fetches history automatically
        // But we refresh here too for immediate UI update
        await Promise.all([
          fetchAllActiveOrders(), // Use combined function instead
          // fetchDeliveryHistory(),
        ]);
      }
    } catch (error) {
      logger.error('Error verifying delivery:', error);
    } finally {
      setIsVerifying(false);
    }
  };

  // Close verification modal
  const handleCloseVerificationModal = () => {
    setShowVerificationModal(false);
    setOrderIdToVerify(null);
  };

  // Calculate today's earnings and deliveries
  const calculateTodayStats = () => {
    if (!orderHistory || orderHistory.length === 0) {
      return {
        earnings: 0,
        deliveries: 0,
        totalEarnings: 0,
      };
    }

    // Helper function to safely extract numeric values
    const extractNumber = (value) => {
      if (value === null || value === undefined) return 0;
      if (typeof value === 'number') return value;
      if (typeof value === 'string') return parseFloat(value) || 0;
      // Handle MongoDB Decimal128 format
      if (typeof value === 'object' && value.$numberDecimal) {
        return parseFloat(value.$numberDecimal) || 0;
      }
      return 0;
    };

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayOrders = orderHistory.filter(order => {
      // Use updatedAt for completed deliveries (when they were actually completed)
      const orderDate = new Date(order.updatedAt || order.createdAt);
      orderDate.setHours(0, 0, 0, 0);
      return orderDate.getTime() === today.getTime();
    });

    const todayEarnings = todayOrders.reduce((sum, order) => {
      const earnings = extractNumber(order.totalEarnings) || 
                      extractNumber(order.grandTotal) || 
                      (extractNumber(order.deliveryFee) + extractNumber(order.tip));
      return sum + earnings;
    }, 0);

    const totalEarnings = orderHistory.reduce((sum, order) => {
      const earnings = extractNumber(order.totalEarnings) || 
                      extractNumber(order.grandTotal) || 
                      (extractNumber(order.deliveryFee) + extractNumber(order.tip));
      return sum + earnings;
    }, 0);

    return {
      earnings: todayEarnings,
      deliveries: todayOrders.length,
      totalEarnings: totalEarnings,
    };
  };

  const todayStats = calculateTodayStats();
  const todayEarnings = todayStats.earnings;
  const todayDeliveries = todayStats.deliveries;
  const totalEarnings = todayStats.totalEarnings;

  // Get user's first name for greeting
  const getUserFirstName = () => {
    if (user?.name) {
      return user.name.split(' ')[0];
    }
    return 'Driver';
  };

  // Get greeting based on time of day
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView 
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#007AFF']}
            tintColor="#007AFF"
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.greeting}>{getGreeting()}!</Text>
            <Text style={styles.driverName}>{getUserFirstName()}</Text>
            {lastRefreshTime && (
              <Text style={styles.lastRefreshText}>
                Last updated: {lastRefreshTime}
              </Text>
            )}
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity 
              style={styles.refreshButton}
              onPress={onRefresh}
              disabled={refreshing}
            >
              <RefreshCw 
                color={refreshing ? "#9CA3AF" : "#3B82F6"} 
                size={24}
                style={refreshing ? styles.refreshIconSpinning : null}
              />
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.statusButton, isOnline ? styles.online : styles.offline]}
              onPress={toggleOnlineStatus}
            >
              {isOnline ? (
                <Wifi color="#FFFFFF" size={20} />
              ) : (
                <WifiOff color="#FFFFFF" size={20} />
              )}
              <Text style={styles.statusText}>
                {isOnline ? 'Online' : 'Offline'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Connection Status */}
        {isOnline && (
          <View style={[styles.connectionStatus, isConnected ? styles.connected : styles.disconnected]}>
            <Text style={styles.connectionText}>
              {isConnected ? '🟢 Connected to server' : '🔴 Connecting...'}
            </Text>
          </View>
        )}

        {/* Active Order Mode Warning - Shows for ANY active order */}
        {activeOrder && (Array.isArray(activeOrder) ? activeOrder.length > 0 : true) && (
          <View style={styles.activeDeliveryWarning}>
            <LinearGradient
              colors={['#F59E0B', '#D97706']}
              style={styles.activeDeliveryGradient}
            >
              <Text style={styles.activeDeliveryIcon}>🚚</Text>
              <View style={styles.activeDeliveryTextContainer}>
                <Text style={styles.activeDeliveryTitle}>ACTIVE ORDER MODE</Text>
                <Text style={styles.activeDeliveryMessage}>
                  You have an active order. Online status and location are locked until you complete the order.
                </Text>
              </View>
            </LinearGradient>
          </View>
        )}

        {/* New Order Notification */}
        {newOrderNotification && (
          <TouchableOpacity 
            style={styles.newOrderIndicator}
            onPress={clearNewOrderNotification}
          >
            <LinearGradient
              colors={['#10B981', '#059669']}
              style={styles.newOrderGradient}
            >
              <Text style={styles.newOrderText}>
                🍲 New order available! Tap to dismiss
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        )}

        {/* Stats Cards */}
        <View style={styles.statsContainer}>
          <LinearGradient
            colors={['#3B82F6', '#1E40AF']}
            style={styles.statCard}
          >
            <View style={styles.statIcon}>
              <MapPin color="#FFFFFF" size={24} />
            </View>
            <Text style={styles.statNumber}>{availableOrdersCount}</Text>
            <Text style={styles.statLabel}>Available Orders</Text>
          </LinearGradient>

          <LinearGradient
            colors={['#10B981', '#059669']}
            style={styles.statCard}
          >
            <View style={styles.statIcon}>
              <DollarSign color="#FFFFFF" size={24} />
            </View>
            <Text style={styles.statNumber}>
              {formatETB(todayEarnings)}
            </Text>
            <Text style={styles.statLabel}>Today's Earnings</Text>
            {orderHistory && orderHistory.length > 0 && (
              <Text style={styles.statHint}>From completed orders</Text>
            )}
          </LinearGradient>

          <LinearGradient
            colors={['#F59E0B', '#D97706']}
            style={styles.statCard}
          >
            <View style={styles.statIcon}>
              <Truck color="#FFFFFF" size={24} />
            </View>
            <Text style={styles.statNumber}>{todayDeliveries}</Text>
            <Text style={styles.statLabel}>Today's Deliveries</Text>
            {todayDeliveries > 0 && todayEarnings > 0 && (
              <Text style={styles.statHint}>
                Avg: {formatETB(todayEarnings / todayDeliveries)}
              </Text>
            )}
          </LinearGradient>
        </View>

        {/* Total Earnings Card */}
        <View style={styles.totalEarningsContainer}>
          <LinearGradient
            colors={['#8B5CF6', '#7C3AED']}
            style={styles.totalEarningsCard}
          >
            <View style={styles.totalEarningsHeader}>
              <Award color="#FFFFFF" size={28} />
              <Text style={styles.totalEarningsTitle}>Total Earnings</Text>
            </View>
            <Text style={styles.totalEarningsAmount}>
              {formatETB(totalEarnings)}
            </Text>
            <Text style={styles.totalEarningsSubtitle}>
              {orderHistory && orderHistory.length > 0 
                ? `From ${orderHistory.length} completed ${orderHistory.length === 1 ? 'delivery' : 'deliveries'}`
                : 'All time delivery earnings'}
            </Text>
          </LinearGradient>
        </View>

        {/* Currently Delivering Order */}
        {activeOrder && activeOrder.length > 0 && (
          <View style={styles.activeOrderContainer}>
            <Text style={styles.sectionTitle}>🚚 Currently Delivering</Text>

            {activeOrder.map((order, index) => (

              <TouchableOpacity
                key={index}
                style={styles.activeOrderCard}
                onPress={() => router.push(`/order/${order.orderCode}`)}
              >
                <LinearGradient
                  colors={['#3B82F6', '#1D4ED8']}
                  style={styles.activeOrderGradient}
                >
                  <View style={styles.activeOrderHeader}>
                    <Text style={styles.activeOrderCode}>{order.orderCode}</Text>
                    <Text style={styles.activeOrderStatus}>{order.orderStatus}</Text>
                  </View>

                  <View style={styles.activeOrderInfo}>
                    <View style={styles.activeOrderInfoRow}>
                      <Text style={styles.activeOrderLabel}>Restaurant:</Text>
                      <Text style={styles.activeOrderValue}>
                        {order.restaurantName || 'Unknown'}
                      </Text>
                    </View>

                    <View style={styles.activeOrderInfoRow}>
                      <Text style={styles.activeOrderLabel}>Pickup Code:</Text>
                      <Text style={styles.activeOrderValue}>
                        {order.pickUpVerificationCode || 'N/A'}
                      </Text>
                    </View>

                    <View style={styles.activeOrderInfoRow}>
                      <Text style={styles.activeOrderLabel}>Total Earnings:</Text>
                      <Text style={styles.activeOrderEarnings}>
                        {formatETB(order.deliveryFee + order.tip)}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.activeOrderFooter}>
                    <TouchableOpacity
                      style={styles.qrVerifyButton}
                      onPress={(e) => {
                        e.stopPropagation();
                        setOrderIdToVerify(order.id || order._id);
                        setShowVerificationModal(true);
                      }}
                    >
                      <Scan color="#FFFFFF" size={18} />
                      <Text style={styles.qrVerifyButtonText}>Verify with QR</Text>
                    </TouchableOpacity>
                    <Text style={styles.activeOrderTapText}>Tap card for details →</Text>
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Quick Actions */}
        <View style={styles.quickActionsContainer}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.quickActions}>
            <TouchableOpacity 
              style={styles.quickActionButton}
              onPress={() => router.push('/tabs/orders')}
            >
              <View style={styles.quickActionIcon}>
                <MapPin color="#3B82F6" size={28} />
              </View>
              <Text style={styles.quickActionText}>View Orders</Text>
              <Text style={styles.quickActionSubtext}>Browse available deliveries</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.quickActionButton}
              onPress={() => router.push('/tabs/history')}
            >
              <View style={styles.quickActionIcon}>
                <Clock color="#3B82F6" size={28} />
              </View>
              <Text style={styles.quickActionText}>Delivery History</Text>
              <Text style={styles.quickActionSubtext}>View past deliveries</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.quickActions}>
            <TouchableOpacity 
              style={styles.quickActionButton}
              onPress={() => router.push('/tabs/profile')}
            >
              <View style={styles.quickActionIcon}>
                <User color="#3B82F6" size={28} />
              </View>
              <Text style={styles.quickActionText}>My Profile</Text>
              <Text style={styles.quickActionSubtext}>Account & settings</Text>
            </TouchableOpacity>
            
            
          </View>
        </View>

        {/* Online Status Tips */}
        {!isOnline && (
          <View style={styles.tipsContainer}>
            <Text style={styles.tipsTitle}>💡 Ready to Start?</Text>
            <Text style={styles.tipsText}>
              Go online to start receiving delivery requests and earning money!
            </Text>
            <TouchableOpacity 
              style={styles.goOnlineButton}
              onPress={toggleOnlineStatus}
            >
              <Text style={styles.goOnlineButtonText}>Go Online Now</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* No Active Orders Message */}
        {isOnline && activeOrder && activeOrder.length === 0 && (
          <View style={styles.noOrdersContainer}>
            <Text style={styles.noOrdersTitle}>No Active Deliveries</Text>
            <Text style={styles.noOrdersText}>
              You're online and ready to accept orders. New delivery requests will appear here automatically.
            </Text>
          </View>
        )}

        {/* No Earnings Yet Message */}
        {(!orderHistory || orderHistory.length === 0) && (
          <View style={styles.tipsContainer}>
            <Text style={styles.tipsTitle}>🎯 Start Earning Today!</Text>
            <Text style={styles.tipsText}>
              Complete your first delivery to start building your earnings history. Your stats will be updated in real-time!
            </Text>
          </View>
        )}
      </ScrollView>
      
      {/* Order Modal */}
      {showOrderModalState && pendingOrderPopup && (
        <OrderModal
          visible={showOrderModalState}
          order={pendingOrderPopup}
          onAccept={(order) => acceptOrderFromModal(order, () => {
            // Already on dashboard, just refresh the data
            onRefresh();
          })}
          onDecline={declineOrder}
          onClose={hideOrderModal}
        />
      )}

      {/* Verification Modal */}
      <VerificationModal
        visible={showVerificationModal}
        onClose={handleCloseVerificationModal}
        onVerify={handleVerifyDelivery}
        orderId={orderIdToVerify}
        orderCode={activeOrder?.order_id}
        isLoading={isVerifying}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  headerLeft: {
    flex: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  greeting: {
    fontSize: 16,
    color: '#6B7280',
    fontWeight: '500',
  },
  driverName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1F2937',
    marginTop: 4,
  },
  lastRefreshText: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 4,
    fontStyle: 'italic',
  },
  refreshButton: {
    padding: 10,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  refreshIconSpinning: {
    opacity: 0.5,
  },
  statusButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 8,
  },
  online: {
    backgroundColor: '#10B981',
  },
  offline: {
    backgroundColor: '#6B7280',
  },
  statusText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  connectionStatus: {
    marginHorizontal: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 20,
  },
  connected: {
    backgroundColor: '#D1FAE5',
  },
  disconnected: {
    backgroundColor: '#FEE2E2',
  },
  connectionText: {
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  activeDeliveryWarning: {
    marginHorizontal: 20,
    marginBottom: 20,
    borderRadius: 12,
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  activeDeliveryGradient: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  activeDeliveryIcon: {
    fontSize: 24,
  },
  activeDeliveryTextContainer: {
    flex: 1,
  },
  activeDeliveryTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  activeDeliveryMessage: {
    fontSize: 12,
    color: '#FFFFFF',
    opacity: 0.95,
    lineHeight: 16,
  },
  newOrderIndicator: {
    marginHorizontal: 20,
    marginBottom: 20,
    borderRadius: 12,
    overflow: 'hidden',
  },
  newOrderGradient: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  newOrderText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 12,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
    minHeight: 120,
    justifyContent: 'center',
  },
  statIcon: {
    marginBottom: 8,
  },
  statNumber: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#FFFFFF',
    opacity: 0.9,
    textAlign: 'center',
  },
  statHint: {
    fontSize: 10,
    color: '#FFFFFF',
    opacity: 0.75,
    textAlign: 'center',
    marginTop: 4,
  },
  totalEarningsContainer: {
    paddingHorizontal: 20,
    marginBottom: 30,
  },
  totalEarningsCard: {
    padding: 24,
    borderRadius: 16,
  },
  totalEarningsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  totalEarningsTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    marginLeft: 12,
  },
  totalEarningsAmount: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  totalEarningsSubtitle: {
    fontSize: 14,
    color: '#FFFFFF',
    opacity: 0.9,
  },
  activeOrderContainer: {
    paddingHorizontal: 20,
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 16,
  },
  activeOrderCard: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 12,
  },
  activeOrderGradient: {
    padding: 20,
  },
  activeOrderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  activeOrderCode: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  activeOrderStatus: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  activeOrderInfo: {
    marginBottom: 16,
  },
  activeOrderInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  activeOrderLabel: {
    fontSize: 14,
    color: '#FFFFFF',
    opacity: 0.9,
  },
  activeOrderValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  activeOrderEarnings: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  activeOrderFooter: {
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.2)',
    gap: 8,
  },
  qrVerifyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.9)',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 6,
    width: '100%',
  },
  qrVerifyButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  activeOrderTapText: {
    fontSize: 12,
    color: '#FFFFFF',
    opacity: 0.8,
    fontStyle: 'italic',
  },
  quickActionsContainer: {
    paddingHorizontal: 20,
    marginBottom: 30,
  },
  quickActions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  quickActionButton: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    padding: 20,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  quickActionIcon: {
    marginBottom: 8,
  },
  quickActionText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
    textAlign: 'center',
  },
  quickActionSubtext: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
  },
  tipsContainer: {
    backgroundColor: '#EFF6FF',
    marginHorizontal: 20,
    padding: 20,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 30,
  },
  tipsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1E40AF',
    marginBottom: 8,
  },
  tipsText: {
    fontSize: 14,
    color: '#4B5563',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 20,
  },
  goOnlineButton: {
    backgroundColor: '#10B981',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  goOnlineButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  noOrdersContainer: {
    backgroundColor: '#F3F4F6',
    marginHorizontal: 20,
    padding: 20,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 30,
  },
  noOrdersTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4B5563',
    marginBottom: 8,
  },
  noOrdersText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
  },
});
