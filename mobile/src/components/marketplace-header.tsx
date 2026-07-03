/**
 * MarketplaceHeader — Top bar specifically for marketplace
 * Logo + search + notification/profile icons
 */

import React from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { colors } from '../theme/colors';

interface MarketplaceHeaderProps {
  onMenuPress?: () => void;
  onNotificationsPress?: () => void;
  onProfilePress?: () => void;
}

export function MarketplaceHeader({
  onMenuPress,
  onNotificationsPress,
  onProfilePress,
}: MarketplaceHeaderProps) {
  return (
    <View style={styles.container}>
      {/* Top row: menu, logo, icons */}
      <View style={styles.topRow}>
        <TouchableOpacity onPress={onMenuPress} activeOpacity={0.7}>
          <Text style={styles.menuIcon}>&#x2630;</Text>
        </TouchableOpacity>
        <Text style={styles.logo}>TERMINAL.CORE</Text>
        <View style={styles.iconRow}>
          <TouchableOpacity onPress={onNotificationsPress} activeOpacity={0.7}>
            <Text style={styles.icon}>&#x1F514;</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onProfilePress} activeOpacity={0.7}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>A</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>

      {/* Search bar */}
      <View style={styles.searchRow}>
        <View style={styles.searchBar}>
          <Text style={styles.searchIcon}>&#x1F50D;</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search strategies..."
            placeholderTextColor={colors.onSurfaceVariant}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(16, 19, 29, 0.8)',
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant,
    paddingBottom: 10,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: 52,
  },
  menuIcon: {
    fontSize: 20,
    color: colors.onSurfaceVariant,
  },
  logo: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
  },
  iconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  icon: {
    fontSize: 18,
    color: colors.onSurfaceVariant,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 11,
    color: colors.onSurface,
    fontWeight: '600',
  },
  searchRow: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 36,
  },
  searchIcon: {
    fontSize: 14,
    color: colors.onSurfaceVariant,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: colors.onSurface,
    padding: 0,
  },
});
