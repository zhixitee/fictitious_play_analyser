/**
 * Custom hook for WebSocket-based simulation management.
 * 
 * Handles:
 * - WebSocket connection lifecycle
 * - Delta-based message processing
 * - Client-side data accumulation
 * - Cancellation requests
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  SimulationConfig,
  SimulationState,
  WSMessage,
  WSProgress,
  WSCompleted,
  WSCancelled,
  WSError,
  DEFAULT_CONFIG,
} from '../types/simulation';

const WS_BASE_URL = import.meta.env.VITE_WS_URL || 
  (window.location.protocol === 'https:' ? 'wss://' : 'ws://') + 
  window.location.host;

interface UseSimulationOptions {
  onProgress?: (progress: WSProgress) => void;
  onComplete?: (summary: WSCompleted) => void;
  onError?: (error: WSError) => void;
}

export function useSimulation(options: UseSimulationOptions = {}) {
  const [state, setState] = useState<SimulationState>({
    status: 'idle',
    jobId: null,
    config: null,
    currentIteration: 0,
    progressPct: 0,
    avgGap: 0,
    iterations: [],
    gapsByGame: [],
    avgGaps: [],
    matrices: [],
    rowStrategiesHistory: [],
    colStrategiesHistory: [],
    summary: null,
    error: null,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempts = useRef(0);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  /**
   * Handle incoming WebSocket messages
   */
  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const message: WSMessage = JSON.parse(event.data);

      switch (message.type) {
        case 'job_created':
          setState(prev => ({
            ...prev,
            status: 'running',
            jobId: message.job_id,
            config: message.config,
            // Initialize gap arrays for each game
            gapsByGame: Array(message.config.batch_size).fill([]).map(() => []),
            // Initialize strategy history arrays for each game
            rowStrategiesHistory: Array(message.config.batch_size).fill([]).map(() => []),
            colStrategiesHistory: Array(message.config.batch_size).fill([]).map(() => []),
          }));
          break;

        case 'progress':
          handleProgress(message);
          break;

        case 'completed':
          handleCompleted(message);
          break;

        case 'cancelled':
          handleCancelled(message);
          break;

        case 'error':
          handleError(message);
          break;
      }
    } catch (err) {
      console.error('Failed to parse WebSocket message:', err);
    }
  }, [options.onProgress, options.onComplete, options.onError]);

  /**
   * Handle progress updates (delta-based accumulation)
   */
  const handleProgress = useCallback((msg: WSProgress) => {
    setState(prev => {
      // Append new gap values to each game's array
      const newGapsByGame = prev.gapsByGame.map((gaps, gameIndex) => {
        if (gameIndex < msg.chunk_gaps.length) {
          return [...gaps, msg.chunk_gaps[gameIndex]];
        }
        return gaps;
      });

      // Append average gap
      const newAvgGaps = [...prev.avgGaps, msg.avg_gap];

      // Append iteration number
      const newIterations = [...prev.iterations, msg.current_iteration];

      // Set matrices if provided (first update only)
      const newMatrices = msg.matrices || prev.matrices;

      // Append strategies to history
      const newRowStrategiesHistory = prev.rowStrategiesHistory.map((history, gameIndex) => {
        if (msg.row_strategies && gameIndex < msg.row_strategies.length) {
          return [...history, msg.row_strategies[gameIndex]];
        }
        return history;
      });

      const newColStrategiesHistory = prev.colStrategiesHistory.map((history, gameIndex) => {
        if (msg.col_strategies && gameIndex < msg.col_strategies.length) {
          return [...history, msg.col_strategies[gameIndex]];
        }
        return history;
      });

      return {
        ...prev,
        currentIteration: msg.current_iteration,
        progressPct: msg.progress_pct,
        avgGap: msg.avg_gap,
        iterations: newIterations,
        gapsByGame: newGapsByGame,
        avgGaps: newAvgGaps,
        matrices: newMatrices,
        rowStrategiesHistory: newRowStrategiesHistory,
        colStrategiesHistory: newColStrategiesHistory,
      };
    });

    options.onProgress?.(msg);
  }, [options.onProgress]);

  /**
   * Handle simulation completion
   */
  const handleCompleted = useCallback((msg: WSCompleted) => {
    setState(prev => ({
      ...prev,
      status: 'completed',
      summary: msg.summary,
      progressPct: 100,
    }));

    options.onComplete?.(msg);

    // Close WebSocket
    wsRef.current?.close();
    wsRef.current = null;
  }, [options.onComplete]);

  /**
   * Handle cancellation
   */
  const handleCancelled = useCallback((msg: WSCancelled) => {
    setState(prev => ({
      ...prev,
      status: 'cancelled',
      error: msg.reason,
    }));

    wsRef.current?.close();
    wsRef.current = null;
  }, []);

  /**
   * Handle errors
   */
  const handleError = useCallback((msg: WSError) => {
    setState(prev => ({
      ...prev,
      status: 'error',
      error: msg.details || msg.error,
    }));

    options.onError?.(msg);

    wsRef.current?.close();
    wsRef.current = null;
  }, [options.onError]);

  /**
   * Start a new simulation
   */
  const start = useCallback((config: Partial<SimulationConfig> = {}) => {
    // Merge with defaults
    const fullConfig: SimulationConfig = {
      ...DEFAULT_CONFIG,
      ...config,
      seed: config.seed ?? Math.floor(Math.random() * 100000),
    };

    // Reset state
    setState({
      status: 'connecting',
      jobId: null,
      config: fullConfig,
      currentIteration: 0,
      progressPct: 0,
      avgGap: 0,
      iterations: [],
      gapsByGame: [],
      avgGaps: [],
      matrices: [],
      rowStrategiesHistory: [],
      colStrategiesHistory: [],
      summary: null,
      error: null,
    });

    // Create WebSocket connection
    const ws = new WebSocket(`${WS_BASE_URL}/ws/quick`);
    wsRef.current = ws;

    ws.onopen = () => {
      // Send configuration to start simulation
      ws.send(JSON.stringify(fullConfig));
      reconnectAttempts.current = 0;
    };

    ws.onmessage = handleMessage;

    ws.onerror = (event) => {
      console.error('WebSocket error:', event);
      setState(prev => ({
        ...prev,
        status: 'error',
        error: 'Connection error',
      }));
    };

    ws.onclose = (event) => {
      if (event.code !== 1000 && event.code !== 1001) {
        console.warn('WebSocket closed unexpectedly:', event.code, event.reason);
      }
    };
  }, [handleMessage]);

  /**
   * Stop/cancel the running simulation
   */
  const stop = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: 'cancel' }));
    }
  }, []);

  /**
   * Reset to initial state
   */
  const reset = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setState({
      status: 'idle',
      jobId: null,
      config: null,
      currentIteration: 0,
      progressPct: 0,
      avgGap: 0,
      iterations: [],
      gapsByGame: [],
      avgGaps: [],
      matrices: [],
      rowStrategiesHistory: [],
      colStrategiesHistory: [],
      summary: null,
      error: null,
    });
  }, []);

  /**
   * Transform accumulated data into chart format
   */
  const getChartData = useCallback((): { iteration: number; [key: string]: number }[] => {
    const { iterations, gapsByGame, avgGaps } = state;
    
    return iterations.map((iter, idx) => {
      const point: { iteration: number; [key: string]: number } = { iteration: iter };
      
      gapsByGame.forEach((gaps, gameIdx) => {
        if (idx < gaps.length) {
          point[`game${gameIdx + 1}`] = gaps[idx];
        }
      });
      
      if (idx < avgGaps.length) {
        point.average = avgGaps[idx];
      }
      
      return point;
    });
  }, [state]);

  return {
    state,
    start,
    stop,
    reset,
    getChartData,
    isRunning: state.status === 'running' || state.status === 'connecting',
    isCompleted: state.status === 'completed',
    hasError: state.status === 'error',
  };
}
