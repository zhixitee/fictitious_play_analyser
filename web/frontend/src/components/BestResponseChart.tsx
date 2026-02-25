/**
 * Best Response Dynamics Chart
 * 
 * Visualizes which strategy index was played at each iteration.
 * For counter-examples (e.g., Wang 2025 with lexicographic ties),
 * this reveals cyclic "staircase" patterns (1 -> 2 -> 3 -> ...).
 * For random tie-breaking, this should appear as noise.
 * 
 * Features:
 *  - Synchronized zoom domain from parent
 *  - Brush-to-zoom with ReferenceArea
 *  - Dynamic downsampling for performance
 *  - Hex.tech monospace aesthetic
 */

import React, { useMemo, useState, useCallback } from "react";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
} from "recharts";
import { ZoomableChart } from "./charts/ZoomableChart";
import { downsampleData, niceIterationTicks, formatIterationTick } from "./charts/useChartZoom";
import type { Domain, ZoomActions } from "./charts/useChartZoom";

// Colors for row and column players
const ROW_COLOR = "#22c55e"; // green
const COL_COLOR = "#ef4444"; // red

interface BestResponseChartProps {
  iterations: number[];
  bestRowHistory: number[];  // best response index per iteration for one game
  bestColHistory: number[];  // best response index per iteration for one game
  matrixSize: number;        // N (number of actions)
  selectedIterationIndex?: number;
  logScale?: boolean;
  gameLabel?: string;
  /** Synchronized zoom domain from parent (null = full range) */
  domain?: Domain;
  /** Callback to set zoom domain (synchronized with other charts) */
  onBrushZoom?: (domain: Domain) => void;
  /** Whether the chart is currently zoomed in */
  isZoomed?: boolean;
  /** Reset zoom callback */
  onResetZoom?: () => void;
  /** Full zoom actions for scroll-wheel zoom & drag-to-pan */
  zoomActions?: ZoomActions;
}

