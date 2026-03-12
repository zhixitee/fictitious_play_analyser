import React, { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { motion } from "framer-motion";
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
  ReferenceArea,
} from "recharts";
import { BestResponseChart } from "./BestResponseChart";
import {
  useChartZoom,
  downsampleData,
  niceIterationTicks,
  formatIterationTick,
} from "./charts";
import type { Domain } from "./charts";
import { ZoomableChart } from "./charts";

const GAME_COLORS = [
  "#4ade80",
  "#60a5fa",
  "#f472b6",
  "#facc15",
  "#a78bfa",
  "#fb923c",
  "#2dd4bf",
  "#f87171",
  "#818cf8",
  "#34d399",
];

interface PlotPanelProps {
  iterations: number[];
  allGaps: number[][];
  avgGaps: number[];
  explorerGameIndex: number; // -1 = all games, -2 = average only, >= 0 = specific game
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
  const showAverageOnly = explorerGameIndex === -2;
  
  const [internalVisibleGames, setInternalVisibleGames] = useState<boolean[]>([]);
  
  useEffect(() => {
    if (gameCount > 0 && internalVisibleGames.length !== gameCount) {
      setInternalVisibleGames(Array(gameCount).fill(true));
    }
  }, [gameCount, internalVisibleGames.length]);
  
  const effectiveVisibleGames = visibleGames || internalVisibleGames;
  const handleVisibleChange = onVisibleGamesChange || setInternalVisibleGames;

  const selectedIterationValue = iterations[selectedIterationIndex] || 0;

