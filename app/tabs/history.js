import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Calendar, Filter, TrendingUp, DollarSign, Package, Award, ArrowLeft } from 'lucide-react-native';
import { router } from 'expo-router';
import { useDelivery } from '../../providers/delivery-provider';

const { width } = Dimensions.get('window');

export default function HistoryScreen() {
  const { 
    deliveryHistory, 
    isLoadingHistory, 
    historyError, 
    fetchDeliveryHistory 
  } = useDelivery();
  
  const [state, setState] = useState({
    filteredHistory: [],
    originalHistory: [], // Store original data for filtering
  });
  const [refreshing, setRefreshing] = useState(false);
  const [filters, setFilters] = useState({
    dateRange: 'all', // 'today', 'week', 'month', 'all'
    sortBy: 'newest', // 'newest', 'oldest', 'highestEarning'
  });
  const [analytics, setAnalytics] = useState({
    totalEarnings: 0,
    deliveryFeeEarnings: 0,
    tipEarnings: 0,
    totalDeliveries: 0,
    averageEarning: 0,
    highestEarning: 0,
    lowestEarning: 0,
  });

  // Update local state when delivery history changes
  useEffect(() => {
    if (deliveryHistory && deliveryHistory.length > 0) {
      setState(prev => ({
        ...prev,
        originalHistory: deliveryHistory,
        filteredHistory: deliveryHistory,
      }));
    }
  }, [deliveryHistory]);

  // Calculate analytics from delivery history
  const calculateAnalytics = useCallback((history) => {
    if (!history.length) {
      setAnalytics({
        totalEarnings: 0,
        deliveryFeeEarnings: 0,
        tipEarnings: 0,
        totalDeliveries: 0,
        averageEarning: 0,
        highestEarning: 0,
        lowestEarning: 0,
      });
      return;
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

    // Calculate earnings with safe number extraction
    const totalEarnings = history.reduce((sum, order) => {
      const earnings = extractNumber(order.totalEarnings) || 
                      extractNumber(order.grandTotal) || 
                      (extractNumber(order.deliveryFee) + extractNumber(order.tip));
      return sum + earnings;
    }, 0);

    const deliveryFeeEarnings = history.reduce((sum, order) => {
      return sum + extractNumber(order.deliveryFee);
    }, 0);

    const tipEarnings = history.reduce((sum, order) => {
      return sum + extractNumber(order.tip);
    }, 0);

    const totalDeliveries = history.length;
    const averageEarning = totalEarnings / totalDeliveries;

    // Get highest and lowest earnings
    const earningsArray = history.map(order => 
      extractNumber(order.totalEarnings) || 
      extractNumber(order.grandTotal) || 
      (extractNumber(order.deliveryFee) + extractNumber(order.tip))
    );
    const highestEarning = Math.max(...earningsArray, 0);
    const lowestEarning = Math.min(...earningsArray, 0);

    setAnalytics({
      totalEarnings,
      deliveryFeeEarnings,
      tipEarnings,
      totalDeliveries,
      averageEarning,
      highestEarning,
      lowestEarning,
    });
  }, []);

  // Apply filters to data
  const applyFilters = useCallback(() => {
    let filteredData = [...state.originalHistory];

    // Date range filtering
    const now = new Date();
    switch (filters.dateRange) {
      case 'today':
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        filteredData = filteredData.filter(order => 
          order.updatedAt && new Date(order.updatedAt) >= today
        );
        break;
      case 'week':
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        filteredData = filteredData.filter(order => 
          order.updatedAt && new Date(order.updatedAt) >= weekAgo
        );
        break;
      case 'month':
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        filteredData = filteredData.filter(order => 
          order.updatedAt && new Date(order.updatedAt) >= monthAgo
        );
        break;
      // 'all' shows everything
    }

    // Sorting
    switch (filters.sortBy) {
      case 'newest':
        filteredData.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
        break;
      case 'oldest':
        filteredData.sort((a, b) => new Date(a.updatedAt) - new Date(b.updatedAt));
        break;
      case 'highestEarning':
        filteredData.sort((a, b) => b.totalEarnings - a.totalEarnings);
        break;
    }

    setState(prev => ({ ...prev, filteredHistory: filteredData }));
    calculateAnalytics(filteredData);
  }, [filters, state.originalHistory, calculateAnalytics]);

  useEffect(() => {
    fetchDeliveryHistory();
  }, [fetchDeliveryHistory]);

  useEffect(() => {
    if (state.originalHistory.length > 0) {
      applyFilters();
    }
  }, [filters, state.originalHistory.length, applyFilters]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchDeliveryHistory();
    setRefreshing(false);
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-ET', {
      style: 'currency',
      currency: 'ETB'
    }).format(amount || 0);
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Unknown date';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const AnalyticsCard = ({ title, value, subtitle, icon, color }) => (
    <LinearGradient
      colors={[color, `${color}DD`]}
      style={styles.analyticsCard}
    >
      <View style={styles.analyticsHeader}>
        {icon}
        <Text style={styles.analyticsTitle}>{title}</Text>
      </View>
      <Text style={styles.analyticsValue}>{value}</Text>
      {subtitle && <Text style={styles.analyticsSubtitle}>{subtitle}</Text>}
    </LinearGradient>
  );

  const OrderItem = ({ item }) => {
    // Safely extract numeric values
    const extractNumber = (value) => {
      if (value === null || value === undefined) return 0;
      if (typeof value === 'number') return value;
      if (typeof value === 'string') return parseFloat(value) || 0;
      if (typeof value === 'object' && value.$numberDecimal) {
        return parseFloat(value.$numberDecimal) || 0;
      }
      return 0;
    };

    const deliveryFee = extractNumber(item.deliveryFee);
    const tip = extractNumber(item.tip);
    const totalEarnings = extractNumber(item.totalEarnings) || 
                         extractNumber(item.grandTotal) || 
                         (deliveryFee + tip);

    return (
      <View style={styles.orderCard}>
        <View style={styles.orderHeader}>
          <Text style={styles.restaurantName}>{item.restaurantName || 'Unknown Restaurant'}</Text>
          <Text style={styles.orderCode}>{item.orderCode || 'N/A'}</Text>
        </View>
        
        <View style={styles.orderDetails}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Delivery Fee:</Text>
            <Text style={styles.detailValue}>{formatCurrency(deliveryFee)}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Tip:</Text>
            <Text style={[styles.detailValue, styles.tipValue]}>
              +{formatCurrency(tip)}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Total Earnings:</Text>
            <Text style={[styles.detailValue, styles.totalValue]}>
              {formatCurrency(totalEarnings)}
            </Text>
          </View>
        </View>
        
        <View style={styles.orderFooter}>
          <Text style={styles.dateText}>{formatDate(item.updatedAt)}</Text>
          <View style={[styles.statusBadge, styles.completedBadge]}>
            <Text style={styles.statusText}>{item.orderStatus || 'Completed'}</Text>
          </View>
        </View>
      </View>
    );
  };

  if (isLoadingHistory && !refreshing) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading delivery history...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (historyError && (!deliveryHistory || deliveryHistory.length === 0)) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>Unable to Load History</Text>
          <Text style={styles.errorMessage}>{historyError}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={fetchDeliveryHistory}>
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
        <Text style={styles.headerTitle}>Delivery History</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={['#007AFF']}
            tintColor="#007AFF"
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Analytics Section */}
        <View style={styles.analyticsSection}>
          <Text style={styles.sectionTitle}>Performance Analytics</Text>
          <View style={styles.analyticsGrid}>
            <AnalyticsCard
              title="Total Earnings"
              value={formatCurrency(analytics.totalEarnings)}
              subtitle={`${analytics.totalDeliveries} deliveries`}
              icon={<DollarSign size={16} color="#FFF" />}
              color="#10B981"
            />
            <AnalyticsCard
              title="Delivery Fees"
              value={formatCurrency(analytics.deliveryFeeEarnings)}
              subtitle={`${((analytics.deliveryFeeEarnings / analytics.totalEarnings) * 100 || 0).toFixed(1)}% of total`}
              icon={<Package size={16} color="#FFF" />}
              color="#3B82F6"
            />
            <AnalyticsCard
              title="Tips Received"
              value={formatCurrency(analytics.tipEarnings)}
              subtitle={`${((analytics.tipEarnings / analytics.totalEarnings) * 100 || 0).toFixed(1)}% of total`}
              icon={<Award size={16} color="#FFF" />}
              color="#F59E0B"
            />
            <AnalyticsCard
              title="Avg per Delivery"
              value={formatCurrency(analytics.averageEarning)}
              subtitle={`Range: ${formatCurrency(analytics.lowestEarning)} - ${formatCurrency(analytics.highestEarning)}`}
              icon={<TrendingUp size={16} color="#FFF" />}
              color="#8B5CF6"
            />
          </View>
        </View>

        {/* Filters Section */}
        <View style={styles.filtersSection}>
          <Text style={styles.sectionTitle}>
            <Filter size={16} color="#666" /> Filters & Sorting
          </Text>
          
          <View style={styles.filterRow}>
            <Text style={styles.filterLabel}>Date Range:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.filterOptions}>
                {['today', 'week', 'month', 'all'].map((range) => (
                  <TouchableOpacity
                    key={range}
                    style={[
                      styles.filterButton,
                      filters.dateRange === range && styles.filterButtonActive
                    ]}
                    onPress={() => setFilters(prev => ({ ...prev, dateRange: range }))}
                  >
                    <Text style={[
                      styles.filterButtonText,
                      filters.dateRange === range && styles.filterButtonTextActive
                    ]}>
                      {range.charAt(0).toUpperCase() + range.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>

          <View style={styles.filterRow}>
            <Text style={styles.filterLabel}>Sort By:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.filterOptions}>
                {[
                  { value: 'newest', label: 'Newest' },
                  { value: 'oldest', label: 'Oldest' },
                  { value: 'highestEarning', label: 'Highest Earning' }
                ].map((sort) => (
                  <TouchableOpacity
                    key={sort.value}
                    style={[
                      styles.filterButton,
                      filters.sortBy === sort.value && styles.filterButtonActive
                    ]}
                    onPress={() => setFilters(prev => ({ ...prev, sortBy: sort.value }))}
                  >
                    <Text style={[
                      styles.filterButtonText,
                      filters.sortBy === sort.value && styles.filterButtonTextActive
                    ]}>
                      {sort.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        </View>

        {/* Orders List */}
        <View style={styles.ordersSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Order History</Text>
            <Text style={styles.resultsCount}>
              Showing {state.filteredHistory.length} orders
            </Text>
          </View>

          {state.filteredHistory.length === 0 ? (
            <View style={styles.emptyState}>
              <Calendar size={48} color="#9CA3AF" />
              <Text style={styles.emptyStateTitle}>No orders found</Text>
              <Text style={styles.emptyStateText}>
                {filters.dateRange !== 'all' 
                  ? `No completed deliveries in the selected period.`
                  : 'No completed delivery history yet.'
                }
              </Text>
            </View>
          ) : (
            <FlatList
              data={state.filteredHistory}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => <OrderItem item={item} />}
              scrollEnabled={false}
              showsVerticalScrollIndicator={false}
            />
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
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#EF4444',
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  analyticsSection: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 12,
  },
  analyticsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  analyticsCard: {
    width: (width - 40) / 2 - 4,
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  analyticsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  analyticsTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFF',
    marginLeft: 6,
    opacity: 0.9,
  },
  analyticsValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 2,
  },
  analyticsSubtitle: {
    fontSize: 10,
    color: '#FFF',
    opacity: 0.8,
  },
  filtersSection: {
    backgroundColor: '#FFF',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    width: 80,
    marginRight: 12,
  },
  filterOptions: {
    flexDirection: 'row',
    flex: 1,
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#F3F4F6',
    borderRadius: 20,
    marginRight: 8,
  },
  filterButtonActive: {
    backgroundColor: '#007AFF',
  },
  filterButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
  },
  filterButtonTextActive: {
    color: '#FFF',
  },
  ordersSection: {
    flex: 1,
    padding: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  resultsCount: {
    fontSize: 14,
    color: '#6B7280',
  },
  orderCard: {
    backgroundColor: '#FFF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  restaurantName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1F2937',
    flex: 1,
  },
  orderCode: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  orderDetails: {
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  detailLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1F2937',
  },
  tipValue: {
    color: '#10B981',
  },
  totalValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  orderFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  dateText: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  completedBadge: {
    backgroundColor: '#D1FAE5',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#065F46',
    textTransform: 'capitalize',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#6B7280',
    marginTop: 12,
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
  },
});