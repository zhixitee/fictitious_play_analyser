import { useState, useCallback, useRef } from "react";

export type Domain = [number, number] | null;

export interface ZoomState {
  domain: Domain;
  isBrushing: boolean;
  brushStart: number | null;
  brushEnd: number | null;
  isZoomed: boolean;
}

export interface ZoomActions {
  startBrush: (x: number) => void;
  moveBrush: (x: number) => void;
  endBrush: () => void;
  resetZoom: () => void;
  setDomain: (d: Domain) => void;
  zoomAtPoint: (cursorFraction: number, zoomIn: boolean, fullDomain: [number, number]) => void;
  pan: (deltaFraction: number, fullDomain: [number, number]) => void;
}

const ZOOM_FACTOR = 0.15;
const MIN_SPAN = 5;

export function useChartZoom(): [ZoomState, ZoomActions] {
  const [domain, setDomainRaw] = useState<Domain>(null);
  const [brushStart, setBrushStart] = useState<number | null>(null);
  const [brushEnd, setBrushEnd] = useState<number | null>(null);
  const isBrushing = brushStart !== null;

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

      if (newSpan >= fullDomain[1] - fullDomain[0]) {
        setDomain(null);
        return;
      }

      const anchor = cur[0] + span * cursorFraction;
      let lo = anchor - newSpan * cursorFraction;
      let hi = anchor + newSpan * (1 - cursorFraction);

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
      if (!cur) return;
      const span = cur[1] - cur[0];
      const shift = span * deltaFraction;

      let lo = cur[0] + shift;
      let hi = cur[1] + shift;

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

// Returns at most maxPoints items within the visible domain, preserving endpoints.
export function downsampleData<T extends { iteration: number }>(
  data: T[],
  domain: Domain,
  maxPoints = 1000,
): T[] {
  if (data.length === 0) return data;

  let startIdx = 0;
  let endIdx = data.length - 1;

  if (domain) {
    const [lo, hi] = domain;
    startIdx = lowerBound(data, lo);
    endIdx = upperBound(data, hi);
  }

  const visibleLen = endIdx - startIdx + 1;
  if (visibleLen <= maxPoints) {
    return data.slice(startIdx, endIdx + 1);
  }

  const step = Math.ceil(visibleLen / maxPoints);
  const result: T[] = [];

  for (let i = startIdx; i <= endIdx; i += step) {
    result.push(data[i]);
  }

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

// Generates ~count "nice" round tick values (d3-style).
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

  niceStep = Math.max(1, Math.round(niceStep));

  const start = Math.ceil(lo / niceStep) * niceStep;
  const ticks: number[] = [];
  for (let v = start; v <= hi; v += niceStep) {
    ticks.push(v);
  }
  return ticks;
}

export function formatIterationTick(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value % 1_000 === 0 ? 0 : 1)}k`;
  return String(Math.round(value));
}
