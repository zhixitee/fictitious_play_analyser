/**
 * Best Response Dynamics Chart
 * 
 * Visualizes which strategy index was played at each iteration.
 * For counter-examples (e.g., Wang 2025 with lexicographic ties),
 * this reveals cyclic "staircase" patterns (1 -> 2 -> 3 -> ...).
 * For random tie-breaking, this should appear as noise.
 * 
 * Uses downsampling for performance with large iteration counts.
 */

import React, { useMemo } from "react";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

// Colors for row and column players
const ROW_COLOR = "#4ade80"; // green
const COL_COLOR = "#60a5fa"; // blue

interface BestResponseChartProps {
  iterations: number[];
  bestRowHistory: number[];  // best response index per iteration for one game
  bestColHistory: number[];  // best response index per iteration for one game
  matrixSize: number;        // N (number of actions)
  selectedIterationIndex?: number;
  logScale?: boolean;
  gameLabel?: string;
}

interface DataPoint {
  iteration: number;
  row: number;
  col: number;
}

const MAX_POINTS = 2000; // Maximum scatter points to render

export function BestResponseChart({
  iterations,
  bestRowHistory,
  bestColHistory,
  matrixSize,
  selectedIterationIndex = 0,
  logScale = false,
  gameLabel,
}: BestResponseChartProps) {
  const data = useMemo(() => {
    if (!iterations.length || !bestRowHistory.length) return [];

    const len = Math.min(iterations.length, bestRowHistory.length, bestColHistory.length);
    
    // Downsample if needed
    const step = Math.max(1, Math.floor(len / MAX_POINTS));
    const result: DataPoint[] = [];

    for (let i = 0; i < len; i += step) {
      result.push({
        iteration: iterations[i],
        row: bestRowHistory[i],
        col: bestColHistory[i],
      });
    }

    return result;
  }, [iterations, bestRowHistory, bestColHistory]);

  // Separate data arrays for Recharts Scatter (needs separate datasets)
  const rowData = useMemo(() => data.map(d => ({ iteration: d.iteration, action: d.row })), [data]);
  const colData = useMemo(() => data.map(d => ({ iteration: d.iteration, action: d.col })), [data]);

  const selectedIterationValue = useMemo(() => {
    if (!iterations.length) return 0;
    const idx = Math.min(selectedIterationIndex, iterations.length - 1);
    return iterations[idx] || 0;
  }, [iterations, selectedIterationIndex]);

  if (!data.length) {
    return (
      <div className="flex items-center justify-center text-muted h-full">
        <div className="text-center text-sm">
          <div className="text-2xl mb-1">Best Response</div>
          <div>Start a simulation to see best response dynamics</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between px-2">
        <div className="text-xs font-medium text-gray-400">
          Best Response Dynamics{gameLabel ? ` - ${gameLabel}` : ""}
        </div>
        <div className="flex gap-3 text-xs">
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: ROW_COLOR }} />
            Row Player
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: COL_COLOR }} />
            Col Player
          </span>
        </div>
      </div>
      <div style={{ height: 180 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 5, right: 15, left: 15, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2e2e32" />
            <XAxis
              dataKey="iteration"
              type="number"
              stroke="#707070"
              tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
              fontSize={9}
              scale={logScale ? "log" : "auto"}
              domain={logScale ? ["auto", "auto"] : [0, "auto"]}
              name="Iteration"
            />
            <YAxis
              dataKey="action"
              type="number"
              stroke="#707070"
              domain={[0, Math.max(matrixSize - 1, 1)]}
              ticks={Array.from({ length: matrixSize }, (_, i) => i)}
              tickFormatter={(v) => String(v)}
              fontSize={9}
              label={{ value: "Action", angle: -90, position: "insideLeft", style: { fill: "#707070", fontSize: 9 } }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#1f1f20",
                border: "1px solid #2e2e32",
                borderRadius: "4px",
              }}
              labelStyle={{ color: "#d8d9da" }}
              formatter={(value: number, name: string) => [value, name === "row" ? "Row BR" : "Col BR"]}
              labelFormatter={(label) => `Iter: ${Number(label).toLocaleString()}`}
            />

            {/* Selected iteration reference line */}
            {selectedIterationValue > 0 && (
              <ReferenceLine
                x={selectedIterationValue}
                stroke="#ffffff"
                strokeWidth={1}
                strokeDasharray="4 4"
              />
            )}

            <Scatter
              data={rowData}
              fill={ROW_COLOR}
              opacity={0.6}
              name="row"
              dataKey="action"
              shape="circle"
              legendType="none"
            />
            <Scatter
              data={colData}
              fill={COL_COLOR}
              opacity={0.4}
              name="col"
              dataKey="action"
              shape="diamond"
              legendType="none"
            />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default BestResponseChart;
