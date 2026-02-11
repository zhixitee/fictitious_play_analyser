/**
 * TypeScript types for simulation state and WebSocket protocol.
 */

// ============================================================================
// Solver Configuration Enums
// ============================================================================

export type TieBreakingRule = 'lexicographic' | 'random' | 'anti-lexicographic';
export type InitializationMode = 'standard' | 'random';

// ============================================================================
// Configuration Types
// ============================================================================

export type SimulationMode = 'random' | 'mixed' | 'custom';

export interface SimulationConfig {
  mode: SimulationMode;
  batch_size: number;
  iterations: number;
  chunk_size: number;
  seed: number | null;
  mixed_sizes?: number[];
  custom_matrix?: number[][];
  include_strategies?: boolean;
}

// ============================================================================
// Job Types
// ============================================================================

export type JobStatus = 'pending' | 'running' | 'completed' | 'cancelled' | 'failed';

export interface JobInfo {
  job_id: string;
  status: JobStatus;
  mode: SimulationMode;
  batch_size: number;
  iterations: number;
  created_at: number;
  started_at?: number;
  completed_at?: number;
}

export interface JobSummary {
  job_id: string;
  status: JobStatus;
  total_iterations: number;
  games_count: number;
  
  // Gap statistics
  gap_mean: number;
  gap_median: number;
  gap_min: number;
  gap_max: number;
  gap_std: number;
  
  // Karlin's ratio statistics
  ratio_mean: number;
  ratio_median: number;
  ratio_min: number;
  ratio_max: number;
  ratio_std: number;
  
  // Theoretical comparison
  theoretical_bound: number;
  ratio_to_theory: number;
  
  // Timing
  execution_time_seconds: number;
}

// ============================================================================
// WebSocket Message Types
// ============================================================================

export type WSMessageType = 'job_created' | 'progress' | 'completed' | 'cancelled' | 'error';

export interface WSJobCreated {
  type: 'job_created';
  job_id: string;
  config: SimulationConfig;
  timestamp: number;
}

export interface WSProgress {
  type: 'progress';
  job_id: string;
  
  // Progress tracking
  current_iteration: number;
  total_iterations: number;
  progress_pct: number;
  
  // Chunk data (delta)
  chunk_start: number;
  chunk_size: number;
  chunk_gaps: number[];  // Per-game gap values for this chunk
  avg_gap: number;
  
  // Optional
  iterations?: number[];
  detailed_gaps?: number[][];
  
  // Strategy data
  row_strategies?: number[][];  // [game][action]
  col_strategies?: number[][];  // [game][action]
  
  // Matrices (sent on first update only)
  matrices?: number[][][];  // [game][row][col]
  
  timestamp: number;
}

export interface WSCompleted {
  type: 'completed';
  job_id: string;
  summary: JobSummary;
  timestamp: number;
}

export interface WSCancelled {
  type: 'cancelled';
  job_id: string;
  reason: string;
  iterations_completed: number;
  timestamp: number;
}

export interface WSError {
  type: 'error';
  job_id?: string;
  error: string;
  details?: string;
  timestamp: number;
}

export type WSMessage = WSJobCreated | WSProgress | WSCompleted | WSCancelled | WSError;

// ============================================================================
// UI State Types
// ============================================================================

export interface SimulationState {
  status: 'idle' | 'connecting' | 'running' | 'completed' | 'cancelled' | 'error';
  jobId: string | null;
  config: SimulationConfig | null;
  
  // Progress
  currentIteration: number;
  progressPct: number;
  avgGap: number;
  
  // Accumulated data (client-side)
  iterations: number[];
  gapsByGame: number[][];  // [gameIndex][iterationIndex]
  avgGaps: number[];       // Average gap at each update
  
  // Matrices (set once)
  matrices: number[][][];  // [game][row][col]
  
  // Strategy histories (accumulated per update)
  rowStrategiesHistory: number[][][];  // [game][updateIndex][action]
  colStrategiesHistory: number[][][];  // [game][updateIndex][action]
  
  // Final results
  summary: JobSummary | null;
  
  // Error handling
  error: string | null;
}

export interface ChartDataPoint {
  iteration: number;
  [key: string]: number;  // Dynamic keys for each game
}

// ============================================================================
// Constants
// ============================================================================

export const DEFAULT_CONFIG: SimulationConfig = {
  mode: 'random',
  batch_size: 3,
  iterations: 1000,
  chunk_size: 10,
  seed: null,
  mixed_sizes: [3, 5, 7],
  include_strategies: true,
};

export const GAME_COLORS = [
  '#33b5e5',
  '#ff9830',
  '#73bf69',
  '#f2495c',
  '#b388ff',
  '#ffd54f',
  '#4dd0e1',
  '#ff6e40',
  '#aed581',
  '#ec407a',
];
