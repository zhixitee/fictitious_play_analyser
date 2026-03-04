import { useState, useCallback, useRef, useEffect } from "react";
import type { ControlsConfig } from "../components/ControlsPanel";
import type { SimulationSummary } from "../core/stats";
import type { Matrix } from "../core/games";
import type { ValidationViolation } from "../core/solver";
import type {
  SimConfig,
  WorkerOutMessage,
} from "../workers/sim.worker";

// State types
export type SimulationStatus = "idle" | "running" | "finalizing" | "completed" | "error";

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
  validation: { totalChecks: number; violations: ValidationViolation[] };
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
  validation: { totalChecks: 0, violations: [] },
};

// Mutable store outside React state to avoid GC pressure
interface SimDataRef {
  iterations: number[];
  allGaps: number[][];
  avgGaps: number[];
  matrices: Matrix[];
  currentIteration: number;
  progress: number;
  avgGap: number;
  seed: number | null;
  rowStrategies: number[][][];
  colStrategies: number[][][];
  bestRowHistory: number[][];
  bestColHistory: number[][];
  dirty: boolean;
  version: number;
  validationChecks: number;
  validationViolations: ValidationViolation[];
}

function createEmptyDataRef(): SimDataRef {
  return {
    iterations: [],
    allGaps: [],
    avgGaps: [],
    matrices: [],
    currentIteration: 0,
    progress: 0,
    avgGap: 0,
    seed: null,
    rowStrategies: [],
    colStrategies: [],
    bestRowHistory: [],
    bestColHistory: [],
    dirty: false,
    version: 0,
    validationChecks: 0,
    validationViolations: [],
  };
}

export type ServerStatus = "disconnected" | "connecting" | "connected" | "error";

interface UseWorkerSimulationReturn {
  state: SimulationState;
  start: (config: ControlsConfig) => void;
  stop: () => void;
  reset: () => void;
  isRunning: boolean;
  isCompleted: boolean;
  serverStatus: ServerStatus;
}

const LOCAL_SERVER_URL = "ws://localhost:3001";

