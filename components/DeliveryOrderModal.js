import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Animated,
  Dimensions,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Package,
  MapPin,
  Store,
  DollarSign,
  Clock,
  Check,
  X,
  Navigation,
} from 'lucide-react-native';

const { width, height } = Dimensions.get('window');

export default function DeliveryOrderModal({
  visible,
  order,
  onAccept,
  onDecline,
}) {
  const slideAnim = useRef(new Animated.Value(height)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          tension: 50,
          friction: 8,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 50,
          friction: 7,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      slideAnim.setValue(height);
      scaleAnim.setValue(0.9);
      opacityAnim.setValue(0);
    }
  }, [visible]);

  if (!visible || !order) return null;

  const formatCurrency = (value) => {
    if (!value) return '0.00';
    const num = typeof value === 'object' && value.$numberDecimal
      ? parseFloat(value.$numberDecimal)
      : parseFloat(value);
    return num.toFixed(2);
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const deliveryFee = formatCurrency(order.deliveryFee);
  const tip = formatCurrency(order.tip);
  const total = (parseFloat(deliveryFee) + parseFloat(tip)).toFixed(2);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
    >
      <Animated.View style={[styles.overlay, { opacity: opacityAnim }]}>
        <TouchableOpacity
          style={styles.overlayTouchable}
          activeOpacity={1}
          onPress={onDecline}
        />
        
        <Animated.View
          style={[
            styles.modalContainer,
            {
              transform: [{ translateY: slideAnim }, { scale: scaleAnim }],
            },
          ]}
        >
          {/* Header with Gradient */}
          <LinearGradient
            colors={['#10B981', '#059669', '#047857']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.header}
          >
            <View style={styles.headerContent}>
              <View style={styles.iconContainer}>
                <Package color="#FFFFFF" size={32} strokeWidth={2.5} />
              </View>
              <View style={styles.headerText}>
                <Text style={styles.headerTitle}>New Delivery Request</Text>
                <Text style={styles.headerSubtitle}>
                  {formatDate(order.createdAt)}
                </Text>
              </View>
            </View>
            <View style={styles.pulseContainer}>
              <View style={styles.pulseDot} />
            </View>
          </LinearGradient>

          {/* Content */}
          <View style={styles.content}>
            {/* Restaurant Info */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Store color="#059669" size={20} strokeWidth={2} />
                <Text style={styles.sectionTitle}>Restaurant</Text>
              </View>
              <View style={styles.infoCard}>
                <Text style={styles.restaurantName}>
                  {order.restaurantName || 'Unknown Restaurant'}
                </Text>
              </View>
            </View>

            {/* Order Code */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Package color="#3B82F6" size={20} strokeWidth={2} />
                <Text style={styles.sectionTitle}>Order Code</Text>
              </View>
              <View style={styles.infoCard}>
                <Text style={styles.orderCode}>{order.orderCode}</Text>
              </View>
            </View>

            {/* Earnings Breakdown */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <DollarSign color="#F59E0B" size={20} strokeWidth={2} />
                <Text style={styles.sectionTitle}>Earnings</Text>
              </View>
              <View style={styles.earningsCard}>
                <View style={styles.earningRow}>
                  <Text style={styles.earningLabel}>Delivery Fee</Text>
                  <Text style={styles.earningValue}>ETB {deliveryFee}</Text>
                </View>
                <View style={styles.earningRow}>
                  <Text style={styles.earningLabel}>Tip</Text>
                  <Text style={styles.earningValue}>ETB {tip}</Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.earningRow}>
                  <Text style={styles.totalLabel}>Total Earnings</Text>
                  <Text style={styles.totalValue}>ETB {total}</Text>
                </View>
              </View>
            </View>

            {/* Location Info */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Navigation color="#EF4444" size={20} strokeWidth={2} />
                <Text style={styles.sectionTitle}>Delivery Route</Text>
              </View>
              <View style={styles.locationCard}>
                <View style={styles.locationRow}>
                  <View style={styles.locationDot} style={[styles.locationDot, { backgroundColor: '#10B981' }]} />
                  <View style={styles.locationInfo}>
                    <Text style={styles.locationLabel}>From Restaurant</Text>
                    {order.restaurantLocation?.coordinates && (
                      <Text style={styles.locationCoords}>
                        {order.restaurantLocation.coordinates[1]?.toFixed(4)}, {order.restaurantLocation.coordinates[0]?.toFixed(4)}
                      </Text>
                    )}
                  </View>
                </View>
                <View style={styles.locationLine} />
                <View style={styles.locationRow}>
                  <View style={[styles.locationDot, { backgroundColor: '#EF4444' }]} />
                  <View style={styles.locationInfo}>
                    <Text style={styles.locationLabel}>To Customer</Text>
                    {order.deliveryLocation?.coordinates && (
                      <Text style={styles.locationCoords}>
                        {order.deliveryLocation.coordinates[1]?.toFixed(4)}, {order.deliveryLocation.coordinates[0]?.toFixed(4)}
                      </Text>
                    )}
                  </View>
                </View>
              </View>
            </View>
          </View>

          {/* Action Buttons */}
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={styles.declineButton}
              onPress={onDecline}
              activeOpacity={0.8}
            >
              <X color="#EF4444" size={24} strokeWidth={2.5} />
              <Text style={styles.declineButtonText}>Decline</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.acceptButton}
              onPress={onAccept}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={['#10B981', '#059669']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.acceptButtonGradient}
              >
                <Check color="#FFFFFF" size={24} strokeWidth={2.5} />
                <Text style={styles.acceptButtonText}>Accept Order</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlayTouchable: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  modalContainer: {
    width: width * 0.9,
    maxHeight: height * 0.85,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 24,
      },
      android: {
        elevation: 16,
      },
    }),
  },
  header: {
    paddingHorizontal: 24,
    paddingVertical: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.9)',
  },
  pulseContainer: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
  },
  content: {
    padding: 20,
    maxHeight: height * 0.5,
  },
  section: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  restaurantName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
  },
  orderCode: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#3B82F6',
    letterSpacing: 1,
  },
  earningsCard: {
    backgroundColor: '#FFFBEB',
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: '#FCD34D',
  },
  earningRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  earningLabel: {
    fontSize: 15,
    color: '#78716C',
  },
  earningValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#78716C',
  },
  divider: {
    height: 1,
    backgroundColor: '#FCD34D',
    marginVertical: 8,
  },
  totalLabel: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#111827',
  },
  totalValue: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#F59E0B',
  },
  locationCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  locationDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: 4,
  },
  locationLine: {
    width: 2,
    height: 20,
    backgroundColor: '#D1D5DB',
    marginLeft: 5,
    marginVertical: 4,
  },
  locationInfo: {
    flex: 1,
  },
  locationLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 4,
  },
  locationCoords: {
    fontSize: 12,
    color: '#6B7280',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  actionButtons: {
    flexDirection: 'row',
    padding: 20,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  declineButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: '#FEF2F2',
    borderWidth: 2,
    borderColor: '#FEE2E2',
  },
  declineButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#EF4444',
  },
  acceptButton: {
    flex: 2,
    borderRadius: 12,
    overflow: 'hidden',
  },
  acceptButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  acceptButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
});

