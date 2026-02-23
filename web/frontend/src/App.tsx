/**
 * Fictitious Play Convergence Analyzer
 * 
 * Browser-based web application for analyzing convergence of fictitious play
 * in zero-sum games. All simulations run in the browser using Web Workers.
 * 
 * Deployable to Vercel as a static frontend-only app.
 */

import React, { useState, useCallback, useMemo } from "react";
import { Github, Info, GripVertical } from "lucide-react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { useWorkerSimulation } from "./hooks/useWorkerSimulation";
import {
  ControlsPanel,
  PlotPanel,
  MatrixEditor,
} from "./components";
import type { ControlsConfig } from "./components/ControlsPanel";
import type { SimMode } from "./workers/sim.worker";
import { getRPSGame } from "./core/games";
import { IterationExplorer } from "./components/IterationExplorer";

// Default configuration
const defaultConfig: ControlsConfig = {
  mode: "random" as SimMode,
  batchSize: 3,
  iterations: 10000,
  chunkSize: 100,
  seed: Math.floor(Math.random() * 100000),
  sizeN: 3,
  sizes: [3, 5, 7],
  customMatrix: getRPSGame(),
  logScale: true,
  showLegend: true,
  tieBreaking: "lexicographic",
  initialization: "standard",
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
  const gameCount = state.matrices.length || (config.batchSize || 1);
  React.useEffect(() => {
    if (visibleGames.length !== gameCount) {
      setVisibleGames(Array(gameCount).fill(true));
    }
  }, [gameCount, visibleGames.length]);

  // Sync visible games when explorer game selection changes
  React.useEffect(() => {
    if (explorerGameIndex === -1) {
      setVisibleGames(Array(gameCount).fill(true));
    } else {
      setVisibleGames(Array(gameCount).fill(false).map((_, i) => i === explorerGameIndex));
    }
  }, [explorerGameIndex, gameCount]);

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

  // Handle start — default batchSize to 1 if empty
  const handleStart = useCallback(() => {
    setSelectedIterationIndex(0);
    setExplorerGameIndex(-1);
    const effectiveConfig = {
      ...config,
      batchSize: config.batchSize === '' ? 1 : config.batchSize,
    };
    if (config.batchSize === '') {
      setConfig((prev) => ({ ...prev, batchSize: 1 }));
    }
    if (effectiveConfig.seed !== null) {
      const newSeed = Math.floor(Math.random() * 100000);
      setConfig((prev) => ({ ...prev, ...effectiveConfig, seed: newSeed }));
      start({ ...effectiveConfig, seed: newSeed });
    } else {
      start(effectiveConfig);
    }
  }, [start, config]);

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
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
                <strong>Karlin&apos;s Ratio</strong> (gap * sqrt(T)) should converge to a constant
                as iterations increase, bounded by the theoretical O(1/sqrt(T)) rate.
              </p>
              <p className="mt-2">
                <strong>All simulations run entirely in your browser</strong> using Web Workers.
                No data is sent to any server.
              </p>
            </div>
          </div>
        )}
      </header>

      {/* Main Content - Resizable 3-panel layout */}
      <main className="flex-1 min-h-0 overflow-hidden">
        <div className="h-full w-full">
          <Group orientation="horizontal" className="h-full">
            {/* Left Panel - Controls */}
            <Panel defaultSize="20" minSize="15" id="controls" className="h-full">
              <div className="h-full overflow-y-auto p-4 pr-1">
                <div className="flex flex-col gap-4">
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
                    <div className="card flex-shrink-0">
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
            </Panel>

            {/* Left Resize Handle */}
            <Separator className="w-1.5 flex items-center justify-center group hover:bg-border/50 transition-colors">
              <GripVertical size={12} className="text-muted group-hover:text-gray-300 transition-colors" />
            </Separator>

            {/* Center Panel - Charts */}
            <Panel defaultSize="60" minSize="30" id="charts" className="h-full">
              <div className="h-full py-4 px-1">
                <div className="card h-full flex flex-col overflow-hidden">
                  <h2 className="text-lg font-bold text-gray-200 border-b border-border pb-2 mb-4 flex-shrink-0">
                    Duality Gap Convergence
                  </h2>
                  <div className="flex-1 min-h-0 overflow-hidden">
                    <PlotPanel
                      iterations={state.iterations}
                      allGaps={state.allGaps}
                      avgGaps={state.avgGaps}
                      explorerGameIndex={explorerGameIndex}
                      logScale={config.logScale}
                      showLegend={config.showLegend}
                      visibleGames={visibleGames}
                      onVisibleGamesChange={setVisibleGames}
                      selectedIterationIndex={selectedIterationIndex}
                      bestRowHistory={state.bestRowHistory}
                      bestColHistory={state.bestColHistory}
                      matrices={state.matrices}
                    />
                  </div>
                </div>
              </div>
            </Panel>

            {/* Right Resize Handle */}
            <Separator className="w-1.5 flex items-center justify-center group hover:bg-border/50 transition-colors">
              <GripVertical size={12} className="text-muted group-hover:text-gray-300 transition-colors" />
            </Separator>

            {/* Right Panel - Iteration Explorer */}
            <Panel defaultSize="20" minSize="15" id="explorer" className="h-full">
              <div className="h-full overflow-y-auto p-4 pl-1">
                <IterationExplorer
                  state={state}
                  selectedIterationIndex={selectedIterationIndex}
                  onIterationChange={setSelectedIterationIndex}
                  explorerGameIndex={explorerGameIndex}
                  onGameChange={setExplorerGameIndex}
                  isCompleted={isCompleted}
                />
              </div>
            </Panel>
          </Group>
        </div>
      </main>

      {/* Footer */}
      <footer className="flex-shrink-0 border-t border-border py-3 text-center text-xs text-muted">
        Browser-based simulation - All computations run locally on your device
      </footer>
    </div>
  );
}

export default App;
