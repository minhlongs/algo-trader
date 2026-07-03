/**
 * SpreadOpportunities — Compact table-style list for mobile
 * Shows asset spread opportunities from the desktop design.
 */

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../theme/colors';

interface SpreadRow {
  asset: string;
  buyExch: string;
  sellExch: string;
  spread: string;
  spreadColor: string;
  estProfit: string;
}

const SPREADS: SpreadRow[] = [
  { asset: 'WBTC/BTC', buyExch: 'Curve', sellExch: 'Uniswap V3', spread: '0.04%', spreadColor: colors.tertiary, estProfit: '$42.10' },
  { asset: 'stETH/ETH', buyExch: 'Lido', sellExch: 'Binance', spread: '0.12%', spreadColor: colors.tertiary, estProfit: '$185.00' },
  { asset: 'USDT/USDC', buyExch: 'Coinbase', sellExch: 'Kraken', spread: '0.01%', spreadColor: colors.tertiary, estProfit: '$8.45' },
  { asset: 'AVAX/USD', buyExch: 'Bitfinex', sellExch: 'OKX', spread: '0.55%', spreadColor: colors.tertiary, estProfit: '$122.90' },
];

export function SpreadOpportunities() {
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>SPREAD OPPORTUNITIES</Text>
        <Text style={styles.filterIcon}>&#x2261;</Text>
      </View>

      {/* Column headers */}
      <View style={styles.columnHeaders}>
        <Text style={[styles.colHeader, styles.colAsset]}>ASSET</Text>
        <Text style={[styles.colHeader, styles.colExch]}>BUY</Text>
        <Text style={[styles.colHeader, styles.colExch]}>SELL</Text>
        <Text style={[styles.colHeader, styles.colRight]}>SPREAD</Text>
        <Text style={[styles.colHeader, styles.colRight]}>PROFIT</Text>
      </View>

      {/* Data rows */}
      {SPREADS.map((row) => (
        <TouchableOpacity key={row.asset} style={styles.row} activeOpacity={0.7}>
          <Text style={[styles.cell, styles.cellAsset]}>{row.asset}</Text>
          <Text style={[styles.cell, styles.cellExch]}>{row.buyExch}</Text>
          <Text style={[styles.cell, styles.cellExch]}>{row.sellExch}</Text>
          <Text style={[styles.cell, styles.cellRight, { color: row.spreadColor }]}>
            {row.spread}
          </Text>
          <Text style={[styles.cell, styles.cellRight]}>{row.estProfit}</Text>
        </TouchableOpacity>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant,
  },
  title: {
    fontSize: 10,
    fontWeight: '700',
    fontFamily: 'System',
    letterSpacing: 0.55,
    color: colors.primary,
    textTransform: 'uppercase',
  },
  filterIcon: {
    fontSize: 14,
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
  colAsset: { flex: 1.2 },
  colExch: { flex: 1 },
  colRight: { flex: 0.8, textAlign: 'right' },
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
  cellAsset: {
    flex: 1.2,
    fontWeight: '500',
    color: colors.onSurface,
  },
  cellExch: {
    flex: 1,
    color: colors.onSurfaceVariant,
  },
  cellRight: {
    flex: 0.8,
    textAlign: 'right',
    fontWeight: '500',
    color: colors.onSurface,
  },
});