interface DataPoint {
  iteration: number;
  action: number;
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
  domain = null,
  onBrushZoom,
  isZoomed = false,
  onResetZoom,
  zoomActions,
}: BestResponseChartProps) {
  // Brush state for this chart
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
    if (brushStart != null && brushEnd != null && onBrushZoom) {
      const lo = Math.min(Number(brushStart), Number(brushEnd));
      const hi = Math.max(Number(brushStart), Number(brushEnd));
      if (hi > lo) {
        onBrushZoom([lo, hi]);
      }
    }
    setBrushStart(null);
    setBrushEnd(null);
  }, [brushStart, brushEnd, onBrushZoom]);

  // Build full data, then downsample to visible domain
  const rawData = useMemo(() => {
    if (!iterations.length || !bestRowHistory.length) return { row: [] as DataPoint[], col: [] as DataPoint[] };

    const len = Math.min(iterations.length, bestRowHistory.length, bestColHistory.length);
    const rowPts: DataPoint[] = [];
    const colPts: DataPoint[] = [];

    const OFFSET = 0.22; // vertical offset so row sits slightly above col
    for (let i = 0; i < len; i++) {
      rowPts.push({ iteration: iterations[i], action: bestRowHistory[i] + OFFSET });
      colPts.push({ iteration: iterations[i], action: bestColHistory[i] - OFFSET });
    }

    return { row: rowPts, col: colPts };
  }, [iterations, bestRowHistory, bestColHistory]);

  // Downsample within visible domain
  const rowData = useMemo(() => downsampleData(rawData.row, domain, MAX_POINTS), [rawData.row, domain]);
  const colData = useMemo(() => downsampleData(rawData.col, domain, MAX_POINTS), [rawData.col, domain]);

  const selectedIterationValue = useMemo(() => {
    if (!iterations.length) return 0;
    const idx = Math.min(selectedIterationIndex, iterations.length - 1);
    return iterations[idx] || 0;
  }, [iterations, selectedIterationIndex]);

  const fullMax = iterations.length > 0 ? iterations[iterations.length - 1] : 1;
  const xDomain: [number | string, number | string] = domain
    ? [domain[0], domain[1]]
    : logScale ? ["auto", "auto"] : [0, "auto"];
  const xTicks = useMemo(
    () => niceIterationTicks(domain, fullMax),
    [domain, fullMax],
  );

  const axisTickStyle = {
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
  };

  if (!rawData.row.length) {
    return (
      <div className="flex items-center justify-center text-muted h-full">
        <div className="text-center text-sm font-mono">
          <div className="text-2xl mb-1">Best Response</div>
          <div>Start a simulation to see best response dynamics</div>
        </div>
      </div>
    );
  }

  return (
    <ZoomableChart
      isZoomed={isZoomed}
      onResetZoom={onResetZoom || (() => {})}
      height="100%"
      title={`Best Response Dynamics${gameLabel ? ` -- ${gameLabel}` : ""}`}
      fullDomain={[iterations[0] || 0, fullMax]}
      zoomActions={zoomActions}
      chartMarginLeft={15}
      chartMarginRight={15}
      legend={
        <>
          <span className="flex items-center gap-1 font-mono">
            <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: ROW_COLOR }} />
            Row
          </span>
          <span className="flex items-center gap-1 font-mono">
            <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: COL_COLOR }} />
            Col
          </span>
        </>
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart
          margin={{ top: 5, right: 15, left: 15, bottom: 5 }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#2e2e32" strokeOpacity={0.5} />
          <XAxis
            dataKey="iteration"
            type="number"
            stroke="#505050"
            tickFormatter={formatIterationTick}
            fontSize={9}
            scale={logScale && !isZoomed ? "log" : "auto"}
            domain={xDomain}
            ticks={isZoomed ? xTicks : undefined}
            allowDataOverflow={true}
            tick={axisTickStyle}
            name="Iteration"
          />
          <YAxis
            dataKey="action"
            type="number"
            stroke="#505050"
            domain={[-0.3, Math.max(matrixSize - 1, 1) + 0.3]}
            ticks={Array.from({ length: matrixSize }, (_, i) => i)}
            tickFormatter={(v: number) => String(v)}
            fontSize={9}
            tick={axisTickStyle}
            label={{ value: "Action", angle: -90, position: "insideLeft", style: { fill: "#505050", fontSize: 9, fontFamily: "'JetBrains Mono', monospace" } }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "rgba(22, 23, 25, 1)",
              border: "1px solid #3e3e42",
              borderRadius: "6px",
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11,
              padding: "8px 12px",
              boxShadow: "0 4px 12px rgba(0, 0, 0, 0.5)",
            }}
            wrapperStyle={{ zIndex: 50, opacity: 1 }}
            labelStyle={{ color: "#a0a0a0", fontFamily: "'JetBrains Mono', monospace", fontSize: 10 }}
            formatter={(value: number, name: string) => [Math.round(value), name === "row" ? "Row BR" : "Col BR"]}
            labelFormatter={(label) => `Iter: ${Number(label).toLocaleString()}`}
          />

          {/* Brush selection area */}
          {brushStart != null && brushEnd != null && (
            <ReferenceArea x1={brushStart} x2={brushEnd} strokeOpacity={0.3} fill="#22c55e" fillOpacity={0.1} />
          )}

          {/* Selected iteration reference line */}
          {selectedIterationValue > 0 && (
            <ReferenceLine x={selectedIterationValue} stroke="#ffffff" strokeWidth={1} strokeDasharray="4 4" strokeOpacity={0.6} />
          )}

          <Scatter
            data={rowData}
            fill={ROW_COLOR}
            opacity={0.6}
            name="row"
            dataKey="action"
            shape="circle"
            legendType="none"
            isAnimationActive={false}
          />
          <Scatter
            data={colData}
            fill={COL_COLOR}
            opacity={0.6}
            name="col"
            dataKey="action"
            shape="diamond"
            legendType="none"
            isAnimationActive={false}
          />
        </ScatterChart>
      </ResponsiveContainer>
    </ZoomableChart>
  );
}

export default BestResponseChart;
