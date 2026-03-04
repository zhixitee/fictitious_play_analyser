import React, { useState, useMemo, useEffect, useRef } from "react";
import { Play, Square, RotateCcw, Dice5 } from "lucide-react";
import type { SimMode } from "../workers/sim.worker";
import type { TieBreakingRule, InitializationMode } from "../types/simulation";

import type { ServerStatus } from "../hooks/useWorkerSimulation";

function estimateMemoryMB(config: {
  batchSize: number | '';
  iterations: number;
  chunkSize: number;
  sizeN: number;
  mode: string;
  sizes: number[];
}): number {
  const batch = Math.max(1, config.batchSize || 1);
  const iters = Math.max(1, config.iterations || 1000);
  const chunk = Math.max(1, config.chunkSize || 100);
  const matSize = config.mode === "mixed"
    ? Math.max(...(config.sizes?.length ? config.sizes : [3]))
    : Math.max(1, config.sizeN || 3);

  // History is downsampled to MAX_HISTORY_POINTS (50k) when iterations exceed that
  const MAX_HISTORY_POINTS = 50_000;
  const storedPoints = Math.min(iters, MAX_HISTORY_POINTS);
  const numChunks = Math.ceil(iters / chunk);

  const strategiesMemory = batch * numChunks * matSize * 8 * 2;
  const gapsMemory = batch * storedPoints * 8;
  const overheadFactor = 1.5;
  return (strategiesMemory + gapsMemory) * overheadFactor / (1024 * 1024);
}

export interface ControlsConfig {
  mode: SimMode;
  batchSize: number | '';
  iterations: number;
  chunkSize: number;
  seed: number | null;
  sizeN: number;
  sizes: number[];
  customMatrix: number[][];
  logScale: boolean;
  showLegend: boolean;
  tieBreaking: TieBreakingRule;
  initialization: InitializationMode;
  localMode: boolean;
  unlimited: boolean;
}

interface ControlsPanelProps {
  config: ControlsConfig;
  onConfigChange: (config: Partial<ControlsConfig>) => void;
  onStart: () => void;
  onStop: () => void;
  onReset: () => void;
  isRunning: boolean;
  progress: number;
  currentIteration: number;
  avgGap: number;
  status: "idle" | "running" | "completed" | "error";
  error?: string;
  gameCount: number;
  serverStatus: ServerStatus;
}

const SIZES = [2, 3, 4, 5, 6, 7, 8, 9, 10];
const MAX_ITERATIONS_DEFAULT = 1_000_000;
const MAX_ITERATIONS_LOCAL = 1_000_000_000;
const MAX_CHUNK_SIZE = 10000;
const MAX_BATCH_SIZE = 100;

