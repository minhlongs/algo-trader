/**
 * DashboardHeader — Top app bar with logo, nav menu, and profile
 * Mobile-adapted: hamburger + logo, notification icon with dot, avatar
 */

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../theme/colors';

interface DashboardHeaderProps {
  onMenuPress?: () => void;
  onNotificationsPress?: () => void;
  onProfilePress?: () => void;
}

export function DashboardHeader({
  onMenuPress,
  onNotificationsPress,
  onProfilePress,
}: DashboardHeaderProps) {
  return (
    <View style={styles.container}>
      {/* Left: Hamburger + Logo */}
      <View style={styles.leftSection}>
        <TouchableOpacity onPress={onMenuPress} style={styles.iconButton} activeOpacity={0.7}>
          <Text style={styles.icon}>&#x2630;</Text>
        </TouchableOpacity>
        <Text style={styles.logo}>TERMINAL.CORE</Text>
      </View>

      {/* Right: Notifications + Avatar */}
      <View style={styles.rightSection}>
        <TouchableOpacity onPress={onNotificationsPress} style={styles.iconButton} activeOpacity={0.7}>
          <View>
            <Text style={styles.icon}>&#x1F514;</Text>
            <View style={styles.notificationDot} />
          </View>
        </TouchableOpacity>
        <TouchableOpacity onPress={onProfilePress} activeOpacity={0.7}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>A</Text>
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 56,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(16, 19, 29, 0.8)',
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant,
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconButton: {
    padding: 4,
  },
  icon: {
    fontSize: 20,
    color: colors.onSurfaceVariant,
  },
  logo: {
    fontSize: 16,
    fontFamily: 'System',
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: -0.24,
  },
  notificationDot: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primaryContainer,
    borderWidth: 1.5,
    borderColor: colors.surface,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 193, 116, 0.2)',
    backgroundColor: colors.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 12,
    color: colors.onSurface,
    fontWeight: '600',
  },
});
