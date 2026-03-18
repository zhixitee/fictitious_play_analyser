/// <reference lib="webworker" />

import { createSolver, stepChunk, validateChunkResult } from "../core/solver";
import type { ValidationViolation } from "../core/solver";
import { getRandomZeroSumGame, getWang2025, getWang2025Augmented, Matrix } from "../core/games";
import { mulberry32 } from "../core/rng";
import { computeSimulationSummary, SimulationSummary } from "../core/stats";
import type { TieBreakingRule, InitializationMode } from "../types/simulation";

export type SimMode = "random" | "mixed" | "custom" | "wang" | "wang_plus" | "wang10";

export interface SimConfig {
  mode: SimMode;
  iterations: number;
  chunk: number;
  batch: number;
  sizes: number[];       // for mixed mode
  sizeN: number;         // for random mode (2..10)
  seed?: number;         // optional seed
  customMatrix?: Matrix; // for custom mode
  tieBreaking: TieBreakingRule;
  initialization: InitializationMode;
}

export interface WorkerStartMessage {
  type: "start";
  config: SimConfig;
}

export interface WorkerStopMessage {
  type: "stop";
}

export type WorkerInMessage = WorkerStartMessage | WorkerStopMessage;

export interface WorkerUpdateMessage {
  type: "update";
  iteration: number;
  // Delta arrays – only new data since last update
  deltaIterations: number[];
  deltaAllGaps: number[][];        // [game][newEntries]
  deltaAvgGaps: number[];
  deltaRowStrategies: number[][][]; // [game][newChunks][action]
  deltaColStrategies: number[][][]; // [game][newChunks][action]
  deltaBestRowHistory: number[][];  // [game][newEntries]
  deltaBestColHistory: number[][];  // [game][newEntries]
  // Sent once on first update
  matrices: Matrix[] | null;
  seed: number;
  avgGap: number;
  progress: number;
  validation: { totalChecks: number; violations: ValidationViolation[] } | null;
}

export interface WorkerFinalizingMessage {
  type: "finalizing";
}

export interface WorkerDoneMessage {
  type: "done";
  summary: SimulationSummary;
  matrices: Matrix[];
  seed: number;
  validation: { totalChecks: number; violations: ValidationViolation[] };
}

export interface WorkerErrorMessage {
  type: "error";
  error: string;
}

export type WorkerOutMessage = WorkerUpdateMessage | WorkerFinalizingMessage | WorkerDoneMessage | WorkerErrorMessage;

let running = false;

self.onmessage = (e: MessageEvent<WorkerInMessage>) => {
  const msg = e.data;
  
  if (msg.type === "stop") {
    running = false;
    return;
  }
  
  if (msg.type === "start") {
    runSimulation(msg.config);
  }
};

function makeMatrices(cfg: SimConfig): { matrices: Matrix[]; seed: number } {
  const seed = cfg.seed ?? Math.floor(Math.random() * 1e9);
  const matrices: Matrix[] = [];

  if (cfg.mode === "custom") {
    matrices.push(cfg.customMatrix ?? [
      [0, -1],
      [1, 0],
    ]);
    return { matrices, seed };
  }

  if (cfg.mode === "wang") {
    matrices.push(getWang2025());
    return { matrices, seed };
  }

  if (cfg.mode === "wang_plus") {
    matrices.push(getWang2025());
    return { matrices, seed };
  }

  if (cfg.mode === "wang10") {
    matrices.push(getWang2025Augmented());
    return { matrices, seed };
  }

  if (cfg.mode === "mixed") {
    const sizes = cfg.sizes.length > 0 ? cfg.sizes : [3, 5, 7, 10];
    for (let i = 0; i < cfg.batch; i++) {
      const n = sizes[i % sizes.length];
      matrices.push(getRandomZeroSumGame(n, mulberry32(seed + i)));
    }
    return { matrices, seed };
  }

  for (let i = 0; i < cfg.batch; i++) {
    matrices.push(getRandomZeroSumGame(cfg.sizeN, mulberry32(seed + i)));
  }
  return { matrices, seed };
}

/** In-place keep-every-other-element for adaptive downsampling in unlimited mode. */
function thinArray<T>(arr: T[]): void {
  let write = 0;
  for (let read = 0; read < arr.length; read += 2) {
    arr[write++] = arr[read];
  }
  arr.length = write;
}

