/**
 * EquityChart — Placeholder SVG area chart for mobile
 * Mirrors the gold/purple equity + P&L chart from the desktop design.
 */

import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { colors } from '../theme/colors';

type TimeFrame = '1H' | '1D' | '1W';

const TIMEFRAMES: TimeFrame[] = ['1H', '1D', '1W'];

const X_LABELS = ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00'];

// Curved path mimicking the desktop SVG chart
const EQUITY_PATH = 'M0 200 Q 50 160, 100 175 T 200 120 T 300 145 T 400 65';
const PNL_PATH = 'M0 225 Q 50 210, 100 218 T 200 178 T 300 192 T 400 160';

export function EquityChart() {
  const [activeFrame, setActiveFrame] = useState<TimeFrame>('1D');

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View style={styles.titleAccent} />
          <Text style={styles.title}>REAL-TIME EQUITY & P&L</Text>
        </View>
        <View style={styles.timeframeRow}>
          {TIMEFRAMES.map((tf) => (
            <TouchableOpacity
              key={tf}
              onPress={() => setActiveFrame(tf)}
              activeOpacity={0.7}
            >
              <View
                style={[
                  styles.timeChip,
                  activeFrame === tf && styles.timeChipActive,
                ]}
              >
                <Text
                  style={[
                    styles.timeChipText,
                    activeFrame === tf && styles.timeChipTextActive,
                  ]}
                >
                  {tf}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Chart area */}
      <View style={styles.chartArea}>
        {/* Grid lines */}
        <View style={styles.gridLines}>
          {Array.from({ length: 5 }).map((_, i) => (
            <View key={i} style={styles.gridLine} />
          ))}
        </View>

        {/* SVG Chart */}
        <Svg style={StyleSheet.absoluteFill} viewBox="0 0 400 230">
          <Defs>
            <LinearGradient id="goldGrad" x1="0" x2="0" y1="0" y2="1">
              <Stop offset="0%" stopColor={colors.primary} stopOpacity="0.3" />
              <Stop offset="100%" stopColor={colors.primary} stopOpacity="0" />
            </LinearGradient>
            <LinearGradient id="purpleGrad" x1="0" x2="0" y1="0" y2="1">
              <Stop offset="0%" stopColor={colors.secondary} stopOpacity="0.3" />
              <Stop offset="100%" stopColor={colors.secondary} stopOpacity="0" />
            </LinearGradient>
          </Defs>
          {/* Equity fill */}
          <Path
            d={`${EQUITY_PATH} L 400 230 L 0 230 Z`}
            fill="url(#goldGrad)"
          />
          {/* Equity line */}
          <Path d={EQUITY_PATH} fill="none" stroke={colors.primary} strokeWidth="2" />
          {/* P&L fill */}
          <Path
            d={`${PNL_PATH} L 400 230 L 0 230 Z`}
            fill="url(#purpleGrad)"
          />
          {/* P&L line */}
          <Path d={PNL_PATH} fill="none" stroke={colors.secondary} strokeWidth="2" />
        </Svg>

        {/* X-axis labels */}
        <View style={styles.xAxis}>
          {X_LABELS.map((label) => (
            <Text key={label} style={styles.xLabel}>
              {label}
            </Text>
          ))}
        </View>
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
          <Text style={styles.legendLabel}>Equity Curve</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.secondary }]} />
          <Text style={styles.legendLabel}>Portfolio P&L</Text>
        </View>
      </View>
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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  titleAccent: {
    width: 4,
    height: 16,
    backgroundColor: colors.primary,
    borderRadius: 2,
  },
  title: {
    fontSize: 10,
    fontWeight: '700',
    fontFamily: 'System',
    letterSpacing: 0.55,
    color: colors.primary,
    textTransform: 'uppercase',
  },
  timeframeRow: {
    flexDirection: 'row',
    gap: 4,
  },
  timeChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: colors.surfaceContainerHigh,
  },
  timeChipActive: {
    backgroundColor: colors.primary,
  },
  timeChipText: {
    fontSize: 9,
    fontWeight: '700',
    fontFamily: 'System',
    letterSpacing: 0.55,
    color: colors.onSurface,
  },
  timeChipTextActive: {
    color: colors.onPrimary,
  },
  chartArea: {
    height: 200,
    position: 'relative',
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  gridLines: {
    ...StyleSheet.absoluteFillObject,
    paddingHorizontal: 0,
    justifyContent: 'space-between',
    paddingVertical: 24,
  },
  gridLine: {
    height: 1,
    backgroundColor: colors.outlineVariant,
    opacity: 0.2,
    marginHorizontal: 12,
  },
  xAxis: {
    position: 'absolute',
    bottom: 8,
    left: 12,
    right: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  xLabel: {
    fontSize: 9,
    color: colors.onSurfaceVariant,
    fontFamily: 'System',
    fontWeight: '500',
  },
  legend: {
    flexDirection: 'row',
    gap: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendLabel: {
    fontSize: 9,
    fontWeight: '700',
    fontFamily: 'System',
    letterSpacing: 0.55,
    color: colors.onSurfaceVariant,
  },
});
