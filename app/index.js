import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '../providers/auth-provider';
import { LinearGradient } from 'expo-linear-gradient';
import { Truck } from 'lucide-react-native';
import LoginScreen from './login';

// ✅ IMPORT KEEP AWAKE HERE
import { useKeepAwake } from 'expo-keep-awake';

export default function IndexScreen() {
  // ✅ CALL KEEP AWAKE HERE
  useKeepAwake();

  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading) {
      if (isAuthenticated) {
        router.replace('/tabs/dashboard');
      } else {
        router.replace('/login');
      }
    }
  }, [isAuthenticated, isLoading]);

  if (isLoading) {
    return (
      <View style={styles.container}>
        <LinearGradient
          colors={['#1E40AF', '#3B82F6']}
          style={styles.gradient}
        >
          <View style={styles.logoContainer}>
            <Truck color="#FFFFFF" size={48} />
          </View>
          <ActivityIndicator size="large" color="#FFFFFF" style={styles.loader} />
        </LinearGradient>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LoginScreen />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoContainer: {
    marginBottom: 32,
  },
  loader: {
    marginTop: 16,
  },
});
