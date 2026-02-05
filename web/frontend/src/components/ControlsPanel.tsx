/**
 * Controls Panel Component
 * 
 * Matches PyQt controls for simulation configuration:
 * - Mode selection (Random, Mixed, Custom, Wang 2025)
 * - Batch size, iterations, chunk size
 * - Seed (optional)
 * - Toggles for log scale, legend, plot mode
 * - Start/Stop buttons
 * - Progress bar and status
 */

import React, { useState } from "react";
import { Play, Square, RotateCcw, Dice5 } from "lucide-react";
import type { SimMode } from "../workers/sim.worker";

export type PlotMode = "all" | "average" | "selected";

export interface ControlsConfig {
  mode: SimMode;
  batchSize: number;
  iterations: number;
  chunkSize: number;
  seed: number | null;
  sizeN: number;
  sizes: number[];
  customMatrix: number[][];
  logScale: boolean;
  showLegend: boolean;
  plotMode: PlotMode;
  selectedGame: number | null;
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
}

const SIZES = [2, 3, 4, 5, 6, 7, 8, 9, 10];
const MAX_ITERATIONS = 10000;

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
}: ControlsPanelProps) {
  const [useSeed, setUseSeed] = useState(config.seed !== null);

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

  return (
    <div className="card w-80 flex-shrink-0 space-y-4 max-h-[calc(100vh-120px)] overflow-y-auto">
      <h2 className="text-lg font-bold text-gray-200 border-b border-border pb-2">
        Simulation Controls
      </h2>

      {/* Mode Selection */}
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

      {/* Random Size Selection */}
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
                {size}×{size}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Mixed Size Selection */}
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

      {/* Batch Size */}
      <div className="space-y-2">
        <label className="block text-sm text-muted">Batch Size</label>
        <input
          type="number"
          value={config.batchSize}
          onChange={(e) =>
            onConfigChange({
              batchSize: Math.max(1, Math.min(10, parseInt(e.target.value) || 1)),
            })
          }
          disabled={isRunning || config.mode === "wang" || config.mode === "custom"}
          min={1}
          max={10}
          className="w-full"
        />
        {(config.mode === "wang" || config.mode === "custom") && (
          <p className="text-xs text-muted">Fixed to 1 for this mode</p>
        )}
      </div>

      {/* Iterations */}
      <div className="space-y-2">
        <label className="block text-sm text-muted">Iterations</label>
        <input
          type="number"
          value={config.iterations}
          onChange={(e) =>
            onConfigChange({
              iterations: Math.max(100, Math.min(MAX_ITERATIONS, parseInt(e.target.value) || 1000)),
            })
          }
          disabled={isRunning}
          min={100}
          max={MAX_ITERATIONS}
          step={100}
          className="w-full"
        />
        <input
          type="range"
          value={config.iterations}
          onChange={(e) => onConfigChange({ iterations: parseInt(e.target.value) })}
          disabled={isRunning}
          min={100}
          max={MAX_ITERATIONS}
          step={100}
          className="w-full"
        />
      </div>

      {/* Chunk Size */}
      <div className="space-y-2">
        <label className="block text-sm text-muted">Chunk Size</label>
        <input
          type="number"
          value={config.chunkSize}
          onChange={(e) =>
            onConfigChange({
              chunkSize: Math.max(10, Math.min(500, parseInt(e.target.value) || 100)),
            })
          }
          disabled={isRunning}
          min={10}
          max={500}
          step={10}
          className="w-full"
        />
      </div>

      {/* Seed */}
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

      {/* Visualization Toggles */}
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

      {/* Plot Mode */}
      <div className="space-y-2">
        <label className="block text-sm text-muted">Plot Mode</label>
        <select
          value={config.plotMode}
          onChange={(e) => onConfigChange({ plotMode: e.target.value as PlotMode })}
          className="w-full"
        >
          <option value="all">All Games</option>
          <option value="average">Average Only</option>
          <option value="selected">Selected Game Only</option>
        </select>
        
        {config.plotMode === "selected" && gameCount > 0 && (
          <select
            value={config.selectedGame ?? 0}
            onChange={(e) => onConfigChange({ selectedGame: parseInt(e.target.value) })}
            className="w-full mt-2"
          >
            {Array.from({ length: gameCount }, (_, i) => (
              <option key={i} value={i}>
                Game {i + 1}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Control Buttons */}
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

      {/* Progress & Status */}
      <div className="pt-4 border-t border-border space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted">Status</span>
          <StatusBadge status={status} />
        </div>

        {/* Progress Bar */}
        {(status === "running" || status === "completed") && (
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

        {/* Current Stats */}
        {status !== "idle" && (
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <div className="text-muted">Iteration</div>
              <div className="font-mono text-gray-200">
                {currentIteration.toLocaleString()}
                <span className="text-muted">/{config.iterations.toLocaleString()}</span>
              </div>
            </div>
            <div>
              <div className="text-muted">Avg Gap</div>
              <div className="font-mono text-gray-200">
                {avgGap > 0 ? avgGap.toExponential(2) : "—"}
              </div>
            </div>
          </div>
        )}

        {/* Error Display */}
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
