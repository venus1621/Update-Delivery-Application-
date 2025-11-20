import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  TextInput,
  Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { 
  MapPin, 
  Clock, 
  DollarSign, 
  Phone, 
  Truck, 
  CheckCircle,
  AlertCircle,
  ArrowLeft,
  Navigation,
  Scan,
  X
} from 'lucide-react-native';
import QRScanner from '../../components/QRScanner';
import { useLocalSearchParams, router } from 'expo-router';
import { useDelivery } from '../../providers/delivery-provider';
import { useAuth } from '../../providers/auth-provider';

// Helper function to format Ethiopian currency
const formatETB = (amount) => {
  return new Intl.NumberFormat('en-ET', {
    style: 'currency',
    currency: 'ETB'
  }).format(amount || 0);
};

export default function OrderDetailsScreen() {
  const { orderId } = useLocalSearchParams();
  const { activeOrder, verifyDelivery, completeOrder, isLoadingActiveOrder } = useDelivery();
  const { user } = useAuth();
  
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationError, setVerificationError] = useState('');
  const [attemptsLeft, setAttemptsLeft] = useState(3);
  const [isLocked, setIsLocked] = useState(false);
  const [showQRScanner, setShowQRScanner] = useState(false);

  // Find the order details (support activeOrder being null, an array, or a single object)
  const order = useMemo(() => {
    if (!activeOrder) return null;
    if (Array.isArray(activeOrder)) return activeOrder[0] || null;
    if (typeof activeOrder === 'object') return activeOrder;
    return null;
  }, [activeOrder]);




  const handleVerifyAndComplete = async (code) => {
    if (isLocked) {
      Alert.alert('Locked', 'Too many failed attempts. Please contact support.');
      return;
    }

    if (!code || code.length !== 6) {
      return;
    }

    setIsVerifying(true);
    setVerificationError('');

    try {
      // First verify the delivery
      const result = await verifyDelivery(order.id, code);
      
      if (result.success) {
        // Show success message
        Alert.alert(
          '✅ Delivery Verified!',
          'Order has been completed successfully',
          [
            {
              text: 'OK',
              onPress: () => {
                setShowVerificationModal(false);
                setVerificationCode('');
                setVerificationError('');
                setAttemptsLeft(3);
                router.back();
              }
            }
          ]
        );
      } else {
        // Handle verification failure
        const newAttemptsLeft = attemptsLeft - 1;
        setAttemptsLeft(newAttemptsLeft);
        
        if (newAttemptsLeft === 0) {
          setIsLocked(true);
          setVerificationError('❌ Account locked. Too many failed attempts. Please contact support.');
          Alert.alert(
            'Account Locked',
            'You have exceeded the maximum number of verification attempts. Please contact support.',
            [{ text: 'OK' }]
          );
        } else {
          const errorMessage = result.error || 'Invalid verification code';
          setVerificationError(`❌ ${errorMessage}. ${newAttemptsLeft} ${newAttemptsLeft === 1 ? 'attempt' : 'attempts'} remaining.`);
          setVerificationCode(''); // Clear the code for retry
        }
      }
    } catch (error) {
      console.error('Error verifying delivery:', error);
      const newAttemptsLeft = attemptsLeft - 1;
      setAttemptsLeft(newAttemptsLeft);
      
      if (newAttemptsLeft === 0) {
        setIsLocked(true);
        setVerificationError('❌ Account locked. Too many failed attempts. Please contact support.');
      } else {
        setVerificationError(`❌ Failed to verify. ${newAttemptsLeft} ${newAttemptsLeft === 1 ? 'attempt' : 'attempts'} remaining.`);
        setVerificationCode('');
      }
    } finally {
      setIsVerifying(false);
    }
  };

  // Handle verification code change with auto-submit
  const handleVerificationCodeChange = (text) => {
    // Only allow numbers
    const numericText = text.replace(/[^0-9]/g, '');
    
    // Limit to 6 digits
    const limitedText = numericText.slice(0, 6);
    
    setVerificationCode(limitedText);
    
    // Clear error when user starts typing
    if (verificationError) {
      setVerificationError('');
    }
    
    // Auto-submit when 6 digits are entered
    if (limitedText.length === 6 && !isVerifying && !isLocked) {
      handleVerifyAndComplete(limitedText);
    }
  };


  const handleNavigateToRestaurant = () => {
    
    // Get restaurant location - handle both object format and coordinates array
    let lat, lng;
    
    if (order.restaurantLocation) {
      // Check if location is already transformed to {lat, lng} format
      if (order.restaurantLocation.lat !== undefined && order.restaurantLocation.lng !== undefined) {
        lat = order.restaurantLocation.lat;
        lng = order.restaurantLocation.lng;
      } 
      // Check if coordinates array exists [lng, lat]
      else if (order.restaurantLocation.coordinates && order.restaurantLocation.coordinates.length >= 2) {
        lng = order.restaurantLocation.coordinates[0]; // longitude is first in backend [lng, lat]
        lat = order.restaurantLocation.coordinates[1]; // latitude is second in backend [lng, lat]
      }
    }

    if (lat && lng) {
      // Navigate to map screen with restaurant location
      const restaurantLocation = JSON.stringify({
        lat: Number(lat),
        lng: Number(lng),
        name: order.restaurantLocation?.name || order.restaurantName || 'Restaurant',
        address: order.restaurantLocation?.address || 'Restaurant Address'
      });
      
      
      router.push({
        pathname: '/map',
        params: {
          restaurantLocation: restaurantLocation
        }
      });
    } else {
      Alert.alert('Error', 'Restaurant location not available');
    }
  };

  const handleNavigateToDelivery = () => {
     
    // Get delivery location - check multiple possible field names
    const deliveryLocationData = order?.destinationLocation || order?.deliveryLocation || order?.deliverLocation;
    
    if (!deliveryLocationData) {
      Alert.alert('Error', 'Delivery location not available');
      return;
    }
    
    let lat, lng;
    
    // Check if location is already transformed to {lat, lng} format
    if (deliveryLocationData.lat !== undefined && deliveryLocationData.lng !== undefined) {
      lat = deliveryLocationData.lat;
      lng = deliveryLocationData.lng;
    } 
    // Check if coordinates array exists [lng, lat]
    else if (deliveryLocationData.coordinates && deliveryLocationData.coordinates.length >= 2) {
      lng = deliveryLocationData.coordinates[0]; // longitude is first in backend [lng, lat]
      lat = deliveryLocationData.coordinates[1]; // latitude is second in backend [lng, lat]
    }
    
    if (lat && lng) {
      // Navigate to map screen with delivery location
      const deliveryLocation = JSON.stringify({
        lat: Number(lat),
        lng: Number(lng),
        name: 'Delivery Location',
        address: deliveryLocationData.address || 'Delivery Address'
      });
      
      
      router.push({
        pathname: '/map',
        params: {
          restaurantLocation: deliveryLocation
        }
      });
    } else {
      Alert.alert('Error', 'Delivery location not available');
    }
  };

  const handleCallCustomer = () => {
    const phoneNumber = order?.phone || order?.userPhone || order?.customer?.phone;
    
    if (!phoneNumber || phoneNumber === 'N/A') {
      Alert.alert('Error', 'Customer phone number not available');
      return;
    }

    // Remove any non-numeric characters except + 
    const cleanedNumber = phoneNumber.replace(/[^\d+]/g, '');
    const phoneUrl = `tel:${cleanedNumber}`;

    Linking.canOpenURL(phoneUrl)
      .then((supported) => {
        if (supported) {
          return Linking.openURL(phoneUrl);
        } else {
          Alert.alert('Error', 'Phone call not supported on this device');
        }
      })
      .catch((error) => {
        console.error('Error opening phone app:', error);
        Alert.alert('Error', 'Failed to open phone app');
      });
  };

  const formatTime = (dateString) => {
    return new Date(dateString).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString();
  };

  if (isLoadingActiveOrder) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1E40AF" />
          <Text style={styles.loadingText}>Loading order details...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!order) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <ArrowLeft color="#1F2937" size={24} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Order Details</Text>
          <View style={styles.placeholder} />
        </View>
        
        <View style={styles.errorContainer}>
          <AlertCircle color="#EF4444" size={48} />
          <Text style={styles.errorTitle}>Order Not Found</Text>
          <Text style={styles.errorMessage}>
            The order you're looking for is not available or has been completed.
          </Text>
          <TouchableOpacity 
            style={styles.retryButton}
            onPress={() => router.back()}
          >
            <Text style={styles.retryButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <ArrowLeft color="#1F2937" size={24} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Order Details</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Order Status Card */}
        <View style={styles.statusCard}>
          <LinearGradient
            colors={
              order.orderStatus === 'Delivering' 
                ? ['#3B82F6', '#1D4ED8'] 
                : ['#10B981', '#059669']
            }
            style={styles.statusGradient}
          >
            <View style={styles.statusHeader}>
              <Truck color="#FFFFFF" size={24} />
              <Text style={styles.statusTitle}>
                {order.orderStatus === 'Delivering' ? 'Delivering Order' : 'Order Ready'}
              </Text>
            </View>
            <Text style={styles.statusSubtitle}>
              {order.orderStatus === 'Delivering' 
                ? 'Order is being delivered to customer'
                : 'Order is on Delivering'
              }
            </Text>
          </LinearGradient>
        </View>

        {/* Order Information */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Order Information</Text>
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Order Code:</Text>
              <Text style={styles.infoValue}>{order.orderCode}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Status:</Text>
              <Text style={[styles.infoValue, styles.statusText]}>{order.orderStatus || 'Pending'}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Created:</Text>
              <Text style={styles.infoValue}>
                {order.updatedAt ? `${formatDate(order.updatedAt)} at ${formatTime(order.updatedAt)}` : 'N/A'}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Pickup Code:</Text>
              <Text style={[styles.infoValue, styles.verificationCode]}>
                {order.pickUpVerificationCode || order.verificationCode || 'N/A'}
              </Text>
            </View>
            {order.distanceKm && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Distance:</Text>
                <Text style={styles.infoValue}>{order.distanceKm} km</Text>
              </View>
            )}
          </View>
        </View>

        {/* Restaurant Information */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Restaurant Details</Text>
          <View style={styles.locationCard}>
            <View style={styles.locationHeader}>
              <MapPin color="#1E40AF" size={20} />
              <Text style={styles.locationTitle}>Pickup Location</Text>
            </View>
            <Text style={styles.restaurantName}>
              {order.restaurantName || order.restaurantLocation?.name || 'Restaurant'}
            </Text>
            <Text style={styles.locationAddress}>
              {(typeof order?.restaurantLocation?.address === 'string' ? order.restaurantLocation.address : null) 
              // || 
              //  (order?.restaurantLocation?.lat != null && order?.restaurantLocation?.lng != null ? 
              //    `Lat: ${Number(order.restaurantLocation.lat).toFixed(4)}, Lng: ${Number(order.restaurantLocation.lng).toFixed(4)}` : 
              //    'Restaurant Address')
                 }
            </Text>
            
            <TouchableOpacity 
              style={styles.navigateButton}
              onPress={handleNavigateToRestaurant}
            >
              <Navigation color="#1E40AF" size={16} />
              <Text style={styles.navigateButtonText}>Navigate to Restaurant</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Delivery Information */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Delivery Details</Text>
          <View style={styles.locationCard}>
            <View style={styles.locationHeader}>
              <MapPin color="#10B981" size={20} />
              <Text style={styles.locationTitle}>Delivery Location</Text>
            </View>
            <Text style={styles.locationAddress}>
              {(typeof order?.destinationLocation?.address === 'string' ? order.destinationLocation.address : null) 
              }
            </Text>
            
            <TouchableOpacity 
              style={[styles.navigateButton, styles.deliveryNavigateButton]}
              onPress={handleNavigateToDelivery}
            >
              <Navigation color="#10B981" size={16} />
              <Text style={[styles.navigateButtonText, styles.deliveryNavigateText]}>
                Navigate to Delivery
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Customer Information */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Customer Information</Text>
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Phone color="#6B7280" size={16} />
              <Text style={styles.infoLabel}>Phone:</Text>
              <Text style={styles.infoValue}>{order.phone || order.userPhone || order.customer?.phone || 'N/A'}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Name:</Text>
              <Text style={styles.infoValue}>{order.userName || order.customer?.name || 'Customer'}</Text>
            </View>
            
            <TouchableOpacity 
              style={styles.callButton}
              onPress={handleCallCustomer}
            >
              <Phone color="#FFFFFF" size={18} />
              <Text style={styles.callButtonText}>Call Customer</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Order Items */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Order Items</Text>
          <View style={styles.itemsCard}>
            {(order.items || []).map((item, index) => (
              <View key={index} style={styles.itemRow}>
                <Text style={styles.itemName}>{item.name}</Text>
                <Text style={styles.itemQuantity}>x{item.quantity}</Text>
              </View>
            ))}
            {(order.description || order.specialInstructions) && (
              <View style={styles.instructionsContainer}>
                <Text style={styles.instructionsLabel}>Special Instructions:</Text>
                <Text style={styles.instructionsText}>
                  {order.description || order.specialInstructions}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Payment Information */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payment Details</Text>
          <View style={styles.paymentCard}>
            <View style={styles.paymentRow}>
              <DollarSign color="#6B7280" size={16} />
              <Text style={styles.paymentLabel}>Delivery Fee:</Text>
              <Text style={styles.paymentValue}>
                {formatETB((() => {
                  const fee = order.deliveryFee;
                  if (typeof fee === 'number') return fee;
                  if (fee?.$numberDecimal) return parseFloat(fee.$numberDecimal);
                  return 0;
                })())}
              </Text>
            </View>
            <View style={styles.paymentRow}>
              <Text style={styles.paymentLabel}>Tip:</Text>
              <Text style={styles.paymentValue}>
                {formatETB((() => {
                  const tipValue = order.tip;
                  if (typeof tipValue === 'number') return tipValue;
                  if (tipValue?.$numberDecimal) return parseFloat(tipValue.$numberDecimal);
                  return 0;
                })())}
              </Text>
            </View>
            <View style={[styles.paymentRow, styles.totalRow]}>
              <Text style={styles.totalLabel}>Total Earnings:</Text>
              <Text style={styles.totalValue}>
                {formatETB((() => {
                  const extractNumber = (val) => {
                    if (typeof val === 'number') return val;
                    if (val?.$numberDecimal) return parseFloat(val.$numberDecimal);
                    return 0;
                  };
                  const fee = extractNumber(order.deliveryFee);
                  const tipVal = extractNumber(order.tip);
                  const total = extractNumber(order.grandTotal) || (fee + tipVal);
                  return total;
                })())}
              </Text>
            </View>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionsSection}>
          <TouchableOpacity 
            style={styles.primaryButton}
            onPress={() => {
              if (!isLocked) {
                setShowVerificationModal(true);
              } else {
                Alert.alert('Locked', 'Too many failed attempts. Please contact support.');
              }
            }}
            disabled={isVerifying || isLocked}
          >
            <LinearGradient
              colors={isLocked ? ['#9CA3AF', '#6B7280'] : ['#10B981', '#059669']}
              style={styles.buttonGradient}
            >
              {isVerifying ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <CheckCircle color="#FFFFFF" size={20} />
              )}
              <Text style={styles.buttonText}>
                {isLocked ? 'Locked' : isVerifying ? 'Verifying...' : 'Complete Order'}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
          
          {isLocked && (
            <Text style={styles.lockedText}>
              Account locked due to multiple failed attempts. Please contact support.
            </Text>
          )}
        </View>
      </ScrollView>

      {/* Verification Modal */}
      {showVerificationModal && !showQRScanner && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>🔐 Verification Required</Text>
              <TouchableOpacity
                style={styles.closeModalButton}
                onPress={() => {
                  setShowVerificationModal(false);
                  setVerificationCode('');
                  setVerificationError('');
                }}
              >
                <X color="#6B7280" size={24} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>
              Enter the 6-digit verification code from the customer to complete the order
            </Text>
            
            {/* Attempts Counter */}
            <View style={styles.attemptsContainer}>
              <Text style={styles.attemptsText}>
                Attempts remaining: <Text style={styles.attemptsBold}>{attemptsLeft}/3</Text>
              </Text>
            </View>
            
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Verification Code:</Text>
              <TextInput
                style={[
                  styles.textInput,
                  styles.codeInput,
                  verificationError ? styles.textInputError : null,
                  isLocked ? styles.textInputLocked : null
                ]}
                value={verificationCode}
                onChangeText={handleVerificationCodeChange}
                placeholder="000000"
                placeholderTextColor="#9CA3AF"
                keyboardType="number-pad"
                maxLength={6}
                autoFocus
                editable={!isVerifying && !isLocked}
                textAlign="center"
              />
              
              {/* Progress Indicator */}
              <View style={styles.codeProgress}>
                {[...Array(6)].map((_, index) => (
                  <View 
                    key={index} 
                    style={[
                      styles.codeDot,
                      index < verificationCode.length ? styles.codeDotFilled : null
                    ]} 
                  />
                ))}
              </View>
              
              {isVerifying && (
                <View style={styles.verifyingContainer}>
                  <ActivityIndicator color="#10B981" size="small" />
                  <Text style={styles.verifyingText}>Verifying code...</Text>
                </View>
              )}
              
              {verificationError ? (
                <Text style={styles.errorText}>{verificationError}</Text>
              ) : (
                <Text style={styles.hintText}>
                  Code will be verified automatically when all 6 digits are entered
                </Text>
              )}
            </View>

            {/* QR Scanner Option */}
            <View style={styles.qrScannerSection}>
              <View style={styles.dividerContainer}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>OR</Text>
                <View style={styles.dividerLine} />
              </View>
              
              <TouchableOpacity
                style={styles.qrScanButton}
                onPress={() => setShowQRScanner(true)}
                disabled={isVerifying || isLocked}
              >
                <LinearGradient
                  colors={['#3B82F6', '#1E40AF']}
                  style={styles.qrScanButtonGradient}
                >
                  <Scan color="#FFFFFF" size={20} />
                  <Text style={styles.qrScanButtonText}>Scan Customer QR Code</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
            
            <TouchableOpacity 
              style={styles.modalSingleButton}
              onPress={() => {
                setShowVerificationModal(false);
                setVerificationCode('');
                setVerificationError('');
              }}
              disabled={isVerifying}
            >
              <Text style={styles.modalSingleButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* QR Scanner Modal */}
      {showQRScanner && (
        <QRScanner
          visible={showQRScanner}
          onClose={() => {
            setShowQRScanner(false);
          }}
          onScanSuccess={(scannedCode, fullData) => {
             setShowQRScanner(false);
            setShowVerificationModal(false);
            setVerificationCode(scannedCode);
            // Auto-verify after scan
            handleVerifyAndComplete(scannedCode);
          }}
          orderId={order?.id || order?._id}
        />
      )}
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
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  placeholder: {
    width: 40,
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
  errorTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1F2937',
    marginTop: 16,
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  retryButton: {
    backgroundColor: '#1E40AF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  statusCard: {
    margin: 20,
    borderRadius: 16,
    overflow: 'hidden',
  },
  statusGradient: {
    padding: 20,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginLeft: 12,
  },
  statusSubtitle: {
    fontSize: 14,
    color: '#FFFFFF',
    opacity: 0.9,
  },
  section: {
    marginHorizontal: 20,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 12,
  },
  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  infoLabel: {
    fontSize: 14,
    color: '#6B7280',
    marginRight: 8,
    flex: 1,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
    flex: 2,
  },
  statusText: {
    color: '#10B981',
  },
  verificationCode: {
    color: '#1E40AF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  locationCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  locationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  locationTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginLeft: 8,
  },
  restaurantName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 4,
  },
  locationAddress: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
    marginBottom: 12,
  },
  navigateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  navigateButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E40AF',
    marginLeft: 6,
  },
  deliveryNavigateButton: {
    backgroundColor: '#ECFDF5',
  },
  deliveryNavigateText: {
    color: '#10B981',
  },
  itemsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  itemName: {
    fontSize: 14,
    color: '#1F2937',
    flex: 1,
  },
  itemQuantity: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  instructionsContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  instructionsLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  instructionsText: {
    fontSize: 14,
    color: '#6B7280',
    fontStyle: 'italic',
  },
  paymentCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  paymentLabel: {
    fontSize: 14,
    color: '#6B7280',
    marginLeft: 8,
    flex: 1,
  },
  paymentValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingTop: 12,
    marginTop: 4,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1F2937',
    flex: 1,
  },
  totalValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#10B981',
  },
  actionsSection: {
    margin: 20,
    marginBottom: 40,
  },
  primaryButton: {
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 12,
  },
  buttonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginLeft: 8,
  },
  secondaryButton: {
    backgroundColor: '#F3F4F6',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    margin: 20,
    width: '90%',
    maxWidth: 400,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1F2937',
    flex: 1,
  },
  closeModalButton: {
    padding: 4,
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  inputContainer: {
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 8,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: '#FFFFFF',
  },
  textInputError: {
    borderColor: '#EF4444',
    borderWidth: 2,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 14,
    marginTop: 8,
    fontWeight: '500',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
  },
  modalConfirmButton: {
    flex: 1,
    backgroundColor: '#1E40AF',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalConfirmText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  callButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginTop: 16,
  },
  callButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginLeft: 8,
  },
  lockedText: {
    fontSize: 14,
    color: '#EF4444',
    textAlign: 'center',
    marginTop: 12,
    fontWeight: '500',
  },
  attemptsContainer: {
    backgroundColor: '#FEF3C7',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  attemptsText: {
    fontSize: 14,
    color: '#92400E',
    textAlign: 'center',
  },
  attemptsBold: {
    fontWeight: 'bold',
    fontSize: 16,
    color: '#B45309',
  },
  codeInput: {
    fontSize: 24,
    fontWeight: 'bold',
    letterSpacing: 8,
    textAlign: 'center',
  },
  textInputLocked: {
    backgroundColor: '#F3F4F6',
    color: '#9CA3AF',
  },
  codeProgress: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    marginBottom: 8,
  },
  codeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#E5E7EB',
  },
  codeDotFilled: {
    backgroundColor: '#10B981',
  },
  verifyingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    gap: 8,
  },
  verifyingText: {
    fontSize: 14,
    color: '#10B981',
    fontWeight: '500',
  },
  hintText: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 8,
    fontStyle: 'italic',
  },
  modalSingleButton: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  modalSingleButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
  },
  qrScannerSection: {
    marginTop: 20,
    marginBottom: 16,
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E5E7EB',
  },
  dividerText: {
    marginHorizontal: 16,
    fontSize: 14,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  qrScanButton: {
    overflow: 'hidden',
    borderRadius: 12,
  },
  qrScanButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 8,
  },
  qrScanButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});