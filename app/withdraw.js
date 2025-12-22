import React, { useState, useEffect, useRef } from 'react';
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
  RefreshControl,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DollarSign, ArrowLeft, RefreshCw } from 'lucide-react-native';
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
  const [refreshing, setRefreshing] = useState(false);

  // 🔄 Animation value for rotate icon
  const rotateAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    fetchBankList();
  }, []);

  const startRotateAnimation = () => {
    rotateAnim.setValue(0);
    Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 700,
        useNativeDriver: true,
      })
    ).start();
  };

  const stopRotateAnimation = () => {
    rotateAnim.stopAnimation();
  };

  const fetchBankList = async () => {
    setIsLoadingBanks(true);

    try {
      const cached = await AsyncStorage.getItem('bank_list_cache');
      if (cached) {
        const { banks, balance, timestamp } = JSON.parse(cached);
        const CACHE_DURATION = 24 * 60 * 60 * 1000;

        if (Date.now() - timestamp < CACHE_DURATION) {
          setAvailableBanks(banks);
          setWithdrawBalance(balance);
          if (banks.length > 0) setSelectedBank(banks[0].id);
          setIsLoadingBanks(false);
          return;
        }
      }

      const response = await fetch(
        'https://api.bahirandelivery.cloud/api/v1/balance/initialize-withdraw',
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      const result = await response.json();

      if (result.status === 'success') {
        const banks = result.data.banks;
        const balance = result.data.balance;

        await AsyncStorage.setItem(
          'bank_list_cache',
          JSON.stringify({
            banks,
            balance,
            timestamp: Date.now(),
          })
        );

        setAvailableBanks(banks);
        setWithdrawBalance(balance);
        if (banks.length > 0) setSelectedBank(banks[0].id);
      }
    } catch (err) {
      setWithdrawError('Failed to load bank info.');
    } finally {
      setIsLoadingBanks(false);
    }
  };

  // 🔄 Manual reload button
  const handleReload = async () => {
    setWithdrawError('');
    setWithdrawSuccess('');

    startRotateAnimation(); // 🔄 start rotating icon
    await AsyncStorage.removeItem('bank_list_cache');
    await fetchBankList();
    stopRotateAnimation(); // 🛑 stop rotating

    setWithdrawSuccess('Refreshed successfully!');
  };

  // 🔄 Pull-to-refresh gesture
  const onPullRefresh = async () => {
    setRefreshing(true);
    await AsyncStorage.removeItem('bank_list_cache');
    await fetchBankList();
    setRefreshing(false);
  };

  const handleWithdraw = async () => {
    setWithdrawError('');
    setWithdrawSuccess('');

    const amount = parseFloat(withdrawAmount);

    if (!amount || amount <= 0) {
      setWithdrawError('Enter a valid amount');
      return;
    }

    if (amount > withdrawBalance) {
      setWithdrawError(`Insufficient balance (${formatCurrency(withdrawBalance)})`);
      return;
    }

    if (!selectedBank) {
      setWithdrawError('Select a bank');
      return;
    }

    setIsWithdrawing(true);

    try {
      const response = await fetch(
        'https://api.bahirandelivery.cloud/api/v1/balance/withdraw',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            amount,
            bankId: selectedBank,
          }),
        }
      );

      const result = await response.json();

      if (response.status === 401) {
        Alert.alert('Session Expired', 'Please login again.', [
          {
            text: 'OK',
            onPress: async () => {
              await logout();
              router.replace('/login');
            },
          },
        ]);
        return;
      }

      if (result.status === 'success') {
        setWithdrawSuccess('Withdrawal requested successfully!');
        await AsyncStorage.removeItem('bank_list_cache');

        setTimeout(() => {
          router.back();
        }, 2000);
      } else {
        setWithdrawError(result.message || 'Failed to withdraw.');
      }
    } catch (err) {
      setWithdrawError('Something went wrong.');
    } finally {
      setIsWithdrawing(false);
    }
  };

  const spin = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardView}>

        {/* HEADER */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <ArrowLeft size={24} color="#1F2937" />
          </TouchableOpacity>

          <Text style={styles.headerTitle}>Withdraw Funds</Text>

          {/* 🔄 Animated Refresh Button */}
          <TouchableOpacity onPress={handleReload} style={styles.reloadButton}>
            <Animated.View style={{ transform: [{ rotate: spin }] }}>
              <RefreshCw size={24} color="#10B981" />
            </Animated.View>
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onPullRefresh} colors={['#10B981']} />
          }
        >

          {/* Loading State */}
          {isLoadingBanks ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size= {48}  color="#10B981" />
              <Text style={styles.loadingText}>Fetching bank list...</Text>
            </View>
          ) : (
            <>
              {/* Balance Card */}
              <View style={styles.balanceCard}>
                <Text style={styles.balanceLabel}>Available Balance</Text>
                <Text style={styles.balanceAmount}>{formatCurrency(withdrawBalance)}</Text>
              </View>

              {/* Banks */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Select Bank</Text>

                {availableBanks.length === 0 ? (
                  <Text style={{ color: 'red' }}>No banks available</Text>
                ) : (
                  availableBanks.map((bank) => (
                    <TouchableOpacity
                      key={bank.id}
                      onPress={() => setSelectedBank(bank.id)}
                      style={[
                        styles.bankOption,
                        selectedBank === bank.id && styles.bankOptionSelected,
                      ]}
                    >
                      <Text style={styles.bankName}>{bank.name}</Text>
                      <Text style={styles.bankSlug}>{bank.slug}</Text>
                    </TouchableOpacity>
                  ))
                )}
              </View>

              {/* Amount Input */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Withdrawal Amount</Text>
                <View style={styles.amountInputContainer}>
                  <DollarSign color="#6B7280" size={20} />
                  <TextInput
                    style={styles.amountInput}
                    keyboardType="numeric"
                    placeholder="Enter amount"
                    value={withdrawAmount}
                    onChangeText={setWithdrawAmount}
                  />
                </View>
              </View>

            </>
          )}
        </ScrollView>

        {/* Withdraw Button */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            disabled={isWithdrawing}
            onPress={handleWithdraw}
            style={styles.withdrawButton}
          >
            <LinearGradient
              colors={isWithdrawing ? ['#9CA3AF', '#6B7280'] : ['#10B981', '#059669']}
              style={styles.withdrawButtonGradient}
            >
              {isWithdrawing ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Text style={styles.withdrawButtonText}>Request Withdrawal</Text>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>

      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/* ================================
   STYLES
=================================*/
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  keyboardView: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: { padding: 8 },
  reloadButton: { padding: 8 },
  headerTitle: { fontSize: 18, fontWeight: '600', color: '#1F2937' },
  scrollContent: { padding: 20, paddingBottom: 120 },

  loadingContainer: { padding: 40, alignItems: 'center' },
  loadingText: { marginTop: 12, color: '#6B7280' },

  balanceCard: {
    backgroundColor: '#FFF',
    padding: 24,
    borderRadius: 12,
    marginBottom: 24,
    alignItems: 'center',
    elevation: 4,
  },
  balanceLabel: { fontSize: 14, color: '#6B7280' },
  balanceAmount: { fontSize: 32, fontWeight: 'bold', color: '#10B981' },

  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 12 },

  bankOption: {
    backgroundColor: '#F3F4F6',
    padding: 16,
    borderRadius: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  bankOptionSelected: { borderColor: '#10B981', backgroundColor: '#ECFDF5' },
  bankName: { fontSize: 16, fontWeight: '600' },
  bankSlug: { fontSize: 12, color: '#6B7280' },

  amountInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 12,
    backgroundColor: '#FFF',
  },
  amountInput: { flex: 1, padding: 12, fontSize: 16 },

  buttonContainer: {
    padding: 20,
    backgroundColor: '#FFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    position: 'absolute',
    bottom: 0,
    width: '100%',
  },
  withdrawButton: { borderRadius: 12, overflow: 'hidden' },
  withdrawButtonGradient: {
    paddingVertical: 15,
    alignItems: 'center',
  },
  withdrawButtonText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
});
