import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { isLiquidGlassAvailable } from 'expo-glass-effect';
import { Tabs } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { SymbolView } from 'expo-symbols';
import { useColors } from '@/hooks/useColors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const sections = [
  { name: 'index', label: 'الرئيسية', icon: 'home', symbol: 'house' },
  { name: 'pos', label: 'البيع', icon: 'shopping-cart', symbol: 'cart' },
  { name: 'products', label: 'المخزون', icon: 'archive', symbol: 'shippingbox' },
  { name: 'more', label: 'المزيد', icon: 'grid', symbol: 'ellipsis' },
] as const;

function NativeTabLayout() {
  return (
    <NativeTabs>
      {sections.map((section) => (
        <NativeTabs.Trigger key={section.name} name={section.name}>
          <NativeTabs.Trigger.Icon sf={{ default: section.symbol, selected: section.symbol }} />
          <NativeTabs.Trigger.Label>{section.label}</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      ))}
    </NativeTabs>
  );
}

function ClassicTabLayout() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginBottom: 2 },
        tabBarStyle: {
          height: isWeb ? 84 : 64 + insets.bottom,
          paddingTop: 7,
          paddingBottom: isWeb ? 34 : Math.max(insets.bottom, 8),
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          elevation: 0,
        },
        tabBarBackground: () => Platform.OS === 'ios'
          ? <BlurView intensity={65} tint="systemMaterial" style={StyleSheet.absoluteFill} />
          : <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.card }]} />,
      }}
    >
      {sections.map((section) => (
        <Tabs.Screen
          key={section.name}
          name={section.name}
          options={{
            title: section.label,
            tabBarIcon: ({ color, size }) => (
              <Feather name={section.icon} size={size} color={color} />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}

export default function TabLayout() {
  // Native liquid-glass tabs are iOS-only; Electron runs the web platform.
  return Platform.OS === 'ios' && isLiquidGlassAvailable() ? <NativeTabLayout /> : <ClassicTabLayout />;
}
