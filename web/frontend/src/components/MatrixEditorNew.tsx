/**
 * Matrix Editor Component
 * 
 * Editable matrix for custom game mode:
 * - Adjustable rows/cols (2..10)
 * - Grid input for values
 * - Template presets (zero-sum, diagonal, RPS)
 */

import React from "react";
import { getRPSGame, getDiagonalGame, zeros, Matrix } from "../core/games";

interface MatrixEditorProps {
  matrix: Matrix;
  onChange: (matrix: Matrix) => void;
  disabled?: boolean;
}

export function MatrixEditor({ matrix, onChange, disabled }: MatrixEditorProps) {
  const n = matrix.length;
  const m = matrix[0]?.length ?? n;

  const handleSizeChange = (newN: number, newM?: number) => {
    const actualM = newM ?? newN;
    const newMatrix = zeros(newN, actualM);
    
    // Copy existing values
    for (let i = 0; i < Math.min(n, newN); i++) {
      for (let j = 0; j < Math.min(m, actualM); j++) {
        newMatrix[i][j] = matrix[i]?.[j] ?? 0;
      }
    }
    
    onChange(newMatrix);
  };

  const handleCellChange = (row: number, col: number, value: number) => {
    const newMatrix = matrix.map((r, i) =>
      r.map((v, j) => (i === row && j === col ? value : v))
    );
    onChange(newMatrix);
  };

  const applyTemplate = (template: "rps" | "diagonal" | "zeros" | "antisym") => {
    switch (template) {
      case "rps":
        onChange(getRPSGame());
        break;
      case "diagonal":
        onChange(getDiagonalGame(n));
        break;
      case "zeros":
        onChange(zeros(n, n));
        break;
      case "antisym":
        // Make current matrix skew-symmetric
        const skew = zeros(n, n);
        for (let i = 0; i < n; i++) {
          for (let j = 0; j < n; j++) {
            skew[i][j] = (matrix[i][j] - (matrix[j]?.[i] ?? 0)) / 2;
          }
        }
        onChange(skew);
        break;
    }
  };

  return (
    <div className="space-y-3">
      {/* Size Controls */}
      <div className="flex gap-4 items-center">
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted">Size:</label>
          <select
            value={n}
            onChange={(e) => handleSizeChange(parseInt(e.target.value))}
            disabled={disabled}
            className="text-sm py-1"
          >
            {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((size) => (
              <option key={size} value={size}>
                {size}x{size}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Matrix Grid */}
      <div className="bg-gray-800 rounded p-2 overflow-x-auto">
        <table className="text-xs">
          <tbody>
            {matrix.map((row, i) => (
              <tr key={i}>
                {row.map((val, j) => (
                  <td key={j} className="p-0.5">
                    <input
                      type="number"
                      value={val.toFixed(2)}
                      onChange={(e) =>
                        handleCellChange(i, j, parseFloat(e.target.value) || 0)
                      }
                      disabled={disabled}
                      className="w-14 text-center text-xs py-1"
                      step="0.1"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Templates */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => applyTemplate("zeros")}
          disabled={disabled}
          className="text-xs bg-gray-700 px-2 py-1 rounded hover:bg-gray-600 transition-colors"
        >
          Zeros
        </button>
        <button
          onClick={() => applyTemplate("rps")}
          disabled={disabled}
          className="text-xs bg-gray-700 px-2 py-1 rounded hover:bg-gray-600 transition-colors"
        >
          RPS 3x3
        </button>
        <button
          onClick={() => applyTemplate("diagonal")}
          disabled={disabled}
          className="text-xs bg-gray-700 px-2 py-1 rounded hover:bg-gray-600 transition-colors"
        >
          Diagonal
        </button>
        <button
          onClick={() => applyTemplate("antisym")}
          disabled={disabled}
          className="text-xs bg-gray-700 px-2 py-1 rounded hover:bg-gray-600 transition-colors"
        >
          Make Zero-Sum
        </button>
      </div>

      {/* Hint */}
      <p className="text-xs text-muted">
        Zero-sum games have A + A<sup>T</sup> = 0 (skew-symmetric)
      </p>
    </div>
  );
}

export default MatrixEditor;
