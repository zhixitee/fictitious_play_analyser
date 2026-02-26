/// <reference lib="webworker" />

import { createSolver, stepChunk, validateChunkResult } from "../core/solver";
import type { ValidationViolation } from "../core/solver";
import { getRandomZeroSumGame, getWang2025, Matrix } from "../core/games";
import { mulberry32 } from "../core/rng";
import { computeSimulationSummary, SimulationSummary } from "../core/stats";
import type { TieBreakingRule, InitializationMode } from "../types/simulation";

export type SimMode = "random" | "mixed" | "custom" | "wang";

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

export interface WorkerDoneMessage {
  type: "done";
  summary: SimulationSummary;
  iterations: number[];
  allGaps: number[][];
  avgGaps: number[];
  matrices: Matrix[];
  seed: number;
  rowStrategies: number[][][];  // [game][iterIdx][action]
  colStrategies: number[][][];  // [game][iterIdx][action]
  bestRowHistory: number[][];   // [game][iterIdx]
  bestColHistory: number[][];   // [game][iterIdx]
  validation: { totalChecks: number; violations: ValidationViolation[] };
}

export interface WorkerErrorMessage {
  type: "error";
  error: string;
}

export type WorkerOutMessage = WorkerUpdateMessage | WorkerDoneMessage | WorkerErrorMessage;

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
    const matrix = cfg.customMatrix ?? [
      [0, -1],
      [1, 0],
    ];
    matrices.push(matrix);
    return { matrices, seed };
  }

  if (cfg.mode === "wang") {
    matrices.push(getWang2025());
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
        rng: initRng,
      });
      solver.config.rng = tieRng;
      return solver;
    });
    
    const totalIter = cfg.iterations;
    const chunkSize = cfg.chunk;

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

      for (let i = 0; i < solversFixed.length; i++) {
        const chunkResult = stepChunk(solversFixed[i], step);
        const { iters, gaps, finalRowStrategy, finalColStrategy, bestRowHistory: brRow, bestColHistory: brCol } = chunkResult;

        // Validate invariants for this chunk
        const vResult = validateChunkResult(solversFixed[i], chunkResult);
        totalValidationChecks += vResult.checks;
        dChecks += vResult.checks;
        for (const v of vResult.violations) {
          const tagged = { ...v, detail: `[Game ${i + 1}] ${v.detail}` };
          allViolations.push(tagged);
          dViolations.push(tagged);
        }
        
        // Only push iteration numbers once (same for all games)
        if (i === 0) {
          for (let k = 0; k < iters.length; k++) {
            allIters.push(iters[k]);
            dIters.push(iters[k]);
          }
        }
        
        for (let k = 0; k < gaps.length; k++) {
          allGaps[i].push(gaps[k]);
          dGaps[i].push(gaps[k]);
        }
        
        for (let k = 0; k < brRow.length; k++) {
          bestRowHistory[i].push(brRow[k]);
          bestColHistory[i].push(brCol[k]);
          dBestRow[i].push(brRow[k]);
          dBestCol[i].push(brCol[k]);
        }
        
        // Store final strategy for this chunk (one per chunk, not per iteration)
        const rowArr = Array.from(finalRowStrategy);
        const colArr = Array.from(finalColStrategy);
        rowStrategies[i].push(rowArr);
        colStrategies[i].push(colArr);
        dRowStrat[i].push(rowArr);
        dColStrat[i].push(colArr);
      }

      for (let k = 0; k < step; k++) {
        const iterIdx = current + k;
        let sum = 0;
        for (let i = 0; i < allGaps.length; i++) {
          sum += allGaps[i][iterIdx];
        }
        const avg = sum / allGaps.length;
        avgGaps.push(avg);
        dAvg.push(avg);
      }

      current += step;

      const now = performance.now();
      if (now - lastUpdateTime >= updateInterval || current >= totalIter) {
        lastUpdateTime = now;
        
        const avgGap = avgGaps[avgGaps.length - 1] ?? 0;
        
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
          progress: (current / totalIter) * 100,
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

    self.postMessage({
      type: "done",
      summary,
      iterations: allIters,
      allGaps,
      avgGaps,
      matrices,
      seed,
      rowStrategies,
      colStrategies,
      bestRowHistory,
      bestColHistory,
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
