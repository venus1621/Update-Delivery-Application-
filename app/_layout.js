import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { DeliveryProvider } from "../providers/delivery-provider";
import { AuthProvider } from "../providers/auth-provider";
import "../firebase"; // Initialize Firebase
 
SplashScreen.preventAutoHideAsync();
 
// Configure QueryClient for production with aggressive caching
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 30, // 30 minutes - data considered fresh
      gcTime: 1000 * 60 * 60 * 24, // 24 hours - cache garbage collection
      retry: 2,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
  },
});
 
function RootLayoutNav() {
  return (
    <Stack 
      screenOptions={{ 
        headerShown: false,
        animation: 'slide_from_right',
        gestureEnabled: true,
      }}
    >
      <Stack.Screen 
        name="index" 
        options={{ headerShown: false }} 
      />
      <Stack.Screen 
        name="login" 
        options={{ 
          headerShown: false,
          gestureEnabled: false, // Prevent back gesture on login
        }} 
      />
      <Stack.Screen 
        name="tabs" 
        options={{ 
          headerShown: false,
          gestureEnabled: false, // Prevent back gesture from tabs
        }} 
      />
      <Stack.Screen 
        name="order/[orderId]" 
        options={{
          title: "Order Details",
          headerShown: true,
          headerStyle: { backgroundColor: "#667eea" },
          headerTintColor: "#fff",
          headerTitleStyle: { fontWeight: 'bold' },
        }} 
      />
    </Stack>
  );
}
 
export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);
 
  return (
    <QueryClientProvider client={queryClient}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <AuthProvider>
          <DeliveryProvider>
            <RootLayoutNav />
          </DeliveryProvider>
        </AuthProvider>
      </GestureHandlerRootView>
    </QueryClientProvider>
  );
}
