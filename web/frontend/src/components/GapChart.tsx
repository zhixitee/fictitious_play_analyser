import React, { useMemo, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { GAME_COLORS } from '../types/simulation';

interface ChartDataPoint {
  iteration: number;
  [key: string]: number;
}

interface GapChartProps {
  data: ChartDataPoint[];
  gameCount: number;
  showIndividualGames?: boolean;
  showAverage?: boolean;
  showTheoreticalBound?: boolean;
  logScale?: boolean;
  markerIteration?: number;  // Iteration value to show vertical marker
  onToggleIndividualGames?: (show: boolean) => void;
  onToggleAverage?: (show: boolean) => void;
  onToggleLogScale?: (log: boolean) => void;
}

export function GapChart({
  data,
  gameCount,
  showIndividualGames = true,
  showAverage = true,
  showTheoreticalBound = true,
  logScale = true,
  markerIteration,
  onToggleIndividualGames,
  onToggleAverage,
  onToggleLogScale,
}: GapChartProps) {
  const [selectedGame, setSelectedGame] = useState<number | null>(null);

  const chartData = useMemo(() => {
    if (data.length === 0) return [];

    return data.map(point => {
      const enhanced: Record<string, number> = { ...point };
      
      if (point.iteration > 0) {
        enhanced.theoretical = 1 / Math.sqrt(point.iteration);
      }
      
      return enhanced;
    });
  }, [data]);

  const formatTooltip = (value: number) => {
    if (typeof value !== 'number') return value;
    return value.toExponential(4);
  };

  const formatYAxis = (value: number) => {
    if (value === 0) return '0';
    if (value >= 1) return value.toFixed(1);
    if (value >= 0.01) return value.toFixed(2);
    return value.toExponential(0);
  };

  if (data.length === 0) {
    return (
      <div className="chart-container flex items-center justify-center text-muted">
        <div className="text-center">
          <div className="text-4xl mb-2">Graph</div>
          <div>Start a simulation to see the convergence chart</div>
        </div>
      </div>
    );
  }

  return (
    <div className="chart-container">
      <div className="flex gap-4 mb-4 text-sm">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showIndividualGames}
            onChange={e => onToggleIndividualGames?.(e.target.checked)}
            className="accent-gray-500"
          />
          <span className="text-muted">Individual Games</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showAverage}
            onChange={e => onToggleAverage?.(e.target.checked)}
            className="accent-gray-500"
          />
          <span className="text-muted">Average</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={logScale}
            onChange={e => onToggleLogScale?.(e.target.checked)}
            className="accent-gray-500"
          />
          <span className="text-muted">Log Scale</span>
        </label>
      </div>

      <ResponsiveContainer width="100%" height={350}>
        <LineChart
          data={chartData}
          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#2e2e32" />
          <XAxis
            dataKey="iteration"
            stroke="#707070"
            tickFormatter={(v) => v.toLocaleString()}
            fontSize={12}
          />
          <YAxis
            scale={logScale ? 'log' : 'auto'}
            domain={logScale ? ['auto', 'auto'] : [0, 'auto']}
            stroke="#707070"
            tickFormatter={formatYAxis}
            fontSize={12}
            allowDataOverflow
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1f1f20',
              border: '1px solid #2e2e32',
              borderRadius: '4px',
            }}
            labelStyle={{ color: '#d8d9da' }}
            formatter={formatTooltip}
            labelFormatter={(label) => `Iteration: ${label.toLocaleString()}`}
          />
          <Legend />

          {showIndividualGames &&
            Array.from({ length: gameCount }, (_, i) => (
              <Line
                key={`game${i + 1}`}
                type="monotone"
                dataKey={`game${i + 1}`}
                stroke={GAME_COLORS[i % GAME_COLORS.length]}
                strokeWidth={selectedGame === i ? 2 : 1}
                dot={false}
                opacity={selectedGame === null || selectedGame === i ? 1 : 0.3}
                name={`Game ${i + 1}`}
              />
            ))}

          {showAverage && (
            <Line
              type="monotone"
              dataKey="average"
              stroke="#ffffff"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={false}
              name="Average"
            />
          )}

          {showTheoreticalBound && (
            <Line
              type="monotone"
              dataKey="theoretical"
              stroke="#ff6b6b"
              strokeWidth={1}
              strokeDasharray="10 5"
              dot={false}
              name="O(1/sqrt(T))"
              opacity={0.7}
            />
          )}

          {markerIteration !== undefined && markerIteration > 0 && (
            <ReferenceLine
              x={markerIteration}
              stroke="#ffd700"
              strokeWidth={2}
              strokeDasharray="4 4"
            />
          )}
        </LineChart>
      </ResponsiveContainer>

      <div className="flex flex-wrap gap-2 mt-4 text-xs">
        {Array.from({ length: gameCount }, (_, i) => (
          <button
            key={i}
            onClick={() => setSelectedGame(selectedGame === i ? null : i)}
            className={`px-2 py-1 rounded transition-colors ${
              selectedGame === null || selectedGame === i
                ? 'opacity-100'
                : 'opacity-50'
            }`}
            style={{
              backgroundColor: GAME_COLORS[i % GAME_COLORS.length] + '30',
              borderColor: GAME_COLORS[i % GAME_COLORS.length],
              borderWidth: 1,
              color: GAME_COLORS[i % GAME_COLORS.length],
            }}
          >
            Game {i + 1}
          </button>
        ))}
        {selectedGame !== null && (
          <button
            onClick={() => setSelectedGame(null)}
            className="px-2 py-1 rounded bg-gray-700 text-gray-300"
          >
            Show All
          </button>
        )}
      </div>
    </div>
  );
}
