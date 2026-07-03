/**
 * StrategyCard — Marketplace strategy listing card for mobile
 * Adapts the desktop strategy card to a compact mobile layout.
 */

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../theme/colors';

interface StrategyCardProps {
  name: string;
  category: string;
  tag: string;
  tagColor: string;
  winRate: string;
  sharpe: string;
  monthlyReturn: string;
  chartBars: number[];
  icon: string;
  iconColor: string;
  onSubscribe?: () => void;
}

function MiniChart({ bars }: { bars: number[] }) {
  return (
    <View style={styles.chartRow}>
      {bars.map((h, i) => {
        const isLast = i === bars.length - 1;
        return (
          <View
            key={i}
            style={[
              styles.chartBar,
              {
                height: `${h}%`,
                backgroundColor: isLast ? colors.primary : undefined,
                shadowColor: isLast ? colors.primaryContainer : undefined,
                shadowOpacity: isLast ? 0.5 : 0,
                shadowRadius: isLast ? 8 : 0,
                elevation: isLast ? 4 : 0,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

export function StrategyCard({
  name, category, tag, tagColor,
  winRate, sharpe, monthlyReturn,
  chartBars, icon, iconColor,
  onSubscribe,
}: StrategyCardProps) {
  return (
    <View style={styles.card}>
      {/* Tag badge */}
      <View style={styles.tagBadge}>
        <View style={[styles.tagPill, { borderColor: tagColor }]}>
          <Text style={[styles.tagText, { color: tagColor }]}>{tag}</Text>
        </View>
      </View>

      {/* Header row */}
      <View style={styles.header}>
        <View style={[styles.iconBox, { borderColor: colors.outlineVariant }]}>
          <Text style={[styles.icon, { color: iconColor }]}>{icon}</Text>
        </View>
        <View style={styles.nameSection}>
          <Text style={styles.strategyName}>{name}</Text>
          <Text style={styles.category}>{category}</Text>
        </View>
      </View>

      {/* Mini chart */}
      <View style={styles.chartArea}>
        <MiniChart bars={chartBars} />
      </View>

      {/* Stats grid */}
      <View style={styles.statsGrid}>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Win Rate</Text>
          <Text style={styles.statValue}>{winRate}</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Sharpe</Text>
          <Text style={styles.statValue}>{sharpe}</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Monthly</Text>
          <Text style={[styles.statValue, { color: colors.tertiary }]}>{monthlyReturn}</Text>
        </View>
      </View>

      {/* Subscribe button */}
      <TouchableOpacity style={styles.subscribeBtn} onPress={onSubscribe} activeOpacity={0.8}>
        <Text style={styles.subscribeText}>SUBSCRIBE</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(28, 31, 41, 0.85)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    overflow: 'hidden',
    position: 'relative',
  },
  tagBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 10,
  },
  tagPill: {
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  tagText: {
    fontSize: 9,
    fontWeight: '700',
    fontFamily: 'System',
    letterSpacing: 0.55,
    textTransform: 'uppercase',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: colors.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    fontSize: 18,
  },
  nameSection: {
    flex: 1,
  },
  strategyName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.onSurface,
  },
  category: {
    fontSize: 9,
    fontWeight: '700',
    fontFamily: 'System',
    letterSpacing: 0.55,
    color: colors.onSurfaceVariant,
    textTransform: 'uppercase',
  },
  chartArea: {
    paddingHorizontal: 14,
    paddingBottom: 8,
  },
  chartRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
    height: 40,
  },
  chartBar: {
    flex: 1,
    borderRadius: 2,
    backgroundColor: 'rgba(78, 222, 163, 0.3)',
  },
  statsGrid: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingBottom: 14,
    gap: 12,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 9,
    fontWeight: '700',
    fontFamily: 'System',
    letterSpacing: 0.55,
    color: colors.onSurfaceVariant,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.onSurface,
  },
  subscribeBtn: {
    backgroundColor: '#f59e0b',
    paddingVertical: 12,
    alignItems: 'center',
  },
  subscribeText: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: 'System',
    letterSpacing: 0.55,
    color: colors.onPrimary,
    textTransform: 'uppercase',
  },
});