  /** Binary search for the closest data index matching an iteration value. */
  const findClosestDataIndex = useCallback((data: ChartDataPoint[], iterValue: number): number | undefined => {
    if (data.length === 0 || iterValue <= 0) return undefined;
    let lo = 0, hi = data.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (data[mid].iteration < iterValue) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0 && Math.abs(data[lo - 1].iteration - iterValue) < Math.abs(data[lo].iteration - iterValue)) {
      return lo - 1;
    }
    return lo;
  }, []);

  const [zoom, zoomActions] = useChartZoom();

  const prevIterLen = useRef(iterations.length);
  useEffect(() => {
    if (iterations.length < prevIterLen.current) {
      zoomActions.resetZoom();
    }
    prevIterLen.current = iterations.length;
  }, [iterations.length, zoomActions]);

  // Animate lines only on first data arrival, then lock animations off
  // so streaming updates don't cause "bounce" on every frame.
  const hadDataRef = useRef(false);
  const [initialAnimDone, setInitialAnimDone] = useState(false);
  const isInitialRender = iterations.length > 0 && !hadDataRef.current;

  useEffect(() => {
    if (iterations.length > 0 && !hadDataRef.current) {
      hadDataRef.current = true;
      // Lock off after initial draw animation completes
      const timer = setTimeout(() => setInitialAnimDone(true), 1000);
      return () => clearTimeout(timer);
    }
    if (iterations.length === 0) {
      hadDataRef.current = false;
      setInitialAnimDone(false);
    }
  }, [iterations.length]);

  const lineAnimActive = isInitialRender && !initialAnimDone;

  const chartVariants = {
    hidden: { opacity: 0, y: 18 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" as const } },
  };

  const staggerContainer = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.12 } },
  };

  const [brushStart, setBrushStart] = useState<string | number | null>(null);
  const [brushEnd, setBrushEnd] = useState<string | number | null>(null);

  const handleMouseDown = useCallback((e: any) => {
    if (e && e.activeLabel != null) {
      setBrushStart(e.activeLabel);
      setBrushEnd(null);
    }
  }, []);

  const handleMouseMove = useCallback((e: any) => {
    if (brushStart != null && e && e.activeLabel != null) {
      setBrushEnd(e.activeLabel);
    }
  }, [brushStart]);

  const handleMouseUp = useCallback(() => {
    if (brushStart != null && brushEnd != null) {
      const lo = Math.min(Number(brushStart), Number(brushEnd));
      const hi = Math.max(Number(brushStart), Number(brushEnd));
      if (hi > lo) {
        zoomActions.setDomain([lo, hi]);
      }
    }
    setBrushStart(null);
    setBrushEnd(null);
  }, [brushStart, brushEnd, zoomActions]);

  const fullMax = iterations.length > 0 ? iterations[iterations.length - 1] : 1;
  const fullDomain: [number, number] = [iterations[0] || 0, fullMax];

  const xDomain: [number | string, number | string] = zoom.domain
    ? [zoom.domain[0], zoom.domain[1]]
    : logScale ? ["auto", "auto"] : [0, "auto"];

  const xTicks = useMemo(
    () => niceIterationTicks(zoom.domain, fullMax),
    [zoom.domain, fullMax],
  );

  const defaultTicks = useMemo(
    () => niceIterationTicks(null, fullMax),
    [fullMax],
  );

  const chartDataFull = useMemo(() => {
    if (iterations.length === 0) return [];

    const data: ChartDataPoint[] = [];

    for (let idx = 0; idx < iterations.length; idx++) {
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

    return data;
  }, [iterations, allGaps, avgGaps, gameCount]);

  const chartData = useMemo(
    () => downsampleData(chartDataFull, zoom.domain, 1000),
    [chartDataFull, zoom.domain],
  );

  const convergenceRateDataFull = useMemo(() => {
    if (iterations.length < 20) return [];

    const windowSize = Math.max(5, Math.floor(iterations.length / 50));
    const data: ChartDataPoint[] = [];

    for (let idx = windowSize; idx < iterations.length; idx++) {
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

  const convergenceRateData = useMemo(
    () => downsampleData(convergenceRateDataFull, zoom.domain, 500),
    [convergenceRateDataFull, zoom.domain],
  );

  const ratioDataFull = useMemo(() => {
    if (iterations.length === 0) return [];

    const data: ChartDataPoint[] = [];

    for (let idx = 0; idx < iterations.length; idx++) {
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

    return data;
  }, [iterations, allGaps, avgGaps, gameCount]);

  const ratioData = useMemo(
    () => downsampleData(ratioDataFull, zoom.domain, 500),
    [ratioDataFull, zoom.domain],
  );

  // Wang (2025) ratio: gap × t^{1/3}.
  // If gap = Θ(t^{−1/3}) (the tie-breaking agnostic lower bound from
  // Wang's Construction 1), this ratio stabilises to a positive constant.
  const wangRatioDataFull = useMemo(() => {
    if (iterations.length === 0) return [];

    const data: ChartDataPoint[] = [];

    for (let idx = 0; idx < iterations.length; idx++) {
      const iter = iterations[idx];
      if (iter <= 0) continue;

      const wangBound = 1 / Math.pow(iter, 1 / 3);
      const point: ChartDataPoint = { iteration: iter, iterationIndex: idx };

      for (let g = 0; g < gameCount; g++) {
        const gap = allGaps[g]?.[idx] ?? 0;
        point[`game${g + 1}`] = gap / wangBound;
      }

      const avg = avgGaps[idx] ?? 0;
      point.average = avg / wangBound;

      data.push(point);
    }

    return data;
  }, [iterations, allGaps, avgGaps, gameCount]);

  const wangRatioData = useMemo(
    () => downsampleData(wangRatioDataFull, zoom.domain, 500),
    [wangRatioDataFull, zoom.domain],
  );

  const gapTooltipIndex = useMemo(
    () => findClosestDataIndex(chartData, selectedIterationValue),
    [chartData, selectedIterationValue, findClosestDataIndex],
  );
  const alphaTooltipIndex = useMemo(
    () => findClosestDataIndex(convergenceRateData, selectedIterationValue),
    [convergenceRateData, selectedIterationValue, findClosestDataIndex],
  );
  const ratioTooltipIndex = useMemo(
    () => findClosestDataIndex(ratioData, selectedIterationValue),
    [ratioData, selectedIterationValue, findClosestDataIndex],
  );
  const wangRatioTooltipIndex = useMemo(
    () => findClosestDataIndex(wangRatioData, selectedIterationValue),
    [wangRatioData, selectedIterationValue, findClosestDataIndex],
  );

  const [showWangRatio, setShowWangRatio] = useState(false);

  const toggleGameVisibility = (gameIndex: number) => {
    const newVisible = [...effectiveVisibleGames];
    newVisible[gameIndex] = !newVisible[gameIndex];
    handleVisibleChange(newVisible);
  };

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

  const AlphaTooltipContent = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div style={{
        ...commonTooltipStyle.contentStyle,
      }}>
        <div style={{ ...commonTooltipStyle.labelStyle, marginBottom: 4 }}>
          Iter: {Number(label).toLocaleString()}
        </div>
        {payload.map((entry: any, i: number) => (
          <div key={i} style={{ color: entry.color, fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>
            {entry.name ?? entry.dataKey}: {formatAlphaTooltip(entry.value)}
          </div>
        ))}
        <div style={{ borderTop: '1px solid #3e3e42', marginTop: 4, paddingTop: 4, fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}>
          <div style={{ color: '#22c55e' }}>Karlin: -0.5000</div>
          <div style={{ color: '#ef4444' }}>Wang: -0.3333</div>
        </div>
      </div>
    );
  };

  const formatRatioTooltip = (value: number) => {
    if (typeof value !== "number") return value;
    return value.toFixed(4);
  };

  if (iterations.length === 0) {
    return (
      <div className="flex items-center justify-center text-muted h-full">
        <div className="text-center">
          <div className="text-4xl mb-2">Chart</div>
          <div>Start a simulation to see the convergence charts</div>
        </div>
      </div>
    );
  }

  const showIndividual = !showAverageOnly;
  const showAverage = explorerGameIndex === -2;

  const commonTooltipStyle = {
    contentStyle: {
      backgroundColor: "rgba(22, 23, 25, 1)",
      border: "1px solid #3e3e42",
      borderRadius: "6px",
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
      fontSize: 11,
      padding: "8px 12px",
      boxShadow: "0 4px 12px rgba(0, 0, 0, 0.5)",
    },
    labelStyle: { color: "#a0a0a0", fontFamily: "'JetBrains Mono', monospace", fontSize: 10 },
    cursor: { stroke: "#555", strokeWidth: 1 },
    wrapperStyle: { zIndex: 50, opacity: 1 },
  };

  const gridProps = {
    strokeDasharray: "3 3",
    stroke: "#2e2e32",
    strokeOpacity: 0.5,
  };

  const axisTickStyle = {
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
  };

  const sharedXAxisProps = {
    dataKey: "iteration" as const,
    stroke: "#505050",
    tickFormatter: formatIterationTick,
    fontSize: 10,
    scale: (logScale && !zoom.isZoomed ? "log" : "auto") as any,
    domain: xDomain,
    ticks: zoom.isZoomed ? xTicks : logScale ? undefined : defaultTicks,
    allowDataOverflow: true,
    tick: axisTickStyle,
    type: "number" as const,
  };

  const chartMouseProps = {
    onMouseDown: handleMouseDown,
    onMouseMove: handleMouseMove,
    onMouseUp: handleMouseUp,
  };

  return (
    <motion.div
      className="flex flex-col gap-4 h-full min-h-0"
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      key={hadDataRef.current ? "active" : "idle"}
    >
      {gameCount > 1 && (
        <motion.div variants={chartVariants} className="flex flex-wrap items-center gap-3 px-2 py-2 bg-gray-800/50 rounded flex-shrink-0">
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
        </motion.div>
      )}

      <motion.div variants={chartVariants} className="flex-[3] min-h-0">
      <ZoomableChart
        isZoomed={zoom.isZoomed}
        onResetZoom={zoomActions.resetZoom}
        height="100%"
        title="Duality Gap"
        fullDomain={fullDomain}
        zoomActions={zoomActions}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 10, right: 30, left: 20, bottom: 5 }}
            {...chartMouseProps}
          >
            <CartesianGrid {...gridProps} />
            <XAxis {...sharedXAxisProps} />
            <YAxis
              scale={logScale ? "log" : "auto"}
              domain={logScale ? [1e-6, "auto"] : [0, "auto"]}
              stroke="#505050"
              tickFormatter={formatYAxis}
              fontSize={10}
              allowDataOverflow={true}
              tick={axisTickStyle}
              label={{ value: 'Duality Gap', angle: -90, position: 'insideLeft', style: { fill: '#505050', fontSize: 10, fontFamily: "'JetBrains Mono', monospace" } }}
            />
            <Tooltip
              {...commonTooltipStyle}
              formatter={formatTooltip}
              labelFormatter={(label) => `Iteration ${Number(label).toLocaleString()}`}
              defaultIndex={gapTooltipIndex}
            />
            {showLegend && <Legend wrapperStyle={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }} />}

            {brushStart != null && brushEnd != null && (
              <ReferenceArea
                x1={brushStart}
                x2={brushEnd}
                strokeOpacity={0.3}
                fill="#4ade80"
                fillOpacity={0.1}
              />
            )}

            {selectedIterationValue > 0 && (
              <ReferenceLine
                x={selectedIterationValue}
                stroke="#ffffff"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                strokeOpacity={0.6}
              />
            )}

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
                    isAnimationActive={lineAnimActive}
                    animationDuration={900}
                    animationEasing="ease-out"
                  />
                );
              })}

            {showAverage && (
              <Line
                type="monotone"
                dataKey="average"
                stroke="#fbbf24"
                strokeWidth={2.5}
                dot={false}
                name="Average Gap"
                isAnimationActive={lineAnimActive}
                animationDuration={900}
                animationEasing="ease-out"
              />
            )}


            <Line
              type="monotone"
              dataKey="karlin"
              stroke="#22c55e"
              strokeWidth={1.5}
              strokeDasharray="8 4"
              dot={false}
              name="Karlin O(T^-1/2)"
              opacity={0.8}
              isAnimationActive={lineAnimActive}
              animationDuration={900}
              animationEasing="ease-out"
            />

            <Line
              type="monotone"
              dataKey="wang"
              stroke="#ef4444"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
              name="Wang O(T^-1/3)"
              opacity={0.8}
              isAnimationActive={lineAnimActive}
              animationDuration={900}
              animationEasing="ease-out"
            />
          </LineChart>
        </ResponsiveContainer>
      </ZoomableChart>
      </motion.div>

      <motion.div variants={chartVariants} className="flex gap-4 justify-center flex-[1.5] min-h-0">
        <div className="flex-1 min-w-0 max-w-[50%] min-h-0">
          <ZoomableChart
            isZoomed={zoom.isZoomed}
            onResetZoom={zoomActions.resetZoom}
            height="100%"
            title="Convergence Rate (alpha)"
            fullDomain={fullDomain}
            zoomActions={zoomActions}
            chartMarginLeft={15}
            chartMarginRight={15}
          >
            {convergenceRateData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={convergenceRateData}
                  margin={{ top: 5, right: 15, left: 15, bottom: 5 }}
                  {...chartMouseProps}
                >
                  <CartesianGrid {...gridProps} />
                  <XAxis {...sharedXAxisProps} fontSize={9} />
                  <YAxis
                    domain={[-1, 0]}
                    stroke="#505050"
                    tickFormatter={(v: number) => v.toFixed(1)}
                    fontSize={9}
                    tick={axisTickStyle}
                    label={{ value: 'alpha', angle: -90, position: 'insideLeft', style: { fill: '#505050', fontSize: 9, fontFamily: "'JetBrains Mono', monospace" } }}
                  />
                  <Tooltip
                    content={<AlphaTooltipContent />}
                    defaultIndex={alphaTooltipIndex}
                  />

                  {brushStart != null && brushEnd != null && (
                    <ReferenceArea x1={brushStart} x2={brushEnd} strokeOpacity={0.3} fill="#4ade80" fillOpacity={0.1} />
                  )}

                  {selectedIterationValue > 0 && (
                    <ReferenceLine x={selectedIterationValue} stroke="#ffffff" strokeWidth={1} strokeDasharray="4 4" strokeOpacity={0.6} />
                  )}

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
                          isAnimationActive={lineAnimActive}
                          animationDuration={900}
                          animationEasing="ease-out"
                        />
                      );
                    })}

                  {showAverage && (
                    <Line type="monotone" dataKey="average" stroke="#fbbf24" strokeWidth={2} dot={false} isAnimationActive={lineAnimActive} animationDuration={900} animationEasing="ease-out" />
                  )}
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-muted font-mono">
                Need more data...
              </div>
            )}
          </ZoomableChart>
        </div>

        <div className="flex-1 min-w-0 max-w-[50%] min-h-0">
          <ZoomableChart
            isZoomed={zoom.isZoomed}
            onResetZoom={zoomActions.resetZoom}
            height="100%"
            title="Gap / Karlin Bound Ratio"
            fullDomain={fullDomain}
            zoomActions={zoomActions}
            chartMarginLeft={15}
            chartMarginRight={15}
          >
            {ratioData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={ratioData}
                  margin={{ top: 5, right: 15, left: 15, bottom: 5 }}
                  {...chartMouseProps}
                >
                  <CartesianGrid {...gridProps} />
                  <XAxis {...sharedXAxisProps} fontSize={9} />
                  <YAxis
                    stroke="#505050"
                    tickFormatter={(v: number) => v.toFixed(1)}
                    fontSize={9}
                    tick={axisTickStyle}
                    label={{ value: 'Ratio', angle: -90, position: 'insideLeft', style: { fill: '#505050', fontSize: 9, fontFamily: "'JetBrains Mono', monospace" } }}
                  />
                  <Tooltip
                    {...commonTooltipStyle}
                    formatter={formatRatioTooltip}
                    labelFormatter={(label) => `Iter: ${Number(label).toLocaleString()}`}
                    defaultIndex={ratioTooltipIndex}
                  />

                  {brushStart != null && brushEnd != null && (
                    <ReferenceArea x1={brushStart} x2={brushEnd} strokeOpacity={0.3} fill="#4ade80" fillOpacity={0.1} />
                  )}

                  {selectedIterationValue > 0 && (
                    <ReferenceLine x={selectedIterationValue} stroke="#ffffff" strokeWidth={1} strokeDasharray="4 4" strokeOpacity={0.6} />
                  )}

                  <ReferenceLine
                    y={1}
                    stroke="#22c55e"
                    strokeDasharray="8 4"
                    strokeWidth={1}
                    label={{ value: '1.0', position: 'right', fill: '#22c55e', fontSize: 9 }}
                  />

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
                          isAnimationActive={lineAnimActive}
                          animationDuration={900}
                          animationEasing="ease-out"
                        />
                      );
                    })}

                  {showAverage && (
                    <Line type="monotone" dataKey="average" stroke="#fbbf24" strokeWidth={2} dot={false} isAnimationActive={lineAnimActive} animationDuration={900} animationEasing="ease-out" />
                  )}
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-muted font-mono">
                Need more data...
              </div>
            )}
          </ZoomableChart>
        </div>
      </motion.div>

      {/* ── Gap / Wang Bound Ratio (toggleable) ────────────────────────── */}
      <motion.div variants={chartVariants} className="flex-shrink-0">
        <button
          onClick={() => setShowWangRatio(v => !v)}
          className={`text-xs px-3 py-1 rounded font-mono transition-colors ${
            showWangRatio
              ? 'bg-red-500/20 text-red-400 border border-red-500/40'
              : 'bg-gray-700/50 text-gray-400 border border-gray-600/40 hover:bg-gray-600/50'
          }`}
        >
          {showWangRatio ? 'Hide' : 'Show'} Gap / Wang Bound Ratio
        </button>
      </motion.div>

      {showWangRatio && (
        <motion.div variants={chartVariants} className="flex-[1.5] min-h-0">
          <ZoomableChart
            isZoomed={zoom.isZoomed}
            onResetZoom={zoomActions.resetZoom}
            height="100%"
            title="Gap / Wang Bound Ratio  (gap × T^{1/3})"
            fullDomain={fullDomain}
            zoomActions={zoomActions}
            chartMarginLeft={15}
            chartMarginRight={15}
          >
            {wangRatioData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={wangRatioData}
                  margin={{ top: 5, right: 15, left: 15, bottom: 5 }}
                  {...chartMouseProps}
                >
                  <CartesianGrid {...gridProps} />
                  <XAxis {...sharedXAxisProps} fontSize={9} />
                  <YAxis
                    stroke="#505050"
                    tickFormatter={(v: number) => v.toFixed(1)}
                    fontSize={9}
                    tick={axisTickStyle}
                    label={{ value: 'Ratio', angle: -90, position: 'insideLeft', style: { fill: '#505050', fontSize: 9, fontFamily: "'JetBrains Mono', monospace" } }}
                  />
                  <Tooltip
                    {...commonTooltipStyle}
                    formatter={formatRatioTooltip}
                    labelFormatter={(label) => `Iter: ${Number(label).toLocaleString()}`}
                    defaultIndex={wangRatioTooltipIndex}
                  />

                  {brushStart != null && brushEnd != null && (
                    <ReferenceArea x1={brushStart} x2={brushEnd} strokeOpacity={0.3} fill="#4ade80" fillOpacity={0.1} />
                  )}

                  {selectedIterationValue > 0 && (
                    <ReferenceLine x={selectedIterationValue} stroke="#ffffff" strokeWidth={1} strokeDasharray="4 4" strokeOpacity={0.6} />
                  )}

                  <ReferenceLine
                    y={1}
                    stroke="#ef4444"
                    strokeDasharray="8 4"
                    strokeWidth={1}
                    label={{ value: '1.0', position: 'right', fill: '#ef4444', fontSize: 9 }}
                  />

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
                          isAnimationActive={lineAnimActive}
                          animationDuration={900}
                          animationEasing="ease-out"
                        />
                      );
                    })}

                  {showAverage && (
                    <Line type="monotone" dataKey="average" stroke="#fbbf24" strokeWidth={2} dot={false} isAnimationActive={lineAnimActive} animationDuration={900} animationEasing="ease-out" />
                  )}
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-muted font-mono">
                Need more data...
              </div>
            )}
          </ZoomableChart>
        </motion.div>
      )}

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
          <motion.div variants={chartVariants} className="flex-[1.5] min-h-0">
          <BestResponseChart
            iterations={iterations}
            bestRowHistory={brRow}
            bestColHistory={brCol}
            matrixSize={matSize}
            selectedIterationIndex={selectedIterationIndex}
            logScale={logScale}
            gameLabel={label}
            domain={zoom.domain}
            onBrushZoom={zoomActions.setDomain}
            isZoomed={zoom.isZoomed}
            onResetZoom={zoomActions.resetZoom}
            zoomActions={zoomActions}
          />
          </motion.div>
        );
      })()}
    </motion.div>
  );
}

export default PlotPanel;
