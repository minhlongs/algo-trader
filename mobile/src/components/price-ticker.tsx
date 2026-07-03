/**
 * PriceTicker — Auto-scrolling horizontal price banner
 * Replicates the fixed top ticker bar from the desktop design.
 */

import React, { useEffect, useRef } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { colors } from '../theme/colors';

interface TickerItem {
  pair: string;
  price: string;
  change: string;
  isPositive: boolean;
}

const TICKER_DATA: TickerItem[] = [
  { pair: 'BTC/USD', price: '64,281.40', change: '+1.2%', isPositive: true },
  { pair: 'ETH/USD', price: '3,492.12', change: '+0.8%', isPositive: true },
  { pair: 'SOL/USD', price: '145.67', change: '-2.1%', isPositive: false },
  { pair: 'GOLD/XAU', price: '2,321.45', change: '+0.4%', isPositive: true },
  { pair: 'SPX/500', price: '5,431.10', change: '+0.1%', isPositive: true },
];

function TickerItemView({ item }: { item: TickerItem }) {
  return (
    <View style={styles.tickerItem}>
      <Text style={styles.tickerLabel}>{item.pair}</Text>
      <Text style={styles.tickerPrice}>{item.price}</Text>
      <Text style={[styles.tickerChange, { color: item.isPositive ? colors.tertiary : colors.error }]}>
        {item.isPositive ? '▲ ' : '▼ '}{item.change}
      </Text>
    </View>
  );
}

export function PriceTicker() {
  const scrollAnim = useRef(new Animated.Value(0)).current;
  const { width } = useWindowDimensions();

  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(scrollAnim, {
        toValue: -width * 2,
        duration: 30000,
        useNativeDriver: true,
      }),
    );
    animation.start();
    return () => animation.stop();
  }, [scrollAnim, width]);

  const combined = [...TICKER_DATA, ...TICKER_DATA];

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.scrollContent,
          { transform: [{ translateX: scrollAnim }] },
        ]}
      >
        {combined.map((item, idx) => (
          <TickerItemView key={`${item.pair}-${idx}`} item={item} />
        ))}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 28,
    backgroundColor: colors.surfaceContainerLowest,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant,
    overflow: 'hidden',
  },
  scrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
    paddingHorizontal: 12,
    height: '100%',
  },
  tickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tickerLabel: {
    fontSize: 10,
    fontFamily: 'System',
    fontWeight: '700',
    letterSpacing: 0.55,
    color: colors.primary,
  },
  tickerPrice: {
    fontSize: 11,
    fontFamily: 'System',
    fontWeight: '500',
    color: colors.primary,
  },
  tickerChange: {
    fontSize: 10,
    fontFamily: 'System',
  },
});
