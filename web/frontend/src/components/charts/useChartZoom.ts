/**
 * useChartZoom - Shared zoom state & smart downsampling for synchronized charts.
 *
 * Provides:
 *  - A shared [xMin, xMax] domain that all charts can subscribe to.
 *  - Per-chart brush (drag-to-zoom) mouse handlers.
 *  - Scroll-wheel zoom (centered on cursor %).
 *  - Drag-to-pan when zoomed in.
 *  - A downsample() utility that returns <= maxPoints visible in the current window.
 *  - Smart tick generation that produces "nice" round numbers at every zoom level.
 */

import { useState, useCallback, useRef } from "react";

// ── Public types ──────────────────────────────────────────────────────────────

export type Domain = [number, number] | null; // null = full range (auto)

export interface ZoomState {
  /** Current visible domain.  null = show everything. */
  domain: Domain;
  /** True when the user is actively dragging a brush selection. */
  isBrushing: boolean;
  /** X value where the brush started (pixel→data mapped externally). */
  brushStart: number | null;
  /** X value where the brush currently ends. */
  brushEnd: number | null;
  /** True when zoomed in (domain !== null). */
  isZoomed: boolean;
}

export interface ZoomActions {
  /** Begin a brush stroke at data-space value `x`. */
  startBrush: (x: number) => void;
  /** Update the in-progress brush end. */
  moveBrush: (x: number) => void;
  /** Commit the brush → zoom into selection. */
  endBrush: () => void;
  /** Reset zoom to full range. */
  resetZoom: () => void;
  /** Programmatically set domain. */
  setDomain: (d: Domain) => void;
  /**
   * Zoom in/out centered at a proportional position within the chart.
   * @param cursorFraction 0..1 horizontal position of the cursor in the chart area
   * @param zoomIn true = zoom in, false = zoom out
   * @param fullDomain the full data range [min, max] used for clamping
   */
  zoomAtPoint: (cursorFraction: number, zoomIn: boolean, fullDomain: [number, number]) => void;
  /**
   * Pan the current view by a fraction of the visible range.
   * Positive = shift right, negative = shift left.
   * @param deltaFraction signed fraction of the visible span to shift by
   * @param fullDomain the full data range [min, max] used for clamping
   */
  pan: (deltaFraction: number, fullDomain: [number, number]) => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ZOOM_FACTOR = 0.15; // 15% zoom per scroll tick
const MIN_SPAN = 5;       // minimum visible iteration range

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useChartZoom(): [ZoomState, ZoomActions] {
  const [domain, setDomainRaw] = useState<Domain>(null);
  const [brushStart, setBrushStart] = useState<number | null>(null);
  const [brushEnd, setBrushEnd] = useState<number | null>(null);
  const isBrushing = brushStart !== null;

  // Use a ref so zoomAtPoint/pan always see the latest domain without stale closures
  const domainRef = useRef<Domain>(null);
  const setDomain = useCallback((d: Domain) => {
    domainRef.current = d;
    setDomainRaw(d);
  }, []);

  const startBrush = useCallback((x: number) => {
    setBrushStart(x);
    setBrushEnd(x);
  }, []);

  const moveBrush = useCallback((x: number) => {
    setBrushEnd(x);
  }, []);

  const endBrush = useCallback(() => {
    if (brushStart !== null && brushEnd !== null) {
      const lo = Math.min(brushStart, brushEnd);
      const hi = Math.max(brushStart, brushEnd);
      // Only zoom if the selection spans a meaningful range
      if (hi - lo > 0) {
        setDomain([lo, hi]);
      }
    }
    setBrushStart(null);
    setBrushEnd(null);
  }, [brushStart, brushEnd, setDomain]);

  const resetZoom = useCallback(() => {
    setDomain(null);
    setBrushStart(null);
    setBrushEnd(null);
  }, [setDomain]);

  const zoomAtPoint = useCallback(
    (cursorFraction: number, zoomIn: boolean, fullDomain: [number, number]) => {
      const cur = domainRef.current ?? fullDomain;
      const span = cur[1] - cur[0];

      const factor = zoomIn ? (1 - ZOOM_FACTOR) : (1 + ZOOM_FACTOR);
      const newSpan = Math.max(MIN_SPAN, span * factor);

      // If zooming out beyond full range, reset
      if (newSpan >= fullDomain[1] - fullDomain[0]) {
        setDomain(null);
        return;
      }

      // Anchor the zoom at the cursor position
      const anchor = cur[0] + span * cursorFraction;
      let lo = anchor - newSpan * cursorFraction;
      let hi = anchor + newSpan * (1 - cursorFraction);

      // Clamp to full domain
      if (lo < fullDomain[0]) {
        lo = fullDomain[0];
        hi = lo + newSpan;
      }
      if (hi > fullDomain[1]) {
        hi = fullDomain[1];
        lo = hi - newSpan;
      }
      lo = Math.max(lo, fullDomain[0]);

      setDomain([lo, hi]);
    },
    [setDomain],
  );

  const pan = useCallback(
    (deltaFraction: number, fullDomain: [number, number]) => {
      const cur = domainRef.current;
      if (!cur) return; // can't pan when not zoomed
      const span = cur[1] - cur[0];
      const shift = span * deltaFraction;

      let lo = cur[0] + shift;
      let hi = cur[1] + shift;

      // Clamp
      if (lo < fullDomain[0]) {
        lo = fullDomain[0];
        hi = lo + span;
      }
      if (hi > fullDomain[1]) {
        hi = fullDomain[1];
        lo = hi - span;
      }

      setDomain([lo, hi]);
    },
    [setDomain],
  );

  const state: ZoomState = {
    domain,
    isBrushing,
    brushStart,
    brushEnd,
    isZoomed: domain !== null,
  };

  const actions: ZoomActions = {
    startBrush,
    moveBrush,
    endBrush,
    resetZoom,
    setDomain,
    zoomAtPoint,
    pan,
  };

  return [state, actions];
}

// ── Downsampling ──────────────────────────────────────────────────────────────

/**
 * Return a downsampled copy of `data` that contains at most `maxPoints` items
 * within the visible `domain`.  Keeps first & last visible points to avoid
 * visual edge clipping.
 */
export function downsampleData<T extends { iteration: number }>(
  data: T[],
  domain: Domain,
  maxPoints = 1000,
): T[] {
  if (data.length === 0) return data;

  // 1. Determine visible slice via binary search
  let startIdx = 0;
  let endIdx = data.length - 1;

  if (domain) {
    const [lo, hi] = domain;
    // find first index >= lo
    startIdx = lowerBound(data, lo);
    // find last index <= hi
    endIdx = upperBound(data, hi);
  }

  const visibleLen = endIdx - startIdx + 1;
  if (visibleLen <= maxPoints) {
    return data.slice(startIdx, endIdx + 1);
  }

  // 2. Take every Nth point + always include first & last
  const step = Math.ceil(visibleLen / maxPoints);
  const result: T[] = [];

  for (let i = startIdx; i <= endIdx; i += step) {
    result.push(data[i]);
  }

  // Ensure last visible point is included
  if (result[result.length - 1] !== data[endIdx]) {
    result.push(data[endIdx]);
  }

  return result;
}

function lowerBound<T extends { iteration: number }>(data: T[], target: number): number {
  let lo = 0;
  let hi = data.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (data[mid].iteration < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function upperBound<T extends { iteration: number }>(data: T[], target: number): number {
  let lo = 0;
  let hi = data.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    if (data[mid].iteration > target) hi = mid - 1;
    else lo = mid;
  }
  return lo;
}

// ── Smart tick generation ─────────────────────────────────────────────────────

/**
 * Generate ~`count` "nice" round tick values for the given domain.
 * Mimics d3-scale's .ticks() logic.
 */
export function niceIterationTicks(
  domain: Domain,
  fullMax: number,
  count = 6,
): number[] {
  const lo = domain ? domain[0] : 0;
  const hi = domain ? domain[1] : fullMax;
  if (hi <= lo) return [lo];

  const span = hi - lo;
  const rawStep = span / count;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const normalized = rawStep / magnitude;

  let niceStep: number;
  if (normalized <= 1.5) niceStep = 1 * magnitude;
  else if (normalized <= 3.5) niceStep = 2 * magnitude;
  else if (normalized <= 7.5) niceStep = 5 * magnitude;
  else niceStep = 10 * magnitude;

  // Ensure step is at least 1
  niceStep = Math.max(1, Math.round(niceStep));

  const start = Math.ceil(lo / niceStep) * niceStep;
  const ticks: number[] = [];
  for (let v = start; v <= hi; v += niceStep) {
    ticks.push(v);
  }
  return ticks;
}

/**
 * Format an iteration value compactly.
 * 1200 → "1.2k", 15000 → "15k", 500 → "500"
 */
export function formatIterationTick(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value % 1_000 === 0 ? 0 : 1)}k`;
  return String(Math.round(value));
}
