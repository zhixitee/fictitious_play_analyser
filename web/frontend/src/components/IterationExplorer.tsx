import React, { useMemo } from "react";
import { Download, FileText, Copy, ChevronDown, ChevronRight } from "lucide-react";
import type { SimulationState } from "../hooks/useWorkerSimulation";
import type { SimulationSummary } from "../core/stats";
import {
  exportToCSV,
  exportSummaryToCSV,
  exportToMarkdown,
} from "../core/export";

const GAME_COLORS = [
  "#4ade80", "#60a5fa", "#f472b6", "#facc15", "#a78bfa",
  "#fb923c", "#2dd4bf", "#f87171", "#818cf8", "#34d399",
];

interface IterationExplorerProps {
  state: SimulationState;
  selectedIterationIndex: number;
  onIterationChange: (index: number) => void;
  explorerGameIndex: number; // -1 = Average
  onGameChange: (index: number) => void;
  isCompleted: boolean;
}

interface CollapsibleSectionProps {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function CollapsibleSection({ title, defaultOpen = true, children }: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = React.useState(defaultOpen);
  
  return (
    <div className="border border-border rounded overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2 bg-surface hover:bg-[#1e1f21] flex items-center gap-2 text-sm font-medium text-gray-200 transition-colors"
      >
        {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        {title}
      </button>
      {isOpen && (
        <div className="p-3 bg-surface">
          {children}
        </div>
      )}
    </div>
  );
}

function StrategyBar({ index, weight, color = '#606060' }: { index: number; weight: number; color?: string }) {
  const percentage = Math.max(0, Math.min(100, weight * 100));
  
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="text-xs text-gray-400 w-4 text-right">{index}</span>
      <div className="flex-1 h-3 bg-gray-800 rounded overflow-hidden">
        <div
          className="h-full transition-all duration-200"
          style={{
            width: `${percentage}%`,
            backgroundColor: color,
          }}
        />
      </div>
      <span className="text-xs text-gray-300 w-12 text-right font-mono">
        {weight.toFixed(3)}
      </span>
    </div>
  );
}

export function IterationExplorer({
  state,
  selectedIterationIndex,
  onIterationChange,
  explorerGameIndex,
  onGameChange,
  isCompleted,
}: IterationExplorerProps) {
  const hasData = state.iterations.length > 0;
  const gameCount = state.allGaps.length;
  const maxIndex = state.iterations.length - 1;
  
  const currentIteration = hasData 
    ? state.iterations[Math.min(selectedIterationIndex, maxIndex)] || 0 
    : 0;
  
  const currentGap = useMemo(() => {
    if (!hasData) return 0;
    const idx = Math.min(selectedIterationIndex, maxIndex);
    if (explorerGameIndex === -1 || explorerGameIndex === -2) {
      return state.avgGaps[idx] || 0;
    }
    return state.allGaps[explorerGameIndex]?.[idx] || 0;
  }, [hasData, selectedIterationIndex, maxIndex, explorerGameIndex, state.avgGaps, state.allGaps]);
  
  const metrics = useMemo(() => {
    const t = currentIteration || 1;
    const gap = currentGap;
    const karlinBound = 1 / Math.sqrt(t);
    const wangBound = 1 / Math.pow(t, 1/3);
    const gapKarlinRatio = gap / karlinBound;
    const gapWangRatio = gap / wangBound;
    const karlinRatio = gap * Math.sqrt(t); // gap * sqrt(T)
    
    return {
      gap,
      karlinBound,
      wangBound,
      gapKarlinRatio,
      gapWangRatio,
      karlinRatio,
    };
  }, [currentIteration, currentGap]);
  
  const selectedMatrix = useMemo(() => {
    if (explorerGameIndex < 0 || !hasData) return null;
    return state.matrices[explorerGameIndex] || null;
  }, [explorerGameIndex, hasData, state.matrices]);
  
  // Strategies are stored per chunk; map iteration index to chunk index
  const currentStrategies = useMemo(() => {
    if (explorerGameIndex < 0 || !hasData) return null;
    
    const rowStrats = state.rowStrategies?.[explorerGameIndex];
    const colStrats = state.colStrategies?.[explorerGameIndex];
    
    if (!rowStrats || !colStrats || rowStrats.length === 0) return null;
    
    const totalIterations = state.iterations.length;
    const numChunks = rowStrats.length;
    
    const chunkIndex = Math.min(
      Math.floor((selectedIterationIndex / totalIterations) * numChunks),
      numChunks - 1
    );
    
    return {
      row: rowStrats[chunkIndex] || [],
      col: colStrats[chunkIndex] || [],
    };
  }, [explorerGameIndex, hasData, selectedIterationIndex, state.rowStrategies, state.colStrategies, state.iterations.length]);
  
  const handleExportCSV = () => {
    if (state.iterations.length === 0) return;
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    exportToCSV(state.iterations, state.allGaps, state.avgGaps, `fp_results_${timestamp}.csv`);
  };

  const handleExportSummary = () => {
    if (!state.summary) return;
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    exportSummaryToCSV(state.summary, `fp_summary_${timestamp}.csv`);
  };

  const handleExportMarkdown = () => {
    if (!state.summary) return;
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    exportToMarkdown(state.summary, state.matrices, `fp_report_${timestamp}.md`);
  };

  const handleCopyLogs = () => {
    navigator.clipboard.writeText(state.logs.join("\n"));
  };

  return (
    <div className="card space-y-4">
      <h2 className="text-lg font-bold text-gray-200 border-b border-border pb-2">
        Iteration Explorer
      </h2>

      <div className="space-y-2">
        <label className="block text-sm text-muted">View Game</label>
        <select
          value={explorerGameIndex}
          onChange={(e) => onGameChange(parseInt(e.target.value))}
          className="w-full"
          disabled={!hasData}
        >
          <option value={-1}>All Games</option>
          <option value={-2}>Average</option>
          {Array.from({ length: gameCount }, (_, i) => (
            <option key={i} value={i}>
              Game {i + 1}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm text-muted">Iteration</label>
          <span className="text-sm font-mono text-gray-300">
            {currentIteration.toLocaleString()}
          </span>
        </div>
        <input
          type="range"
          value={selectedIterationIndex}
          onChange={(e) => onIterationChange(parseInt(e.target.value))}
          min={0}
          max={Math.max(0, maxIndex)}
          step={1}
          disabled={!hasData}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-muted">
          <span>{hasData ? state.iterations[0]?.toLocaleString() || "0" : "0"}</span>
          <span>{hasData ? state.iterations[maxIndex]?.toLocaleString() || "0" : "0"}</span>
        </div>
      </div>

      {hasData && (
        <CollapsibleSection title="Current Metrics" defaultOpen={true}>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
            <span className="text-muted">Duality Gap:</span>
            <span className="font-mono text-gray-300">{metrics.gap.toExponential(4)}</span>
            
            <span className="text-muted">Karlin Ratio (gap*sqrt(T)):</span>
            <span className="font-mono text-gray-300">{metrics.karlinRatio.toFixed(4)}</span>
            
            <span className="text-muted">Gap / Karlin Bound:</span>
            <span className="font-mono text-gray-300">{metrics.gapKarlinRatio.toFixed(4)}</span>
            
            <span className="text-muted">Gap / Wang Bound:</span>
            <span className="font-mono text-gray-300">{metrics.gapWangRatio.toFixed(4)}</span>
            
            <span className="text-muted">Karlin Bound (1/sqrt(T)):</span>
            <span className="font-mono text-gray-300">{metrics.karlinBound.toExponential(4)}</span>
            
            <span className="text-muted">Wang Bound (1/T^(1/3)):</span>
            <span className="font-mono text-gray-300">{metrics.wangBound.toExponential(4)}</span>
          </div>
        </CollapsibleSection>
      )}

      {currentStrategies && (
        <CollapsibleSection title="Strategy Probabilities" defaultOpen={true}>
          <div className="space-y-3">
            <div>
              <h4 className="text-xs font-semibold text-gray-400 mb-1.5">Row Player (p)</h4>
              <div className="space-y-0.5">
                {currentStrategies.row.map((weight, i) => (
                  <StrategyBar 
                    key={i} 
                    index={i} 
                    weight={weight} 
                    color={GAME_COLORS[explorerGameIndex % GAME_COLORS.length]} 
                  />
                ))}
              </div>
            </div>
            
            <div>
              <h4 className="text-xs font-semibold text-gray-400 mb-1.5">Column Player (q)</h4>
              <div className="space-y-0.5">
                {currentStrategies.col.map((weight, j) => (
                  <StrategyBar 
                    key={j} 
                    index={j} 
                    weight={weight} 
                    color={GAME_COLORS[(explorerGameIndex + 1) % GAME_COLORS.length]} 
                  />
                ))}
              </div>
            </div>
          </div>
        </CollapsibleSection>
      )}

      {selectedMatrix && (
        <CollapsibleSection title={`Payoff Matrix - Game ${explorerGameIndex + 1} (${selectedMatrix.length}x${selectedMatrix[0].length})`}>
          <div className="overflow-x-auto">
            <table className="text-xs font-mono w-full">
              <thead>
                <tr>
                  <th className="text-muted p-1"></th>
                  {selectedMatrix[0].slice(0, 8).map((_, j) => (
                    <th key={j} className="text-muted p-1 text-center">C{j}</th>
                  ))}
                  {selectedMatrix[0].length > 8 && <th className="text-muted p-1">...</th>}
                </tr>
              </thead>
              <tbody>
                {selectedMatrix.slice(0, 8).map((row, i) => (
                  <tr key={i}>
                    <td className="text-muted p-1">R{i}</td>
                    {row.slice(0, 8).map((val, j) => (
                      <td 
                        key={j} 
                        className={`p-1 text-right ${val > 0 ? 'text-green-400' : val < 0 ? 'text-red-400' : 'text-gray-400'}`}
                      >
                        {val.toFixed(2)}
                      </td>
                    ))}
                    {row.length > 8 && <td className="text-muted text-center">...</td>}
                  </tr>
                ))}
                {selectedMatrix.length > 8 && (
                  <tr>
                    <td colSpan={10} className="text-muted text-center p-1">...</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CollapsibleSection>
      )}

      {state.seed !== null && (
        <div className="text-xs text-muted">
          Seed: <span className="font-mono text-gray-300">{state.seed}</span>
        </div>
      )}

      <CollapsibleSection title="Log" defaultOpen={false}>
        <div className="flex items-center justify-end mb-2">
          {state.logs.length > 0 && (
            <button
              onClick={handleCopyLogs}
              className="text-xs text-muted hover:text-white flex items-center gap-1"
              title="Copy logs"
            >
              <Copy size={12} /> Copy
            </button>
          )}
        </div>
        <div className="bg-surface rounded p-2 h-24 overflow-y-auto font-mono text-xs text-gray-300">
          {state.logs.length === 0 ? (
            <span className="text-muted">No logs yet...</span>
          ) : (
            state.logs.map((log, i) => (
              <div key={i} className="whitespace-pre-wrap">{log}</div>
            ))
          )}
        </div>
      </CollapsibleSection>

      {state.summary && (
        <CollapsibleSection title="Summary Statistics">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
              <span className="text-muted">Games:</span>
              <span className="font-mono">{state.summary.gamesCount}</span>
              
              <span className="text-muted">Iterations:</span>
              <span className="font-mono">{state.summary.totalIterations.toLocaleString()}</span>
              
              <span className="text-muted">Time:</span>
              <span className="font-mono">{(state.summary.executionTimeMs / 1000).toFixed(2)}s</span>
            </div>

            <div className="pt-2 border-t border-border">
              <h4 className="text-xs font-bold text-gray-400 mb-2">Final Gap Statistics</h4>
              <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
                <span className="text-muted">Mean:</span>
                <span className="font-mono">{state.summary.gapStats.mean.toExponential(3)}</span>
                
                <span className="text-muted">Median:</span>
                <span className="font-mono">{state.summary.gapStats.median.toExponential(3)}</span>
                
                <span className="text-muted">Min:</span>
                <span className="font-mono">{state.summary.gapStats.min.toExponential(3)}</span>
                
                <span className="text-muted">Max:</span>
                <span className="font-mono">{state.summary.gapStats.max.toExponential(3)}</span>
              </div>
            </div>

            <div className="pt-2 border-t border-border">
              <h4 className="text-xs font-bold text-gray-400 mb-2">Karlin&apos;s Ratio (gap * sqrt(T))</h4>
              <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
                <span className="text-muted">Mean:</span>
                <span className="font-mono">{state.summary.karlinStats.mean.toFixed(4)}</span>
                
                <span className="text-muted">Median:</span>
                <span className="font-mono">{state.summary.karlinStats.median.toFixed(4)}</span>
              </div>
            </div>
          </div>
        </CollapsibleSection>
      )}

      {state.validation.totalChecks > 0 && (
        <CollapsibleSection title="Validation">
          <div className="space-y-2 text-xs">
            <div className="grid grid-cols-2 gap-x-2 gap-y-1">
              <span className="text-muted">Checks:</span>
              <span className="font-mono">{state.validation.totalChecks.toLocaleString()}</span>

              <span className="text-muted">Status:</span>
              {state.validation.violations.length === 0 ? (
                <span className="font-mono text-green-400">All passed</span>
              ) : (
                <span className="font-mono text-red-400">
                  {state.validation.violations.length} violation{state.validation.violations.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>

            {state.validation.violations.length > 0 && (
              <div className="pt-2 border-t border-border space-y-1">
                <h4 className="text-xs font-bold text-red-400 mb-1">Violations</h4>
                {state.validation.violations.slice(0, 10).map((v, i) => (
                  <div key={i} className="bg-gray-800 rounded p-1.5 text-[10px] font-mono text-red-300">
                    <span className="text-muted">t={v.iteration}</span>{" "}
                    <span className="text-gray-400">[{v.check}]</span>{" "}
                    {v.detail}
                  </div>
                ))}
                {state.validation.violations.length > 10 && (
                  <div className="text-muted text-[10px]">
                    ...and {state.validation.violations.length - 10} more
                  </div>
                )}
              </div>
            )}
          </div>
        </CollapsibleSection>
      )}

      <CollapsibleSection title="Export">
        <div className="space-y-2">
          <button
            onClick={handleExportCSV}
            disabled={!isCompleted || state.iterations.length === 0}
            className="w-full btn-primary flex items-center justify-center gap-2 text-sm py-2"
          >
            <Download size={14} />
            Results CSV
          </button>
          
          <button
            onClick={handleExportSummary}
            disabled={!state.summary}
            className="w-full btn-primary flex items-center justify-center gap-2 text-sm py-2"
          >
            <Download size={14} />
            Summary CSV
          </button>
          
          <button
            onClick={handleExportMarkdown}
            disabled={!state.summary}
            className="w-full btn-primary flex items-center justify-center gap-2 text-sm py-2"
          >
            <FileText size={14} />
            Markdown Report
          </button>
        </div>
      </CollapsibleSection>
    </div>
  );
}

export default IterationExplorer;
