import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DollarSign, ArrowLeft, CheckCircle, AlertCircle } from 'lucide-react-native';
import { router } from 'expo-router';
import { useAuth } from '../providers/auth-provider';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { formatCurrency } from '../services/balance-service';

export default function WithdrawScreen() {
  const { token, logout } = useAuth();
  
  const [availableBanks, setAvailableBanks] = useState([]);
  const [selectedBank, setSelectedBank] = useState(null);
  const [withdrawBalance, setWithdrawBalance] = useState(null);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [isLoadingBanks, setIsLoadingBanks] = useState(true);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState('');
  const [withdrawSuccess, setWithdrawSuccess] = useState('');

  // Fetch bank list on mount
  useEffect(() => {
    fetchBankList();
  }, []);

  const fetchBankList = async () => {
    setIsLoadingBanks(true);
    
    try {
      // Check cache first (valid for 24 hours)
      const cachedData = await AsyncStorage.getItem('bank_list_cache');
      if (cachedData) {
        const { banks, balance, timestamp } = JSON.parse(cachedData);
        const age = Date.now() - timestamp;
        const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours
        
        if (age < CACHE_DURATION) {
          console.log('✅ Using cached bank list');
          setAvailableBanks(banks);
          setWithdrawBalance(balance);
          if (banks.length > 0) {
            setSelectedBank(banks[0].id);
          }
          setIsLoadingBanks(false);
          return;
        }
      }

      // Fetch fresh data
      console.log('🔄 Fetching fresh bank list from API');
      const response = await fetch(
        'https://bahrain-delivery-backend.onrender.com/api/v1/balance/initialize-withdraw',
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      const result = await response.json();

      if (result.status === 'success' && result.data) {
        const banks = result.data.banks || [];
        const balance = result.data.balance;
        
        // Cache the data
        await AsyncStorage.setItem('bank_list_cache', JSON.stringify({
          banks,
          balance,
          timestamp: Date.now(),
        }));
        
        setAvailableBanks(banks);
        setWithdrawBalance(balance);
        if (banks.length > 0) {
          setSelectedBank(banks[0].id);
        }
      } else {
        setWithdrawError('Failed to load bank information');
      }
    } catch (error) {
      console.error('Error fetching bank list:', error);
      setWithdrawError('Failed to load bank information. Please try again.');
    } finally {
      setIsLoadingBanks(false);
    }
  };

  const handleWithdraw = async () => {
    setWithdrawError('');
    setWithdrawSuccess('');

    // Validation
    const amount = parseFloat(withdrawAmount);
    if (!withdrawAmount.trim() || isNaN(amount)) {
      setWithdrawError('Please enter a valid amount');
      return;
    }

    if (amount <= 0) {
      setWithdrawError('Amount must be greater than 0');
      return;
    }

    // Check against withdraw balance
    if (withdrawBalance && amount > withdrawBalance) {
      setWithdrawError(`Insufficient balance. Available: ${formatCurrency(withdrawBalance)}`);
      return;
    }

    // Validate bank selection
    if (!selectedBank) {
      setWithdrawError('Please select a bank');
      return;
    }

    // Verify selected bank exists
    const bank = availableBanks.find(b => b.id === selectedBank);
    if (!bank) {
      setWithdrawError('Invalid bank selection');
      return;
    }

    setIsWithdrawing(true);

    try {
      const response = await fetch(
        'https://bahrain-delivery-backend.onrender.com/api/v1/balance/withdraw',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            amount: amount,
            bankId: selectedBank,
          }),
        }
      );

      const result = await response.json();

      // Check for authentication errors
      if (response.status === 401) {
        Alert.alert(
          'Session Expired',
          'Your session has expired. Please log in again.',
          [
            {
              text: 'OK',
              onPress: async () => {
                await logout();
                router.replace('/login');
              },
            },
          ],
          { cancelable: false }
        );
        return;
      }

      if (result.status === 'success' || response.ok) {
        setWithdrawSuccess(result.message || 'Withdrawal request submitted successfully!');
        
        // Clear cache to force fresh data on next fetch
        await AsyncStorage.removeItem('bank_list_cache');
        
        // Navigate back after 2 seconds
        setTimeout(() => {
          router.back();
        }, 2000);
      } else {
        setWithdrawError(result.message || 'Withdrawal failed. Please try again.');
      }
    } catch (error) {
      console.error('Error requesting withdrawal:', error);
      setWithdrawError('Something went wrong. Please try again.');
    } finally {
      setIsWithdrawing(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backButton}
            activeOpacity={0.7}
          >
            <ArrowLeft color="#1F2937" size={24} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Withdraw Funds</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {isLoadingBanks ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#10B981" />
              <Text style={styles.loadingText}>Loading withdrawal options...</Text>
            </View>
          ) : (
            <>
              {/* Balance Card */}
              <View style={styles.balanceCard}>
                <Text style={styles.balanceLabel}>Available Balance</Text>
                <Text style={styles.balanceAmount}>
                  {withdrawBalance ? formatCurrency(withdrawBalance) : formatCurrency(0)}
                </Text>
              </View>

              {/* Bank Selection */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Select Bank</Text>
                {availableBanks.length > 0 ? (
                  <View style={styles.bankListContainer}>
                    {availableBanks.map((bank) => (
                      <TouchableOpacity
                        key={bank.id}
                        style={[
                          styles.bankOption,
                          selectedBank === bank.id && styles.bankOptionSelected,
                        ]}
                        onPress={() => setSelectedBank(bank.id)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.bankOptionContent}>
                          <View
                            style={[
                              styles.bankRadio,
                              selectedBank === bank.id && styles.bankRadioSelected,
                            ]}
                          >
                            {selectedBank === bank.id && (
                              <View style={styles.bankRadioInner} />
                            )}
                          </View>
                          <View style={styles.bankInfo}>
                            <Text style={styles.bankName}>{bank.name}</Text>
                            <Text style={styles.bankSlug}>{bank.slug}</Text>
                          </View>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : (
                  <View style={styles.noBanksContainer}>
                    <Text style={styles.noBanksText}>No banks available</Text>
                  </View>
                )}
              </View>

              {/* Amount Input */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Withdrawal Amount (ETB)</Text>
                <View style={styles.amountInputContainer}>
                  <DollarSign color="#6b7280" size={20} style={styles.inputIcon} />
                  <TextInput
                    style={styles.amountInput}
                    placeholder="Enter amount"
                    placeholderTextColor="#9ca3af"
                    value={withdrawAmount}
                    onChangeText={setWithdrawAmount}
                    keyboardType="numeric"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
              </View>

              {/* Quick Amount Buttons */}
              <View style={styles.quickAmountsContainer}>
                <Text style={styles.quickAmountsLabel}>Quick Select</Text>
                <View style={styles.quickAmountsButtons}>
                  {['50', '100', '200', '500'].map((amount) => (
                    <TouchableOpacity
                      key={amount}
                      style={styles.quickAmountButton}
                      onPress={() => setWithdrawAmount(amount)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.quickAmountText}>{amount}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Error/Success Messages */}
              {(withdrawError || withdrawSuccess) && (
                <View
                  style={[
                    styles.messageBanner,
                    withdrawError ? styles.errorBanner : styles.successBanner,
                  ]}
                >
                  {withdrawError ? (
                    <AlertCircle color="#ef4444" size={20} />
                  ) : (
                    <CheckCircle color="#10b981" size={20} />
                  )}
                  <Text
                    style={[
                      styles.messageText,
                      withdrawError ? styles.errorText : styles.successText,
                    ]}
                  >
                    {withdrawError || withdrawSuccess}
                  </Text>
                </View>
              )}
            </>
          )}
        </ScrollView>

        {/* Withdraw Button */}
        {!isLoadingBanks && (
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={styles.withdrawButton}
              onPress={handleWithdraw}
              disabled={isWithdrawing || !selectedBank || !withdrawAmount}
              activeOpacity={0.7}
            >
              <LinearGradient
                colors={isWithdrawing || !selectedBank || !withdrawAmount ? ['#9CA3AF', '#6B7280'] : ['#10B981', '#059669']}
                style={styles.withdrawButtonGradient}
              >
                {isWithdrawing ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.withdrawButtonText}>Request Withdrawal</Text>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
  },
  headerSpacer: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 100,
  },
  loadingContainer: {
    paddingVertical: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
    color: '#6B7280',
  },
  balanceCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    marginBottom: 24,
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  balanceLabel: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 8,
  },
  balanceAmount: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#10B981',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 12,
  },
  bankListContainer: {
    gap: 12,
  },
  bankOption: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    padding: 16,
  },
  bankOptionSelected: {
    backgroundColor: '#EFF6FF',
    borderColor: '#3B82F6',
  },
  bankOptionContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bankRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bankRadioSelected: {
    borderColor: '#3B82F6',
  },
  bankRadioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#3B82F6',
  },
  bankInfo: {
    flex: 1,
  },
  bankName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  bankSlug: {
    fontSize: 13,
    color: '#6B7280',
  },
  noBanksContainer: {
    padding: 24,
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
  },
  noBanksText: {
    fontSize: 14,
    color: '#DC2626',
  },
  amountInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    paddingHorizontal: 16,
  },
  inputIcon: {
    marginRight: 12,
  },
  amountInput: {
    flex: 1,
    fontSize: 16,
    color: '#1F2937',
    paddingVertical: 16,
  },
  quickAmountsContainer: {
    marginBottom: 24,
  },
  quickAmountsLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  quickAmountsButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  quickAmountButton: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
  },
  quickAmountText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  messageBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 16,
    gap: 12,
  },
  successBanner: {
    backgroundColor: '#d1fae5',
    borderWidth: 1,
    borderColor: '#10b981',
  },
  errorBanner: {
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#ef4444',
  },
  messageText: {
    flex: 1,
    fontSize: 14,
  },
  successText: {
    color: '#065f46',
  },
  errorText: {
    color: '#991b1b',
  },
  buttonContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  withdrawButton: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  withdrawButtonGradient: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  withdrawButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
});



