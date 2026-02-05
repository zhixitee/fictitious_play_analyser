/**
 * Plot Panel Component
 * 
 * Recharts-based line plot for visualizing convergence:
 * - Gap vs Iteration
 * - Multiple game lines
 * - Average line
 * - Theoretical bound O(1/√T)
 * - Log scale support
 * - Game selection
 */

import React, { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { PlotMode } from "./ControlsPanel";

// Color palette for games
const GAME_COLORS = [
  "#4ade80", // green
  "#60a5fa", // blue
  "#f472b6", // pink
  "#facc15", // yellow
  "#a78bfa", // purple
  "#fb923c", // orange
  "#2dd4bf", // teal
  "#f87171", // red
  "#818cf8", // indigo
  "#34d399", // emerald
];

interface PlotPanelProps {
  iterations: number[];
  allGaps: number[][];
  avgGaps: number[];
  plotMode: PlotMode;
  selectedGame: number | null;
  logScale: boolean;
  showLegend: boolean;
  onGameSelect?: (gameIndex: number | null) => void;
}

interface ChartDataPoint {
  iteration: number;
  [key: string]: number;
}

export function PlotPanel({
  iterations,
  allGaps,
  avgGaps,
  plotMode,
  selectedGame,
  logScale,
  showLegend,
  onGameSelect,
}: PlotPanelProps) {
  const gameCount = allGaps.length;

  // Build chart data
  const chartData = useMemo(() => {
    if (iterations.length === 0) return [];

    // Sample data for performance (keep at most 500 points)
    const maxPoints = 500;
    const step = Math.max(1, Math.floor(iterations.length / maxPoints));

    const data: ChartDataPoint[] = [];

    for (let idx = 0; idx < iterations.length; idx += step) {
      const iter = iterations[idx];
      if (iter <= 0) continue; // Skip iteration 0 for log scale compatibility
      
      const point: ChartDataPoint = { iteration: iter };

      // Per-game gaps (ensure positive for log scale)
      for (let g = 0; g < gameCount; g++) {
        const gap = allGaps[g]?.[idx] ?? 0;
        point[`game${g + 1}`] = Math.max(gap, 1e-10);
      }

      // Average gap
      const avg = avgGaps[idx] ?? 0;
      point.average = Math.max(avg, 1e-10);

      // Theoretical bound: 1/√T
      point.theoretical = 1 / Math.sqrt(iter);

      data.push(point);
    }

    // Always include the last point
    const lastIdx = iterations.length - 1;
    if (lastIdx > 0 && lastIdx % step !== 0) {
      const iter = iterations[lastIdx];
      if (iter > 0) {
        const point: ChartDataPoint = { iteration: iter };
        for (let g = 0; g < gameCount; g++) {
          const gap = allGaps[g]?.[lastIdx] ?? 0;
          point[`game${g + 1}`] = Math.max(gap, 1e-10);
        }
        const avg = avgGaps[lastIdx] ?? 0;
        point.average = Math.max(avg, 1e-10);
        point.theoretical = 1 / Math.sqrt(iter);
        data.push(point);
      }
    }

    return data;
  }, [iterations, allGaps, avgGaps, gameCount]);

  // Format Y axis
  const formatYAxis = (value: number) => {
    if (value === 0) return "0";
    if (value >= 1) return value.toFixed(1);
    if (value >= 0.01) return value.toFixed(2);
    return value.toExponential(0);
  };

  // Format tooltip
  const formatTooltip = (value: number) => {
    if (typeof value !== "number") return value;
    return value.toExponential(4);
  };

  // Empty state
  if (iterations.length === 0) {
    return (
      <div className="chart-container flex items-center justify-center text-muted" style={{ height: 400 }}>
        <div className="text-center">
          <div className="text-4xl mb-2">📊</div>
          <div>Start a simulation to see the convergence chart</div>
        </div>
      </div>
    );
  }

  // Determine which lines to show
  const showIndividual = plotMode === "all" || plotMode === "selected";
  const showAverage = plotMode === "all" || plotMode === "average";

  return (
    <div className="chart-container" style={{ height: 400 }}>
      <ResponsiveContainer width="100%" height="100%">
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
            scale={logScale ? "log" : "auto"}
            domain={logScale ? [1e-6, "auto"] : [0, "auto"]}
            stroke="#707070"
            tickFormatter={formatYAxis}
            fontSize={12}
            allowDataOverflow={true}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#1f1f20",
              border: "1px solid #2e2e32",
              borderRadius: "4px",
            }}
            labelStyle={{ color: "#d8d9da" }}
            formatter={formatTooltip}
            labelFormatter={(label) => `Iteration: ${label.toLocaleString()}`}
          />
          {showLegend && <Legend />}

          {/* Individual game lines */}
          {showIndividual &&
            Array.from({ length: gameCount }, (_, i) => {
              // In "selected" mode, only show the selected game
              if (plotMode === "selected" && selectedGame !== i) {
                return null;
              }
              return (
                <Line
                  key={`game${i + 1}`}
                  type="monotone"
                  dataKey={`game${i + 1}`}
                  stroke={GAME_COLORS[i % GAME_COLORS.length]}
                  strokeWidth={selectedGame === i ? 2 : 1}
                  dot={false}
                  name={`Game ${i + 1}`}
                />
              );
            })}

          {/* Average line */}
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

          {/* Theoretical bound */}
          <Line
            type="monotone"
            dataKey="theoretical"
            stroke="#ff6b6b"
            strokeWidth={1}
            strokeDasharray="10 5"
            dot={false}
            name="O(1/√T)"
            opacity={0.7}
          />
        </LineChart>
      </ResponsiveContainer>

      {/* Game selector buttons */}
      {plotMode === "all" && gameCount > 1 && (
        <div className="flex flex-wrap gap-2 mt-4 text-xs">
          {Array.from({ length: gameCount }, (_, i) => (
            <button
              key={i}
              onClick={() => onGameSelect?.(selectedGame === i ? null : i)}
              className={`px-2 py-1 rounded transition-colors border ${
                selectedGame === null || selectedGame === i
                  ? "opacity-100"
                  : "opacity-50"
              }`}
              style={{
                backgroundColor: GAME_COLORS[i % GAME_COLORS.length] + "30",
                borderColor: GAME_COLORS[i % GAME_COLORS.length],
                color: GAME_COLORS[i % GAME_COLORS.length],
              }}
            >
              Game {i + 1}
            </button>
          ))}
          {selectedGame !== null && (
            <button
              onClick={() => onGameSelect?.(null)}
              className="px-2 py-1 rounded bg-gray-700 text-gray-300"
            >
              Show All
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default PlotPanel;
