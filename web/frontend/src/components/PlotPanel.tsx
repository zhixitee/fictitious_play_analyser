/**
 * Plot Panel Component
 * 
 * Recharts-based visualizations for convergence analysis:
 * - Main Duality Gap chart (large)
 * - Convergence Rate (alpha) chart (side-by-side with ratio)
 * - Gap / Karlin Bound Ratio chart (side-by-side with alpha)
 * - Vertical reference line synced to selected iteration
 * - Checkbox-based game visibility
 */

import React, { useMemo, useState, useEffect } from "react";
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
} from "recharts";
import { BestResponseChart } from "./BestResponseChart";

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
  explorerGameIndex: number; // -1 = all games, >= 0 = specific game
  logScale: boolean;
  showLegend: boolean;
  visibleGames?: boolean[];
  onVisibleGamesChange?: (visibleGames: boolean[]) => void;
  selectedIterationIndex?: number;
  bestRowHistory?: number[][];  // [game][iterIdx]
  bestColHistory?: number[][];  // [game][iterIdx]
  matrices?: number[][][];      // [game][row][col] for matrix size
}

interface ChartDataPoint {
  iteration: number;
  iterationIndex: number;
  [key: string]: number;
}

export function PlotPanel({
  iterations,
  allGaps,
  avgGaps,
  explorerGameIndex,
  logScale,
  showLegend,
  visibleGames,
  onVisibleGamesChange,
  selectedIterationIndex = 0,
  bestRowHistory,
  bestColHistory,
  matrices,
}: PlotPanelProps) {
  const selectedGame = explorerGameIndex >= 0 ? explorerGameIndex : null;
  const gameCount = allGaps.length;
  
  // Initialize visible games state if not provided
  const [internalVisibleGames, setInternalVisibleGames] = useState<boolean[]>([]);
  
  useEffect(() => {
    if (gameCount > 0 && internalVisibleGames.length !== gameCount) {
      setInternalVisibleGames(Array(gameCount).fill(true));
    }
  }, [gameCount, internalVisibleGames.length]);
  
  const effectiveVisibleGames = visibleGames || internalVisibleGames;
  const handleVisibleChange = onVisibleGamesChange || setInternalVisibleGames;

  // Get selected iteration value for reference line
  const selectedIterationValue = iterations[selectedIterationIndex] || 0;

  // Build main chart data (Duality Gap)
  const chartData = useMemo(() => {
    if (iterations.length === 0) return [];

    const maxPoints = 500;
    const step = Math.max(1, Math.floor(iterations.length / maxPoints));
    const data: ChartDataPoint[] = [];

    for (let idx = 0; idx < iterations.length; idx += step) {
      const iter = iterations[idx];
      if (iter <= 0) continue;
      
      const point: ChartDataPoint = { iteration: iter, iterationIndex: idx };

      for (let g = 0; g < gameCount; g++) {
        const gap = allGaps[g]?.[idx] ?? 0;
        point[`game${g + 1}`] = Math.max(gap, 1e-10);
      }

      const avg = avgGaps[idx] ?? 0;
      point.average = Math.max(avg, 1e-10);
      point.karlin = 1 / Math.sqrt(iter);
      point.wang = 1 / Math.pow(iter, 1/3);

      data.push(point);
    }

    // Include last point
    const lastIdx = iterations.length - 1;
    if (lastIdx > 0 && lastIdx % step !== 0) {
      const iter = iterations[lastIdx];
      if (iter > 0) {
        const point: ChartDataPoint = { iteration: iter, iterationIndex: lastIdx };
        for (let g = 0; g < gameCount; g++) {
          const gap = allGaps[g]?.[lastIdx] ?? 0;
          point[`game${g + 1}`] = Math.max(gap, 1e-10);
        }
        const avg = avgGaps[lastIdx] ?? 0;
        point.average = Math.max(avg, 1e-10);
        point.karlin = 1 / Math.sqrt(iter);
        point.wang = 1 / Math.pow(iter, 1/3);
        data.push(point);
      }
    }

    return data;
  }, [iterations, allGaps, avgGaps, gameCount]);

  // Build convergence rate (alpha) data
  const convergenceRateData = useMemo(() => {
    if (iterations.length < 20) return [];

    const maxPoints = 200;
    const step = Math.max(1, Math.floor(iterations.length / maxPoints));
    const windowSize = Math.max(5, Math.floor(iterations.length / 50));

    const data: ChartDataPoint[] = [];

    for (let idx = windowSize; idx < iterations.length; idx += step) {
      const iter = iterations[idx];
      if (iter <= 0) continue;

      const point: ChartDataPoint = { iteration: iter, iterationIndex: idx };

      for (let g = 0; g < gameCount; g++) {
        const startIdx = Math.max(0, idx - windowSize);
        const t1 = iterations[startIdx];
        const t2 = iterations[idx];
        const gap1 = allGaps[g]?.[startIdx] ?? 0;
        const gap2 = allGaps[g]?.[idx] ?? 0;

        if (t1 > 0 && t2 > 0 && gap1 > 0 && gap2 > 0 && t1 !== t2) {
          const logT1 = Math.log10(t1);
          const logT2 = Math.log10(t2);
          const logG1 = Math.log10(gap1);
          const logG2 = Math.log10(gap2);
          const alpha = (logG2 - logG1) / (logT2 - logT1);
          point[`game${g + 1}`] = alpha;
        }
      }

      // Average alpha
      const visibleAlphas: number[] = [];
      for (let g = 0; g < gameCount; g++) {
        const val = point[`game${g + 1}`];
        if (typeof val === 'number' && effectiveVisibleGames[g]) {
          visibleAlphas.push(val);
        }
      }
      if (visibleAlphas.length > 0) {
        point.average = visibleAlphas.reduce((a, b) => a + b, 0) / visibleAlphas.length;
      }

      data.push(point);
    }

    return data;
  }, [iterations, allGaps, gameCount, effectiveVisibleGames]);

  // Build Gap / Karlin Bound ratio data
  const ratioData = useMemo(() => {
    if (iterations.length === 0) return [];

    const maxPoints = 200;
    const step = Math.max(1, Math.floor(iterations.length / maxPoints));
    const data: ChartDataPoint[] = [];

    for (let idx = 0; idx < iterations.length; idx += step) {
      const iter = iterations[idx];
      if (iter <= 0) continue;

      const karlinBound = 1 / Math.sqrt(iter);
      const point: ChartDataPoint = { iteration: iter, iterationIndex: idx };

      for (let g = 0; g < gameCount; g++) {
        const gap = allGaps[g]?.[idx] ?? 0;
        point[`game${g + 1}`] = gap / karlinBound;
      }

      const avg = avgGaps[idx] ?? 0;
      point.average = avg / karlinBound;

      data.push(point);
    }

    // Include last point
    const lastIdx = iterations.length - 1;
    if (lastIdx > 0 && lastIdx % step !== 0) {
      const iter = iterations[lastIdx];
      if (iter > 0) {
        const karlinBound = 1 / Math.sqrt(iter);
        const point: ChartDataPoint = { iteration: iter, iterationIndex: lastIdx };
        for (let g = 0; g < gameCount; g++) {
          const gap = allGaps[g]?.[lastIdx] ?? 0;
          point[`game${g + 1}`] = gap / karlinBound;
        }
        const avg = avgGaps[lastIdx] ?? 0;
        point.average = avg / karlinBound;
        data.push(point);
      }
    }

    return data;
  }, [iterations, allGaps, avgGaps, gameCount]);

  // Toggle game visibility
  const toggleGameVisibility = (gameIndex: number) => {
    const newVisible = [...effectiveVisibleGames];
    newVisible[gameIndex] = !newVisible[gameIndex];
    if (newVisible.some(v => v)) {
      handleVisibleChange(newVisible);
    }
  };

  // Format functions
  const formatYAxis = (value: number) => {
    if (value === 0) return "0";
    if (value >= 1) return value.toFixed(1);
    if (value >= 0.01) return value.toFixed(2);
    return value.toExponential(0);
  };

  const formatTooltip = (value: number) => {
    if (typeof value !== "number") return value;
    return value.toExponential(4);
  };

  const formatAlphaTooltip = (value: number) => {
    if (typeof value !== "number") return value;
    return value.toFixed(4);
  };

  const formatRatioTooltip = (value: number) => {
    if (typeof value !== "number") return value;
    return value.toFixed(4);
  };

  // Empty state
  if (iterations.length === 0) {
    return (
      <div className="flex items-center justify-center text-muted" style={{ height: 400 }}>
        <div className="text-center">
          <div className="text-4xl mb-2">Chart</div>
          <div>Start a simulation to see the convergence charts</div>
        </div>
      </div>
    );
  }

  const showIndividual = true;
  const showAverage = explorerGameIndex === -1;

  // Common chart configuration
  const commonTooltipStyle = {
    contentStyle: {
      backgroundColor: "#1f1f20",
      border: "1px solid #2e2e32",
      borderRadius: "4px",
    },
    labelStyle: { color: "#d8d9da" },
  };

  return (
    <div className="space-y-4">
      {/* Game visibility checkboxes */}
      {gameCount > 1 && (
        <div className="flex flex-wrap items-center gap-3 px-2 py-2 bg-gray-800/50 rounded">
          <span className="text-xs text-muted font-medium">Show Games:</span>
          {Array.from({ length: gameCount }, (_, i) => (
            <label
              key={i}
              className="flex items-center gap-1.5 cursor-pointer text-xs"
            >
              <input
                type="checkbox"
                checked={effectiveVisibleGames[i] ?? true}
                onChange={() => toggleGameVisibility(i)}
                className="w-3 h-3 rounded border-gray-600 text-gray-500 focus:ring-gray-500 focus:ring-offset-0"
                style={{ accentColor: GAME_COLORS[i % GAME_COLORS.length] }}
              />
              <span
                className="font-medium"
                style={{ color: GAME_COLORS[i % GAME_COLORS.length] }}
              >
                Game {i + 1}
              </span>
            </label>
          ))}
          <button
            onClick={() => handleVisibleChange(Array(gameCount).fill(false))}
            className="ml-auto text-xs px-2 py-0.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300"
          >
            Collapse
          </button>
          <button
            onClick={() => handleVisibleChange(Array(gameCount).fill(true))}
            className="text-xs px-2 py-0.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300"
          >
            Show All
          </button>
        </div>
      )}

      {/* Main Duality Gap Chart */}
      <div style={{ height: 350 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 10, right: 30, left: 20, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#2e2e32" />
            <XAxis
              dataKey="iteration"
              stroke="#707070"
              tickFormatter={(v) => v.toLocaleString()}
              fontSize={11}
              scale={logScale ? "log" : "auto"}
              domain={logScale ? ['auto', 'auto'] : [0, 'auto']}
            />
            <YAxis
              scale={logScale ? "log" : "auto"}
              domain={logScale ? [1e-6, "auto"] : [0, "auto"]}
              stroke="#707070"
              tickFormatter={formatYAxis}
              fontSize={11}
              allowDataOverflow={true}
              label={{ value: 'Duality Gap', angle: -90, position: 'insideLeft', style: { fill: '#707070', fontSize: 11 } }}
            />
            <Tooltip
              {...commonTooltipStyle}
              formatter={formatTooltip}
              labelFormatter={(label) => `Iteration: ${label.toLocaleString()}`}
            />
            {showLegend && <Legend wrapperStyle={{ fontSize: 11 }} />}

            {/* Selected iteration reference line */}
            {selectedIterationValue > 0 && (
              <ReferenceLine
                x={selectedIterationValue}
                stroke="#ffffff"
                strokeWidth={1.5}
                strokeDasharray="4 4"
              />
            )}

            {/* Individual game lines */}
            {showIndividual &&
              Array.from({ length: gameCount }, (_, i) => {
                if (!effectiveVisibleGames[i]) return null;
                if (selectedGame !== null && selectedGame !== i) return null;
                return (
                  <Line
                    key={`game${i + 1}`}
                    type="monotone"
                    dataKey={`game${i + 1}`}
                    stroke={GAME_COLORS[i % GAME_COLORS.length]}
                    strokeWidth={selectedGame === i ? 2.5 : 1.5}
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
                stroke="#fbbf24"
                strokeWidth={2.5}
                dot={false}
                name="Average Gap"
              />
            )}

            {/* Karlin bound */}
            <Line
              type="monotone"
              dataKey="karlin"
              stroke="#22c55e"
              strokeWidth={1.5}
              strokeDasharray="8 4"
              dot={false}
              name="Karlin O(T^-1/2)"
              opacity={0.8}
            />

            {/* Wang bound */}
            <Line
              type="monotone"
              dataKey="wang"
              stroke="#ef4444"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
              name="Wang O(T^-1/3)"
              opacity={0.8}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Bottom charts - side by side */}
      <div className="flex gap-4 justify-center">
        {/* Convergence Rate (alpha) Chart */}
        <div className="flex-1 min-w-0 max-w-[50%]">
          <div className="text-xs font-medium text-gray-400 mb-1 px-2">
            Convergence Rate (alpha)
          </div>
          <div style={{ height: 180 }}>
            {convergenceRateData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={convergenceRateData}
                  margin={{ top: 5, right: 15, left: 15, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#2e2e32" />
                  <XAxis
                    dataKey="iteration"
                    stroke="#707070"
                    tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}
                    fontSize={9}
                    scale={logScale ? "log" : "auto"}
                    domain={logScale ? ['auto', 'auto'] : [0, 'auto']}
                  />
                  <YAxis
                    domain={[-1, 0]}
                    stroke="#707070"
                    tickFormatter={(v) => v.toFixed(1)}
                    fontSize={9}
                    label={{ value: 'alpha', angle: -90, position: 'insideLeft', style: { fill: '#707070', fontSize: 9 } }}
                  />
                  <Tooltip
                    {...commonTooltipStyle}
                    formatter={formatAlphaTooltip}
                    labelFormatter={(label) => `Iter: ${label.toLocaleString()}`}
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

                  {/* Reference lines */}
                  <ReferenceLine
                    y={-0.5}
                    stroke="#22c55e"
                    strokeDasharray="8 4"
                    strokeWidth={1}
                    label={{ value: '-0.5', position: 'right', fill: '#22c55e', fontSize: 9 }}
                  />
                  <ReferenceLine
                    y={-1/3}
                    stroke="#ef4444"
                    strokeDasharray="4 4"
                    strokeWidth={1}
                    label={{ value: '-0.33', position: 'right', fill: '#ef4444', fontSize: 9 }}
                  />

                  {/* Game lines */}
                  {showIndividual &&
                    Array.from({ length: gameCount }, (_, i) => {
                      if (!effectiveVisibleGames[i]) return null;
                      if (selectedGame !== null && selectedGame !== i) return null;
                      return (
                        <Line
                          key={`game${i + 1}`}
                          type="monotone"
                          dataKey={`game${i + 1}`}
                          stroke={GAME_COLORS[i % GAME_COLORS.length]}
                          strokeWidth={1}
                          dot={false}
                          opacity={0.7}
                        />
                      );
                    })}

                  {showAverage && (
                    <Line
                      type="monotone"
                      dataKey="average"
                      stroke="#fbbf24"
                      strokeWidth={2}
                      dot={false}
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-muted">
                Need more data...
              </div>
            )}
          </div>
        </div>

        {/* Gap / Karlin Bound Ratio Chart */}
        <div className="flex-1 min-w-0 max-w-[50%]">
          <div className="text-xs font-medium text-gray-400 mb-1 px-2">
            Gap / Karlin Bound Ratio
          </div>
          <div style={{ height: 180 }}>
            {ratioData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={ratioData}
                  margin={{ top: 5, right: 15, left: 15, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#2e2e32" />
                  <XAxis
                    dataKey="iteration"
                    stroke="#707070"
                    tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}
                    fontSize={9}
                    scale={logScale ? "log" : "auto"}
                    domain={logScale ? ['auto', 'auto'] : [0, 'auto']}
                  />
                  <YAxis
                    stroke="#707070"
                    tickFormatter={(v) => v.toFixed(1)}
                    fontSize={9}
                    label={{ value: 'Ratio', angle: -90, position: 'insideLeft', style: { fill: '#707070', fontSize: 9 } }}
                  />
                  <Tooltip
                    {...commonTooltipStyle}
                    formatter={formatRatioTooltip}
                    labelFormatter={(label) => `Iter: ${label.toLocaleString()}`}
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

                  {/* Reference line at 1.0 (gap equals theoretical bound) */}
                  <ReferenceLine
                    y={1}
                    stroke="#22c55e"
                    strokeDasharray="8 4"
                    strokeWidth={1}
                    label={{ value: '1.0', position: 'right', fill: '#22c55e', fontSize: 9 }}
                  />

                  {/* Game lines */}
                  {showIndividual &&
                    Array.from({ length: gameCount }, (_, i) => {
                      if (!effectiveVisibleGames[i]) return null;
                      if (selectedGame !== null && selectedGame !== i) return null;
                      return (
                        <Line
                          key={`game${i + 1}`}
                          type="monotone"
                          dataKey={`game${i + 1}`}
                          stroke={GAME_COLORS[i % GAME_COLORS.length]}
                          strokeWidth={1}
                          dot={false}
                          opacity={0.7}
                        />
                      );
                    })}

                  {showAverage && (
                    <Line
                      type="monotone"
                      dataKey="average"
                      stroke="#fbbf24"
                      strokeWidth={2}
                      dot={false}
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-muted">
                Need more data...
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Best Response Dynamics Chart */}
      {bestRowHistory && bestColHistory && bestRowHistory.length > 0 && (() => {
        // Determine which game to show (selected game or first game)
        const brGameIdx = selectedGame !== null ? selectedGame : 0;
        const brRow = bestRowHistory[brGameIdx];
        const brCol = bestColHistory[brGameIdx];
        const matSize = matrices?.[brGameIdx]?.length ?? 3;
        const label = selectedGame !== null
          ? `Game ${selectedGame + 1}`
          : gameCount === 1 ? "Game 1" : `Game 1 (of ${gameCount})`;
        if (!brRow || !brCol) return null;
        return (
          <BestResponseChart
            iterations={iterations}
            bestRowHistory={brRow}
            bestColHistory={brCol}
            matrixSize={matSize}
            selectedIterationIndex={selectedIterationIndex}
            logScale={logScale}
            gameLabel={label}
          />
        );
      })()}
    </div>
  );
}

export default PlotPanel;
