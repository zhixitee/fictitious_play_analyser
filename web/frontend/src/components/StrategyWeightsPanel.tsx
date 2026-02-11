/**
 * Strategy Weights Panel - displays game matrices, strategies, and convergence metrics.
 * Mirrors the PyQt GUI's right panel functionality.
 */

import React, { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, Download, FileText } from 'lucide-react';
import { SimulationState, GAME_COLORS } from '../types/simulation';

interface StrategyWeightsPanelProps {
  state: SimulationState;
  selectedIteration: number;
  onIterationChange: (iteration: number) => void;
  showIndividualGames: boolean;
  onToggleIndividualGames: (show: boolean) => void;
  onExportCurrent: () => void;
  onExportAll: () => void;
}

interface CollapsibleSectionProps {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function CollapsibleSection({ title, defaultOpen = true, children }: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  
  return (
    <div className="border border-border rounded overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2 bg-gray-800 hover:bg-gray-700 flex items-center gap-2 text-sm font-medium text-gray-200 transition-colors"
      >
        {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        {title}
      </button>
      {isOpen && (
        <div className="p-3 bg-gray-900">
          {children}
        </div>
      )}
    </div>
  );
}

interface StrategyBarProps {
  index: number;
  weight: number;
  color?: string;
}

function StrategyBar({ index, weight, color = '#606060' }: StrategyBarProps) {
  const percentage = Math.max(0, Math.min(100, weight * 100));
  
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="text-xs text-gray-400 w-6 text-right">{index}</span>
      <div className="flex-1 h-4 bg-gray-800 rounded overflow-hidden">
        <div
          className="h-full transition-all duration-200"
          style={{
            width: `${percentage}%`,
            backgroundColor: color,
          }}
        />
      </div>
      <span className="text-xs text-gray-300 w-14 text-right font-mono">
        {weight.toFixed(4)}
      </span>
    </div>
  );
}

export function StrategyWeightsPanel({
  state,
  selectedIteration,
  onIterationChange,
  showIndividualGames,
  onToggleIndividualGames,
  onExportCurrent,
  onExportAll,
}: StrategyWeightsPanelProps) {
  const [selectedGame, setSelectedGame] = useState(0);
  
  const hasData = state.iterations.length > 0;
  const gameCount = state.gapsByGame.length;
  const maxIteration = state.iterations.length;
  
  // Map selectedIteration (1-indexed) to array index (0-indexed)
  const iterIndex = Math.max(0, Math.min(selectedIteration - 1, maxIteration - 1));
  const currentIterationValue = state.iterations[iterIndex] || 0;
  
  // Get data for selected game and iteration
  const matrix = useMemo(() => {
    if (!hasData || selectedGame >= state.matrices.length) return null;
    return state.matrices[selectedGame];
  }, [state.matrices, selectedGame, hasData]);
  
  const rowStrategy = useMemo(() => {
    if (!hasData || selectedGame >= state.rowStrategiesHistory.length) return null;
    const history = state.rowStrategiesHistory[selectedGame];
    if (iterIndex >= history.length) return history[history.length - 1] || null;
    return history[iterIndex];
  }, [state.rowStrategiesHistory, selectedGame, iterIndex, hasData]);
  
  const colStrategy = useMemo(() => {
    if (!hasData || selectedGame >= state.colStrategiesHistory.length) return null;
    const history = state.colStrategiesHistory[selectedGame];
    if (iterIndex >= history.length) return history[history.length - 1] || null;
    return history[iterIndex];
  }, [state.colStrategiesHistory, selectedGame, iterIndex, hasData]);
  
  const currentGap = useMemo(() => {
    if (!hasData || selectedGame >= state.gapsByGame.length) return 0;
    const gaps = state.gapsByGame[selectedGame];
    if (iterIndex >= gaps.length) return gaps[gaps.length - 1] || 0;
    return gaps[iterIndex];
  }, [state.gapsByGame, selectedGame, iterIndex, hasData]);
  
  // Calculate average gap across all games at this iteration
  const avgGap = useMemo(() => {
    if (!hasData) return 0;
    const gaps = state.gapsByGame.map(g => {
      if (iterIndex >= g.length) return g[g.length - 1] || 0;
      return g[iterIndex];
    }).filter(g => g !== undefined);
    if (gaps.length === 0) return 0;
    return gaps.reduce((a, b) => a + b, 0) / gaps.length;
  }, [state.gapsByGame, iterIndex, hasData]);
  
  // Convergence metrics
  const metrics = useMemo(() => {
    const t = currentIterationValue || 1;
    const gap = showIndividualGames ? currentGap : avgGap;
    const karlinRatio = gap * Math.sqrt(t);
    const theoryBound = 1 / Math.sqrt(t);
    const gapKarlinRatio = gap / theoryBound;
    const wangBound = 1 / Math.pow(t, 1/3);
    const gapWangRatio = gap / wangBound;
    
    return {
      gap,
      karlinRatio,
      theoryBound,
      gapKarlinRatio,
      wangBound,
      gapWangRatio,
    };
  }, [currentGap, avgGap, currentIterationValue, showIndividualGames]);
  
  // Calculate convergence rate (alpha)
  const convergenceRate = useMemo(() => {
    if (!hasData || iterIndex < 10) return null;
    
    const window = Math.min(10, Math.floor(iterIndex / 2));
    if (window < 2) return null;
    
    const startIdx = iterIndex - window;
    const t1 = state.iterations[startIdx];
    const t2 = state.iterations[iterIndex];
    
    if (!t1 || !t2 || t1 <= 0 || t2 <= 0) return null;
    
    const gap1 = showIndividualGames 
      ? state.gapsByGame[selectedGame]?.[startIdx]
      : state.gapsByGame.map(g => g[startIdx]).reduce((a, b) => a + b, 0) / gameCount;
    const gap2 = showIndividualGames
      ? state.gapsByGame[selectedGame]?.[iterIndex]
      : state.gapsByGame.map(g => g[iterIndex]).reduce((a, b) => a + b, 0) / gameCount;
    
    if (!gap1 || !gap2 || gap1 <= 0 || gap2 <= 0) return null;
    
    const logTStart = Math.log10(t1);
    const logTEnd = Math.log10(t2);
    const logGapStart = Math.log10(Math.max(gap1, 1e-15));
    const logGapEnd = Math.log10(Math.max(gap2, 1e-15));
    
    const alpha = (logGapEnd - logGapStart) / (logTEnd - logTStart);
    
    return alpha;
  }, [state.iterations, state.gapsByGame, selectedGame, iterIndex, hasData, showIndividualGames, gameCount]);
  
  if (!hasData) {
    return (
      <div className="card w-80 flex-shrink-0">
        <h2 className="text-lg font-bold text-gray-200 border-b border-border pb-2 mb-4">
          Strategy Weights
        </h2>
        <div className="text-center text-gray-500 py-8">
          Run simulation to<br />view strategy weights
        </div>
      </div>
    );
  }
  
  return (
    <div className="card w-80 flex-shrink-0 space-y-4 max-h-[calc(100vh-12rem)] overflow-y-auto">
      <h2 className="text-lg font-bold text-gray-200 border-b border-border pb-2">
        Strategy Weights
      </h2>
      
      {/* Show Individual Games Toggle */}
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={showIndividualGames}
          onChange={e => onToggleIndividualGames(e.target.checked)}
          className="rounded border-gray-600 bg-gray-800 text-gray-500 focus:ring-gray-500"
        />
        <span className="text-gray-300">Show Individual Games</span>
      </label>
      
      {/* Game Selector */}
      {showIndividualGames && (
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted">Game:</label>
          <select
            value={selectedGame}
            onChange={e => setSelectedGame(parseInt(e.target.value))}
            className="flex-1 text-sm"
          >
            {Array.from({ length: gameCount }, (_, i) => (
              <option key={i} value={i}>Game {i + 1}</option>
            ))}
          </select>
          
          {/* Export Buttons */}
          <button
            onClick={onExportCurrent}
            className="p-1.5 bg-gray-700 hover:bg-gray-600 rounded text-gray-300"
            title="Export Current Game"
          >
            <Download size={14} />
          </button>
          <button
            onClick={onExportAll}
            className="p-1.5 bg-gray-700 hover:bg-gray-600 rounded text-gray-300"
            title="Export All Games"
          >
            <FileText size={14} />
          </button>
        </div>
      )}
      
      {/* Iteration Slider */}
      <div className="space-y-1">
        <label className="block text-sm text-muted">
          Iteration: <span className="text-gray-300 font-mono">{currentIterationValue.toLocaleString()}</span>
        </label>
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={1}
            max={maxIteration}
            value={selectedIteration}
            onChange={e => onIterationChange(parseInt(e.target.value))}
            className="flex-1"
          />
          <input
            type="number"
            min={1}
            max={maxIteration}
            value={selectedIteration}
            onChange={e => onIterationChange(Math.max(1, Math.min(maxIteration, parseInt(e.target.value) || 1)))}
            className="w-16 text-sm text-center"
          />
        </div>
      </div>
      
      {/* Header */}
      <div className="text-center py-2 bg-gray-800 rounded text-sm font-medium text-gray-200">
        {showIndividualGames ? `Game ${selectedGame + 1}` : 'Average'} - Iteration {currentIterationValue.toLocaleString()}
      </div>
      
      {/* Payoff Matrix */}
      {showIndividualGames && matrix && (
        <CollapsibleSection title={`Payoff Matrix (${matrix.length}x${matrix[0]?.length || 0})`}>
          <div className="overflow-x-auto">
            <table className="text-xs w-full">
              <thead>
                <tr>
                  <th className="p-1 text-gray-500"></th>
                  {matrix[0]?.map((_, j) => (
                    <th key={j} className="p-1 text-gray-400 font-normal">C{j}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrix.map((row, i) => (
                  <tr key={i}>
                    <td className="p-1 text-gray-400">R{i}</td>
                    {row.map((val, j) => (
                      <td
                        key={j}
                        className={`p-1 text-center font-mono ${
                          val > 0 ? 'text-gray-200' : val < 0 ? 'text-gray-400' : 'text-gray-500'
                        }`}
                      >
                        {val.toFixed(2)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CollapsibleSection>
      )}
      
      {/* Row Player Strategy */}
      {showIndividualGames && rowStrategy && (
        <CollapsibleSection title="Row Player">
          {rowStrategy.map((weight, i) => (
            <StrategyBar
              key={i}
              index={i}
              weight={weight}
              color={GAME_COLORS[selectedGame % GAME_COLORS.length]}
            />
          ))}
        </CollapsibleSection>
      )}
      
      {/* Column Player Strategy */}
      {showIndividualGames && colStrategy && (
        <CollapsibleSection title="Column Player">
          {colStrategy.map((weight, i) => (
            <StrategyBar
              key={i}
              index={i}
              weight={weight}
              color={GAME_COLORS[selectedGame % GAME_COLORS.length]}
            />
          ))}
        </CollapsibleSection>
      )}
      
      {/* Convergence Metrics */}
      <CollapsibleSection title="Convergence Metrics">
        <div className="space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-gray-400">Duality Gap:</span>
            <span className="font-mono text-gray-200">{metrics.gap.toExponential(4)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Karlin Ratio:</span>
            <span className="font-mono text-gray-200">{metrics.karlinRatio.toFixed(4)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Theory Bound:</span>
            <span className="font-mono text-gray-200">{metrics.theoryBound.toExponential(4)}</span>
          </div>
          
          <div className="border-t border-gray-700 my-2" />
          
          <div className="flex justify-between">
            <span className="text-gray-400">Gap/Karlin Ratio:</span>
            <span className="font-mono text-gray-200">{metrics.gapKarlinRatio.toFixed(4)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Gap/Wang Ratio:</span>
            <span className="font-mono text-gray-200">{metrics.gapWangRatio.toFixed(4)}</span>
          </div>
        </div>
      </CollapsibleSection>
      
      {/* Convergence Rate */}
      {convergenceRate !== null && (
        <CollapsibleSection title="Convergence Rate">
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-400">{showIndividualGames ? 'This Game' : 'Batch Mean'} (alpha):</span>
              <span className="font-mono text-gray-200">{convergenceRate.toFixed(4)}</span>
            </div>
            
            <div className="border-t border-gray-700 my-2" />
            
            <div className="flex justify-between text-gray-500">
              <span>Karlin: -0.5000</span>
              <span>Wang: -0.3333</span>
            </div>
          </div>
        </CollapsibleSection>
      )}
    </div>
  );
}
