/**
 * SignalCard — Arbitrage signal rows for mobile
 * Shows live arbitrage opportunities with exchange routes.
 */

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../theme/colors';

interface Signal {
  instrument: string;
  spread: string;
  route: string;
  spreadColor?: string;
}

const SIGNALS: Signal[] = [
  { instrument: 'BTC / USDT', spread: '0.42%', route: 'Binance ➔ Coinbase' },
  { instrument: 'ETH / USD', spread: '0.28%', route: 'Kraken ➔ Gemini' },
  { instrument: 'SOL / USDC', spread: '1.15%', route: 'Bybit ➔ OKX' },
];

export function SignalCard() {
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>ARBITRAGE SIGNALS</Text>
        <Text style={styles.status}>LIVE SCANNING</Text>
      </View>

      {/* Signal rows */}
      <View style={styles.list}>
        {SIGNALS.map((signal) => (
          <TouchableOpacity key={signal.instrument} style={styles.row} activeOpacity={0.7}>
            <View style={styles.rowTop}>
              <Text style={styles.instrument}>{signal.instrument}</Text>
              <Text style={styles.spread}>{signal.spread}</Text>
            </View>
            <View style={styles.rowBottom}>
              <Text style={styles.route}>{signal.route}</Text>
              <Text style={styles.cta}>EXECUTE NOW</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {/* View all */}
      <TouchableOpacity style={styles.viewAll} activeOpacity={0.7}>
        <Text style={styles.viewAllText}>VIEW ALL SIGNALS</Text>
      </TouchableOpacity>
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
    backgroundColor: 'rgba(38, 42, 52, 0.5)',
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
  status: {
    fontSize: 9,
    fontWeight: '700',
    fontFamily: 'System',
    letterSpacing: 0.55,
    color: colors.tertiary,
  },
  list: {
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant,
  },
  row: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant,
  },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  rowBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  instrument: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: 'System',
    color: colors.onSurface,
  },
  spread: {
    fontSize: 11,
    fontWeight: '500',
    fontFamily: 'System',
    color: colors.tertiary,
  },
  route: {
    fontSize: 9,
    color: colors.onSurfaceVariant,
  },
  cta: {
    fontSize: 9,
    fontWeight: '700',
    fontFamily: 'System',
    letterSpacing: 0.55,
    color: colors.primary,
    textTransform: 'uppercase',
  },
  viewAll: {
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: colors.surfaceContainerHighest,
  },
  viewAllText: {
    fontSize: 9,
    fontWeight: '700',
    fontFamily: 'System',
    letterSpacing: 0.55,
    color: colors.onSurfaceVariant,
    textTransform: 'uppercase',
  },
});
