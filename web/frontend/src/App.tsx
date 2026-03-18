import React, { useState, useCallback } from "react";
import { Github, Info, GripVertical } from "lucide-react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { useWorkerSimulation } from "./hooks/useWorkerSimulation";
import {
  ControlsPanel,
  PlotPanel,
  MatrixEditor,
} from "./components";
import { DualityGapModal } from "./components/DualityGapModal";
import type { ControlsConfig } from "./components/ControlsPanel";
import type { SimMode } from "./workers/sim.worker";
import { getRPSGame } from "./core/games";
import { IterationExplorer } from "./components/IterationExplorer";

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
  tieBreaking: "lexicographic",
  initialization: "standard",
  localMode: import.meta.env.DEV,
  unlimited: false,
};

function App() {
  const [config, setConfig] = useState<ControlsConfig>(defaultConfig);
  const [showInfo, setShowInfo] = useState(false);
  const [isDualityModalOpen, setIsDualityModalOpen] = useState(false);
  const [visibleGames, setVisibleGames] = useState<boolean[]>([]);
  const [selectedIterationIndex, setSelectedIterationIndex] = useState<number>(0);
  const [explorerGameIndex, setExplorerGameIndex] = useState<number>(-1); // -1 = All Games, -2 = Average
  const [isIterationScrubbing, setIsIterationScrubbing] = useState(false);

  const {
    state,
    start,
    stop,
    reset,
    isRunning,
    isCompleted,
    serverStatus,
  } = useWorkerSimulation();

  const gameCount = state.matrices.length || (config.batchSize || 1);
  React.useEffect(() => {
    if (visibleGames.length !== gameCount) {
      setVisibleGames(Array(gameCount).fill(true));
    }
  }, [gameCount, visibleGames.length]);

  React.useEffect(() => {
    if (explorerGameIndex === -1) {
      setVisibleGames(Array(gameCount).fill(true));
    } else if (explorerGameIndex === -2) {
      setVisibleGames(Array(gameCount).fill(false));
    } else {
      setVisibleGames(Array(gameCount).fill(false).map((_, i) => i === explorerGameIndex));
    }
  }, [explorerGameIndex, gameCount]);

  // Reset explorer selection if the toggled-off game was selected
  const handleVisibleGamesChange = useCallback((newVisible: boolean[]) => {
    setVisibleGames(newVisible);
    if (explorerGameIndex >= 0 && !newVisible[explorerGameIndex]) {
      setExplorerGameIndex(-1);
    }
  }, [explorerGameIndex]);

  React.useEffect(() => {
    if (state.iterations.length > 0) {
      setSelectedIterationIndex(state.iterations.length - 1);
    }
  }, [state.iterations.length]);

  const handleConfigChange = useCallback((updates: Partial<ControlsConfig>) => {
    setConfig((prev) => ({ ...prev, ...updates }));
  }, []);

  const handleIterationChange = useCallback((index: number) => {
    setSelectedIterationIndex(index);
  }, []);

  const handleStart = useCallback(() => {
    setSelectedIterationIndex(0);
    setExplorerGameIndex(-1);
    const effectiveConfig = {
      ...config,
      batchSize: config.batchSize === '' ? 1 : config.batchSize,
      iterations: (config.localMode && config.unlimited)
        ? Number.MAX_SAFE_INTEGER
        : config.iterations,
    };
    if (config.batchSize === '') {
      setConfig((prev) => ({ ...prev, batchSize: 1 }));
    }
    start(effectiveConfig);
  }, [start, config]);

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      <header className="border-b border-border bg-surface">
        <div className="px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-100">
              Fictitious Play Convergence Analyser
            </h1>
            <p className="text-sm text-muted">
              Real-time visualisation of zero-sum game convergence
            </p>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsDualityModalOpen(true)}
              className="px-2.5 py-1 rounded border border-blue-500/30 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 transition-colors text-xs font-semibold"
              title="Open duality gap visualizer"
            >
              Duality Gap
            </button>
            <button
              onClick={() => setShowInfo(!showInfo)}
              className="text-muted hover:text-white transition-colors"
              title="About"
            >
              <Info size={20} />
            </button>
            <a
              href="https://github.com/zhixitee/convergence"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted hover:text-white transition-colors"
            >
              <Github size={20} />
            </a>
          </div>
        </div>

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

      <main className="flex-1 min-h-0 overflow-hidden">
        <div className="h-full w-full">
          <Group orientation="horizontal" className="h-full">
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
                    serverStatus={serverStatus}
                  />

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

            <Separator className="w-1.5 flex items-center justify-center group hover:bg-border/50 transition-colors">
              <GripVertical size={12} className="text-muted group-hover:text-gray-300 transition-colors" />
            </Separator>

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
                      onVisibleGamesChange={handleVisibleGamesChange}
                      selectedIterationIndex={selectedIterationIndex}
                      pinSelectionOverlay={isIterationScrubbing}
                      bestRowHistory={state.bestRowHistory}
                      bestColHistory={state.bestColHistory}
                      matrices={state.matrices}
                    />
                  </div>
                </div>
              </div>
            </Panel>

            <Separator className="w-1.5 flex items-center justify-center group hover:bg-border/50 transition-colors">
              <GripVertical size={12} className="text-muted group-hover:text-gray-300 transition-colors" />
            </Separator>

            <Panel defaultSize="20" minSize="15" id="explorer" className="h-full">
              <div className="h-full overflow-y-auto p-4 pl-1">
                <IterationExplorer
                  state={state}
                  selectedIterationIndex={selectedIterationIndex}
                  onIterationChange={handleIterationChange}
                  onIterationDragStart={() => setIsIterationScrubbing(true)}
                  onIterationDragEnd={() => setIsIterationScrubbing(false)}
                  explorerGameIndex={explorerGameIndex}
                  onGameChange={setExplorerGameIndex}
                  isCompleted={isCompleted}
                />
              </div>
            </Panel>
          </Group>
        </div>
      </main>

      <footer className="flex-shrink-0 border-t border-border py-3 text-center text-xs text-muted">
        Browser-based simulation - All computations run locally on your device
      </footer>

      <DualityGapModal
        isOpen={isDualityModalOpen}
        onClose={() => setIsDualityModalOpen(false)}
      />
    </div>
  );
}

export default App;
