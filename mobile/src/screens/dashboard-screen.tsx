/**
 * DashboardScreen — Main trading dashboard for mobile
 * Composes: PriceTicker, DashboardHeader, StatsCard row, EquityChart,
 * SignalCard, NodePerformance, SpreadOpportunities, ActivePositions,
 * BottomTabBar, FAB.
 * Mobile-adapted 375px single-column scroll layout.
 */

import React, { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PriceTicker } from '../components/price-ticker';
import { DashboardHeader } from '../components/dashboard-header';
import { StatsCard } from '../components/stats-card';
import { EquityChart } from '../components/equity-chart';
import { SignalCard } from '../components/signal-card';
import { NodePerformance } from '../components/node-performance';
import { SpreadOpportunities } from '../components/spread-opportunities';
import { ActivePositions } from '../components/active-positions';
import { BottomTabBar } from '../components/bottom-tab-bar';
import { FAB } from '../components/fab';
import { colors } from '../theme/colors';

export function DashboardScreen() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.container}>
        {/* Price ticker - always visible at top */}
        <PriceTicker />

        {/* Header */}
        <DashboardHeader
          onMenuPress={() => {}}
          onNotificationsPress={() => {}}
          onProfilePress={() => {}}
        />

        {/* Main scrollable content */}
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Stats Row - horizontal scroll on mobile */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.statsRow}
            contentContainerStyle={styles.statsRowContent}
          >
            <StatsCard
              label="TOTAL EQUITY (USD)"
              value="$1,429,203"
              trend="+2.4%"
              progress={75}
            />
            <StatsCard
              label="OPEN POSITIONS"
              value="42 Active"
              icon="wallet"
              subtitle="Margin Usage: 34.2%"
            />
            <StatsCard
              label="TODAY'S P&L"
              value="+$12,402"
              trend="High"
              trendColor={colors.tertiary}
            />
            <StatsCard
              label="ACTIVE STRATEGIES"
              value="9 Running"
              icon="bolt"
              subtitle="System Health: Optimal"
            />
          </ScrollView>

          {/* Gap between sections */}
          <View style={styles.sectionGap} />

          {/* Equity Chart */}
          <EquityChart />

          <View style={styles.sectionGap} />

          {/* Signals + Node Performance grid on mobile */}
          <SignalCard />

          <View style={styles.sectionGap} />

          <NodePerformance />

          <View style={styles.sectionGap} />

          {/* Spread Opportunities */}
          <SpreadOpportunities />

          <View style={styles.sectionGap} />

          {/* Active Positions */}
          <ActivePositions />

          {/* Bottom spacer for FAB */}
          <View style={styles.bottomSpacer} />
        </ScrollView>

        {/* Bottom Tab Bar */}
        <BottomTabBar activeTab={activeTab} onTabPress={setActiveTab} />

        {/* Floating Action Button */}
        <FAB />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 12,
    paddingTop: 4,
  },
  statsRow: {
    marginHorizontal: -12,
  },
  statsRowContent: {
    paddingHorizontal: 12,
    gap: 10,
    paddingVertical: 12,
  },
  sectionGap: {
    height: 12,
  },
  bottomSpacer: {
    height: 100,
  },
});
