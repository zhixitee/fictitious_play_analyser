import React, { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

interface DualityGapModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const RPS_MATRIX = [
  [0, -1, 1],
  [1, 0, -1],
  [-1, 1, 0],
] as const;

const LABELS = ["Rock", "Paper", "Scissors"];
const COLORS = ["#ef4444", "#3b82f6", "#22c55e"];

function renormalizeThree(values: number[]): number[] {
  const sum = values[0] + values[1] + values[2];
  if (sum <= 0) return [1 / 3, 1 / 3, 1 / 3];
  return values.map((v) => Math.max(0, v / sum));
}

export function DualityGapModal({ isOpen, onClose }: DualityGapModalProps) {
  const [p1Strategy, setP1Strategy] = useState<number[]>([0.8, 0.1, 0.1]);
  const [p2Strategy, setP2Strategy] = useState<number[]>([0.1, 0.8, 0.1]);

  const handleSlider = (player: 1 | 2, index: number, value: number) => {
    const current = player === 1 ? p1Strategy : p2Strategy;
    const next = [...current];

    const clamped = Math.max(0, Math.min(1, value));
    const oldVal = next[index];
    next[index] = clamped;

    const oldRemainder = 1 - oldVal;
    const newRemainder = 1 - clamped;
    const other1 = (index + 1) % 3;
    const other2 = (index + 2) % 3;

    if (oldRemainder <= 1e-9) {
      next[other1] = newRemainder / 2;
      next[other2] = newRemainder / 2;
    } else {
      next[other1] = (next[other1] / oldRemainder) * newRemainder;
      next[other2] = (next[other2] / oldRemainder) * newRemainder;
    }

    const normalized = renormalizeThree(next);
    if (player === 1) {
      setP1Strategy(normalized);
    } else {
      setP2Strategy(normalized);
    }
  };

  const snapToNash = () => {
    const nash = [1 / 3, 1 / 3, 1 / 3];
    setP1Strategy(nash);
    setP2Strategy(nash);
  };

  const gapMetrics = useMemo(() => {
    const Ay = [
      RPS_MATRIX[0][0] * p2Strategy[0] + RPS_MATRIX[0][1] * p2Strategy[1] + RPS_MATRIX[0][2] * p2Strategy[2],
      RPS_MATRIX[1][0] * p2Strategy[0] + RPS_MATRIX[1][1] * p2Strategy[1] + RPS_MATRIX[1][2] * p2Strategy[2],
      RPS_MATRIX[2][0] * p2Strategy[0] + RPS_MATRIX[2][1] * p2Strategy[1] + RPS_MATRIX[2][2] * p2Strategy[2],
    ];
    const maxP1 = Math.max(...Ay);

    const xA = [
      p1Strategy[0] * RPS_MATRIX[0][0] + p1Strategy[1] * RPS_MATRIX[1][0] + p1Strategy[2] * RPS_MATRIX[2][0],
      p1Strategy[0] * RPS_MATRIX[0][1] + p1Strategy[1] * RPS_MATRIX[1][1] + p1Strategy[2] * RPS_MATRIX[2][1],
      p1Strategy[0] * RPS_MATRIX[0][2] + p1Strategy[1] * RPS_MATRIX[1][2] + p1Strategy[2] * RPS_MATRIX[2][2],
    ];
    const minP1 = Math.min(...xA);

    const gap = Math.max(0, maxP1 - minP1);
    const gapPercentage = Math.max(0, Math.min(100, (gap / 2) * 100));
    return { gap, gapPercentage };
  }, [p1Strategy, p2Strategy]);

  // Map gap in [0, 2] to HSL hue in [120 (green), 0 (red)] for smooth color feedback.
  const gapColor = useMemo(() => {
    const normalized = Math.max(0, Math.min(1, gapMetrics.gap / 2));
    const hue = 120 * (1 - normalized);
    return `hsl(${hue.toFixed(1)} 85% 55%)`;
  }, [gapMetrics.gap]);

  const severity = useMemo(() => Math.max(0, Math.min(1, gapMetrics.gap / 2)), [gapMetrics.gap]);
  const skullness = useMemo(() => Math.max(0, Math.min(1, (severity - 0.55) / 0.45)), [severity]);
  const smileCurve = useMemo(() => 62 - severity * 40, [severity]);
  const faceHue = useMemo(() => 120 - severity * 120, [severity]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ type: "spring", stiffness: 280, damping: 24 }}
            className="bg-surface border border-border rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-border bg-[#111214]">
              <h2 className="text-lg md:text-xl font-bold text-gray-100">
                Understanding the Duality Gap (Exploitability)
              </h2>
              <button
                onClick={onClose}
                className="text-muted hover:text-white transition-colors"
                aria-label="Close duality gap visualizer"
              >
                <X size={22} />
              </button>
            </div>

            <div className="flex-1 overflow-auto">
              <div className="flex flex-col md:flex-row min-h-full">
                <div className="p-6 md:w-1/2 border-r border-border bg-[#161719] text-sm leading-relaxed space-y-4">
                  <p className="text-gray-300">
                    Think of the <strong>Duality Gap</strong> as an <span className="text-white font-bold">exploitability meter</span>.
                  </p>
                  <p className="text-gray-400">
                    In Rock-Paper-Scissors, if one player is predictable, the other can exploit that pattern.
                    The duality gap measures exactly how exploitable the current pair of mixed strategies is.
                  </p>
                  <div className="bg-gray-800/50 p-3 rounded border border-gray-700/50">
                    <p className="text-gray-300 italic">
                      "If each player best-responded to the other player's current mix, how much room for improvement is left?"
                    </p>
                  </div>
                  <p className="text-gray-400">
                    Mathematically, it is
                    <span className="text-gray-200 font-mono"> max(Ay) - min(x^T A)</span>.
                    At Nash equilibrium, this value is exactly zero.
                  </p>
                  <p className="text-gray-300 font-semibold">
                    Use the sliders to create predictable strategies, then click <span className="text-yellow-400">Snap to Nash Equilibrium</span>.
                  </p>
                </div>

                <div className="p-6 md:w-1/2 flex flex-col gap-6 bg-[#0b0c0e]">
                  <div className="text-center bg-surface border border-border p-4 rounded-lg">
                    <div className="text-muted text-xs uppercase tracking-widest mb-1">Current Duality Gap</div>
                    <div
                      className="text-4xl font-mono font-bold"
                      style={{ color: gapColor }}
                    >
                      {gapMetrics.gap.toFixed(4)}
                    </div>

                    <div className="mt-4 flex justify-center">
                      <motion.svg
                        width="112"
                        height="112"
                        viewBox="0 0 100 100"
                        aria-label="Duality gap mood indicator"
                        initial={false}
                      >
                        <motion.circle
                          cx="50"
                          cy="50"
                          r="38"
                          stroke="rgba(255,255,255,0.25)"
                          strokeWidth="2"
                          animate={{
                            fill: `hsl(${faceHue.toFixed(1)} 70% ${skullness > 0.8 ? 82 : 60}%)`,
                          }}
                          transition={{ duration: 0.35 }}
                        />

                        <motion.circle
                          cx="35"
                          cy="40"
                          r={4 - skullness * 1.2}
                          fill="#111827"
                          animate={{ opacity: 1 - skullness }}
                          transition={{ duration: 0.25 }}
                        />
                        <motion.circle
                          cx="65"
                          cy="40"
                          r={4 - skullness * 1.2}
                          fill="#111827"
                          animate={{ opacity: 1 - skullness }}
                          transition={{ duration: 0.25 }}
                        />

                        <motion.path
                          d="M31 36 L39 44"
                          stroke="#111827"
                          strokeWidth="3"
                          strokeLinecap="round"
                          animate={{ opacity: skullness }}
                          transition={{ duration: 0.25 }}
                        />
                        <motion.path
                          d="M39 36 L31 44"
                          stroke="#111827"
                          strokeWidth="3"
                          strokeLinecap="round"
                          animate={{ opacity: skullness }}
                          transition={{ duration: 0.25 }}
                        />
                        <motion.path
                          d="M61 36 L69 44"
                          stroke="#111827"
                          strokeWidth="3"
                          strokeLinecap="round"
                          animate={{ opacity: skullness }}
                          transition={{ duration: 0.25 }}
                        />
                        <motion.path
                          d="M69 36 L61 44"
                          stroke="#111827"
                          strokeWidth="3"
                          strokeLinecap="round"
                          animate={{ opacity: skullness }}
                          transition={{ duration: 0.25 }}
                        />

                        <motion.path
                          d={`M30 62 Q50 ${smileCurve.toFixed(2)} 70 62`}
                          fill="none"
                          stroke="#111827"
                          strokeWidth="3"
                          strokeLinecap="round"
                          animate={{ opacity: Math.max(0, 1 - skullness * 2) }}
                          transition={{ duration: 0.35 }}
                        />

                        <motion.polygon
                          points="50,48 44,58 56,58"
                          fill="#111827"
                          animate={{ opacity: skullness }}
                          transition={{ duration: 0.3 }}
                        />
                        <motion.rect
                          x="36"
                          y="61"
                          width="28"
                          height="10"
                          rx="2"
                          fill="#111827"
                          animate={{ opacity: skullness }}
                          transition={{ duration: 0.3 }}
                        />
                        {[41, 46, 51, 56, 61].map((x) => (
                          <motion.line
                            key={x}
                            x1={x}
                            y1="62"
                            x2={x}
                            y2="70"
                            stroke="#f8fafc"
                            strokeWidth="1"
                            animate={{ opacity: skullness }}
                            transition={{ duration: 0.3 }}
                          />
                        ))}
                      </motion.svg>
                    </div>

                    <div className="text-[11px] text-muted mt-1 font-mono">
                      {severity < 0.15 && "Calm: near Nash equilibrium"}
                      {severity >= 0.15 && severity < 0.55 && "Warning: exploitability rising"}
                      {severity >= 0.55 && "Critical: highly exploitable"}
                    </div>
                    <div className="mt-3 h-2 w-full bg-gray-800 rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-gradient-to-r from-green-500 via-yellow-500 to-red-500"
                        animate={{ width: `${gapMetrics.gapPercentage}%` }}
                        transition={{ type: "spring", bounce: 0, duration: 0.5 }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-muted mt-1 font-mono">
                      <span>0.0 (Nash)</span>
                      <span>2.0 (Max)</span>
                    </div>
                  </div>

                  <div className="flex gap-6">
                    {[1, 2].map((player) => (
                      <div key={player} className="flex-1 space-y-3">
                        <h3 className="text-sm font-bold text-gray-300 border-b border-border pb-1">
                          Player {player} Strategy
                        </h3>
                        {LABELS.map((label, idx) => {
                          const val = player === 1 ? p1Strategy[idx] : p2Strategy[idx];
                          return (
                            <div key={label} className="space-y-1">
                              <div className="flex justify-between text-xs">
                                <span style={{ color: COLORS[idx] }}>{label}</span>
                                <span className="font-mono text-muted">{(val * 100).toFixed(0)}%</span>
                              </div>
                              <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.01"
                                value={val}
                                onChange={(e) => handleSlider(player as 1 | 2, idx, parseFloat(e.target.value))}
                                className="w-full accent-gray-500"
                              />
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>

                  <div className="mt-auto">
                    <button
                      onClick={snapToNash}
                      className="w-full py-2 bg-gray-800 hover:bg-gray-700 border border-gray-600 text-gray-200 text-sm font-bold rounded transition-colors"
                    >
                      Snap to Nash Equilibrium
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default DualityGapModal;