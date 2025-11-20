import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DollarSign, TrendingUp, Calendar, Award, ArrowLeft } from 'lucide-react-native';
import { useDelivery } from '../providers/delivery-provider';
import { router } from 'expo-router';

// Helper function to format Ethiopian currency
const formatETB = (amount) => {
  return new Intl.NumberFormat('en-ET', {
    style: 'currency',
    currency: 'ETB'
  }).format(amount || 0);
};

export default function EarningsScreen() {
  const { 
    deliveryHistory, 
    isLoadingHistory, 
    historyError, 
    fetchDeliveryHistory 
  } = useDelivery();

  const [refreshing, setRefreshing] = React.useState(false);

  // Fetch delivery history on mount
  useEffect(() => {
    fetchDeliveryHistory();
  }, [fetchDeliveryHistory]);

  // Handle refresh
  const onRefresh = async () => {
    setRefreshing(true);
    await fetchDeliveryHistory();
    setRefreshing(false);
  };

  // Use deliveryHistory instead of orderHistory for consistency
  const orderHistory = deliveryHistory || [];

  // Calculate earnings by period
  const calculateEarnings = (period) => {
    const now = new Date();
    const filtered = orderHistory.filter(order => {
      const orderDate = new Date(order.createdAt);
      
      switch (period) {
        case 'today':
          return orderDate.toDateString() === now.toDateString();
        
        case 'week':
          const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          return orderDate >= weekAgo;
        
        case 'month':
          return orderDate.getMonth() === now.getMonth() && 
                 orderDate.getFullYear() === now.getFullYear();
        
        case 'all':
        default:
          return true;
      }
    });

    const totalEarnings = filtered.reduce((sum, order) => sum + (order.deliveryFee + order.tip), 0);
    const deliveryCount = filtered.length;
    const averagePerDelivery = deliveryCount > 0 ? totalEarnings / deliveryCount : 0;

    return {
      total: totalEarnings,
      count: deliveryCount,
      average: averagePerDelivery,
    };
  };

  const todayStats = calculateEarnings('today');
  const weekStats = calculateEarnings('week');
  const monthStats = calculateEarnings('month');
  const allTimeStats = calculateEarnings('all');

  // Calculate total tips
  const totalTips = orderHistory.reduce((sum, order) => sum + (order.tip || 0), 0);
  const totalDeliveryFees = orderHistory.reduce((sum, order) => sum + (order.deliveryFee || 0), 0);

  // Loading state
  if (isLoadingHistory && !refreshing) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <ArrowLeft color="#1F2937" size={24} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Earnings</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading earnings data...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Error state
  if (historyError && (!orderHistory || orderHistory.length === 0)) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <ArrowLeft color="#1F2937" size={24} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Earnings</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.emptyContainer}>
          <DollarSign color="#9CA3AF" size={64} />
          <Text style={styles.emptyTitle}>Unable to Load Earnings</Text>
          <Text style={styles.emptyText}>{historyError}</Text>
          <TouchableOpacity 
            style={styles.retryButton}
            onPress={fetchDeliveryHistory}
          >
            <Text style={styles.retryButtonText}>Try Again</Text>
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
        <Text style={styles.headerTitle}>Earnings</Text>
        <View style={styles.placeholder} />
      </View>

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
        {/* Today's Earnings Highlight */}
        <View style={styles.highlightContainer}>
          <LinearGradient
            colors={['#3B82F6', '#1E40AF']}
            style={styles.highlightCard}
          >
            <Text style={styles.highlightLabel}>Today's Earnings</Text>
            <Text style={styles.highlightAmount}>{formatETB(todayStats.total)}</Text>
            <View style={styles.highlightStats}>
              <View style={styles.highlightStat}>
                <Text style={styles.highlightStatValue}>{todayStats.count}</Text>
                <Text style={styles.highlightStatLabel}>Deliveries</Text>
              </View>
              <View style={styles.highlightDivider} />
              <View style={styles.highlightStat}>
                <Text style={styles.highlightStatValue}>
                  {formatETB(todayStats.average)}
                </Text>
                <Text style={styles.highlightStatLabel}>Avg/Delivery</Text>
              </View>
            </View>
          </LinearGradient>
        </View>

        {/* Period Stats */}
        <View style={styles.periodsContainer}>
          <Text style={styles.sectionTitle}>Earnings by Period</Text>
          
          {/* This Week */}
          <View style={styles.periodCard}>
            <View style={styles.periodHeader}>
              <View style={styles.periodIconContainer}>
                <Calendar color="#3B82F6" size={24} />
              </View>
              <View style={styles.periodInfo}>
                <Text style={styles.periodLabel}>This Week</Text>
                <Text style={styles.periodAmount}>{formatETB(weekStats.total)}</Text>
              </View>
            </View>
            <View style={styles.periodStats}>
              <Text style={styles.periodStatText}>{weekStats.count} deliveries</Text>
              <Text style={styles.periodStatText}>{formatETB(weekStats.average)} avg</Text>
            </View>
          </View>

          {/* This Month */}
          <View style={styles.periodCard}>
            <View style={styles.periodHeader}>
              <View style={styles.periodIconContainer}>
                <TrendingUp color="#10B981" size={24} />
              </View>
              <View style={styles.periodInfo}>
                <Text style={styles.periodLabel}>This Month</Text>
                <Text style={styles.periodAmount}>{formatETB(monthStats.total)}</Text>
              </View>
            </View>
            <View style={styles.periodStats}>
              <Text style={styles.periodStatText}>{monthStats.count} deliveries</Text>
              <Text style={styles.periodStatText}>{formatETB(monthStats.average)} avg</Text>
            </View>
          </View>

          {/* All Time */}
          <View style={styles.periodCard}>
            <View style={styles.periodHeader}>
              <View style={styles.periodIconContainer}>
                <Award color="#F59E0B" size={24} />
              </View>
              <View style={styles.periodInfo}>
                <Text style={styles.periodLabel}>All Time</Text>
                <Text style={styles.periodAmount}>{formatETB(allTimeStats.total)}</Text>
              </View>
            </View>
            <View style={styles.periodStats}>
              <Text style={styles.periodStatText}>{allTimeStats.count} deliveries</Text>
              <Text style={styles.periodStatText}>{formatETB(allTimeStats.average)} avg</Text>
            </View>
          </View>
        </View>

        {/* Earnings Breakdown */}
        <View style={styles.breakdownContainer}>
          <Text style={styles.sectionTitle}>Earnings Breakdown</Text>
          
          <LinearGradient
            colors={['#10B981', '#059669']}
            style={styles.breakdownCard}
          >
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>Delivery Fees</Text>
              <Text style={styles.breakdownAmount}>{formatETB(totalDeliveryFees)}</Text>
            </View>
          </LinearGradient>

          <LinearGradient
            colors={['#8B5CF6', '#7C3AED']}
            style={styles.breakdownCard}
          >
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>Tips</Text>
              <Text style={styles.breakdownAmount}>{formatETB(totalTips)}</Text>
            </View>
          </LinearGradient>

          <View style={styles.totalCard}>
            <View style={styles.breakdownRow}>
              <Text style={styles.totalLabel}>Total Earnings</Text>
              <Text style={styles.totalAmount}>{formatETB(totalDeliveryFees + totalTips)}</Text>
            </View>
          </View>
        </View>

        {/* Empty State */}
        {orderHistory.length === 0 && (
          <View style={styles.emptyContainer}>
            <DollarSign color="#9CA3AF" size={64} />
            <Text style={styles.emptyTitle}>No Earnings Yet</Text>
            <Text style={styles.emptyText}>
              Complete deliveries to start earning money!
            </Text>
          </View>
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
  highlightContainer: {
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  highlightCard: {
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
  },
  highlightLabel: {
    fontSize: 16,
    color: '#FFFFFF',
    opacity: 0.9,
    marginBottom: 8,
  },
  highlightAmount: {
    fontSize: 40,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 20,
  },
  highlightStats: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    justifyContent: 'space-around',
  },
  highlightStat: {
    alignItems: 'center',
    flex: 1,
  },
  highlightStatValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  highlightStatLabel: {
    fontSize: 12,
    color: '#FFFFFF',
    opacity: 0.9,
  },
  highlightDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#FFFFFF',
    opacity: 0.3,
  },
  periodsContainer: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 16,
  },
  periodCard: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  periodHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  periodIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  periodInfo: {
    flex: 1,
  },
  periodLabel: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 4,
  },
  periodAmount: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  periodStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  periodStatText: {
    fontSize: 14,
    color: '#6B7280',
  },
  breakdownContainer: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  breakdownCard: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  breakdownLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  breakdownAmount: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  totalCard: {
    backgroundColor: '#1F2937',
    padding: 20,
    borderRadius: 12,
    marginTop: 8,
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  totalAmount: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#4B5563',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6B7280',
  },
  retryButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});

