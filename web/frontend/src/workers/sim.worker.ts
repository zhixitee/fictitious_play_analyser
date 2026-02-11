/**
 * Simulation Web Worker
 * 
 * Runs fictitious play simulations in a separate thread to keep the UI responsive.
 * Receives configuration, runs simulation in chunks, and posts progress updates.
 */

/// <reference lib="webworker" />

import { createSolver, stepChunk } from "../core/solver";
import type { SolverConfig } from "../core/solver";
import { getRandomZeroSumGame, getWang2025, Matrix } from "../core/games";
import { mulberry32 } from "../core/rng";
import { computeSimulationSummary, SimulationSummary } from "../core/stats";
import type { TieBreakingRule, InitializationMode } from "../types/simulation";

// ============================================================================
// Types
// ============================================================================

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
  iterations: number[];
  allGaps: number[][];
  avgGaps: number[];
  matrices: Matrix[];
  avgGap: number;
  progress: number;
  seed: number;
  rowStrategies: number[][][];  // [game][iterIdx][action]
  colStrategies: number[][][];  // [game][iterIdx][action]
  bestRowHistory: number[][];   // [game][iterIdx] - row player best response index
  bestColHistory: number[][];   // [game][iterIdx] - col player best response index
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
}

export interface WorkerErrorMessage {
  type: "error";
  error: string;
}

export type WorkerOutMessage = WorkerUpdateMessage | WorkerDoneMessage | WorkerErrorMessage;

// ============================================================================
// Worker State
// ============================================================================

let running = false;

// ============================================================================
// Message Handler
// ============================================================================

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

// ============================================================================
// Matrix Generation
// ============================================================================

function makeMatrices(cfg: SimConfig): { matrices: Matrix[]; seed: number } {
  const seed = cfg.seed ?? Math.floor(Math.random() * 1e9);
  const matrices: Matrix[] = [];

  if (cfg.mode === "custom") {
    // Use custom matrix (default to 2x2 RPS if not provided)
    const matrix = cfg.customMatrix ?? [
      [0, -1],
      [1, 0],
    ];
    matrices.push(matrix);
    return { matrices, seed };
  }

  if (cfg.mode === "wang") {
    // Wang 2025 construction (10x10)
    matrices.push(getWang2025());
    return { matrices, seed };
  }

  if (cfg.mode === "mixed") {
    // Mixed sizes: cycle through selected sizes
    const sizes = cfg.sizes.length > 0 ? cfg.sizes : [3, 5, 7, 10];
    for (let i = 0; i < cfg.batch; i++) {
      const n = sizes[i % sizes.length];
      matrices.push(getRandomZeroSumGame(n, mulberry32(seed + i)));
    }
    return { matrices, seed };
  }

  // Random mode: all games same size
  for (let i = 0; i < cfg.batch; i++) {
    matrices.push(getRandomZeroSumGame(cfg.sizeN, mulberry32(seed + i)));
  }
  return { matrices, seed };
}

// ============================================================================
// Simulation Runner
// ============================================================================

