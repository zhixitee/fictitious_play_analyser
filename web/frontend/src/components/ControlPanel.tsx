/**
 * Control panel component for simulation configuration.
 * Mirrors the PyQt GUI controls.
 */

import React, { useState, useEffect } from 'react';
import { Play, Square, RotateCcw } from 'lucide-react';
import { SimulationConfig, SimulationMode, SimulationState, JobSummary, DEFAULT_CONFIG } from '../types/simulation';

interface ControlPanelProps {
  onStart: (config: Partial<SimulationConfig>) => void;
  onStop: () => void;
  onReset: () => void;
  isRunning: boolean;
  isCompleted: boolean;
  state: SimulationState;
}

const AVAILABLE_SIZES = [2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20];

export function ControlPanel({
  onStart,
  onStop,
  onReset,
  isRunning,
  isCompleted,
  state,
}: ControlPanelProps) {
  const [mode, setMode] = useState<SimulationMode>('random');
  const [iterations, setIterations] = useState(DEFAULT_CONFIG.iterations);
  const [chunkSize, setChunkSize] = useState(DEFAULT_CONFIG.chunk_size);
  const [seed, setSeed] = useState<number>(Math.floor(Math.random() * 100000));
  const [mixedSizes, setMixedSizes] = useState<number[]>([3, 5, 7]);
  const [customMatrix, setCustomMatrix] = useState<number[][]>([
    [0, -1],
    [1, 0],
  ]);
  const [batchSize, setBatchSize] = useState(DEFAULT_CONFIG.batch_size);

  const handleStart = () => {
    const config: Partial<SimulationConfig> = {
      mode,
      batch_size: batchSize,
      iterations,
      chunk_size: chunkSize,
      seed,
    };

    if (mode === 'mixed') {
      config.mixed_sizes = mixedSizes;
    } else if (mode === 'custom') {
      config.custom_matrix = customMatrix;
    }

    onStart(config);
  };

  const toggleSize = (size: number) => {
    if (mixedSizes.includes(size)) {
      setMixedSizes(mixedSizes.filter(s => s !== size));
    } else {
      setMixedSizes([...mixedSizes, size].sort((a, b) => a - b));
    }
  };

  return (
    <div className="card w-80 flex-shrink-0 space-y-4">
      <h2 className="text-lg font-bold text-gray-200 border-b border-border pb-2">
        Simulation Controls
      </h2>

      {/* Mode Selection */}
      <div className="space-y-2">
        <label className="block text-sm text-muted">Mode</label>
        <select
          value={mode}
          onChange={e => setMode(e.target.value as SimulationMode)}
          disabled={isRunning}
          className="w-full"
        >
          <option value="random">Random Games</option>
          <option value="mixed">Mixed Sizes</option>
          <option value="custom">Custom Matrix</option>
        </select>
      </div>

      {/* Mixed Size Configuration */}
      {mode === 'mixed' && (
        <div className="space-y-2">
          <label className="block text-sm text-muted">Game Sizes</label>
          <div className="grid grid-cols-4 gap-1">
            {AVAILABLE_SIZES.map(size => (
              <button
                key={size}
                onClick={() => toggleSize(size)}
                disabled={isRunning}
                className={`text-xs py-1 px-2 rounded transition-colors ${
                  mixedSizes.includes(size)
                    ? 'bg-gray-500 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                {size}x{size}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Custom Matrix Editor */}
      {mode === 'custom' && (
        <div className="space-y-2">
          <label className="block text-sm text-muted">Custom Matrix</label>
          <div className="bg-gray-800 rounded p-2 overflow-x-auto">
            <table className="text-xs">
              <tbody>
                {customMatrix.map((row, i) => (
                  <tr key={i}>
                    {row.map((val, j) => (
                      <td key={j} className="p-1">
                        <input
                          type="number"
                          value={val}
                          onChange={e => {
                            const newMatrix = customMatrix.map((r, ri) =>
                              r.map((v, ci) =>
                                ri === i && ci === j
                                  ? parseFloat(e.target.value) || 0
                                  : v
                              )
                            );
                            setCustomMatrix(newMatrix);
                          }}
                          disabled={isRunning}
                          className="w-14 text-center text-xs"
                          step="0.1"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setCustomMatrix([[0, -1], [1, 0]])}
              disabled={isRunning}
              className="text-xs bg-gray-700 px-2 py-1 rounded hover:bg-gray-600"
            >
              2x2
            </button>
            <button
              onClick={() =>
                setCustomMatrix([
                  [0, -1, 1],
                  [1, 0, -1],
                  [-1, 1, 0],
                ])
              }
              disabled={isRunning}
              className="text-xs bg-gray-700 px-2 py-1 rounded hover:bg-gray-600"
            >
              RPS 3x3
            </button>
          </div>
        </div>
      )}

      {/* Batch Size */}
      <div className="space-y-2">
        <label className="block text-sm text-muted">Batch Size</label>
        <input
          type="number"
          value={batchSize}
          onChange={e => setBatchSize(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
          disabled={isRunning}
          min={1}
          max={10}
          className="w-full"
        />
      </div>

      {/* Iterations */}
      <div className="space-y-2">
        <label className="block text-sm text-muted">Iterations</label>
        <input
          type="number"
          value={iterations}
          onChange={e => setIterations(Math.max(1, Math.min(10000, parseInt(e.target.value) || 1)))}
          disabled={isRunning}
          min={1}
          max={10000}
          step={100}
          className="w-full"
        />
      </div>

      {/* Chunk Size */}
      <div className="space-y-2">
        <label className="block text-sm text-muted">Chunk Size</label>
        <input
          type="number"
          value={chunkSize}
          onChange={e => setChunkSize(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
          disabled={isRunning}
          min={1}
          max={10}
          step={1}
          className="w-full"
        />
      </div>

      {/* Seed */}
      <div className="space-y-2">
        <label className="block text-sm text-muted">Random Seed</label>
        <div className="flex gap-2">
          <input
            type="number"
            value={seed}
            onChange={e => setSeed(parseInt(e.target.value) || 0)}
            disabled={isRunning}
            min={0}
            max={99999}
            className="flex-1"
          />
          <button
            onClick={() => setSeed(Math.floor(Math.random() * 100000))}
            disabled={isRunning}
            className="bg-gray-700 px-3 rounded hover:bg-gray-600"
            title="Randomize"
          >
            🎲
          </button>
        </div>
      </div>

      {/* Control Buttons */}
      <div className="flex gap-2 pt-4 border-t border-border">
        {!isRunning ? (
          <button
            onClick={handleStart}
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
          className="btn-primary flex items-center justify-center"
          title="Reset"
        >
          <RotateCcw size={16} />
        </button>
      </div>

      {/* Status Section */}
      <div className="pt-4 border-t border-border space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted">Status</span>
          <StatusBadge status={state.status} />
        </div>

        {/* Progress Bar */}
        {(state.status === 'running' || state.status === 'completed') && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted">
              <span>Progress</span>
              <span>{state.progressPct.toFixed(1)}%</span>
            </div>
            <div className="h-2 bg-gray-800 rounded overflow-hidden">
              <div
                className="h-full bg-gray-500 transition-all duration-200"
                style={{ width: `${state.progressPct}%` }}
              />
            </div>
          </div>
        )}

        {/* Current Stats */}
        {state.status !== 'idle' && (
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <div className="text-muted">Iteration</div>
              <div className="font-mono text-gray-200">
                {state.currentIteration.toLocaleString()}
                {state.config && (
                  <span className="text-muted">
                    /{state.config.iterations.toLocaleString()}
                  </span>
                )}
              </div>
            </div>
            <div>
              <div className="text-muted">Avg Gap</div>
              <div className="font-mono text-gray-200">
                {state.avgGap > 0 ? state.avgGap.toExponential(2) : '-'}
              </div>
            </div>
          </div>
        )}

        {/* Error Display */}
        {state.error && (
          <div className="bg-red-900/30 border border-red-700 rounded p-2 text-red-300 text-xs">
            {state.error}
          </div>
        )}

        {/* Summary (when completed) */}
        {state.summary && <SummaryDisplay summary={state.summary} />}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: SimulationState['status'] }) {
  const styles: Record<string, string> = {
    idle: 'bg-gray-700 text-gray-300',
    connecting: 'bg-yellow-700 text-yellow-200 animate-pulse',
    running: 'bg-blue-700 text-blue-200 animate-pulse',
    completed: 'bg-green-700 text-green-200',
    cancelled: 'bg-orange-700 text-orange-200',
    error: 'bg-red-700 text-red-200',
  };

  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${styles[status]}`}>
      {status.toUpperCase()}
    </span>
  );
}

function SummaryDisplay({ summary }: { summary: JobSummary }) {
  return (
    <div className="space-y-2 text-xs">
      <div className="text-muted font-medium">Final Statistics</div>
      <div className="grid grid-cols-2 gap-x-2 gap-y-1">
        <span className="text-muted">Games:</span>
        <span className="font-mono">{summary.games_count}</span>
        
        <span className="text-muted">Iterations:</span>
        <span className="font-mono">{summary.total_iterations.toLocaleString()}</span>
        
        <span className="text-muted">Time:</span>
        <span className="font-mono">{summary.execution_time_seconds.toFixed(2)}s</span>
        
        <span className="text-muted">Gap Mean:</span>
        <span className="font-mono">{summary.gap_mean.toExponential(3)}</span>
        
        <span className="text-muted">Karlin Ratio:</span>
        <span className="font-mono">{summary.ratio_mean.toFixed(4)}</span>
      </div>
    </div>
  );
}
