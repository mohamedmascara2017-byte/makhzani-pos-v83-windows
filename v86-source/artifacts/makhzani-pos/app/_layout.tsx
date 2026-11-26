import '../index.css';
import React, { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StoreProvider } from '@/components/StoreContext';
import { useStore } from '@/components/StoreContext';
import CloudSyncAgent from '@/components/CloudSyncAgent';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
  const { ready, currentUser } = useStore();
  const segments = useSegments();
  const router = useRouter();
  const routeName = String(segments[0] ?? '');
  const isLogin = routeName === 'login';

  useEffect(() => {
    if (!ready) return;
    const publicRoute = isLogin || routeName === '' || routeName === 'index';
    if (!currentUser && !publicRoute) router.replace('/login');
    if (currentUser && isLogin) router.replace('/(tabs)');
  }, [ready, currentUser, isLogin, routeName, router]);

  return (
    <Stack screenOptions={{ headerShown: false, headerBackTitle: 'Back' }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="login" />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="product-form" options={{ presentation: 'modal' }} />
      <Stack.Screen name="purchases" />
      <Stack.Screen name="returns" />
      <Stack.Screen name="inventory-count" />
      <Stack.Screen name="employees" />
      <Stack.Screen name="change-pin" />
      <Stack.Screen name="excel" />
      <Stack.Screen name="invoice" />
      <Stack.Screen name="audit" />
      <Stack.Screen name="reports" />
      <Stack.Screen name="sync" />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <KeyboardProvider>
              <StoreProvider>
                <RootLayoutNav />
                <CloudSyncAgent />
              </StoreProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
