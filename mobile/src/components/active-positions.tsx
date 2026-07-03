/**
 * ActivePositions — Compact positions list for mobile
 * Shows open positions with unrealized P&L.
 */

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../theme/colors';

interface Position {
  instrument: string;
  isLong: boolean;
  size: string;
  entry: string;
  pnl: string;
  pnlPositive: boolean;
}

const POSITIONS: Position[] = [
  { instrument: 'BTC-PERP', isLong: true, size: '2.45 BTC', entry: '63,140.20', pnl: '+$2,104.50', pnlPositive: true },
  { instrument: 'SOL-PERP', isLong: false, size: '150.0 SOL', entry: '148.22', pnl: '-$382.12', pnlPositive: false },
  { instrument: 'ETH-USD', isLong: true, size: '12.0 ETH', entry: '3,320.15', pnl: '+$912.45', pnlPositive: true },
];

export function ActivePositions() {
  return (
    <View style={styles.container}>
      {/* Tab bar */}
      <View style={styles.tabBar}>
        <View style={styles.tabRow}>
          <Text style={styles.tabActive}>ACTIVE POSITIONS</Text>
          <Text style={styles.tabInactive}>Trade History</Text>
        </View>
        <Text style={styles.autoRefresh}>AUTO-REFRESH: 5S</Text>
      </View>

      {/* Column headers */}
      <View style={styles.columnHeaders}>
        <Text style={[styles.colHeader, styles.colInstrument]}>INSTRUMENT</Text>
        <Text style={[styles.colHeader, styles.colSize]}>SIZE</Text>
        <Text style={[styles.colHeader, styles.colEntry]}>ENTRY</Text>
        <Text style={[styles.colHeader, styles.colPnl]}>P&L</Text>
        <Text style={[styles.colHeader, styles.colAction]}> </Text>
      </View>

      {/* Position rows */}
      {POSITIONS.map((pos) => (
        <View key={pos.instrument} style={styles.row}>
          <View style={[styles.cell, styles.colInstrument]}>
            <View style={[styles.indicator, { backgroundColor: pos.pnlPositive ? colors.tertiary : colors.error }]} />
            <Text style={styles.instrumentText}>{pos.instrument}</Text>
          </View>
          <Text style={[styles.cell, styles.colSize]}>{pos.size}</Text>
          <Text style={[styles.cell, styles.colEntry]}>{pos.entry}</Text>
          <Text style={[styles.cell, styles.colPnl, { color: pos.pnlPositive ? colors.tertiary : colors.error }]}>
            {pos.pnl}
          </Text>
          <TouchableOpacity style={[styles.cell, styles.colAction]} activeOpacity={0.7}>
            <Text style={styles.closeButton}>CLOSE</Text>
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(28, 31, 41, 0.85)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    overflow: 'hidden',
  },
  tabBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant,
  },
  tabRow: {
    flexDirection: 'row',
    gap: 12,
  },
  tabActive: {
    fontSize: 10,
    fontWeight: '700',
    fontFamily: 'System',
    letterSpacing: 0.55,
    color: colors.primary,
    textTransform: 'uppercase',
  },
  tabInactive: {
    fontSize: 10,
    fontWeight: '700',
    fontFamily: 'System',
    letterSpacing: 0.55,
    color: colors.onSurfaceVariant,
    textTransform: 'uppercase',
  },
  autoRefresh: {
    fontSize: 9,
    fontWeight: '700',
    fontFamily: 'System',
    letterSpacing: 0.55,
    color: colors.onSurfaceVariant,
  },
  columnHeaders: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.surfaceContainerLow,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant,
  },
  colHeader: {
    fontSize: 9,
    fontWeight: '700',
    fontFamily: 'System',
    letterSpacing: 0.55,
    color: colors.onSurfaceVariant,
    textTransform: 'uppercase',
  },
  colInstrument: { flex: 1.3, flexDirection: 'row', alignItems: 'center', gap: 6 },
  colSize: { flex: 1 },
  colEntry: { flex: 1 },
  colPnl: { flex: 1.2, textAlign: 'right' },
  colAction: { flex: 0.8, alignItems: 'flex-end' },
  row: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant,
    alignItems: 'center',
  },
  cell: {
    fontSize: 10,
    fontFamily: 'System',
  },
  indicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  instrumentText: {
    fontWeight: '500',
    color: colors.onSurface,
    fontSize: 11,
    fontFamily: 'System',
  },
  closeButton: {
    fontSize: 9,
    fontWeight: '700',
    fontFamily: 'System',
    letterSpacing: 0.55,
    color: colors.error,
  },
});
