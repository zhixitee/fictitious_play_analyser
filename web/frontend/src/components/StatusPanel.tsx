import React from "react";
import { Download, FileText, Copy } from "lucide-react";
import type { SimulationSummary } from "../core/stats";
import type { Matrix } from "../core/games";
import {
  exportToCSV,
  exportSummaryToCSV,
  exportToMarkdown,
} from "../core/export";

interface StatusPanelProps {
  logs: string[];
  summary: SimulationSummary | null;
  iterations: number[];
  allGaps: number[][];
  avgGaps: number[];
  matrices: Matrix[];
  seed: number | null;
  isCompleted: boolean;
}

export function StatusPanel({
  logs,
  summary,
  iterations,
  allGaps,
  avgGaps,
  matrices,
  seed,
  isCompleted,
}: StatusPanelProps) {
  const handleExportCSV = () => {
    if (iterations.length === 0) return;
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    exportToCSV(iterations, allGaps, avgGaps, `fp_results_${timestamp}.csv`);
  };

  const handleExportSummary = () => {
    if (!summary) return;
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    exportSummaryToCSV(summary, `fp_summary_${timestamp}.csv`);
  };

  const handleExportMarkdown = () => {
    if (!summary) return;
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    exportToMarkdown(summary, matrices, `fp_report_${timestamp}.md`);
  };

  const handleCopyLogs = () => {
    navigator.clipboard.writeText(logs.join("\n"));
  };

  return (
    <div className="card w-80 flex-shrink-0 space-y-4 max-h-[calc(100vh-120px)] overflow-y-auto">
      <h2 className="text-lg font-bold text-gray-200 border-b border-border pb-2">
        Status & Export
      </h2>

      {seed !== null && (
        <div className="text-xs text-muted">
          Seed: <span className="font-mono text-gray-300">{seed}</span>
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm text-muted">Log</label>
          {logs.length > 0 && (
            <button
              onClick={handleCopyLogs}
              className="text-xs text-muted hover:text-white flex items-center gap-1"
              title="Copy logs"
            >
              <Copy size={12} />
            </button>
          )}
        </div>
        <div className="bg-gray-800 rounded p-2 h-32 overflow-y-auto font-mono text-xs text-gray-300">
          {logs.length === 0 ? (
            <span className="text-muted">No logs yet...</span>
          ) : (
            logs.map((log, i) => (
              <div key={i} className="whitespace-pre-wrap">
                {log}
              </div>
            ))
          )}
        </div>
      </div>

      {summary && (
        <div className="space-y-3 pt-2 border-t border-border">
          <h3 className="text-sm font-bold text-gray-300">Summary Statistics</h3>
          
          <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
            <span className="text-muted">Games:</span>
            <span className="font-mono">{summary.gamesCount}</span>
            
            <span className="text-muted">Iterations:</span>
            <span className="font-mono">{summary.totalIterations.toLocaleString()}</span>
            
            <span className="text-muted">Time:</span>
            <span className="font-mono">{(summary.executionTimeMs / 1000).toFixed(2)}s</span>
          </div>

          <div className="pt-2 border-t border-border">
            <h4 className="text-xs font-bold text-gray-400 mb-2">Final Gap Statistics</h4>
            <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
              <span className="text-muted">Mean:</span>
              <span className="font-mono">{summary.gapStats.mean.toExponential(3)}</span>
              
              <span className="text-muted">Median:</span>
              <span className="font-mono">{summary.gapStats.median.toExponential(3)}</span>
              
              <span className="text-muted">Min:</span>
              <span className="font-mono">{summary.gapStats.min.toExponential(3)}</span>
              
              <span className="text-muted">Max:</span>
              <span className="font-mono">{summary.gapStats.max.toExponential(3)}</span>
              
              <span className="text-muted">Std:</span>
              <span className="font-mono">{summary.gapStats.std.toExponential(3)}</span>
            </div>
          </div>

          <div className="pt-2 border-t border-border">
            <h4 className="text-xs font-bold text-gray-400 mb-2">Karlin&apos;s Ratio (gap * sqrt(T))</h4>
            <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
              <span className="text-muted">Mean:</span>
              <span className="font-mono">{summary.karlinStats.mean.toFixed(4)}</span>
              
              <span className="text-muted">Median:</span>
              <span className="font-mono">{summary.karlinStats.median.toFixed(4)}</span>
              
              <span className="text-muted">Min:</span>
              <span className="font-mono">{summary.karlinStats.min.toFixed(4)}</span>
              
              <span className="text-muted">Max:</span>
              <span className="font-mono">{summary.karlinStats.max.toFixed(4)}</span>
              
              <span className="text-muted">Std:</span>
              <span className="font-mono">{summary.karlinStats.std.toFixed(4)}</span>
            </div>
          </div>
        </div>
      )}

      <div className="pt-4 border-t border-border space-y-2">
        <h3 className="text-sm font-bold text-gray-300">Export</h3>
        
        <button
          onClick={handleExportCSV}
          disabled={!isCompleted || iterations.length === 0}
          className="w-full btn-primary flex items-center justify-center gap-2 text-sm py-2"
        >
          <Download size={14} />
          Results CSV
        </button>
        
        <button
          onClick={handleExportSummary}
          disabled={!summary}
          className="w-full btn-primary flex items-center justify-center gap-2 text-sm py-2"
        >
          <Download size={14} />
          Summary CSV
        </button>
        
        <button
          onClick={handleExportMarkdown}
          disabled={!summary}
          className="w-full btn-primary flex items-center justify-center gap-2 text-sm py-2"
        >
          <FileText size={14} />
          Markdown Report
        </button>
      </div>
    </div>
  );
}

export default StatusPanel;
