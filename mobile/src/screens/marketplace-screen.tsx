/**
 * MarketplaceScreen — Strategy marketplace for mobile
 * Composes: MarketplaceHeader, filter tabs, strategy card grid,
 * pagination footer, BottomTabBar.
 * Mobile-adapted 375px single-column scroll layout.
 */

import React, { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MarketplaceHeader } from '../components/marketplace-header';
import { StrategyCard } from '../components/strategy-card';
import { BottomTabBar } from '../components/bottom-tab-bar';
import { colors } from '../theme/colors';

type FilterTag = 'All' | 'Momentum' | 'Arbitrage' | 'Volatility' | 'Mean Reversion';

const FILTERS: FilterTag[] = ['All', 'Momentum', 'Arbitrage', 'Volatility', 'Mean Reversion'];

interface StrategyData {
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
}

const STRATEGIES: StrategyData[] = [
  {
    name: 'Volt_Aura v2.4', category: 'MOMENTUM / HFT', tag: 'FREE', tagColor: colors.secondary,
    winRate: '64.2%', sharpe: '3.12', monthlyReturn: '+12.4%',
    chartBars: [30, 45, 60, 55, 75, 90, 85], icon: '⚡', iconColor: colors.primary,
  },
  {
    name: 'StableFlow_Alpha', category: 'ARBITRAGE / LOW RISK', tag: 'PRO', tagColor: colors.primary,
    winRate: '91.0%', sharpe: '4.88', monthlyReturn: '+4.2%',
    chartBars: [50, 52, 55, 53, 58, 60, 62], icon: '≈', iconColor: colors.secondary,
  },
  {
    name: 'Quantum_Tail_V5', category: 'VOLATILITY / ML', tag: 'ENTERPRISE', tagColor: colors.primary,
    winRate: '52.8%', sharpe: '2.45', monthlyReturn: '+22.1%',
    chartBars: [40, 60, 30, 80, 45, 95, 85], icon: '∑', iconColor: colors.primary,
  },
  {
    name: 'Apex_Growth_System', category: 'TREND / MULTI-ASSET', tag: 'PRO', tagColor: colors.primary,
    winRate: '58.9%', sharpe: '1.95', monthlyReturn: '+15.8%',
    chartBars: [20, 40, 35, 65, 55, 85, 95], icon: '↑', iconColor: colors.primary,
  },
];

export function MarketplaceScreen() {
  const [activeFilter, setActiveFilter] = useState<FilterTag>('All');
  const [activeTab, setActiveTab] = useState('markets');

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.container}>
        {/* Marketplace Header with search */}
        <MarketplaceHeader />

        {/* Main scrollable content */}
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Title section */}
          <View style={styles.titleSection}>
            <Text style={styles.pageTitle}>Strategy Marketplace</Text>
            <Text style={styles.pageSubtitle}>
              High-performance algorithmic models developed by verified quantitative analysts.
            </Text>
          </View>

          {/* Sort row */}
          <View style={styles.sortRow}>
            <View style={styles.sortChip}>
              <Text style={styles.sortLabel}>SORT BY:</Text>
              <Text style={styles.sortValue}>Popularity</Text>
              <Text style={styles.sortArrow}>▼</Text>
            </View>
            <Text style={styles.resultCount}>1-4 of 148</Text>
          </View>

          {/* Filter tabs (horizontal scroll) */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.filterRow}
          >
            {FILTERS.map((filter) => {
              const isActive = filter === activeFilter;
              return (
                <TouchableOpacity
                  key={filter}
                  onPress={() => setActiveFilter(filter)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.filterChip, isActive && styles.filterChipActive]}>
                    <Text style={[styles.filterText, isActive && styles.filterTextActive]}>
                      {filter}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Strategy Cards Grid (2 columns on wider phones, single on narrow) */}
          <View style={styles.cardGrid}>
            {STRATEGIES.map((strat) => (
              <StrategyCard key={strat.name} {...strat} />
            ))}
          </View>

          {/* Pagination */}
          <View style={styles.pagination}>
            <View style={styles.paginationRow}>
              <TouchableOpacity activeOpacity={0.7}>
                <Text style={styles.pageArrow}>{'◀'}</Text>
              </TouchableOpacity>
              <View style={styles.pageNumbers}>
                {[1, 2, 3, '...', 12].map((page, idx) => (
                  <TouchableOpacity key={`${page}-${idx}`} activeOpacity={0.7}>
                    <View
                      style={[
                        styles.pageNumber,
                        page === 1 && styles.pageNumberActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.pageNumberText,
                          page === 1 && styles.pageNumberTextActive,
                        ]}
                      >
                        {page}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity activeOpacity={0.7}>
                <Text style={styles.pageArrow}>{'▶'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Bottom spacer */}
          <View style={styles.bottomSpacer} />
        </ScrollView>

        {/* Bottom Tab Bar */}
        <BottomTabBar activeTab={activeTab} onTabPress={setActiveTab} />
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
    paddingBottom: 16,
  },
  titleSection: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.onSurface,
    marginBottom: 6,
  },
  pageSubtitle: {
    fontSize: 13,
    color: colors.onSurfaceVariant,
    lineHeight: 18,
  },
  sortRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  sortChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surfaceContainer,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  sortLabel: {
    fontSize: 9,
    fontWeight: '700',
    fontFamily: 'System',
    letterSpacing: 0.55,
    color: colors.onSurfaceVariant,
    textTransform: 'uppercase',
  },
  sortValue: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: 'System',
    letterSpacing: 0.55,
    color: colors.onSurface,
    textTransform: 'uppercase',
  },
  sortArrow: {
    fontSize: 8,
    color: colors.onSurfaceVariant,
  },
  resultCount: {
    fontSize: 10,
    fontWeight: '500',
    fontFamily: 'System',
    color: colors.onSurfaceVariant,
  },
  filterRow: {
    paddingHorizontal: 16,
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(83, 68, 52, 0.3)',
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    marginRight: 8,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
  },
  filterText: {
    fontSize: 10,
    fontWeight: '700',
    fontFamily: 'System',
    letterSpacing: 0.55,
    color: colors.onSurfaceVariant,
    textTransform: 'uppercase',
  },
  filterTextActive: {
    color: colors.onPrimary,
  },
  cardGrid: {
    paddingHorizontal: 16,
    gap: 14,
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  paginationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pageArrow: {
    fontSize: 14,
    color: colors.onSurfaceVariant,
    paddingHorizontal: 8,
  },
  pageNumbers: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pageNumber: {
    width: 30,
    height: 30,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageNumberActive: {
    backgroundColor: 'rgba(255, 193, 116, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 193, 116, 0.3)',
  },
  pageNumberText: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.onSurfaceVariant,
  },
  pageNumberTextActive: {
    color: colors.primary,
  },
  bottomSpacer: {
    height: 32,
  },
});
