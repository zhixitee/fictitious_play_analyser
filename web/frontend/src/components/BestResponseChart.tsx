import React, { useMemo, useState, useCallback, useEffect } from "react";
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

const ROW_COLOR = "#86efac";
const COL_COLOR = "#fca5a5";
const ROW_STROKE = "#14532d";
const COL_STROKE = "#7f1d1d";

interface BestResponseChartProps {
  iterations: number[];
  bestRowHistory: number[];  // best response index per iteration for one game
  bestColHistory: number[];  // best response index per iteration for one game
  matrixSize: number;        // N (number of actions)
  selectedIterationIndex?: number;
  pinSelectionOverlay?: boolean;
  logScale?: boolean;
  gameLabel?: string;
  domain?: Domain;
  onBrushZoom?: (domain: Domain) => void;
  isZoomed?: boolean;
  onResetZoom?: () => void;
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
  pinSelectionOverlay = false,
  logScale = false,
  gameLabel,
  domain = null,
  onBrushZoom,
  isZoomed = false,
  onResetZoom,
  zoomActions,
}: BestResponseChartProps) {
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

  // Build full data, then downsample
  const rawData = useMemo(() => {
    if (!iterations.length || !bestRowHistory.length) return { row: [] as DataPoint[], col: [] as DataPoint[] };

    const len = Math.min(iterations.length, bestRowHistory.length, bestColHistory.length);
    const rowPts: DataPoint[] = [];
    const colPts: DataPoint[] = [];

    const OFFSET = 0.3; // vertical jitter so row/col dots are more clearly separated
    for (let i = 0; i < len; i++) {
      rowPts.push({ iteration: iterations[i], action: bestRowHistory[i] + OFFSET });
      colPts.push({ iteration: iterations[i], action: bestColHistory[i] - OFFSET });
    }

    return { row: rowPts, col: colPts };
  }, [iterations, bestRowHistory, bestColHistory]);

  const rowData = useMemo(() => downsampleData(rawData.row, domain, MAX_POINTS), [rawData.row, domain]);
  const colData = useMemo(() => downsampleData(rawData.col, domain, MAX_POINTS), [rawData.col, domain]);

  const selectedIterationValue = useMemo(() => {
    if (!iterations.length) return 0;
    const idx = Math.min(selectedIterationIndex, iterations.length - 1);
    return iterations[idx] || 0;
  }, [iterations, selectedIterationIndex]);

  const [displayIterationValue, setDisplayIterationValue] = useState(selectedIterationValue);

  useEffect(() => {
    if (!pinSelectionOverlay) {
      setDisplayIterationValue(selectedIterationValue);
      return;
    }

    if (selectedIterationValue <= 0) {
      setDisplayIterationValue(0);
      return;
    }

    let raf = 0;
    const animate = () => {
      setDisplayIterationValue((prev) => {
        const delta = selectedIterationValue - prev;
        if (Math.abs(delta) <= 0.5) {
          return selectedIterationValue;
        }
        raf = requestAnimationFrame(animate);
        return prev + delta * 0.32;
      });
    };

    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [selectedIterationValue, pinSelectionOverlay]);

  const fullMax = iterations.length > 0 ? iterations[iterations.length - 1] : 1;
  const xDomain: [number | string, number | string] = domain
    ? [domain[0], domain[1]]
    : logScale ? ["auto", "auto"] : [0, "auto"];
  const xTicks = useMemo(
    () => niceIterationTicks(domain, fullMax),
    [domain, fullMax],
  );

  const alwaysTicks = useMemo(
    () => niceIterationTicks(null, fullMax),
    [fullMax],
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
            ticks={isZoomed ? xTicks : logScale ? undefined : alwaysTicks}
            allowDataOverflow={true}
            tick={axisTickStyle}
            name="Iteration"
          />
          <YAxis
            dataKey="action"
            type="number"
            stroke="#505050"
            domain={[-0.4, Math.max(matrixSize - 1, 1) + 0.4]}
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
              color: "#f3f4f6",
              padding: "8px 12px",
              boxShadow: "0 4px 12px rgba(0, 0, 0, 0.5)",
            }}
            wrapperStyle={{ zIndex: 50, opacity: 1 }}
            labelStyle={{ color: "#a0a0a0", fontFamily: "'JetBrains Mono', monospace", fontSize: 10 }}
            itemStyle={{ color: "#f3f4f6", fontFamily: "'JetBrains Mono', monospace" }}
            formatter={(value: number, name: string) => [Math.round(value), name === "row" ? "Row BR" : "Col BR"]}
            labelFormatter={(label) => `Iter: ${Number(label).toLocaleString()}`}
          />

          {brushStart != null && brushEnd != null && (
            <ReferenceArea x1={brushStart} x2={brushEnd} strokeOpacity={0.3} fill="#22c55e" fillOpacity={0.1} />
          )}

          {pinSelectionOverlay && displayIterationValue > 0 && (
            <ReferenceLine x={displayIterationValue} stroke="#ffffff" strokeWidth={1} strokeDasharray="4 4" strokeOpacity={0.6} />
          )}

          <Scatter
            data={rowData}
            fill={ROW_COLOR}
            stroke={ROW_STROKE}
            strokeWidth={0.8}
            opacity={0.75}
            name="row"
            dataKey="action"
            shape="circle"
            legendType="none"
            isAnimationActive={false}
          />
          <Scatter
            data={colData}
            fill={COL_COLOR}
            stroke={COL_STROKE}
            strokeWidth={0.8}
            opacity={0.75}
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
