/**
 * Local simulation server — runs FP simulations in a Node.js process
 * with full access to system RAM (no browser memory limits).
 *
 * Usage:
 *   npx tsx server/localServer.ts [--port 3001] [--max-heap 8192]
 *
 * The frontend connects via WebSocket when "Local Mode" is enabled.
 * Message protocol is identical to the Web Worker (WorkerOutMessage).
 */

import { WebSocketServer, WebSocket } from "ws";
import { createSolver, stepChunk, validateChunkResult } from "../src/core/solver";
import type { ValidationViolation } from "../src/core/solver";
import { getRandomZeroSumGame, getWang2025 } from "../src/core/games";
import type { Matrix } from "../src/core/games";
import { mulberry32 } from "../src/core/rng";
import { computeSimulationSummary } from "../src/core/stats";
import type { TieBreakingRule, InitializationMode } from "../src/types/simulation";

// ── Types (mirror sim.worker.ts) ─────────────────────────────────────────────

interface SimConfig {
  mode: "random" | "mixed" | "custom" | "wang";
  iterations: number;
  chunk: number;
  batch: number;
  sizes: number[];
  sizeN: number;
  seed?: number;
  customMatrix?: Matrix;
  tieBreaking: TieBreakingRule;
  initialization: InitializationMode;
}

// ── CLI args ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function getArg(name: string, fallback: string): string {
  const idx = args.indexOf(name);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : fallback;
}
const PORT = parseInt(getArg("--port", "3001"), 10);

// ── Matrix construction (same as sim.worker.ts) ──────────────────────────────

function makeMatrices(cfg: SimConfig): { matrices: Matrix[]; seed: number } {
  const seed = cfg.seed ?? Math.floor(Math.random() * 1e9);
  const matrices: Matrix[] = [];

  if (cfg.mode === "custom") {
    matrices.push(cfg.customMatrix ?? [[0, -1], [1, 0]]);
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

  // random mode
  for (let i = 0; i < cfg.batch; i++) {
    matrices.push(getRandomZeroSumGame(cfg.sizeN, mulberry32(seed + i)));
  }
  return { matrices, seed };
}

// ── Simulation runner (async, yields to event loop) ──────────────────────────

async function runSimulation(ws: WebSocket, cfg: SimConfig): Promise<void> {
  let running = true;

  // Listen for stop messages on the same connection
  const onMessage = (data: Buffer | ArrayBuffer | Buffer[]) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === "stop") {
        running = false;
      }
    } catch { /* ignore non-JSON */ }
  };
  ws.on("message", onMessage);

  const startTime = performance.now();

  try {
    const { matrices, seed } = makeMatrices(cfg);

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

        const vResult = validateChunkResult(solversFixed[i], chunkResult);
        totalValidationChecks += vResult.checks;
        dChecks += vResult.checks;
        for (const v of vResult.violations) {
          const tagged = { ...v, detail: `[Game ${i + 1}] ${v.detail}` };
          allViolations.push(tagged);
          dViolations.push(tagged);
        }

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

        const updateMsg = {
          type: "update" as const,
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
        };

        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(updateMsg));
        }

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

      // Yield to event loop so "stop" messages can be received
      await new Promise<void>((resolve) => setImmediate(resolve));
    }

    const endTime = performance.now();
    const summary = computeSimulationSummary(allGaps, current, endTime - startTime);

    const doneMsg = {
      type: "done" as const,
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
    };

    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(doneMsg));
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "error", error: errorMsg }));
    }
  } finally {
    ws.off("message", onMessage);
  }
}

// ── Server ───────────────────────────────────────────────────────────────────

const wss = new WebSocketServer({ port: PORT });

// Memory reporting
function formatMemory(): string {
  const usage = process.memoryUsage();
  const rss = (usage.rss / (1024 * 1024)).toFixed(0);
  const heap = (usage.heapUsed / (1024 * 1024)).toFixed(0);
  const heapTotal = (usage.heapTotal / (1024 * 1024)).toFixed(0);
  return `RSS: ${rss}MB  Heap: ${heap}/${heapTotal}MB`;
}

wss.on("connection", (ws) => {
  console.log(`[server] Client connected (${formatMemory()})`);

  // Each connection handles one simulation at a time
  let activeSimulation: Promise<void> | null = null;

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString());

      if (msg.type === "start" && msg.config) {
        console.log(`[server] Starting simulation: ${msg.config.mode} mode, ` +
          `${msg.config.batch} games, ${msg.config.iterations >= Number.MAX_SAFE_INTEGER ? 'unlimited' : msg.config.iterations} iterations`);

        activeSimulation = runSimulation(ws, msg.config).then(() => {
          console.log(`[server] Simulation complete (${formatMemory()})`);
          activeSimulation = null;
        });
      }
      // "stop" messages are handled inside runSimulation's onMessage listener
    } catch {
      // ignore invalid JSON
    }
  });

  ws.on("close", () => {
    console.log(`[server] Client disconnected (${formatMemory()})`);
  });
});

console.log(`
╔══════════════════════════════════════════════════════════════╗
║  FP Convergence — Local Simulation Server                   ║
║                                                              ║
║  WebSocket listening on ws://localhost:${String(PORT).padEnd(24)}║
║  Node.js ${process.version.padEnd(49)}║
║  Memory: ${formatMemory().padEnd(49)}║
║                                                              ║
║  Enable "Local Mode" in the frontend to connect.             ║
║  Press Ctrl+C to stop.                                       ║
╚══════════════════════════════════════════════════════════════╝
`);

// Periodic memory report
setInterval(() => {
  if (wss.clients.size > 0) {
    console.log(`[server] ${formatMemory()} | ${wss.clients.size} client(s)`);
  }
}, 10000);
