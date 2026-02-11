/**
 * Progress display component showing simulation status.
 */

import React from 'react';
import { SimulationState, JobSummary } from '../types/simulation';

interface ProgressDisplayProps {
  state: SimulationState;
}

export function ProgressDisplay({ state }: ProgressDisplayProps) {
  const {
    status,
    jobId,
    currentIteration,
    progressPct,
    avgGap,
    summary,
    error,
    config,
  } = state;

  const formatNumber = (n: number, decimals = 2) => {
    if (n === 0) return '0';
    if (Math.abs(n) < 0.0001) return n.toExponential(decimals);
    return n.toFixed(decimals);
  };

  const formatScientific = (n: number) => n.toExponential(4);

  return (
    <div className="card space-y-4">
      {/* Status Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-200">Status</h2>
        <StatusBadge status={status} />
      </div>

      {/* Job ID */}
      {jobId && (
        <div className="text-sm text-muted">
          Job ID: <span className="font-mono text-gray-300">{jobId}</span>
        </div>
      )}

      {/* Progress Bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-sm text-muted">
          <span>Progress</span>
          <span>{formatNumber(progressPct)}%</span>
        </div>
        <div className="progress-bar">
          <div
            className="progress-bar-fill"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Current Stats */}
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <div className="text-muted">Iteration</div>
          <div className="font-mono text-lg">
            {currentIteration.toLocaleString()}
            {config && (
              <span className="text-muted text-sm">
                {' / '}
                {config.iterations.toLocaleString()}
              </span>
            )}
          </div>
        </div>
        <div>
          <div className="text-muted">Avg Gap</div>
          <div className="font-mono text-lg">
            {avgGap > 0 ? formatScientific(avgGap) : '-'}
          </div>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded p-3 text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Summary (when completed) */}
      {summary && <SummaryTable summary={summary} />}
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
    <span className={`px-2 py-1 rounded text-xs font-medium ${styles[status]}`}>
      {status.toUpperCase()}
    </span>
  );
}

function SummaryTable({ summary }: { summary: JobSummary }) {
  const formatExp = (n: number) => n.toExponential(4);
  const formatFixed = (n: number) => n.toFixed(4);

  return (
    <div className="border-t border-border pt-4 space-y-3">
      <h3 className="font-bold text-gray-300">Final Statistics</h3>
      
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div className="text-muted">Games</div>
        <div className="font-mono">{summary.games_count}</div>
        
        <div className="text-muted">Total Iterations</div>
        <div className="font-mono">{summary.total_iterations.toLocaleString()}</div>
        
        <div className="text-muted">Execution Time</div>
        <div className="font-mono">{formatFixed(summary.execution_time_seconds)}s</div>
      </div>

      <div className="text-xs text-muted border-t border-border pt-2 mt-2">
        Gap Statistics
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <div className="text-muted">Mean</div>
        <div className="font-mono">{formatExp(summary.gap_mean)}</div>
        
        <div className="text-muted">Median</div>
        <div className="font-mono">{formatExp(summary.gap_median)}</div>
        
        <div className="text-muted">Min / Max</div>
        <div className="font-mono">
          {formatExp(summary.gap_min)} / {formatExp(summary.gap_max)}
        </div>
      </div>

      <div className="text-xs text-muted border-t border-border pt-2 mt-2">
        Karlin's Ratio (gap * sqrt(T))
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <div className="text-muted">Mean</div>
        <div className="font-mono">{formatFixed(summary.ratio_mean)}</div>
        
        <div className="text-muted">Theoretical Bound</div>
        <div className="font-mono">{formatExp(summary.theoretical_bound)}</div>
        
        <div className="text-muted">Ratio to Theory</div>
        <div className="font-mono">{formatFixed(summary.ratio_to_theory)}</div>
      </div>
    </div>
  );
}
