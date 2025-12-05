

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Animated,
  TextInput,
  Modal,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Wallet,
  Clock,
  Search,
  XCircle,
  CheckCircle,
} from "lucide-react-native";

import { router } from "expo-router";
import { useAuth } from "../providers/auth-provider";

import {
  getTransactionHistory,
  formatCurrency,
  formatDateTime,
  getTransactionTypeColor,
  getTransactionStatusColor,
} from "../services/balance-service";

export default function TransactionHistoryScreen() {
  const { token } = useAuth();

  const [transactions, setTransactions] = useState([]);
  const [displayList, setDisplayList] = useState({});
  const [totalBalance, setTotalBalance] = useState(0);
  const [bankMap, setBankMap] = useState({});
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const [selectedTx, setSelectedTx] = useState(null);

  const rotateAnim = useRef(new Animated.Value(0)).current;

  // 🔄 Refresh icon animation
  const startRotate = () => {
    rotateAnim.setValue(0);
    Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 700,
        useNativeDriver: true,
      })
    ).start();
  };
  const stopRotate = () => rotateAnim.stopAnimation();

  const spin = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  // ----------------------------------------------------------
  // Load bank names from cache (TeleBirr / CBE Birr)
  // ----------------------------------------------------------
  const loadBankCache = async () => {
    try {
      const cache = await AsyncStorage.getItem("bank_list_cache");
      if (!cache) return;

      const parsed = JSON.parse(cache);
      const map = {};

      parsed.banks.forEach((b) => {
        map[b.id] = b.name;
      });

      setBankMap(map);
    } catch (e) {
      console.log("BANK CACHE ERR:", e);
    }
  };

  // ----------------------------------------------------------
  // Group transactions by date
  // ----------------------------------------------------------
  const groupByDate = (list) => {
    const groups = {};

    const now = new Date();
    const today = now.toISOString().split("T")[0];

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const yesterdayString = yesterday.toISOString().split("T")[0];

    list.forEach((tx) => {
      const dateKey = tx.createdAt.split("T")[0];
      let group = "Older";

      if (dateKey === today) group = "Today";
      else if (dateKey === yesterdayString) group = "Yesterday";
      else {
        const daysDiff =
          (now - new Date(dateKey)) / (1000 * 60 * 60 * 24);
        if (daysDiff <= 7) group = "This Week";
        else if (daysDiff <= 14) group = "Last Week";
      }

      if (!groups[group]) groups[group] = [];
      groups[group].push(tx);
    });

    return groups;
  };

  // ----------------------------------------------------------
  // Fetch transaction history
  // ----------------------------------------------------------
  const fetchTransactions = useCallback(async () => {
    try {
      const res = await getTransactionHistory(token);
      if (!res.success) return;

      const sorted = res.data.transactions.sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
      );

      setTransactions(sorted);
      setDisplayList(groupByDate(sorted));
      setTotalBalance(res.data.totalBalance);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
      stopRotate();
    }
  }, [token]);

  useEffect(() => {
    loadBankCache();
    fetchTransactions();
  }, [fetchTransactions]);

  // ----------------------------------------------------------
  // SEARCH — without order ID or amount
  // ----------------------------------------------------------
  useEffect(() => {
    if (!search.trim()) {
      setDisplayList(groupByDate(transactions));
      return;
    }

    const q = search.toLowerCase();

    const filtered = transactions.filter((tx) => {
      return (
        tx.type.toLowerCase().includes(q) ||
        (tx.status && tx.status.toLowerCase().includes(q)) ||
        (tx.note && tx.note.toLowerCase().includes(q.replace(/[0-9]/g, ""))) ||
        (tx.bankId && (bankMap[tx.bankId] || "").toLowerCase().includes(q))
      );
    });

    setDisplayList(groupByDate(filtered));
  }, [search, transactions]);

  // ----------------------------------------------------------
  // MAIN UI RENDER
  // ----------------------------------------------------------
  if (isLoading)
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color="#2563EB" size="large" />
        <Text style={{ color: "#6B7280", marginTop: 10 }}>
          Loading transactions…
        </Text>
      </SafeAreaView>
    );

  return (
    <SafeAreaView style={styles.container}>

      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <ArrowLeft size={24} color="#1F2937" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Transactions</Text>

        <TouchableOpacity
          onPress={() => {
            startRotate();
            setRefreshing(true);
            fetchTransactions();
          }}
        >
          <Animated.View style={{ transform: [{ rotate: spin }] }}>
            <RefreshCw size={22} color="#2563EB" />
          </Animated.View>
        </TouchableOpacity>
      </View>

      {/* SEARCH BAR */}
      <View style={styles.searchContainer}>
        <Search size={18} color="#6B7280" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by bank, status, or type..."
          placeholderTextColor="#9CA3AF"
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={fetchTransactions}
          />
        }
      >
        {/* BALANCE CARD */}
        <View style={styles.balanceCard}>
          <LinearGradient colors={["#2563EB", "#1E3A8A"]} style={styles.balanceGradient}>
            <Wallet size={28} color="white" />
            <Text style={styles.balanceAmount}>{formatCurrency(totalBalance)}</Text>
            <Text style={styles.balanceType}>Available Balance</Text>
          </LinearGradient>
        </View>

        {/* GROUPED TRANSACTIONS */}
        {Object.keys(displayList).map((groupName) => (
          <View key={groupName} style={{ marginBottom: 20 }}>
            <Text style={styles.groupTitle}>{groupName}</Text>

            {displayList[groupName].map((tx) => {
              const typeColor = getTransactionTypeColor(tx.type);
              const statusStyle = getTransactionStatusColor(tx.status);

              return (
                <TouchableOpacity
                  key={tx.id}
                  style={styles.card}
                  onPress={() => setSelectedTx(tx)}
                >
                  {/* LEFT */}
                  <View style={styles.left}>
                    <View
                      style={[
                        styles.iconBox,
                        { backgroundColor: typeColor + "22" },
                      ]}
                    >
                      {tx.type === "Deposit" ? (
                        <TrendingUp color={typeColor} size={20} />
                      ) : (
                        <TrendingDown color={typeColor} size={20} />
                      )}
                    </View>

                    <View>
                      <Text style={styles.typeText}>{tx.type}</Text>
                      <Text style={styles.date}>{formatDateTime(tx.createdAt)}</Text>

                      {tx.type === "Withdraw" && (
                        <Text style={styles.bankName}>
                          {bankMap[tx.bankId] || "Unknown Bank"}
                        </Text>
                      )}

                      {tx.note && (
                        <Text style={styles.note}>
                          {tx.note.replace(/order\s+[a-f0-9]+/gi, "")}
                        </Text>
                      )}
                    </View>
                  </View>

                  {/* RIGHT */}
                  <View style={styles.right}>
                    <Text style={[styles.amount, { color: typeColor }]}>
                      {tx.type === "Deposit" ? "+" : "-"}
                      {formatCurrency(tx.netAmount)}
                    </Text>

                    <View
                      style={[
                        styles.statusBox,
                        { backgroundColor: statusStyle.backgroundColor },
                      ]}
                    >
                     {statusStyle.icon && (
  <statusStyle.icon size={16} color={statusStyle.color} />
)}

                      <Text style={[styles.statusText, { color: statusStyle.color }]}>
                        {tx.status}
                      </Text>
                    </View>

                    <Text style={styles.balanceText}>
                      Balance: {formatCurrency(tx.currentBalance)}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </ScrollView>

      {/* ================================
          FEE BREAKDOWN MODAL
      ================================= */}
      <Modal visible={!!selectedTx} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            {selectedTx && (
              <>
                <Text style={styles.modalTitle}>Transaction Details</Text>

                <Text style={styles.modalRow}>
                  <Text style={styles.modalLabel}>Type: </Text>
                  {selectedTx.type}
                </Text>

                <Text style={styles.modalRow}>
                  <Text style={styles.modalLabel}>Original Amount: </Text>
                  {formatCurrency(selectedTx.originalAmount)}
                </Text>

                <Text style={styles.modalRow}>
                  <Text style={styles.modalLabel}>Fee: </Text>
                  {formatCurrency(selectedTx.fee)}
                </Text>

                <Text style={styles.modalRow}>
                  <Text style={styles.modalLabel}>Net Amount: </Text>
                  {formatCurrency(selectedTx.netAmount)}
                </Text>

                {selectedTx.bankId && (
                  <Text style={styles.modalRow}>
                    <Text style={styles.modalLabel}>Bank: </Text>
                    {bankMap[selectedTx.bankId]}
                  </Text>
                )}

                <Text style={styles.modalRow}>
                  <Text style={styles.modalLabel}>Status: </Text>
                  {selectedTx.status}
                </Text>

                <Text style={styles.modalRow}>
                  <Text style={styles.modalLabel}>Date: </Text>
                  {formatDateTime(selectedTx.createdAt)}
                </Text>

                <TouchableOpacity
                  style={styles.closeButton}
                  onPress={() => setSelectedTx(null)}
                >
                  <XCircle size={22} color="white" />
                  <Text style={styles.closeText}>Close</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ----------------------------------------------------------
// STYLES
// ----------------------------------------------------------
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  header: {
    padding: 16,
    backgroundColor: "white",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  headerTitle: { fontSize: 18, fontWeight: "700" },

  searchContainer: {
    backgroundColor: "white",
    margin: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    flexDirection: "row",
    alignItems: "center",
  },

  searchInput: {
    flex: 1,
    marginLeft: 10,
    fontSize: 14,
    color: "#111827",
  },

  balanceCard: { marginHorizontal: 16, marginBottom: 20, borderRadius: 16 },
  balanceGradient: { padding: 24 },
  balanceAmount: { fontSize: 34, fontWeight: "bold", color: "white" },
  balanceType: { color: "white", marginTop: 4 },

  groupTitle: {
    fontSize: 15,
    fontWeight: "700",
    marginLeft: 16,
    marginBottom: 10,
    color: "#4B5563",
  },

  card: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 16,
    backgroundColor: "white",
    borderRadius: 12,
    elevation: 2,
  },

  left: { flexDirection: "row", gap: 12 },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },

  typeText: { fontSize: 15, fontWeight: "700" },
  date: { fontSize: 12, color: "#6B7280" },
  note: { fontSize: 11, color: "#6B7280", marginTop: 4 },
  bankName: { fontSize: 12, color: "#1D4ED8", fontWeight: "600" },

  right: { alignItems: "flex-end" },

  amount: { fontSize: 17, fontWeight: "700" },

  statusBox: {
    flexDirection: "row",
    gap: 4,
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 4,
  },

  statusText: { fontSize: 10, fontWeight: "700" },
  balanceText: { marginTop: 4, fontSize: 11, color: "#6B7280" },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
  },

  modalBox: {
    width: "88%",
    backgroundColor: "white",
    padding: 20,
    borderRadius: 16,
  },

  modalTitle: { fontSize: 18, fontWeight: "700", marginBottom: 12 },

  modalRow: { fontSize: 14, marginBottom: 8 },
  modalLabel: { fontWeight: "700" },

  closeButton: {
    marginTop: 20,
    padding: 10,
    borderRadius: 10,
    backgroundColor: "#EF4444",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
  },

  closeText: { color: "white", fontWeight: "700" },
});
