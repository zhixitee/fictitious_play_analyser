/**
 * Fictitious Play Convergence Analyzer
 * 
 * Browser-based web application for analyzing convergence of fictitious play
 * in zero-sum games. All simulations run in the browser using Web Workers.
 * 
 * Deployable to Vercel as a static frontend-only app.
 */

import React, { useState, useCallback } from "react";
import { Github, Info } from "lucide-react";
import { useWorkerSimulation } from "./hooks/useWorkerSimulation";
import {
  ControlsPanel,
  PlotPanel,
  StatusPanel,
  MatrixEditor,
} from "./components";
import type { ControlsConfig, PlotMode } from "./components/ControlsPanel";
import type { SimMode } from "./workers/sim.worker";
import { zeros, getRPSGame } from "./core/games";

// Default configuration
const defaultConfig: ControlsConfig = {
  mode: "random" as SimMode,
  batchSize: 3,
  iterations: 10000,
  chunkSize: 100,
  seed: null,
  sizeN: 3,
  sizes: [3, 5, 7],
  customMatrix: getRPSGame(),
  logScale: true,
  showLegend: true,
  plotMode: "all" as PlotMode,
  selectedGame: null,
};

function App() {
  const [config, setConfig] = useState<ControlsConfig>(defaultConfig);
  const [showInfo, setShowInfo] = useState(false);

  const {
    state,
    start,
    stop,
    reset,
    isRunning,
    isCompleted,
  } = useWorkerSimulation();

  // Update configuration
  const handleConfigChange = useCallback((updates: Partial<ControlsConfig>) => {
    setConfig((prev) => ({ ...prev, ...updates }));
  }, []);

  // Handle start
  const handleStart = useCallback(() => {
    start(config);
  }, [start, config]);

  // Handle game selection
  const handleGameSelect = useCallback((gameIndex: number | null) => {
    setConfig((prev) => ({ ...prev, selectedGame: gameIndex }));
  }, []);

  // Get effective game count
  const gameCount = state.matrices.length || config.batchSize;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-surface">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-100">
              Fictitious Play Convergence Analyzer
            </h1>
            <p className="text-sm text-muted">
              Real-time visualization of zero-sum game convergence
            </p>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowInfo(!showInfo)}
              className="text-muted hover:text-white transition-colors"
              title="About"
            >
              <Info size={20} />
            </button>
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted hover:text-white transition-colors"
            >
              <Github size={20} />
            </a>
          </div>
        </div>
      </header>

      {/* Info Panel */}
      {showInfo && (
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="card text-sm text-muted">
            <h3 className="font-bold text-gray-300 mb-2">About</h3>
            <p>
              This simulator implements the <strong>Fictitious Play</strong> algorithm
              for zero-sum games. The duality gap measures how close the current
              strategy profile is to a Nash equilibrium. According to Robinson (1951),
              Fictitious Play converges at rate O(T<sup>-1/2</sup>) for zero-sum games.
            </p>
            <p className="mt-2">
              <strong>Karlin&apos;s Ratio</strong> (gap × √T) should converge to a constant
              as iterations increase, bounded by the theoretical O(1/√T) rate shown
              in red on the chart.
            </p>
            <p className="mt-2">
              <strong>All simulations run entirely in your browser</strong> using Web Workers.
              No data is sent to any server.
            </p>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex gap-6">
          {/* Left Panel - Controls */}
          <div className="flex-shrink-0">
            <ControlsPanel
              config={config}
              onConfigChange={handleConfigChange}
              onStart={handleStart}
              onStop={stop}
              onReset={reset}
              isRunning={isRunning}
              progress={state.progress}
              currentIteration={state.currentIteration}
              avgGap={state.avgGap}
              status={state.status}
              error={state.error ?? undefined}
              gameCount={gameCount}
            />

            {/* Matrix Editor (for custom mode) */}
            {config.mode === "custom" && (
              <div className="card mt-4">
                <h3 className="text-sm font-bold text-gray-300 mb-3">
                  Custom Matrix
                </h3>
                <MatrixEditor
                  matrix={config.customMatrix}
                  onChange={(matrix) => handleConfigChange({ customMatrix: matrix })}
                  disabled={isRunning}
                />
              </div>
            )}
          </div>

          {/* Center Panel - Plot */}
          <div className="flex-1">
            <div className="card">
              <h2 className="text-lg font-bold text-gray-200 mb-4">
                Duality Gap vs Iteration
              </h2>
              <PlotPanel
                iterations={state.iterations}
                allGaps={state.allGaps}
                avgGaps={state.avgGaps}
                plotMode={config.plotMode}
                selectedGame={config.selectedGame}
                logScale={config.logScale}
                showLegend={config.showLegend}
                onGameSelect={handleGameSelect}
              />
            </div>

            {/* Matrices display (when completed and custom/wang mode) */}
            {isCompleted && state.matrices.length > 0 && (
              <div className="card mt-4">
                <h3 className="text-sm font-bold text-gray-300 mb-3">
                  Game Matrices
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {state.matrices.slice(0, 4).map((matrix, idx) => (
                    <div key={idx} className="bg-gray-800 rounded p-2 overflow-x-auto">
                      <div className="text-xs text-muted mb-1">
                        Game {idx + 1} ({matrix.length}×{matrix[0].length})
                      </div>
                      <table className="text-xs font-mono">
                        <tbody>
                          {matrix.slice(0, 6).map((row, i) => (
                            <tr key={i}>
                              {row.slice(0, 6).map((val, j) => (
                                <td key={j} className="px-1 text-right">
                                  {val.toFixed(2)}
                                </td>
                              ))}
                              {row.length > 6 && <td className="text-muted">...</td>}
                            </tr>
                          ))}
                          {matrix.length > 6 && (
                            <tr>
                              <td colSpan={7} className="text-muted text-center">
                                ...
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Panel - Status */}
          <StatusPanel
            logs={state.logs}
            summary={state.summary}
            iterations={state.iterations}
            allGaps={state.allGaps}
            avgGaps={state.avgGaps}
            matrices={state.matrices}
            seed={state.seed}
            isCompleted={isCompleted}
          />
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-8 py-4 text-center text-sm text-muted">
        <p>
          Browser-based simulation • All computations run locally on your device
        </p>
      </footer>
    </div>
  );
}

export default App;
