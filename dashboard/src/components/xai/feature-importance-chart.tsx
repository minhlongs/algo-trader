// @ts-nocheck
/** @jsxImportSource react */
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { StitchCard, StitchCardHeader, StitchCardBody } from '../ui/stitch-card';

export interface FeatureImportanceData {
  name: string;
  importance: number;
  description?: string;
}

export interface FeatureImportanceChartProps {
  data: FeatureImportanceData[];
  title?: string;
  maxFeatures?: number;
  color?: string;
  height?: number | string;
  showDescription?: boolean;
}

/**
 * Feature Importance Bar Chart
 *
 * Displays top features with their importance scores.
 * Uses Recharts for responsive, animated bar chart.
 */
export function FeatureImportanceChart({
  data,
  title = 'Feature Importance',
  maxFeatures = 10,
  color = '#00FFA3',
  height = 400,
  showDescription = false,
}: FeatureImportanceChartProps) {
  // Sort and limit data
  const sortedData = [...data]
    .sort((a, b) => b.importance - a.importance)
    .slice(0, maxFeatures)
    .reverse(); // Reverse for horizontal bar chart top-to-bottom

  // Calculate percentage
  const total = data.reduce((sum, d) => sum + d.importance, 0);
  const chartData = sortedData.map((d) => ({
    ...d,
    percentage: (d.importance / total * 100).toFixed(1),
  }));

  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: { name: string; importance: number; description?: string } }> }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-bg-surface text-white p-3 rounded shadow-lg border border-outline">
          <p className="font-semibold text-accent">{data.name}</p>
          <p className="text-sm text-muted">Importance: {(data.importance * 100).toFixed(1)}%</p>
          {data.description && (
            <p className="text-xs text-muted-foreground mt-1">{data.description}</p>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <StitchCard className="w-full">
      <StitchCardHeader>
        <h3 className="text-lg flex items-center gap-2">
          <span className="text-accent">📊</span>
          {title}
        </h3>
      </StitchCardHeader>
      <StitchCardBody>
        <ResponsiveContainer width="100%" height={height}>
          <BarChart
            data={chartData}
            layout="horizontal"
            margin={{ top: 5, right: 30, left: showDescription ? 120 : 80, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="var(--colors-outline, #3f4e5f)" />
            <XAxis
              type="number"
              tick={{ fill: '#8892B0' }}
              tickFormatter={(value: number | string) => value ? `${value}%` : ''}
              domain={[0, 'dataMax']}
            />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fill: '#8892B0', fontSize: 12 }}
              width={showDescription ? 120 : 80}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="importance" fill={color} radius={[0, 4, 4, 0]}>
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={color} opacity={0.8 + (index * 0.05)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>

        {/* Legend */}
        <div className="mt-4 flex flex-wrap gap-2">
          {chartData.slice(0, 5).map((item) => (
            <span key={item.name} className="text-xs border border-outline text-muted px-2 py-1 rounded">
              {item.name}: {item.percentage}%
            </span>
          ))}
        </div>
      </StitchCardBody>
    </StitchCard>
  );
}