function runSimulation(cfg: SimConfig) {
  running = true;
  const startTime = performance.now();

  try {
    // Generate game matrices
    const { matrices, seed } = makeMatrices(cfg);
    
    // Build solver configuration
    const solverRng = mulberry32(seed + 999999); // separate RNG stream for tie-breaking
    const solverConfig: Partial<SolverConfig> = {
      tieBreaking: cfg.tieBreaking,
      initialization: cfg.initialization,
      rng: solverRng,
    };
    
    // Create solvers for each game (each gets its own RNG stream for initialization)
    const solvers = matrices.map((m, i) => {
      const initRng = mulberry32(seed + 500000 + i);
      return createSolver(m, {
        ...solverConfig,
        rng: cfg.tieBreaking === "random"
          ? mulberry32(seed + 1000000 + i)
          : initRng,
        // For initialization, temporarily use initRng, then switch to tie-breaking RNG
      });
    });
    
    // If initialization is random but tie-breaking is not random,
    // the solver was created with initRng. That's fine since rng is only
    // used for random tie-breaking at runtime.
    // If both are random, we need separate RNG streams. Let's fix:
    // Re-create solvers properly with initialization RNG first, then set tie-breaking RNG
    const solversFixed = matrices.map((m, i) => {
      const initRng = mulberry32(seed + 500000 + i);
      const tieRng = mulberry32(seed + 1000000 + i);
      // createSolver uses config.rng for initialization (if random mode)
      // and stepChunk uses config.rng for tie-breaking (if random mode)
      // We need to use initRng during createSolver, then swap to tieRng
      const solver = createSolver(m, {
        tieBreaking: cfg.tieBreaking,
        initialization: cfg.initialization,
        rng: initRng, // used for random initialization
      });
      // Now swap to tie-breaking RNG for runtime
      solver.config.rng = tieRng;
      return solver;
    });
    
    const totalIter = cfg.iterations;
    const chunkSize = cfg.chunk;

    // Accumulate results
    const allIters: number[] = [];
    const allGaps: number[][] = matrices.map(() => []);
    const avgGaps: number[] = [];
    const rowStrategies: number[][][] = matrices.map(() => []);  // [game][iterIdx][action]
    const colStrategies: number[][][] = matrices.map(() => []);  // [game][iterIdx][action]
    const bestRowHistory: number[][] = matrices.map(() => []);   // [game][iterIdx]
    const bestColHistory: number[][] = matrices.map(() => []);   // [game][iterIdx]

    let current = 0;
    let lastUpdateTime = startTime;
    const updateInterval = 50; // ms between UI updates

    while (running && current < totalIter) {
      const step = Math.min(chunkSize, totalIter - current);

      // Run chunk for all games
      for (let i = 0; i < solversFixed.length; i++) {
        const { iters, gaps, finalRowStrategy, finalColStrategy, bestRowHistory: brRow, bestColHistory: brCol } = stepChunk(solversFixed[i], step);
        
        // Only push iteration numbers once (same for all games)
        if (i === 0) {
          for (let k = 0; k < iters.length; k++) {
            allIters.push(iters[k]);
          }
        }
        
        // Push gaps for this game
        for (let k = 0; k < gaps.length; k++) {
          allGaps[i].push(gaps[k]);
        }
        
        // Push best response history for this game
        for (let k = 0; k < brRow.length; k++) {
          bestRowHistory[i].push(brRow[k]);
          bestColHistory[i].push(brCol[k]);
        }
        
        // Store final strategy for this chunk (one per chunk, not per iteration)
        rowStrategies[i].push(Array.from(finalRowStrategy));
        colStrategies[i].push(Array.from(finalColStrategy));
      }

      // Compute average gaps for each iteration in this chunk
      for (let k = 0; k < step; k++) {
        const iterIdx = current + k;
        let sum = 0;
        for (let i = 0; i < allGaps.length; i++) {
          sum += allGaps[i][iterIdx];
        }
        avgGaps.push(sum / allGaps.length);
      }

      current += step;

      // Post update (throttled)
      const now = performance.now();
      if (now - lastUpdateTime >= updateInterval || current >= totalIter) {
        lastUpdateTime = now;
        
        const avgGap = avgGaps[avgGaps.length - 1] ?? 0;
        
        self.postMessage({
          type: "update",
          iteration: current,
          iterations: allIters,
          allGaps,
          avgGaps,
          matrices,
          avgGap,
          progress: (current / totalIter) * 100,
          seed,
          rowStrategies,
          colStrategies,
          bestRowHistory,
          bestColHistory,
        } satisfies WorkerUpdateMessage);
      }
    }

    // Compute final summary
    const endTime = performance.now();
    const summary = computeSimulationSummary(allGaps, current, endTime - startTime);

    // Post completion message
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