export function useWorkerSimulation(): UseWorkerSimulationReturn {
  const [state, setState] = useState<SimulationState>(initialState);
  const [serverStatus, setServerStatus] = useState<ServerStatus>("disconnected");
  const workerRef = useRef<Worker | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const dataRef = useRef<SimDataRef>(createEmptyDataRef());
  const rafRef = useRef<number>(0);
  const lastSyncedVersion = useRef<number>(0);
  const runningRef = useRef(false);

  const addLog = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setState((prev) => ({
      ...prev,
      logs: [...prev.logs.slice(-99), `[${timestamp}] ${message}`],
    }));
  }, []);

  // rAF render loop: syncs ref data → React state at ≤60fps
  useEffect(() => {
    function tick() {
      const d = dataRef.current;
      if (d.dirty && d.version !== lastSyncedVersion.current) {
        lastSyncedVersion.current = d.version;
        d.dirty = false;

        setState((prev) => ({
          ...prev,
          iterations: d.iterations,
          allGaps: d.allGaps,
          avgGaps: d.avgGaps,
          matrices: d.matrices,
          currentIteration: d.currentIteration,
          progress: d.progress,
          avgGap: d.avgGap,
          seed: d.seed,
          rowStrategies: d.rowStrategies,
          colStrategies: d.colStrategies,
          bestRowHistory: d.bestRowHistory,
          bestColHistory: d.bestColHistory,
          validation: { totalChecks: d.validationChecks, violations: d.validationViolations },
        }));
      }
      if (runningRef.current) {
        rafRef.current = requestAnimationFrame(tick);
      }
    }
    if (runningRef.current) {
      rafRef.current = requestAnimationFrame(tick);
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [state.status]); // re-subscribe when status changes (idle→running→completed)

  useEffect(() => {
    return () => {
      runningRef.current = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []);

  // Unified message handler – pure ref mutations, no setState
  // Works for both Worker (event.data) and WebSocket (parsed JSON)
  const handleMessage = useCallback(
    (msg: WorkerOutMessage) => {

      switch (msg.type) {
        case "update": {
          const d = dataRef.current;

          // Matrices sent once on first update
          if (msg.matrices) {
            d.matrices = msg.matrices;
            const g = msg.matrices.length;
            if (d.allGaps.length !== g) {
              d.allGaps = Array.from({ length: g }, () => []);
              d.rowStrategies = Array.from({ length: g }, () => []);
              d.colStrategies = Array.from({ length: g }, () => []);
              d.bestRowHistory = Array.from({ length: g }, () => []);
              d.bestColHistory = Array.from({ length: g }, () => []);
            }
          }

          const di = msg.deltaIterations;
          for (let k = 0; k < di.length; k++) {
            d.iterations.push(di[k]);
          }
          for (let g = 0; g < msg.deltaAllGaps.length; g++) {
            const dg = msg.deltaAllGaps[g];
            for (let k = 0; k < dg.length; k++) {
              d.allGaps[g].push(dg[k]);
            }
          }
          const da = msg.deltaAvgGaps;
          for (let k = 0; k < da.length; k++) {
            d.avgGaps.push(da[k]);
          }
          for (let g = 0; g < msg.deltaBestRowHistory.length; g++) {
            const dr = msg.deltaBestRowHistory[g];
            const dc = msg.deltaBestColHistory[g];
            for (let k = 0; k < dr.length; k++) {
              d.bestRowHistory[g].push(dr[k]);
              d.bestColHistory[g].push(dc[k]);
            }
          }
          for (let g = 0; g < msg.deltaRowStrategies.length; g++) {
            for (const chunk of msg.deltaRowStrategies[g]) {
              d.rowStrategies[g].push(chunk);
            }
            for (const chunk of msg.deltaColStrategies[g]) {
              d.colStrategies[g].push(chunk);
            }
          }

          d.currentIteration = msg.iteration;
          d.progress = msg.progress;
          d.avgGap = msg.avgGap;
          d.seed = msg.seed;

          if (msg.validation) {
            d.validationChecks += msg.validation.totalChecks;
            for (const v of msg.validation.violations) {
              d.validationViolations.push(v);
            }
          }

          d.dirty = true;
          d.version++;
          break;
        }

        case "finalizing": {
          setState((prev) => ({
            ...prev,
            status: "finalizing",
          }));
          addLog("Simulation complete — finalising data...");
          break;
        }

        case "done": {
          runningRef.current = false;
          // Use already-accumulated data from delta updates (done message is lightweight)
          const d = dataRef.current;
          d.matrices = msg.matrices;
          d.seed = msg.seed;

          setState((prev) => ({
            ...prev,
            status: "completed",
            iterations: d.iterations,
            allGaps: d.allGaps,
            avgGaps: d.avgGaps,
            matrices: msg.matrices,
            summary: msg.summary,
            progress: 100,
            seed: msg.seed,
            rowStrategies: d.rowStrategies,
            colStrategies: d.colStrategies,
            bestRowHistory: d.bestRowHistory,
            bestColHistory: d.bestColHistory,
            validation: msg.validation,
          }));
          addLog(
            `Completed: ${msg.summary.totalIterations.toLocaleString()} iterations, ` +
              `${msg.summary.gamesCount} games in ${(msg.summary.executionTimeMs / 1000).toFixed(2)}s`
          );
          addLog(
            `Final gap mean: ${msg.summary.gapStats.mean.toExponential(3)}, ` +
              `Karlin ratio: ${msg.summary.karlinStats.mean.toFixed(4)}`
          );
          const v = msg.validation;
          if (v.violations.length === 0) {
            addLog(`Validation: ${v.totalChecks} checks passed`);
          } else {
            addLog(`Validation: ${v.violations.length} violation(s) in ${v.totalChecks} checks`);
            for (const viol of v.violations.slice(0, 5)) {
              addLog(`  ⚠ t=${viol.iteration}: ${viol.detail}`);
            }
          }
          break;
        }

        case "error":
          runningRef.current = false;
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

  // Wrapper for Worker onmessage events
  const handleWorkerMessage = useCallback(
    (event: MessageEvent<WorkerOutMessage>) => handleMessage(event.data),
    [handleMessage]
  );

  // Build SimConfig from ControlsConfig
  const buildSimConfig = useCallback((config: ControlsConfig): SimConfig => ({
    mode: config.mode,
    iterations: config.iterations,
    chunk: config.chunkSize,
    batch: config.mode === "wang" || config.mode === "custom" ? 1 : (config.batchSize || 1),
    sizes: config.sizes,
    sizeN: config.sizeN,
    seed: config.seed ?? undefined,
    customMatrix: config.mode === "custom" ? config.customMatrix : undefined,
    tieBreaking: config.tieBreaking,
    initialization: config.initialization,
  }), []);

  // ── WebSocket (local server) start path ──────────────────────────────────
  const startViaServer = useCallback(
    (config: ControlsConfig) => {
      // Clean up previous connections
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }

      dataRef.current = createEmptyDataRef();
      lastSyncedVersion.current = 0;
      runningRef.current = true;
      setServerStatus("connecting");

      setState({
        ...initialState,
        status: "running",
        logs: [],
      });

      const simConfig = buildSimConfig(config);
      const iterLabel = simConfig.iterations >= Number.MAX_SAFE_INTEGER
        ? "unlimited"
        : simConfig.iterations.toLocaleString();

      addLog(`Connecting to local server at ${LOCAL_SERVER_URL}...`);

      const ws = new WebSocket(LOCAL_SERVER_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setServerStatus("connected");
        addLog(`Connected to local server (Node.js process)`);
        addLog(`Starting simulation: ${config.mode} mode`);
        addLog(`Config: ${simConfig.batch} games, ${iterLabel} iterations`);
        ws.send(JSON.stringify({ type: "start", config: simConfig }));
      };

      ws.onmessage = (event) => {
        try {
          const msg: WorkerOutMessage = JSON.parse(event.data as string);
          handleMessage(msg);
        } catch {
          // ignore non-JSON
        }
      };

      ws.onerror = () => {
        setServerStatus("error");
        runningRef.current = false;
        setState((prev) => ({
          ...prev,
          status: "error",
          error: "Could not connect to local server. Run: npm run server",
        }));
        addLog("Failed to connect to local server. Make sure it's running: npm run server");
      };

      ws.onclose = () => {
        setServerStatus("disconnected");
        // If simulation was still running, the server closed unexpectedly
        if (runningRef.current) {
          runningRef.current = false;
          setState((prev) => {
            if (prev.status === "running") {
              return { ...prev, status: "completed" };
            }
            return prev;
          });
          addLog("Server connection closed");
        }
      };
    },
    [handleMessage, addLog, buildSimConfig]
  );

  // ── Web Worker start path ────────────────────────────────────────────────
  const startViaWorker = useCallback(
    (config: ControlsConfig) => {
      if (workerRef.current) {
        workerRef.current.terminate();
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }

      dataRef.current = createEmptyDataRef();
      lastSyncedVersion.current = 0;
      runningRef.current = true;

      setState({
        ...initialState,
        status: "running",
        logs: [],
      });

      const worker = new Worker(
        new URL("../workers/sim.worker.ts", import.meta.url),
        { type: "module" }
      );

      worker.onmessage = handleWorkerMessage;
      worker.onerror = (error) => {
        runningRef.current = false;
        setState((prev) => ({
          ...prev,
          status: "error",
          error: error.message || "Worker error",
        }));
        addLog(`Worker error: ${error.message}`);
      };

      workerRef.current = worker;

      const simConfig = buildSimConfig(config);

      addLog(`Starting simulation: ${config.mode} mode`);
      const iterLabel = simConfig.iterations >= Number.MAX_SAFE_INTEGER
        ? "unlimited"
        : simConfig.iterations.toLocaleString();
      addLog(
        `Config: ${simConfig.batch} games, ${iterLabel} iterations`
      );

      worker.postMessage({ type: "start", config: simConfig });
    },
    [handleWorkerMessage, addLog, buildSimConfig]
  );

  // ── Public start: routes to server or worker ─────────────────────────────
  const start = useCallback(
    (config: ControlsConfig) => {
      if (config.localMode) {
        startViaServer(config);
      } else {
        startViaWorker(config);
      }
    },
    [startViaServer, startViaWorker]
  );

  const stop = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "stop" }));
      addLog("Stopping simulation (server)...");
    } else if (workerRef.current) {
      workerRef.current.postMessage({ type: "stop" });
      addLog("Stopping simulation...");
    }
  }, [addLog]);

  const reset = useCallback(() => {
    runningRef.current = false;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setServerStatus("disconnected");
    dataRef.current = createEmptyDataRef();
    lastSyncedVersion.current = 0;
    setState(initialState);
  }, []);

  return {
    state,
    start,
    stop,
    reset,
    isRunning: state.status === "running" || state.status === "finalizing",
    isCompleted: state.status === "completed",
    serverStatus,
  };
}

export default useWorkerSimulation;
