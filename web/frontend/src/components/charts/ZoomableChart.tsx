import React, { useRef, useCallback, useState, type ReactNode } from "react";
import { RotateCcw, Move, ZoomIn, ZoomOut } from "lucide-react";
import type { ZoomActions } from "./useChartZoom";

// ── Props ─────────────────────────────────────────────────────────────────────

interface ZoomableChartProps {
  /** Whether the chart is currently zoomed in */
  isZoomed: boolean;
  /** Called when the user clicks "Reset" */
  onResetZoom: () => void;
  /** Chart height – px number or CSS string like '100%' */
  height: number | string;
  /** Optional title (top-left label) */
  title?: string;
  /** Optional right-side legend / badge elements */
  legend?: ReactNode;
  /** The Recharts ResponsiveContainer + chart */
  children: ReactNode;
  /** Extra className on outer div */
  className?: string;
  /** Full data domain [min, max] for clamping zoom/pan. Required for scroll+drag. */
  fullDomain?: [number, number];
  /** Zoom actions from useChartZoom – needed for scroll zoom & drag pan */
  zoomActions?: ZoomActions;
  /** Recharts chart left margin (px) to compute cursor fraction correctly */
  chartMarginLeft?: number;
  /** Recharts chart right margin (px) */
  chartMarginRight?: number;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ZoomableChart({
  isZoomed,
  onResetZoom,
  height,
  title,
  legend,
  children,
  className = "",
  fullDomain,
  zoomActions,
  chartMarginLeft = 20,
  chartMarginRight = 30,
}: ZoomableChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const [isPanning, setIsPanning] = useState(false);
  const panStartX = useRef<number>(0);

  // Maps pixel X to a 0..1 fraction of the chart plotting area (excluding margins)
  const pixelToFraction = useCallback(
    (clientX: number): number => {
      const el = containerRef.current;
      if (!el) return 0.5;
      const rect = el.getBoundingClientRect();
      const plotLeft = chartMarginLeft;
      const plotRight = rect.width - chartMarginRight;
      const plotWidth = plotRight - plotLeft;
      if (plotWidth <= 0) return 0.5;
      const x = clientX - rect.left - plotLeft;
      return Math.max(0, Math.min(1, x / plotWidth));
    },
    [chartMarginLeft, chartMarginRight],
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (!zoomActions || !fullDomain) return;
      e.preventDefault();
      const fraction = pixelToFraction(e.clientX);
      const zoomIn = e.deltaY < 0;
      zoomActions.zoomAtPoint(fraction, zoomIn, fullDomain);
    },
    [zoomActions, fullDomain, pixelToFraction],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!isZoomed || !zoomActions || !fullDomain) return;
      // Middle-click or shift+left-click to pan (left-click reserved for brush-to-zoom)
      if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
        e.preventDefault();
        setIsPanning(true);
        panStartX.current = e.clientX;
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      }
    },
    [isZoomed, zoomActions, fullDomain],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isPanning || !zoomActions || !fullDomain || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const plotWidth = rect.width - chartMarginLeft - chartMarginRight;
      if (plotWidth <= 0) return;

      const dx = e.clientX - panStartX.current;
      const deltaFraction = -dx / plotWidth;
      panStartX.current = e.clientX;
      zoomActions.pan(deltaFraction, fullDomain);
    },
    [isPanning, zoomActions, fullDomain, chartMarginLeft, chartMarginRight],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (isPanning) {
        setIsPanning(false);
        (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
      }
    },
    [isPanning],
  );

  const handleZoomIn = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!zoomActions || !fullDomain) return;
      zoomActions.zoomAtPoint(0.5, true, fullDomain);
    },
    [zoomActions, fullDomain],
  );

  const handleZoomOut = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!zoomActions || !fullDomain) return;
      zoomActions.zoomAtPoint(0.5, false, fullDomain);
    },
    [zoomActions, fullDomain],
  );

  return (
    <div className={`zoomable-chart h-full flex flex-col ${className}`}>
      {(title || legend) && (
        <div className="flex items-center justify-between px-2 mb-1 flex-shrink-0">
          {title && (
            <div className="text-xs font-semibold text-gray-400 font-mono tracking-wide uppercase">
              {title}
            </div>
          )}
          {legend && <div className="flex gap-3 text-xs">{legend}</div>}
        </div>
      )}

      <div
        ref={containerRef}
        className={`relative flex-1 min-h-0 ${isPanning ? "cursor-grabbing" : isZoomed ? "cursor-grab" : ""}`}
        style={typeof height === 'number' ? { height } : undefined}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {children}

        <div className="absolute bottom-2 left-2 z-20 flex items-center gap-1">
          <button
            onClick={handleZoomIn}
            className="flex items-center justify-center w-6 h-6 rounded
                       text-[10px] font-mono
                       bg-gray-800/70 hover:bg-gray-700/90
                       text-gray-400 hover:text-gray-200
                       border border-gray-600/40 hover:border-gray-500/60
                       backdrop-blur-sm transition-all duration-150
                       select-none cursor-pointer"
            title="Zoom in"
          >
            <ZoomIn size={12} />
          </button>
          <button
            onClick={handleZoomOut}
            disabled={!isZoomed}
            className="flex items-center justify-center w-6 h-6 rounded
                       text-[10px] font-mono
                       bg-gray-800/70 hover:bg-gray-700/90
                       text-gray-400 hover:text-gray-200
                       border border-gray-600/40 hover:border-gray-500/60
                       backdrop-blur-sm transition-all duration-150
                       select-none cursor-pointer
                       disabled:opacity-30 disabled:cursor-default"
            title="Zoom out"
          >
            <ZoomOut size={12} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onResetZoom();
            }}
            disabled={!isZoomed}
            className="flex items-center justify-center w-6 h-6 rounded
                       text-[10px] font-mono
                       bg-gray-800/70 hover:bg-gray-700/90
                       text-gray-400 hover:text-gray-200
                       border border-gray-600/40 hover:border-gray-500/60
                       backdrop-blur-sm transition-all duration-150
                       select-none cursor-pointer
                       disabled:opacity-30 disabled:cursor-default"
            title="Reset zoom"
          >
            <RotateCcw size={10} />
          </button>
        </div>

        {isZoomed && !isPanning && (
          <div className="absolute top-1 right-2 z-10 text-gray-600 pointer-events-none"
               title="Shift+drag to pan, scroll to zoom">
            <Move size={12} />
          </div>
        )}
      </div>
    </div>
  );
}

export default ZoomableChart;