export function ControlsPanel({
  config,
  onConfigChange,
  onStart,
  onStop,
  onReset,
  isRunning,
  progress,
  currentIteration,
  avgGap,
  status,
  error,
  gameCount,
  serverStatus,
}: ControlsPanelProps) {
  const [useSeed, setUseSeed] = useState(config.seed !== null);
  const maxIterations = config.localMode ? MAX_ITERATIONS_LOCAL : MAX_ITERATIONS_DEFAULT;

  // Live elapsed time timer
  const [elapsed, setElapsed] = useState(0);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (status === "running") {
      startTimeRef.current = Date.now();
      setElapsed(0);
      const interval = setInterval(() => {
        if (startTimeRef.current !== null) {
          setElapsed(Date.now() - startTimeRef.current);
        }
      }, 100);
      return () => clearInterval(interval);
    }
  }, [status === "running"]);

  const handleSeedToggle = (checked: boolean) => {
    setUseSeed(checked);
    onConfigChange({ seed: checked ? Math.floor(Math.random() * 100000) : null });
  };

  const handleSeedChange = (value: number) => {
    onConfigChange({ seed: value });
  };

  const handleRandomizeSeed = () => {
    onConfigChange({ seed: Math.floor(Math.random() * 100000) });
  };

  const toggleSize = (size: number) => {
    const newSizes = config.sizes.includes(size)
      ? config.sizes.filter((s) => s !== size)
      : [...config.sizes, size].sort((a, b) => a - b);
    onConfigChange({ sizes: newSizes.length > 0 ? newSizes : [3] });
  };

  const isUnlimited = config.localMode && config.unlimited;

  const estimatedMB = useMemo(() => estimateMemoryMB(config), [
    config.batchSize, config.iterations, config.chunkSize,
    config.sizeN, config.mode, config.sizes,
  ]);

  // Live memory estimate based on current iteration (for unlimited mode)
  const liveMemoryMB = useMemo(() => {
    if (!isUnlimited) return estimatedMB;
    const liveConfig = { ...config, iterations: currentIteration || 1 };
    return estimateMemoryMB(liveConfig);
  }, [isUnlimited, currentIteration, config, estimatedMB]);

  const memoryColor = estimatedMB < 100
    ? "bg-green-700/40 text-green-300 border-green-700"
    : estimatedMB < 500
    ? "bg-yellow-700/40 text-yellow-300 border-yellow-700"
    : estimatedMB < 1000
    ? "bg-orange-700/40 text-orange-300 border-orange-700"
    : "bg-red-700/40 text-red-300 border-red-700";

  const memoryLabel = estimatedMB < 100 ? "Safe" : estimatedMB < 500 ? "Caution" : estimatedMB < 1000 ? "Warning" : "Danger";

  return (
    <div className="card space-y-4">
      <h2 className="text-lg font-bold text-gray-200 border-b border-border pb-2">
        Simulation Controls
      </h2>

      <div className="space-y-2">
        <label className="block text-sm text-muted">Mode</label>
        <select
          value={config.mode}
          onChange={(e) => onConfigChange({ mode: e.target.value as SimMode })}
          disabled={isRunning}
          className="w-full"
        >
          <option value="random">Random Games</option>
          <option value="mixed">Mixed Sizes</option>
          <option value="custom">Custom Matrix</option>
          <option value="wang">Wang 2025</option>
        </select>
      </div>

      {config.mode === "random" && (
        <div className="space-y-2">
          <label className="block text-sm text-muted">Matrix Size</label>
          <select
            value={config.sizeN}
            onChange={(e) => onConfigChange({ sizeN: parseInt(e.target.value) })}
            disabled={isRunning}
            className="w-full"
          >
            {SIZES.map((size) => (
              <option key={size} value={size}>
                {size}x{size}
              </option>
            ))}
          </select>
        </div>
      )}

      {config.mode === "mixed" && (
        <div className="space-y-2">
          <label className="block text-sm text-muted">Game Sizes</label>
          <div className="grid grid-cols-5 gap-1">
            {SIZES.map((size) => (
              <button
                key={size}
                onClick={() => toggleSize(size)}
                disabled={isRunning}
                className={`text-xs py-1.5 px-2 rounded transition-colors ${
                  config.sizes.includes(size)
                    ? "bg-gray-500 text-white"
                    : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                }`}
              >
                {size}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted">
            Selected: {config.sizes.join(", ")}
          </p>
        </div>
      )}

      <div className="space-y-2">
        <label className="block text-sm text-muted">Batch Size</label>
        <input
          type="number"
          value={config.batchSize}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === '') {
              onConfigChange({ batchSize: '' });
            } else {
              const num = parseInt(raw);
              if (!isNaN(num)) {
                onConfigChange({ batchSize: Math.max(0, num) || '' });
              }
            }
          }}
          disabled={isRunning || config.mode === "wang" || config.mode === "custom"}
          min={0}
          max={MAX_BATCH_SIZE}
          placeholder="Enter batch size"
          className="w-full"
        />
        {(config.mode === "wang" || config.mode === "custom") && (
          <p className="text-xs text-muted">Fixed to 1 for this mode</p>
        )}
      </div>

      <div className="space-y-2">
        <label className="block text-sm text-muted">Iterations</label>
        <input
          type="number"
          value={config.iterations}
          onChange={(e) =>
            onConfigChange({
              iterations: Math.max(100, Math.min(maxIterations, parseInt(e.target.value) || 1000)),
            })
          }
          disabled={isRunning}
          min={100}
          max={maxIterations}
          step={100}
          className="w-full"
        />
        <input
          type="range"
          value={Math.min(config.iterations, MAX_ITERATIONS_DEFAULT)}
          onChange={(e) => onConfigChange({ iterations: parseInt(e.target.value) })}
          disabled={isRunning}
          min={100}
          max={MAX_ITERATIONS_DEFAULT}
          step={100}
          className="w-full"
        />
        {config.localMode && config.iterations > MAX_ITERATIONS_DEFAULT && (
              <p className="text-xs text-yellow-400 font-mono">
                {config.iterations.toLocaleString()} iters (above default 1M cap)
              </p>
            )}
      </div>

      <div className="space-y-2">
        <label className="block text-sm text-muted">Chunk Size</label>
        <input
          type="number"
          value={config.chunkSize}
          onChange={(e) =>
            onConfigChange({
              chunkSize: Math.max(1, Math.min(MAX_CHUNK_SIZE, parseInt(e.target.value) || 100)),
            })
          }
          disabled={isRunning}
          min={1}
          max={MAX_CHUNK_SIZE}
          step={1}
          className="w-full"
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm text-muted">Random Seed</label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={useSeed}
              onChange={(e) => handleSeedToggle(e.target.checked)}
              disabled={isRunning}
              className="accent-gray-500"
            />
            <span className="text-xs text-muted">Use seed</span>
          </label>
        </div>
        {useSeed && (
          <div className="flex gap-2">
            <input
              type="number"
              value={config.seed ?? 0}
              onChange={(e) => handleSeedChange(parseInt(e.target.value) || 0)}
              disabled={isRunning}
              min={0}
              className="flex-1"
            />
            <button
              onClick={handleRandomizeSeed}
              disabled={isRunning}
              className="bg-gray-700 px-3 rounded hover:bg-gray-600 transition-colors"
              title="Randomize seed"
            >
              <Dice5 size={16} />
            </button>
          </div>
        )}
        {!useSeed && (
          <p className="text-xs text-muted">Random seed each run</p>
        )}
      </div>

      <div className="space-y-2 pt-2 border-t border-border">
        <label className="block text-sm text-muted">Environment</label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={config.localMode}
            onChange={(e) => {
              const local = e.target.checked;
              onConfigChange({
                localMode: local,
                unlimited: local ? config.unlimited : false,
                iterations: !local && config.iterations > MAX_ITERATIONS_DEFAULT
                  ? MAX_ITERATIONS_DEFAULT
                  : config.iterations,
              });
            }}
            disabled={isRunning}
            className="accent-gray-500"
          />
          <span className="text-sm text-gray-300">Local Mode</span>
          <span className="text-[10px] text-muted">(uses local server)</span>
        </label>
        {config.localMode && (
          <div className="flex items-center gap-2 mt-1">
            <span className={`w-2 h-2 rounded-full ${
              serverStatus === "connected" ? "bg-green-400" :
              serverStatus === "connecting" ? "bg-yellow-400 animate-pulse" :
              serverStatus === "error" ? "bg-red-400" :
              "bg-gray-500"
            }`} />
            <span className="text-[10px] text-muted">
              {serverStatus === "connected" ? "Server connected" :
               serverStatus === "connecting" ? "Connecting..." :
               serverStatus === "error" ? "Server unreachable — run: npm run server" :
               "Server idle"}
            </span>
          </div>
        )}
      </div>

      <div className="space-y-2 pt-2 border-t border-border">
        <label className="block text-sm text-muted">Visualization</label>
        
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={config.logScale}
            onChange={(e) => onConfigChange({ logScale: e.target.checked })}
            className="accent-gray-500"
          />
          <span className="text-sm text-gray-300">Log Scale</span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={config.showLegend}
            onChange={(e) => onConfigChange({ showLegend: e.target.checked })}
            className="accent-gray-500"
          />
          <span className="text-sm text-gray-300">Show Legend</span>
        </label>
      </div>

      <div className="space-y-2 pt-2 border-t border-border">
        <label className="block text-sm text-muted">Solver Settings</label>

        <div className="space-y-1">
          <label className="block text-xs text-muted">Tie Breaking</label>
          <select
            value={config.tieBreaking}
            onChange={(e) => onConfigChange({ tieBreaking: e.target.value as TieBreakingRule })}
            disabled={isRunning}
            className="w-full"
          >
            <option value="lexicographic">Lexicographic (lowest index)</option>
            <option value="random">Random (uniform over ties)</option>
            <option value="anti-lexicographic">Anti-Lexicographic (highest index)</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="block text-xs text-muted">Initialization</label>
          <select
            value={config.initialization}
            onChange={(e) => onConfigChange({ initialization: e.target.value as InitializationMode })}
            disabled={isRunning}
            className="w-full"
          >
            <option value="standard">Standard [1, 0, ..., 0]</option>
            <option value="random">Random Beliefs</option>
          </select>
        </div>
      </div>

      {isUnlimited ? (
        <div className={`text-xs rounded border px-3 py-2 font-mono ${
          status === "running"
            ? (liveMemoryMB < 100 ? "bg-green-700/40 text-green-300 border-green-700"
              : liveMemoryMB < 500 ? "bg-yellow-700/40 text-yellow-300 border-yellow-700"
              : liveMemoryMB < 1000 ? "bg-orange-700/40 text-orange-300 border-orange-700"
              : "bg-red-700/40 text-red-300 border-red-700")
            : "bg-yellow-700/40 text-yellow-300 border-yellow-700"
        }`}>
          {status === "running"
            ? <>Live Memory: ~{liveMemoryMB < 1 ? liveMemoryMB.toFixed(2) : liveMemoryMB.toFixed(0)} MB</>
            : <>Unlimited mode — memory grows with iterations</>}
        </div>
      ) : (
        <div className={`text-xs rounded border px-3 py-2 font-mono ${memoryColor}`}>
          Est. Memory: {estimatedMB < 1 ? estimatedMB.toFixed(2) : estimatedMB.toFixed(0)} MB
          <span className="ml-2 opacity-75">({memoryLabel})</span>
        </div>
      )}

      <div className="flex gap-2 pt-4 border-t border-border">
        {!isRunning ? (
          <button
            onClick={onStart}
            className="btn-primary flex-1 flex items-center justify-center gap-2"
          >
            <Play size={16} />
            Start
          </button>
        ) : (
          <button
            onClick={onStop}
            className="btn-danger flex-1 flex items-center justify-center gap-2"
          >
            <Square size={16} />
            Stop
          </button>
        )}
        <button
          onClick={onReset}
          disabled={isRunning}
          className="btn-primary flex items-center justify-center px-3"
          title="Reset"
        >
          <RotateCcw size={16} />
        </button>
      </div>

      <div className="pt-4 border-t border-border space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted">Status</span>
          <StatusBadge status={status} />
        </div>

        {(status === "running" || status === "completed") && !isUnlimited && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted">
              <span>Progress</span>
              <span>{progress.toFixed(1)}%</span>
            </div>
            <div className="h-2 bg-gray-800 rounded overflow-hidden">
              <div
                className="h-full bg-gray-500 transition-all duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {status !== "idle" && (
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <div className="text-muted">Iteration</div>
              <div className="font-mono text-gray-200">
                {currentIteration.toLocaleString()}
                {!isUnlimited && (
                  <span className="text-muted">/{config.iterations.toLocaleString()}</span>
                )}
              </div>
            </div>
            <div>
              <div className="text-muted">Avg Gap</div>
              <div className="font-mono text-gray-200">
                {avgGap > 0 ? avgGap.toExponential(2) : "-"}
              </div>
            </div>
            <div>
              <div className="text-muted">Elapsed</div>
              <div className="font-mono text-gray-200">
                {elapsed < 1000
                  ? `${(elapsed / 1000).toFixed(1)}s`
                  : elapsed < 60000
                  ? `${(elapsed / 1000).toFixed(1)}s`
                  : `${Math.floor(elapsed / 60000)}m ${((elapsed % 60000) / 1000).toFixed(0)}s`}
              </div>
            </div>
            {isUnlimited && status === "running" && (
              <div className="col-span-2">
                <div className="text-muted">Est. Memory</div>
                <div className="font-mono text-gray-200">
                  {liveMemoryMB < 1 ? liveMemoryMB.toFixed(2) : liveMemoryMB.toFixed(0)} MB
                </div>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="bg-red-900/30 border border-red-700 rounded p-2 text-red-300 text-xs">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    idle: "bg-gray-700 text-gray-300",
    running: "bg-blue-700 text-blue-200 animate-pulse",
    completed: "bg-green-700 text-green-200",
    error: "bg-red-700 text-red-200",
  };

  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${styles[status] || styles.idle}`}>
      {status.toUpperCase()}
    </span>
  );
}

export default ControlsPanel;
