/**
 * StatsCard — Compact glass-morphism metric card for the stats row
 * For mobile: horizontal ScrollView of these cards.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';

interface StatsCardProps {
  label: string;
  value: string;
  trend?: string | null;
  trendColor?: string;
  progress?: number;
  icon?: string;
  subtitle?: string | null;
}

export function StatsCard({
  label,
  value,
  trend,
  trendColor = colors.tertiary,
  progress,
  icon,
  subtitle,
}: StatsCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.valueRow}>
        <Text style={styles.value}>{value}</Text>
        {trend ? (
          <Text style={[styles.trend, { color: trendColor }]}>{trend}</Text>
        ) : null}
        {icon ? <Text style={styles.icon}>{icon}</Text> : null}
      </View>
      {typeof progress === 'number' ? (
        <View style={styles.progressTrack}>
          <View style={[styles.progressBar, { width: `${progress}%` }]} />
        </View>
      ) : null}
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 160,
    height: 104,
    padding: 12,
    backgroundColor: 'rgba(28, 31, 41, 0.85)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    justifyContent: 'space-between',
  },
  label: {
    fontSize: 10,
    fontFamily: 'System',
    fontWeight: '700',
    letterSpacing: 0.55,
    color: colors.onSurfaceVariant,
    textTransform: 'uppercase',
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  value: {
    fontSize: 18,
    fontFamily: 'System',
    fontWeight: '600',
    color: colors.onSurface,
  },
  trend: {
    fontSize: 11,
    fontFamily: 'System',
    fontWeight: '500',
  },
  icon: {
    fontSize: 18,
    opacity: 0.5,
  },
  progressTrack: {
    height: 4,
    backgroundColor: colors.surfaceContainerHighest,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 2,
  },
  subtitle: {
    fontSize: 10,
    color: colors.onSurfaceVariant,
  },
});
