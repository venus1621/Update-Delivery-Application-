import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
  Animated,
  Dimensions,
} from 'react-native';
import { CameraView, Camera } from 'expo-camera';
import { X, Camera as CameraIcon, AlertCircle, Scan, CheckCircle } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function QRScanner({ visible, onClose, onScanSuccess, orderId }) {
  const [hasPermission, setHasPermission] = useState(null);
  const [scanned, setScanned] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  
  // Animation values
  const scanLineAnim = useRef(new Animated.Value(0)).current;
  const successScaleAnim = useRef(new Animated.Value(0)).current;
  const successOpacityAnim = useRef(new Animated.Value(0)).current;
  const checkmarkScaleAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      requestCameraPermission();
      startScanLineAnimation();
    } else {
      // Reset animations when closed
      scanLineAnim.setValue(0);
      successScaleAnim.setValue(0);
      successOpacityAnim.setValue(0);
      checkmarkScaleAnim.setValue(0);
      setShowSuccess(false);
    }
  }, [visible]);

  // Animated scanning line
  const startScanLineAnimation = () => {
    scanLineAnim.setValue(0);
    Animated.loop(
      Animated.sequence([
        Animated.timing(scanLineAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(scanLineAnim, {
          toValue: 0,
          duration: 2000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  };

  // Success animation
  const playSuccessAnimation = () => {
    setShowSuccess(true);
    
    // Animated sequence for success overlay
    Animated.parallel([
      Animated.spring(successScaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
      Animated.timing(successOpacityAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();

    // Checkmark animation with delay
    setTimeout(() => {
      Animated.spring(checkmarkScaleAnim, {
        toValue: 1,
        tension: 40,
        friction: 5,
        useNativeDriver: true,
      }).start();
    }, 200);
  };

  const requestCameraPermission = async () => {
    try {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');
      
      if (status !== 'granted') {
        Alert.alert(
          'Camera Permission Required',
          'Please enable camera access in your device settings to scan QR codes.',
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('Error requesting camera permission:', error);
      Alert.alert('Error', 'Failed to request camera permission');
    }
  };

  const handleBarCodeScanned = ({ type, data }) => {
    if (scanned || isProcessing) return;

    setScanned(true);
    setIsProcessing(true);

    try {
      // Parse the QR code data
      let verificationData;
      
      // Try to parse as JSON first
      try {
        verificationData = JSON.parse(data);
      } catch {
        // If not JSON, treat as plain verification code
        verificationData = { code: data };
      }

      // Extract verification code
      const verificationCode = verificationData.code || 
                               verificationData.verificationCode || 
                               verificationData.orderId || 
                               data;

      // Success feedback
      if (Platform.OS === 'android') {
        const { Vibration } = require('react-native');
        Vibration.vibrate([0, 100, 100, 100]); // Pattern vibration
      }

      // Play success animation
      playSuccessAnimation();

      // Pass the scanned data to the parent component after animation
      setTimeout(() => {
        onScanSuccess(verificationCode, verificationData);
        setIsProcessing(false);
        setScanned(false);
        setShowSuccess(false);
      }, 1500);

    } catch (error) {
      console.error('❌ Error processing QR code:', error);
      Alert.alert(
        'Invalid QR Code',
        'The scanned QR code is not valid. Please try again or enter the code manually.',
        [
          { 
            text: 'Try Again', 
            onPress: () => {
              setScanned(false);
              setIsProcessing(false);
            }
          },
          { text: 'Cancel', onPress: onClose }
        ]
      );
    }
  };

  const handleClose = () => {
    setScanned(false);
    setIsProcessing(false);
    onClose();
  };

  if (!visible) return null;

  if (hasPermission === null) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size= {48}  color="#3B82F6" />
          <Text style={styles.loadingText}>Requesting camera permission...</Text>
        </View>
      </View>
    );
  }

  if (hasPermission === false) {
    return (
      <View style={styles.container}>
        <View style={styles.permissionContainer}>
          <AlertCircle color="#EF4444" size={48} />
          <Text style={styles.permissionTitle}>Camera Access Denied</Text>
          <Text style={styles.permissionMessage}>
            Please enable camera access in your device settings to scan QR codes.
          </Text>
          <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
            <Text style={styles.closeButtonText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const scanLineTranslateY = scanLineAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-140, 140],
  });

  return (
    <View style={styles.fullScreenContainer}>
      {/* Camera View - Full Screen */}
      <CameraView
        style={styles.camera}
        facing="back"
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
        barcodeScannerSettings={{
          barcodeTypes: ['qr', 'pdf417'],
        }}
      >
        {/* Dark Overlay for better contrast */}
        <View style={styles.overlay} />

        {/* Header */}
        <View style={styles.header}>
          <LinearGradient
            colors={['rgba(0, 0, 0, 0.9)', 'transparent']}
            style={styles.headerGradient}
          >
            <View style={styles.headerContent}>
              <View style={styles.headerLeft}>
                <Scan color="#FFFFFF" size={28} />
                <Text style={styles.headerTitle}>Scan QR Code</Text>
              </View>
              <TouchableOpacity
                style={styles.closeIconButton}
                onPress={handleClose}
                disabled={isProcessing}
              >
                <X color="#FFFFFF" size={28} />
              </TouchableOpacity>
            </View>
            <Text style={styles.headerSubtitle}>
              Position the QR code within the frame
            </Text>
          </LinearGradient>
        </View>

        {/* Scanning Frame - Centered */}
        <View style={styles.scanFrame}>
          <View style={styles.scanBox}>
            {/* Corner borders */}
            <View style={[styles.corner, styles.cornerTopLeft]} />
            <View style={[styles.corner, styles.cornerTopRight]} />
            <View style={[styles.corner, styles.cornerBottomLeft]} />
            <View style={[styles.corner, styles.cornerBottomRight]} />
            
            {/* Animated Scanning Line */}
            {!scanned && !isProcessing && (
              <Animated.View 
                style={[
                  styles.scanLine,
                  {
                    transform: [{ translateY: scanLineTranslateY }],
                  }
                ]} 
              />
            )}

            {isProcessing && !showSuccess && (
              <View style={styles.processingContainer}>
                <ActivityIndicator size= {48}  color="#FFFFFF" />
                <Text style={styles.processingText}>Verifying...</Text>
              </View>
            )}
          </View>
        </View>

        {/* Success Animation Overlay */}
        {showSuccess && (
          <Animated.View 
            style={[
              styles.successOverlay,
              {
                opacity: successOpacityAnim,
                transform: [{ scale: successScaleAnim }],
              }
            ]}
          >
            <View style={styles.successCircle}>
              <Animated.View
                style={{
                  transform: [{ scale: checkmarkScaleAnim }],
                }}
              >
                <CheckCircle color="#10B981" size={80} fill="#FFFFFF" />
              </Animated.View>
            </View>
            <Text style={styles.successText}>Scan Successful!</Text>
            <Text style={styles.successSubtext}>Verifying order...</Text>
          </Animated.View>
        )}

        {/* Footer Instructions */}
        <View style={styles.footer}>
          <LinearGradient
            colors={['transparent', 'rgba(0, 0, 0, 0.9)']}
            style={styles.footerGradient}
          >
            <View style={styles.instructionContainer}>
              <CameraIcon color="#10B981" size={24} />
              <Text style={styles.instructionText}>
                Ask the customer to show their verification QR code
              </Text>
            </View>

            {scanned && !showSuccess && (
              <TouchableOpacity
                style={styles.scanAgainButton}
                onPress={() => {
                  setScanned(false);
                  setIsProcessing(false);
                  startScanLineAnimation();
                }}
              >
                <Text style={styles.scanAgainText}>Scan Again</Text>
              </TouchableOpacity>
            )}
          </LinearGradient>
        </View>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  fullScreenContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    backgroundColor: '#000000',
    zIndex: 9999,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1F2937',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#FFFFFF',
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    backgroundColor: '#1F2937',
  },
  permissionTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  permissionMessage: {
    fontSize: 16,
    color: '#D1D5DB',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  closeButton: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  camera: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    zIndex: 10,
  },
  headerGradient: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  headerSubtitle: {
    fontSize: 15,
    color: '#D1D5DB',
    marginTop: 4,
  },
  closeIconButton: {
    padding: 8,
  },
  scanFrame: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanBox: {
    width: 300,
    height: 300,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  corner: {
    position: 'absolute',
    width: 50,
    height: 50,
    borderColor: '#10B981',
    borderWidth: 5,
  },
  cornerTopLeft: {
    top: 0,
    left: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderTopLeftRadius: 12,
  },
  cornerTopRight: {
    top: 0,
    right: 0,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
    borderTopRightRadius: 12,
  },
  cornerBottomLeft: {
    bottom: 0,
    left: 0,
    borderRightWidth: 0,
    borderTopWidth: 0,
    borderBottomLeftRadius: 12,
  },
  cornerBottomRight: {
    bottom: 0,
    right: 0,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    borderBottomRightRadius: 12,
  },
  scanLine: {
    position: 'absolute',
    width: '90%',
    height: 3,
    backgroundColor: '#10B981',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 15,
    elevation: 10,
  },
  processingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  processingText: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: Platform.OS === 'ios' ? 40 : 30,
    zIndex: 10,
  },
  footerGradient: {
    paddingHorizontal: 24,
    paddingTop: 30,
  },
  instructionContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    padding: 18,
    gap: 14,
  },
  instructionText: {
    flex: 1,
    fontSize: 15,
    color: '#FFFFFF',
    fontWeight: '600',
    lineHeight: 22,
  },
  scanAgainButton: {
    backgroundColor: '#3B82F6',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 14,
  },
  scanAgainText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  successOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  successCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 20,
    elevation: 15,
  },
  successText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginTop: 24,
    letterSpacing: 0.5,
  },
  successSubtext: {
    fontSize: 16,
    color: '#D1D5DB',
    marginTop: 8,
  },
});




