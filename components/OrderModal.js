import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Alert,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Package, X, Check, XCircle, MapPin } from 'lucide-react-native';
import { useAuth } from '../providers/auth-provider';
import { useDelivery } from '../providers/delivery-provider';

export default function OrderModal({ visible, order, onAccept, onDecline, onClose }) {
  const { userId } = useAuth();
  const { acceptOrder, isOnline, isConnected } = useDelivery();
  const [acceptingOrder, setAcceptingOrder] = useState(false);

  // Slide animation
  const slideAnim = React.useRef(new Animated.Value(1000)).current;

  React.useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 0,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: 1000,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  if (!visible || !order) return null;

  const extractNumber = (val) => {
    if (!val) return 0;
    if (typeof val === 'number') return val;
    if (typeof val === 'string') return parseFloat(val) || 0;
    if (val.$numberDecimal) return parseFloat(val.$numberDecimal);
    return Number(val) || 0;
  };

  const deliveryFee = extractNumber(order.deliveryFee);
  const tip = extractNumber(order.tip);
  const total = extractNumber(order.grandTotal) || deliveryFee + tip;

  const format = (num) => (num || 0).toFixed(2);

  const handleAccept = async () => {
    // Instantly block double-tap
    if (acceptingOrder) return;
  
    // Must be online & connected
    if (!isOnline) {
      Alert.alert('Go Online', 'You need to be ONLINE to accept orders.');
      return;
    }
  
    if (!isConnected) {
      Alert.alert('No Connection', 'Waiting for server connection...');
      return;
    }
  
    setAcceptingOrder(true);
  
    try {
      const success = await acceptOrder(order.orderId, userId);
      if (success) {
        onClose(); // Close modal immediately on success
      }
    } catch (err) {
      console.error('Accept failed:', err);
      Alert.alert('Failed', 'Could not accept order. Try again.');
    } finally {
      setAcceptingOrder(false);
    }
  };

  const handleDecline = () => {
    Alert.alert('Decline?', 'Skip this order?', [
      { text: 'Cancel' },
      { text: 'Decline', style: 'destructive', onPress: () => onDecline(order) },
    ]);
  };

  return (
    <Modal transparent visible={visible} animationType="fade">
      <View style={styles.overlay}>
        <Animated.View
          style={[
            styles.modal,
            { transform: [{ translateY: slideAnim }] },
          ]}
        >
          <LinearGradient colors={['#1E293B', '#0F172A']} style={styles.gradient}>
            {/* Close Button */}
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <X color="#94A3B8" size={28} />
            </TouchableOpacity>

            {/* Top Section - Big Earnings */}
            <View style={styles.topSection}>
              <Package color="#10B981" size={48} />
              <Text style={styles.newOrderText}>New Order!</Text>

              <Text style={styles.earningText}>ETB {format(total)}</Text>
              <Text style={styles.earningSubtext}>
                {tip > 0 ? `Includes ETB ${format(tip)} tip 🔥` : 'Delivery Fee'}
              </Text>
            </View>

            {/* Middle - Key Info */}
            <View style={styles.infoContainer}>
              <View style={styles.infoCard}>
                <MapPin color="#60A5FA" size={20} />
                <View style={{ marginLeft: 12 }}>
                  <Text style={styles.infoTitle}>From</Text>
                  <Text style={styles.infoValue} numberOfLines={1}>
                    {order.restaurantName || 'Restaurant'}
                  </Text>
                </View>
              </View>

              {order.distanceKm && (
                <View style={styles.distanceBadge}>
                  <Text style={styles.distanceText}>
                    {(extractNumber(order.distanceKm)).toFixed(1)} km away
                  </Text>
                </View>
              )}

              <Text style={styles.orderCode}>
                #{order.orderCode || order.orderId}
              </Text>
            </View>

            {/* Bottom Buttons */}
            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[styles.btn, styles.declineBtn]}
                onPress={handleDecline}
                disabled={acceptingOrder}
              >
                <LinearGradient
                  colors={['#EF4444', '#DC2626']}
                  style={styles.btnGradient}
                >
                  <XCircle size={28} color="white" />
                  <Text style={styles.btnText}>Decline</Text>
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.btn, styles.acceptBtn]}
                onPress={handleAccept}
                disabled={acceptingOrder}
              >
                <LinearGradient
                  colors={acceptingOrder ? ['#6B7280', '#4B5563'] : ['#10B981', '#059669']}
                  style={styles.btnGradient}
                >
                  <Check size={28} color="white" />
                  <Text style={styles.btnText}>
                    {acceptingOrder ? 'Accepting...' : 'Accept'}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'flex-end',
  },
  modal: {
    height: '92%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  gradient: {
    flex: 1,
    paddingTop: 20,
  },
  closeBtn: {
    position: 'absolute',
    top: 16,
    right: 20,
    zIndex: 10,
    padding: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 20,
  },
  topSection: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  newOrderText: {
    color: '#10B981',
    fontSize: 22,
    fontWeight: 'bold',
    marginTop: 12,
  },
  earningText: {
    color: '#FFFFFF',
    fontSize: 56,
    fontWeight: '900',
    marginTop: 16,
    letterSpacing: 1,
  },
  earningSubtext: {
    color: '#94A3B8',
    fontSize: 16,
    marginTop: 8,
  },
  infoContainer: {
    paddingHorizontal: 24,
    alignItems: 'center',
    marginBottom: 30,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    padding: 16,
    borderRadius: 16,
    width: '100%',
  },
  infoTitle: {
    color: '#94A3B8',
    fontSize: 13,
  },
  infoValue: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 4,
  },
  distanceBadge: {
    backgroundColor: '#10B981',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginTop: 16,
  },
  distanceText: {
    color: 'white',
    fontWeight: 'bold',
  },
  orderCode: {
    color: '#64748B',
    fontSize: 14,
    marginTop: 20,
    fontWeight: '600',
  },
  buttonRow: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    paddingBottom: 40,
    gap: 16,
  },
  btn: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 5,
  },
  btnGradient: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 20,
    gap: 12,
  },
  btnText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
