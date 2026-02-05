/**
 * Fictitious Play Convergence Analyzer
 * 
 * Browser-based web application for analyzing convergence of fictitious play
 * in zero-sum games. All simulations run in the browser using Web Workers.
 * 
 * Deployable to Vercel as a static frontend-only app.
 */

import React, { useState, useCallback, useMemo } from "react";
import { Github, Info } from "lucide-react";
import { useWorkerSimulation } from "./hooks/useWorkerSimulation";
import {
  ControlsPanel,
  PlotPanel,
  MatrixEditor,
} from "./components";
import type { ControlsConfig, PlotMode } from "./components/ControlsPanel";
import type { SimMode } from "./workers/sim.worker";
import { getRPSGame } from "./core/games";
import { IterationExplorer } from "./components/IterationExplorer";

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
  const [visibleGames, setVisibleGames] = useState<boolean[]>([]);
  const [selectedIterationIndex, setSelectedIterationIndex] = useState<number>(0);
  const [explorerGameIndex, setExplorerGameIndex] = useState<number>(-1); // -1 = Average

  const {
    state,
    start,
    stop,
    reset,
    isRunning,
    isCompleted,
  } = useWorkerSimulation();

  // Update visible games when game count changes
  const gameCount = state.matrices.length || config.batchSize;
  React.useEffect(() => {
    if (visibleGames.length !== gameCount) {
      setVisibleGames(Array(gameCount).fill(true));
    }
  }, [gameCount, visibleGames.length]);

  // Update selected iteration when simulation progresses
  React.useEffect(() => {
    if (state.iterations.length > 0) {
      setSelectedIterationIndex(state.iterations.length - 1);
    }
  }, [state.iterations.length]);

  // Get the actual iteration value at selectedIterationIndex
  const selectedIteration = useMemo(() => {
    if (state.iterations.length === 0) return 0;
    return state.iterations[Math.min(selectedIterationIndex, state.iterations.length - 1)] || 0;
  }, [state.iterations, selectedIterationIndex]);

  // Update configuration
  const handleConfigChange = useCallback((updates: Partial<ControlsConfig>) => {
    setConfig((prev) => ({ ...prev, ...updates }));
  }, []);

  // Handle start
  const handleStart = useCallback(() => {
    setSelectedIterationIndex(0);
    setExplorerGameIndex(-1);
    start(config);
  }, [start, config]);

  // Handle game selection
  const handleGameSelect = useCallback((gameIndex: number | null) => {
    setConfig((prev) => ({ ...prev, selectedGame: gameIndex }));
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-surface">
        <div className="px-4 py-3 flex items-center justify-between">
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

        {/* Info Panel (collapsible) */}
        {showInfo && (
          <div className="px-4 pb-3">
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
                as iterations increase, bounded by the theoretical O(1/√T) rate.
              </p>
              <p className="mt-2">
                <strong>All simulations run entirely in your browser</strong> using Web Workers.
                No data is sent to any server.
              </p>
            </div>
          </div>
        )}
      </header>

      {/* Main Content - Fixed width panels */}
      <main className="px-4 py-4">
        <div className="flex gap-4">
          {/* Left Panel - Controls */}
          <div className={`flex-shrink-0 ${config.mode === 'custom' ? 'w-96' : 'w-72'}`}>
            <div className="sticky top-4">
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
          </div>

          {/* Center Panel - Charts */}
          <div className="flex-1 min-w-0">
            <div className="card">
              <h2 className="text-lg font-bold text-gray-200 mb-4">
                Duality Gap Convergence
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
                visibleGames={visibleGames}
                onVisibleGamesChange={setVisibleGames}
                selectedIterationIndex={selectedIterationIndex}
              />
            </div>
          </div>

          {/* Right Panel - Status & Explorer */}
          <div className="w-80 flex-shrink-0">
            <div className="sticky top-4">
              <IterationExplorer
                state={state}
                selectedIterationIndex={selectedIterationIndex}
                onIterationChange={setSelectedIterationIndex}
                explorerGameIndex={explorerGameIndex}
                onGameChange={setExplorerGameIndex}
                isCompleted={isCompleted}
              />
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-3 text-center text-xs text-muted">
        Browser-based simulation • All computations run locally on your device
      </footer>
    </div>
  );
}

export default App;
