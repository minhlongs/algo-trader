/**
 * BottomTabBar — Mobile bottom navigation with icon tabs
 * Replaces the desktop sidebar for mobile.
 */

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../theme/colors';

export interface TabItem {
  key: string;
  label: string;
  icon: string;
}

export const DEFAULT_TABS: TabItem[] = [
  { key: 'dashboard', label: 'Dashboard', icon: '▣' },
  { key: 'markets', label: 'Markets', icon: '≡' },
  { key: 'positions', label: 'Positions', icon: '□' },
  { key: 'analysis', label: 'Analysis', icon: '∑' },
  { key: 'orders', label: 'Orders', icon: '☰' },
];

interface BottomTabBarProps {
  tabs?: TabItem[];
  activeTab: string;
  onTabPress?: (key: string) => void;
}

export function BottomTabBar({
  tabs = DEFAULT_TABS,
  activeTab,
  onTabPress,
}: BottomTabBarProps) {
  return (
    <View style={styles.container}>
      {tabs.map((tab) => {
        const isActive = tab.key === activeTab;
        return (
          <TouchableOpacity
            key={tab.key}
            style={styles.tab}
            onPress={() => onTabPress?.(tab.key)}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabIcon, isActive && styles.tabIconActive]}>
              {tab.icon}
            </Text>
            <Text
              style={[styles.tabLabel, isActive && styles.tabLabelActive]}
              numberOfLines={1}
            >
              {tab.label}
            </Text>
            {isActive && <View style={styles.activeIndicator} />}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    height: 60,
    backgroundColor: colors.surfaceContainerLowest,
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant,
    paddingBottom: 6,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 6,
    position: 'relative',
  },
  tabIcon: {
    fontSize: 18,
    color: colors.onSurfaceVariant,
    marginBottom: 2,
  },
  tabIconActive: {
    color: colors.primary,
  },
  tabLabel: {
    fontSize: 9,
    fontWeight: '700',
    fontFamily: 'System',
    letterSpacing: 0.55,
    color: colors.onSurfaceVariant,
    textTransform: 'uppercase',
  },
  tabLabelActive: {
    color: colors.primary,
  },
  activeIndicator: {
    position: 'absolute',
    top: 0,
    width: 24,
    height: 2,
    backgroundColor: colors.primary,
    borderRadius: 1,
  },
});
