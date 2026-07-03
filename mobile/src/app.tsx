/**
 * App.tsx — Root navigation component for TERMINAL.CORE Mobile
 * Uses react-navigation for tab-based navigation between Dashboard and Marketplace.
 *
 * This is an Expo Router-compatible entry point. To run:
 *   npx create-expo-app@latest terminal-core-mobile --template blank-typescript
 *   Copy src/ into the project, install deps from package.json
 */

import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { DashboardScreen } from '../screens/dashboard-screen';
import { MarketplaceScreen } from '../screens/marketplace-screen';
import { colors } from '../theme/colors';

const Tab = createBottomTabNavigator();

type TabIcon = { focused: boolean; color: string; size: number };

function DashboardIcon({ focused }: TabIcon) {
  return <>{focused ? '▣' : '▣'}</>;
}

function MarketsIcon({ focused }: TabIcon) {
  return <>{focused ? '≡' : '≡'}</>;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <NavigationContainer
        theme={{
          dark: true,
          colors: {
            primary: colors.primary,
            background: colors.surface,
            card: colors.surfaceContainerLowest,
            text: colors.onSurface,
            border: colors.outlineVariant,
            notification: colors.primaryContainer,
          },
          fonts: {
            regular: { fontFamily: 'System', fontWeight: '400' },
            medium: { fontFamily: 'System', fontWeight: '500' },
            bold: { fontFamily: 'System', fontWeight: '700' },
            heavy: { fontFamily: 'System', fontWeight: '900' },
          },
        }}
      >
        <Tab.Navigator
          screenOptions={{
            headerShown: false,
            tabBarStyle: { display: 'none' }, // We use our own BottomTabBar
          }}
        >
          <Tab.Screen name="Dashboard" component={DashboardScreen} />
          <Tab.Screen name="Marketplace" component={MarketplaceScreen} />
        </Tab.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
