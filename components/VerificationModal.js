import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { X, CheckCircle, AlertCircle, Scan } from 'lucide-react-native';
import QRScanner from './QRScanner';

export default function VerificationModal({ 
  visible, 
  onClose, 
  onVerify, 
  orderId, 
  orderCode,
  isLoading = false 
}) {
  const [verificationCode, setVerificationCode] = useState('');
  const [showQRScanner, setShowQRScanner] = useState(false);

  const handleVerify = () => {
    if (!orderId) {
      Alert.alert(
        "⚠️ No Order Selected",
        "No order is selected for verification. Please try again.",
        [{ text: 'OK' }]
      );
      return;
    }

    if (!verificationCode.trim()) {
      Alert.alert(
        "⚠️ Verification Code Required",
        "Please enter the verification code to complete the delivery.",
        [{ text: 'OK' }]
      );
      return;
    }

    if (verificationCode.trim().length < 4) {
      Alert.alert(
        "⚠️ Invalid Code",
        "Verification code should be at least 4 characters long.",
        [{ text: 'OK' }]
      );
      return;
    }

    onVerify(verificationCode.trim());
    setVerificationCode(''); // Clear input after verification attempt
  };

  const handleClose = () => {
    setVerificationCode('');
    setShowQRScanner(false);
    onClose();
  };

  const handleQRScanSuccess = (scannedCode, fullData) => {
    
    setVerificationCode(scannedCode);
    setShowQRScanner(false);
    
    // Auto-verify after QR scan
    onVerify(scannedCode);
  };

  const openQRScanner = () => {
    setShowQRScanner(true);
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.modalContainer}>
          <LinearGradient
            colors={['#FFFFFF', '#F8FAFC']}
            style={styles.modalContent}
          >
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <CheckCircle color="#10B981" size={24} />
                <Text style={styles.title}>Complete Delivery</Text>
              </View>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={handleClose}
                disabled={isLoading}
              >
                <X color="#6B7280" size={24} />
              </TouchableOpacity>
            </View>

            {/* Order Info */}
            <View style={styles.orderInfo}>
              <Text style={styles.orderInfoTitle}>Order Details</Text>
              <View style={styles.orderInfoRow}>
                <Text style={styles.orderInfoLabel}>Order ID:</Text>
                <Text style={styles.orderInfoValue}>{orderCode || 'N/A'}</Text>
              </View>
            </View>

            {/* Instructions */}
            <View style={styles.instructionsContainer}>
              <AlertCircle color="#F59E0B" size={20} />
              <Text style={styles.instructionsText}>
                Please ask the customer for the verification code to complete the delivery.
              </Text>
            </View>

            {/* Verification Code Input */}
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Verification Code</Text>
              <TextInput
                style={styles.verificationInput}
                value={verificationCode}
                onChangeText={setVerificationCode}
                placeholder="Enter verification code"
                placeholderTextColor="#9CA3AF"
                keyboardType="numeric"
                maxLength={10}
                autoFocus={true}
                editable={!isLoading}
                returnKeyType="done"
                onSubmitEditing={handleVerify}
              />
            </View>

            {/* QR Code Scanner Button */}
            <View style={styles.qrScannerContainer}>
              <View style={styles.dividerContainer}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>OR</Text>
                <View style={styles.dividerLine} />
              </View>
              
              <TouchableOpacity
                style={styles.qrScanButton}
                onPress={openQRScanner}
                disabled={isLoading}
              >
                <LinearGradient
                  colors={['#3B82F6', '#1E40AF']}
                  style={styles.qrScanButtonGradient}
                >
                  <Scan color="#FFFFFF" size={20} />
                  <Text style={styles.qrScanButtonText}>Scan QR Code</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>

            {/* Action Buttons */}
            <View style={styles.buttonContainer}>
              <TouchableOpacity
                style={[styles.button, styles.cancelButton]}
                onPress={handleClose}
                disabled={isLoading}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.button,
                  styles.verifyButton,
                  isLoading && styles.verifyButtonDisabled
                ]}
                onPress={handleVerify}
                disabled={isLoading}
              >
                <LinearGradient
                  colors={isLoading ? ['#9CA3AF', '#6B7280'] : ['#10B981', '#059669']}
                  style={styles.verifyButtonGradient}
                >
                  <Text style={styles.verifyButtonText}>
                    {isLoading ? 'Verifying...' : 'Verify Delivery'}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </View>
      </KeyboardAvoidingView>

      {/* QR Scanner Modal */}
      {showQRScanner && (
        <Modal
          visible={showQRScanner}
          animationType="slide"
          onRequestClose={() => setShowQRScanner(false)}
        >
          <QRScanner
            visible={showQRScanner}
            onClose={() => setShowQRScanner(false)}
            onScanSuccess={handleQRScanSuccess}
            orderId={orderId}
          />
        </Modal>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 400,
  },
  modalContent: {
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  closeButton: {
    padding: 4,
  },
  orderInfo: {
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    padding: 16,
    marginBottom: 20,
  },
  orderInfoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  orderInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  orderInfoLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  orderInfoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
  },
  instructionsContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
    gap: 8,
  },
  instructionsText: {
    flex: 1,
    fontSize: 14,
    color: '#92400E',
    lineHeight: 20,
  },
  inputContainer: {
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  verificationInput: {
    borderWidth: 2,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    textAlign: 'center',
    letterSpacing: 2,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    height: 48,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
  },
  verifyButton: {
    overflow: 'hidden',
  },
  verifyButtonDisabled: {
    opacity: 0.6,
  },
  verifyButtonGradient: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
  verifyButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  qrScannerContainer: {
    marginBottom: 24,
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
    borderRadius: 8,
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
