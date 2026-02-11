/**
 * useWorkerSimulation Hook
 * 
 * Manages simulation state and Web Worker communication.
 * Provides a clean interface for the UI to start/stop simulations
 * and receive real-time updates.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import type { ControlsConfig } from "../components/ControlsPanel";
import type { SimulationSummary } from "../core/stats";
import type { Matrix } from "../core/games";
import type {
  SimConfig,
  WorkerOutMessage,
} from "../workers/sim.worker";

// State types
export type SimulationStatus = "idle" | "running" | "completed" | "error";

export interface SimulationState {
  status: SimulationStatus;
  iterations: number[];
  allGaps: number[][];
  avgGaps: number[];
  matrices: Matrix[];
  currentIteration: number;
  progress: number;
  avgGap: number;
  summary: SimulationSummary | null;
  error: string | null;
  logs: string[];
  seed: number | null;
  rowStrategies: number[][][];  // [game][chunkIdx][action]
  colStrategies: number[][][];  // [game][chunkIdx][action]
  bestRowHistory: number[][];   // [game][iterIdx]
  bestColHistory: number[][];   // [game][iterIdx]
}

const initialState: SimulationState = {
  status: "idle",
  iterations: [],
  allGaps: [],
  avgGaps: [],
  matrices: [],
  currentIteration: 0,
  progress: 0,
  avgGap: 0,
  summary: null,
  error: null,
  logs: [],
  seed: null,
  rowStrategies: [],
  colStrategies: [],
  bestRowHistory: [],
  bestColHistory: [],
};

interface UseWorkerSimulationReturn {
  state: SimulationState;
  start: (config: ControlsConfig) => void;
  stop: () => void;
  reset: () => void;
  isRunning: boolean;
  isCompleted: boolean;
}

export function useWorkerSimulation(): UseWorkerSimulationReturn {
  const [state, setState] = useState<SimulationState>(initialState);
  const workerRef = useRef<Worker | null>(null);
  const startTimeRef = useRef<number>(0);

  // Add log entry
  const addLog = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setState((prev) => ({
      ...prev,
      logs: [...prev.logs.slice(-99), `[${timestamp}] ${message}`],
    }));
  }, []);

  // Cleanup worker on unmount
  useEffect(() => {
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, []);

  // Handle worker messages
  const handleWorkerMessage = useCallback(
    (event: MessageEvent<WorkerOutMessage>) => {
      const msg = event.data;

      switch (msg.type) {
        case "update":
          setState((prev) => ({
            ...prev,
            iterations: msg.iterations,
            allGaps: msg.allGaps,
            avgGaps: msg.avgGaps,
            matrices: msg.matrices,
            currentIteration: msg.iteration,
            progress: msg.progress,
            avgGap: msg.avgGap,
            seed: msg.seed,
            rowStrategies: msg.rowStrategies,
            colStrategies: msg.colStrategies,
            bestRowHistory: msg.bestRowHistory,
            bestColHistory: msg.bestColHistory,
          }));
          break;

        case "done":
          setState((prev) => ({
            ...prev,
            status: "completed",
            iterations: msg.iterations,
            allGaps: msg.allGaps,
            avgGaps: msg.avgGaps,
            matrices: msg.matrices,
            summary: msg.summary,
            progress: 100,
            seed: msg.seed,
            rowStrategies: msg.rowStrategies,
            colStrategies: msg.colStrategies,
            bestRowHistory: msg.bestRowHistory,
            bestColHistory: msg.bestColHistory,
          }));
          addLog(
            `Completed: ${msg.summary.totalIterations.toLocaleString()} iterations, ` +
              `${msg.summary.gamesCount} games in ${(msg.summary.executionTimeMs / 1000).toFixed(2)}s`
          );
          addLog(
            `Final gap mean: ${msg.summary.gapStats.mean.toExponential(3)}, ` +
              `Karlin ratio: ${msg.summary.karlinStats.mean.toFixed(4)}`
          );
          break;

        case "error":
          setState((prev) => ({
            ...prev,
            status: "error",
            error: msg.error,
          }));
          addLog(`Error: ${msg.error}`);
          break;
      }
    },
    [addLog]
  );

  // Start simulation
  const start = useCallback(
    (config: ControlsConfig) => {
      // Terminate existing worker
      if (workerRef.current) {
        workerRef.current.terminate();
      }

      // Reset state
      setState({
        ...initialState,
        status: "running",
        logs: [],
      });

      startTimeRef.current = performance.now();

      // Create new worker
      const worker = new Worker(
        new URL("../workers/sim.worker.ts", import.meta.url),
        { type: "module" }
      );

      worker.onmessage = handleWorkerMessage;
      worker.onerror = (error) => {
        setState((prev) => ({
          ...prev,
          status: "error",
          error: error.message || "Worker error",
        }));
        addLog(`Worker error: ${error.message}`);
      };

      workerRef.current = worker;

      // Build worker config
      const workerConfig: SimConfig = {
        mode: config.mode,
        iterations: config.iterations,
        chunk: config.chunkSize,
        batch: config.mode === "wang" || config.mode === "custom" ? 1 : config.batchSize,
        sizes: config.sizes,
        sizeN: config.sizeN,
        seed: config.seed ?? undefined,
        customMatrix: config.mode === "custom" ? config.customMatrix : undefined,
        tieBreaking: config.tieBreaking,
        initialization: config.initialization,
      };

      addLog(`Starting simulation: ${config.mode} mode`);
      addLog(
        `Config: ${workerConfig.batch} games, ${workerConfig.iterations.toLocaleString()} iterations`
      );

      // Start simulation
      worker.postMessage({ type: "start", config: workerConfig });
    },
    [handleWorkerMessage, addLog]
  );

  // Stop simulation
  const stop = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.postMessage({ type: "stop" });
      addLog("Stopping simulation...");
    }
  }, [addLog]);

  // Reset
  const reset = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
    setState(initialState);
  }, []);

  return {
    state,
    start,
    stop,
    reset,
    isRunning: state.status === "running",
    isCompleted: state.status === "completed",
  };
}

export default useWorkerSimulation;