function runSimulation(cfg: SimConfig) {
  running = true;
  const startTime = performance.now();

  try {
    const { matrices, seed } = makeMatrices(cfg);

    // Separate RNG streams: one for initialization, one for runtime tie-breaking
    const solversFixed = matrices.map((m, i) => {
      const initRng = mulberry32(seed + 500000 + i);
      const tieRng = mulberry32(seed + 1000000 + i);
      const solver = createSolver(m, {
        tieBreaking: cfg.tieBreaking,
        initialization: cfg.initialization,
        symmetric: cfg.mode === "wang" || cfg.mode === "wang_plus" || cfg.mode === "wang10",
        rng: initRng,
      });
      solver.config.rng = tieRng;
      return solver;
    });
    
    const totalIter = cfg.iterations;
    const chunkSize = cfg.chunk;

    // ── Downsampling: cap stored history to ~50k points to avoid OOM ──────
    const MAX_HISTORY_POINTS = 50_000;
    const isUnlimited = totalIter >= Number.MAX_SAFE_INTEGER;
    let sampleInterval = isUnlimited
      ? 1
      : Math.max(1, Math.ceil(totalIter / MAX_HISTORY_POINTS));

    const allIters: number[] = [];
    const allGaps: number[][] = matrices.map(() => []);
    const avgGaps: number[] = [];
    const rowStrategies: number[][][] = matrices.map(() => []);
    const colStrategies: number[][][] = matrices.map(() => []);
    const bestRowHistory: number[][] = matrices.map(() => []);
    const bestColHistory: number[][] = matrices.map(() => []);

    // Delta buffers – flushed on each UI update
    let dIters: number[] = [];
    let dGaps: number[][] = matrices.map(() => []);
    let dAvg: number[] = [];
    let dRowStrat: number[][][] = matrices.map(() => []);
    let dColStrat: number[][][] = matrices.map(() => []);
    let dBestRow: number[][] = matrices.map(() => []);
    let dBestCol: number[][] = matrices.map(() => []);
    let sentMatrices = false;

    let totalValidationChecks = 0;
    const allViolations: ValidationViolation[] = [];
    let dViolations: ValidationViolation[] = [];
    let dChecks = 0;

    let current = 0;
    let lastUpdateTime = startTime;
    const updateInterval = 50; // ms between UI updates

    while (running && current < totalIter) {
      const step = Math.min(chunkSize, totalIter - current);
      const isLastChunk = current + step >= totalIter;

      // Temp storage for this chunk's gaps (for avg computation without full history)
      const chunkGapResults: Float64Array[] = [];

      for (let i = 0; i < solversFixed.length; i++) {
        const chunkResult = stepChunk(solversFixed[i], step);
        const { iters, gaps, finalRowStrategy, finalColStrategy, bestRowHistory: brRow, bestColHistory: brCol } = chunkResult;
        chunkGapResults.push(gaps);

        // Validate invariants for this chunk
        const vResult = validateChunkResult(solversFixed[i], chunkResult);
        totalValidationChecks += vResult.checks;
        dChecks += vResult.checks;
        for (const v of vResult.violations) {
          const tagged = { ...v, detail: `[Game ${i + 1}] ${v.detail}` };
          allViolations.push(tagged);
          dViolations.push(tagged);
        }

        const expectedFirstStepTie = cfg.mode === "wang10" && current === 0 ? 1 : 0;
        const effRowTies = Math.max(0, chunkResult.rowTieCount - expectedFirstStepTie);
        const effColTies = Math.max(0, chunkResult.colTieCount - expectedFirstStepTie);

        if ((cfg.mode === "wang" || cfg.mode === "wang_plus" || cfg.mode === "wang10") &&
            (effRowTies > 0 || effColTies > 0)) {
          const tieViolation: ValidationViolation = {
            iteration: current + step,
            check: "tie_detected",
            detail:
              `[Game ${i + 1}] ties detected in chunk: ` +
              `row=${effRowTies} (max tie size=${chunkResult.maxRowTieSize}), ` +
              `col=${effColTies} (max tie size=${chunkResult.maxColTieSize})` +
              (cfg.mode === "wang10" && current === 0 ? " [excluding expected first-step tie]" : ""),
          };
          allViolations.push(tieViolation);
          dViolations.push(tieViolation);
        }
        
        // Only push iteration numbers once (same for all games)
        if (i === 0) {
          for (let k = 0; k < iters.length; k++) {
            const globalIdx = current + k;
            if (globalIdx % sampleInterval === 0 || (isLastChunk && k === step - 1)) {
              allIters.push(iters[k]);
              dIters.push(iters[k]);
            }
          }
        }
        
        for (let k = 0; k < gaps.length; k++) {
          const globalIdx = current + k;
          if (globalIdx % sampleInterval === 0 || (isLastChunk && k === step - 1)) {
            allGaps[i].push(gaps[k]);
            dGaps[i].push(gaps[k]);
          }
        }
        
        for (let k = 0; k < brRow.length; k++) {
          const globalIdx = current + k;
          if (globalIdx % sampleInterval === 0 || (isLastChunk && k === step - 1)) {
            bestRowHistory[i].push(brRow[k]);
            bestColHistory[i].push(brCol[k]);
            dBestRow[i].push(brRow[k]);
            dBestCol[i].push(brCol[k]);
          }
        }
        
        // Sample strategies at the same rate as other arrays (one per chunk, but only sampled chunks)
        const chunkEndIdx = current + step - 1;
        if (chunkEndIdx % sampleInterval === 0 || isLastChunk) {
          const rowArr = Array.from(finalRowStrategy);
          const colArr = Array.from(finalColStrategy);
          rowStrategies[i].push(rowArr);
          colStrategies[i].push(colArr);
          dRowStrat[i].push(rowArr);
          dColStrat[i].push(colArr);
        }
      }

      // Compute avg gaps only for sampled iterations
      for (let k = 0; k < step; k++) {
        const globalIdx = current + k;
        if (globalIdx % sampleInterval === 0 || (isLastChunk && k === step - 1)) {
          let sum = 0;
          for (let g = 0; g < chunkGapResults.length; g++) {
            sum += chunkGapResults[g][k];
          }
          const avg = sum / chunkGapResults.length;
          avgGaps.push(avg);
          dAvg.push(avg);
        }
      }

      current += step;

      // Adaptive thinning for unlimited mode: halve stored points when cap exceeded
      if (isUnlimited && allIters.length > MAX_HISTORY_POINTS) {
        sampleInterval *= 2;
        thinArray(allIters);
        thinArray(avgGaps);
        for (let gi = 0; gi < matrices.length; gi++) {
          thinArray(allGaps[gi]);
          thinArray(bestRowHistory[gi]);
          thinArray(bestColHistory[gi]);
          thinArray(rowStrategies[gi]);
          thinArray(colStrategies[gi]);
        }
      }

      const now = performance.now();
      if (now - lastUpdateTime >= updateInterval || current >= totalIter) {
        lastUpdateTime = now;
        
        // Current avg gap from latest chunk (for live display, not just sampled)
        let currentAvgGap = 0;
        for (let g = 0; g < chunkGapResults.length; g++) {
          currentAvgGap += chunkGapResults[g][step - 1];
        }
        currentAvgGap /= chunkGapResults.length;
        const avgGap = currentAvgGap;
        
        self.postMessage({
          type: "update",
          iteration: current,
          deltaIterations: dIters,
          deltaAllGaps: dGaps,
          deltaAvgGaps: dAvg,
          deltaRowStrategies: dRowStrat,
          deltaColStrategies: dColStrat,
          deltaBestRowHistory: dBestRow,
          deltaBestColHistory: dBestCol,
          matrices: sentMatrices ? null : matrices,
          seed,
          avgGap,
          progress: totalIter >= Number.MAX_SAFE_INTEGER ? -1 : (current / totalIter) * 100,
          validation: dViolations.length > 0 || dChecks > 0
            ? { totalChecks: dChecks, violations: dViolations }
            : null,
        } satisfies WorkerUpdateMessage);

        dIters = [];
        dGaps = matrices.map(() => []);
        dAvg = [];
        dRowStrat = matrices.map(() => []);
        dColStrat = matrices.map(() => []);
        dBestRow = matrices.map(() => []);
        dBestCol = matrices.map(() => []);
        dViolations = [];
        dChecks = 0;
        sentMatrices = true;
      }
    }

    const endTime = performance.now();
    const summary = computeSimulationSummary(allGaps, current, endTime - startTime);

    self.postMessage({ type: "finalizing" } satisfies WorkerFinalizingMessage);

    self.postMessage({
      type: "done",
      summary,
      matrices,
      seed,
      validation: { totalChecks: totalValidationChecks, violations: allViolations },
    } satisfies WorkerDoneMessage);
    
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    self.postMessage({
      type: "error",
      error: errorMsg,
    } satisfies WorkerErrorMessage);
  }

  running = false;
}

export {};
