/**
 * Main Application Component
 * 
 * Fictitious Play Convergence Analyzer - Web Interface
 */

import React, { useState, useEffect } from 'react';
import { useSimulation } from './hooks/useSimulation';
import { ControlPanel, GapChart, StrategyWeightsPanel } from './components';
import { Download, FileText, Github } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || '';

function App() {
  const {
    state,
    start,
    stop,
    reset,
    getChartData,
    isRunning,
    isCompleted,
  } = useSimulation({
    onProgress: (msg) => {
      console.debug('Progress:', msg.current_iteration, msg.avg_gap);
    },
    onComplete: (msg) => {
      console.log('Completed:', msg.summary);
    },
    onError: (msg) => {
      console.error('Error:', msg.error, msg.details);
    },
  });

  const chartData = getChartData();
  const gameCount = state.config?.batch_size || 3;

  // State for strategy weights panel and chart controls
  const [selectedIteration, setSelectedIteration] = useState(1);
  const [showIndividualGames, setShowIndividualGames] = useState(true);
  const [showAverage, setShowAverage] = useState(true);
  const [logScale, setLogScale] = useState(true);

  // Auto-update selected iteration to latest when running
  useEffect(() => {
    if (isRunning && state.iterations.length > 0) {
      setSelectedIteration(state.iterations.length);
    }
  }, [isRunning, state.iterations.length]);

  // Get marker iteration value (actual iteration number, not index)
  const markerIterationValue = state.iterations[selectedIteration - 1] || 0;

  const handleExport = async (format: 'csv' | 'md') => {
    if (!state.jobId) return;
    
    const url = `${API_BASE}/api/jobs/${state.jobId}/export/${format}`;
    window.open(url, '_blank');
  };

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
            {isCompleted && state.jobId && (
              <>
                <button
                  onClick={() => handleExport('csv')}
                  className="flex items-center gap-2 text-sm text-muted hover:text-white transition-colors"
                >
                  <Download size={16} />
                  CSV
                </button>
                <button
                  onClick={() => handleExport('md')}
                  className="flex items-center gap-2 text-sm text-muted hover:text-white transition-colors"
                >
                  <FileText size={16} />
                  Markdown
                </button>
              </>
            )}
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

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex gap-6">
          {/* Left Panel - Controls */}
          <ControlPanel
            onStart={start}
            onStop={stop}
            onReset={reset}
            isRunning={isRunning}
            isCompleted={isCompleted}
            state={state}
          />

          {/* Center Panel - Visualization */}
          <div className="flex-1 space-y-6">
            {/* Chart */}
            <div className="card">
              <h2 className="text-lg font-bold text-gray-200 mb-4">
                Duality Gap vs Iteration
              </h2>
              <GapChart
                data={chartData}
                gameCount={gameCount}
                showIndividualGames={showIndividualGames}
                showAverage={showAverage}
                showTheoreticalBound={true}
                logScale={logScale}
                markerIteration={markerIterationValue}
                onToggleIndividualGames={setShowIndividualGames}
                onToggleAverage={setShowAverage}
                onToggleLogScale={setLogScale}
              />
            </div>

            {/* Info Panel */}
            <div className="card text-sm text-muted">
              <h3 className="font-bold text-gray-300 mb-2">About</h3>
              <p>
                This simulator implements the <strong>Fictitious Play</strong> algorithm 
                for zero-sum games. The duality gap measures how close the current 
                strategy profile is to a Nash equilibrium. According to Robinson (1951), 
                Fictitious Play converges at rate O(T<sup>-1/2</sup>) for zero-sum games.
              </p>
              <p className="mt-2">
                <strong>Karlin's Ratio</strong> (gap × √T) should converge to a constant 
                as iterations increase, bounded by the theoretical O(1/√T) rate shown 
                in red on the chart.
              </p>
            </div>
          </div>

          {/* Right Panel - Strategy Weights */}
          <StrategyWeightsPanel
            state={state}
            selectedIteration={selectedIteration}
            onIterationChange={setSelectedIteration}
            showIndividualGames={showIndividualGames}
            onToggleIndividualGames={setShowIndividualGames}
            onExportCurrent={() => handleExport('csv')}
            onExportAll={() => handleExport('md')}
          />
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-8 py-4 text-center text-sm text-muted">
        <p>Proof-of-concept web interface • Single-user demo mode</p>
      </footer>
    </div>
  );
}

export default App;
