import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MessageSquare, X, Bell } from 'lucide-react-native';

export default function BroadcastMessage({ 
  visible, 
  messages, 
  onClose,
  onClear 
}) {
  if (!visible || !messages || messages.length === 0) return null;

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#3B82F6', '#1E40AF']}
        style={styles.header}
      >
        <View style={styles.headerContent}>
          <Bell color="#FFFFFF" size={20} />
          <Text style={styles.headerTitle}>Server Messages</Text>
          <Text style={styles.messageCount}>{messages.length}</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={onClear} style={styles.clearButton}>
            <Text style={styles.clearButtonText}>Clear All</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <X color="#FFFFFF" size={20} />
          </TouchableOpacity>
        </View>
      </LinearGradient>

      <ScrollView style={styles.messagesContainer} showsVerticalScrollIndicator={false}>
        {messages.map((message, index) => (
          <View key={index} style={styles.messageItem}>
            <View style={styles.messageHeader}>
              <MessageSquare color="#3B82F6" size={16} />
              <Text style={styles.messageTime}>
                {new Date(message.timestamp || Date.now()).toLocaleTimeString([], { 
                  hour: '2-digit', 
                  minute: '2-digit' 
                })}
              </Text>
            </View>
            <Text style={styles.messageText}>
              {message.text || message.message || JSON.stringify(message)}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderRadius: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    maxHeight: 300,
    zIndex: 1000,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  messageCount: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  clearButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  clearButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  closeButton: {
    padding: 4,
  },
  messagesContainer: {
    maxHeight: 200,
    paddingHorizontal: 20,
  },
  messageItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  messageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  messageTime: {
    fontSize: 12,
    color: '#6B7280',
  },
  messageText: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
  },
});
