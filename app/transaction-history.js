import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Filter,
  RefreshCw,
  Wallet,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
} from 'lucide-react-native';
import { router } from 'expo-router';
import { useAuth } from '../providers/auth-provider';
import {
  getTransactionHistory,
  formatCurrency,
  formatDateTime,
  getTransactionTypeColor,
  getTransactionStatusColor,
} from '../services/balance-service';

const { width } = Dimensions.get('window');

export default function TransactionHistoryScreen() {
  const { token } = useAuth();
  const [transactions, setTransactions] = useState([]);
  const [filteredTransactions, setFilteredTransactions] = useState([]);
  const [totalBalance, setTotalBalance] = useState(0);
  const [requesterType, setRequesterType] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [filterBy, setFilterBy] = useState('all'); // all, deposit, withdraw

  // Fetch transaction history
  const fetchTransactions = useCallback(async () => {
    try {
      setError(null);
      const result = await getTransactionHistory(token);

      if (result.success) {
        // Sort transactions in descending order (newest first)
        const sortedTransactions = [...result.data.transactions].sort((a, b) => {
          return new Date(b.createdAt) - new Date(a.createdAt);
        });
        
        setTransactions(sortedTransactions);
        setFilteredTransactions(sortedTransactions);
        setTotalBalance(result.data.totalBalance);
        setRequesterType(result.data.requesterType);
      } else {
        setError(result.message);
      }
    } catch (err) {
      console.error('Error fetching transactions:', err);
      setError('Failed to load transaction history');
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  // Handle refresh
  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchTransactions();
  };

  // Apply filter - maintain descending order
  useEffect(() => {
    let filtered = [];
    if (filterBy === 'all') {
      filtered = [...transactions];
    } else if (filterBy === 'deposit') {
      filtered = transactions.filter(t => t.type === 'Deposit');
    } else if (filterBy === 'withdraw') {
      filtered = transactions.filter(t => t.type === 'Withdraw');
    }
    
    // Keep descending order (newest first)
    const sortedFiltered = filtered.sort((a, b) => {
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
    
    setFilteredTransactions(sortedFiltered);
  }, [filterBy, transactions]);

  // Get status icon
  const getStatusIcon = (status) => {
    switch (status) {
      case 'COMPLETED':
        return <CheckCircle color="#10B981" size={18} />;
      case 'PENDING':
        return <Clock color="#F59E0B" size={18} />;
      case 'FAILED':
        return <XCircle color="#EF4444" size={18} />;
      default:
        return <AlertCircle color="#6B7280" size={18} />;
    }
  };

  // Calculate statistics
  const calculateStats = () => {
    const deposits = transactions.filter(t => t.type === 'Deposit');
    const withdrawals = transactions.filter(t => t.type === 'Withdraw');

    const totalDeposits = deposits.reduce((sum, t) => sum + t.amount, 0);
    const totalWithdrawals = withdrawals.reduce((sum, t) => sum + t.amount, 0);

    return {
      totalDeposits,
      totalWithdrawals,
      depositCount: deposits.length,
      withdrawalCount: withdrawals.length,
    };
  };

  const stats = calculateStats();

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.loadingText}>Loading transactions...</Text>
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
          activeOpacity={0.7}
        >
          <ArrowLeft color="#1F2937" size={24} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Transaction History</Text>
          <Text style={styles.headerSubtitle}>
            {filteredTransactions.length} transaction{filteredTransactions.length !== 1 ? 's' : ''}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.refreshButton}
          onPress={handleRefresh}
          activeOpacity={0.7}
        >
          <RefreshCw color="#3B82F6" size={20} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={['#3B82F6']}
            tintColor="#3B82F6"
          />
        }
      >
        {/* Balance Card */}
        <View style={styles.balanceCard}>
          <LinearGradient
            colors={['#3B82F6', '#1E40AF']}
            style={styles.balanceGradient}
          >
            <View style={styles.balanceHeader}>
              <Wallet color="#FFFFFF" size={24} />
              <Text style={styles.balanceLabel}>Current Balance</Text>
            </View>
            <Text style={styles.balanceAmount}>{formatCurrency(totalBalance)}</Text>
            {requesterType && (
              <Text style={styles.requesterType}>{requesterType} Account</Text>
            )}
          </LinearGradient>
        </View>

        {/* Statistics Cards */}
        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <View style={styles.statIconContainer}>
              <TrendingUp color="#10B981" size={20} />
            </View>
            <Text style={styles.statValue}>{formatCurrency(stats.totalDeposits)}</Text>
            <Text style={styles.statLabel}>Total Deposits</Text>
            <Text style={styles.statCount}>{stats.depositCount} transactions</Text>
          </View>

          <View style={styles.statCard}>
            <View style={[styles.statIconContainer, { backgroundColor: '#FEE2E2' }]}>
              <TrendingDown color="#EF4444" size={20} />
            </View>
            <Text style={styles.statValue}>{formatCurrency(stats.totalWithdrawals)}</Text>
            <Text style={styles.statLabel}>Total Withdrawals</Text>
            <Text style={styles.statCount}>{stats.withdrawalCount} transactions</Text>
          </View>
        </View>

        {/* Filter Buttons */}
        <View style={styles.filterContainer}>
          <Text style={styles.filterTitle}>Filter by Type</Text>
          <View style={styles.filterButtons}>
            <TouchableOpacity
              style={[styles.filterButton, filterBy === 'all' && styles.filterButtonActive]}
              onPress={() => setFilterBy('all')}
              activeOpacity={0.7}
            >
              <Filter
                size={16}
                color={filterBy === 'all' ? '#FFFFFF' : '#6B7280'}
              />
              <Text
                style={[
                  styles.filterButtonText,
                  filterBy === 'all' && styles.filterButtonTextActive,
                ]}
              >
                All
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.filterButton, filterBy === 'deposit' && styles.filterButtonActive]}
              onPress={() => setFilterBy('deposit')}
              activeOpacity={0.7}
            >
              <TrendingUp
                size={16}
                color={filterBy === 'deposit' ? '#FFFFFF' : '#10B981'}
              />
              <Text
                style={[
                  styles.filterButtonText,
                  filterBy === 'deposit' && styles.filterButtonTextActive,
                ]}
              >
                Deposits
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.filterButton, filterBy === 'withdraw' && styles.filterButtonActive]}
              onPress={() => setFilterBy('withdraw')}
              activeOpacity={0.7}
            >
              <TrendingDown
                size={16}
                color={filterBy === 'withdraw' ? '#FFFFFF' : '#EF4444'}
              />
              <Text
                style={[
                  styles.filterButtonText,
                  filterBy === 'withdraw' && styles.filterButtonTextActive,
                ]}
              >
                Withdrawals
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Transaction List */}
        <View style={styles.transactionsContainer}>
          <Text style={styles.transactionsTitle}>All Transactions (Recent First)</Text>

          {error ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity
                style={styles.retryButton}
                onPress={handleRefresh}
                activeOpacity={0.7}
              >
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : filteredTransactions.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Wallet color="#9CA3AF" size={48} />
              <Text style={styles.emptyTitle}>No Transactions</Text>
              <Text style={styles.emptyMessage}>
                {filterBy === 'all'
                  ? 'You have no transaction history yet.'
                  : `No ${filterBy} transactions found.`}
              </Text>
            </View>
          ) : (
            filteredTransactions.map((transaction, index) => {
              const typeColor = getTransactionTypeColor(transaction.type);
              const statusColors = getTransactionStatusColor(transaction.status);

              return (
                <View key={transaction.id || index} style={styles.transactionCard}>
                  <View style={styles.transactionLeft}>
                    <View
                      style={[
                        styles.transactionIconContainer,
                        { backgroundColor: `${typeColor}15` },
                      ]}
                    >
                      {transaction.type === 'Deposit' ? (
                        <TrendingUp color={typeColor} size={20} />
                      ) : (
                        <TrendingDown color={typeColor} size={20} />
                      )}
                    </View>
                    <View style={styles.transactionInfo}>
                      <Text style={styles.transactionType}>{transaction.type}</Text>
                      <Text style={styles.transactionDate}>
                        {formatDateTime(transaction.createdAt)}
                      </Text>
                      {transaction.note && (
                        <Text style={styles.transactionNote} numberOfLines={1}>
                          {transaction.note}
                        </Text>
                      )}
                    </View>
                  </View>

                  <View style={styles.transactionRight}>
                    <Text
                      style={[
                        styles.transactionAmount,
                        { color: typeColor },
                      ]}
                    >
                      {transaction.type === 'Deposit' ? '+' : '-'}
                      {formatCurrency(transaction.amount)}
                    </Text>
                    <View
                      style={[
                        styles.transactionStatus,
                        { backgroundColor: statusColors.backgroundColor },
                      ]}
                    >
                      {getStatusIcon(transaction.status)}
                      <Text
                        style={[styles.transactionStatusText, { color: statusColors.color }]}
                      >
                        {transaction.status}
                      </Text>
                    </View>
                    <Text style={styles.transactionBalance}>
                      Balance: {formatCurrency(transaction.currentBalance)}
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </View>
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
  headerTitleContainer: {
    flex: 1,
    marginLeft: 12,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  refreshButton: {
    padding: 8,
  },
  balanceCard: {
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 16,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  balanceGradient: {
    padding: 24,
  },
  balanceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  balanceLabel: {
    fontSize: 14,
    color: '#FFFFFF',
    opacity: 0.9,
    marginLeft: 8,
    fontWeight: '500',
  },
  balanceAmount: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  requesterType: {
    fontSize: 13,
    color: '#FFFFFF',
    opacity: 0.8,
  },
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginBottom: 20,
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  statIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#D1FAE5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 2,
  },
  statCount: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  filterContainer: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  filterTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
  },
  filterButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  filterButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 6,
  },
  filterButtonActive: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  filterButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  filterButtonTextActive: {
    color: '#FFFFFF',
  },
  transactionsContainer: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  transactionsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 16,
  },
  transactionCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  transactionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  transactionIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  transactionInfo: {
    flex: 1,
  },
  transactionType: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  transactionDate: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 2,
  },
  transactionNote: {
    fontSize: 11,
    color: '#9CA3AF',
    fontStyle: 'italic',
  },
  transactionRight: {
    alignItems: 'flex-end',
  },
  transactionAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  transactionStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
    marginBottom: 4,
  },
  transactionStatusText: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  transactionBalance: {
    fontSize: 11,
    color: '#9CA3AF',
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
    alignItems: 'center',
    paddingVertical: 32,
  },
  errorText: {
    fontSize: 14,
    color: '#EF4444',
    marginBottom: 16,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1F2937',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyMessage: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
});

