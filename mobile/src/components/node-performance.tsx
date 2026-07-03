/**
 * NodePerformance — Latency bars for edge nodes
 * Replicates the desktop node latency widgets.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';

interface NodeData {
  name: string;
  latency: string;
  barWidth: string;
  barColor: string;
}

const NODES: NodeData[] = [
  { name: 'NY-EAST-01', latency: '14ms', barWidth: '100%', barColor: colors.tertiary },
  { name: 'LDN-PROX-04', latency: '22ms', barWidth: '75%', barColor: colors.tertiary },
  { name: 'TKY-EDGE-02', latency: '154ms', barWidth: '25%', barColor: colors.error },
];

export function NodePerformance() {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>NODE PERFORMANCE</Text>
      </View>
      <View style={styles.list}>
        {NODES.map((node) => (
          <View key={node.name} style={styles.row}>
            <Text style={styles.nodeName}>{node.name}</Text>
            <View style={styles.barSection}>
              <Text style={[styles.latency, { color: node.barColor }]}>
                {node.latency}
              </Text>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    {
                      width: node.barWidth as any,
                      backgroundColor: node.barColor,
                    },
                  ]}
                />
              </View>
            </View>
          </View>
        ))}
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
    padding: 12,
  },
  header: {
    marginBottom: 12,
  },
  title: {
    fontSize: 10,
    fontWeight: '700',
    fontFamily: 'System',
    letterSpacing: 0.55,
    color: colors.primary,
    textTransform: 'uppercase',
  },
  list: {
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  nodeName: {
    fontSize: 10,
    fontWeight: '700',
    fontFamily: 'System',
    letterSpacing: 0.55,
    color: colors.onSurface,
    flex: 1,
  },
  barSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1.5,
  },
  latency: {
    fontSize: 10,
    fontWeight: '500',
    fontFamily: 'System',
    width: 40,
    textAlign: 'right',
  },
  barTrack: {
    flex: 1,
    height: 6,
    backgroundColor: colors.surfaceContainerHighest,
    borderRadius: 3,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
  },
});
