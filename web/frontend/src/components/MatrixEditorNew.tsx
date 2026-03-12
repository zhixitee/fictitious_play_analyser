import React from "react";
import { getRPSGame, getDiagonalGame, zeros, skewSymmetrize, Matrix } from "../core/games";

interface MatrixEditorProps {
  matrix: Matrix;
  onChange: (matrix: Matrix) => void;
  disabled?: boolean;
}

/** Cell background based on position: upper triangle, diagonal, lower triangle */
function cellBg(i: number, j: number): string {
  if (i === j) return "bg-gray-600/40";     // diagonal
  if (j > i)   return "bg-blue-900/25";     // upper triangle
  return "bg-emerald-900/20";               // lower triangle
}

export function MatrixEditor({ matrix, onChange, disabled }: MatrixEditorProps) {
  const n = matrix.length;
  const m = matrix[0]?.length ?? n;

  const handleSizeChange = (newN: number, newM?: number) => {
    const actualM = newM ?? newN;
    const newMatrix = zeros(newN, actualM);
    
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

  const applyRandom = () => {
    const M = zeros(n, n);
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++)
        M[i][j] = Math.round((Math.random() * 2 - 1) * 100) / 100;
    onChange(skewSymmetrize(M));
  };

  const applyUpperTriangular = () => {
    const M = zeros(n, n);
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++)
        M[i][j] = 1;
    onChange(M);
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
        onChange(skewSymmetrize(matrix));
        break;
    }
  };

  return (
    <div className="space-y-3">
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

      <div className="bg-gray-800 rounded p-2 overflow-x-auto">
        <table className="text-sm">
          <thead>
            <tr>
              <th className="w-6"></th>
              {Array.from({ length: m }, (_, j) => (
                <th key={j} className="text-[10px] text-muted pb-0.5 text-center font-normal">C{j}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.map((row, i) => (
              <tr key={i}>
                <td className="text-[10px] text-muted pr-1 text-right">R{i}</td>
                {row.map((val, j) => (
                  <td key={j} className="p-0.5">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={val % 1 === 0 ? val.toString() : val.toFixed(2)}
                      onChange={(e) => {
                        const parsed = parseFloat(e.target.value);
                        if (!isNaN(parsed)) handleCellChange(i, j, parsed);
                        else if (e.target.value === "" || e.target.value === "-") return;
                      }}
                      onBlur={(e) => {
                        const parsed = parseFloat(e.target.value);
                        handleCellChange(i, j, isNaN(parsed) ? 0 : parsed);
                      }}
                      disabled={disabled}
                      className={`w-16 text-center text-sm py-1.5 px-2 font-mono rounded ${cellBg(i, j)}`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex gap-3 mt-1.5 text-[10px] text-muted">
          <span><span className="inline-block w-2.5 h-2.5 rounded-sm bg-blue-900/50 align-middle mr-1"></span>Upper</span>
          <span><span className="inline-block w-2.5 h-2.5 rounded-sm bg-gray-600/60 align-middle mr-1"></span>Diagonal</span>
          <span><span className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-900/40 align-middle mr-1"></span>Lower</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={applyRandom}
          disabled={disabled}
          className="text-xs bg-indigo-700 px-2 py-1 rounded hover:bg-indigo-600 transition-colors"
        >
          Random
        </button>
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
          onClick={applyUpperTriangular}
          disabled={disabled}
          className="text-xs bg-gray-700 px-2 py-1 rounded hover:bg-gray-600 transition-colors"
        >
          Upper Triangular
        </button>
        <button
          onClick={() => applyTemplate("antisym")}
          disabled={disabled}
          className="text-xs bg-gray-700 px-2 py-1 rounded hover:bg-gray-600 transition-colors"
        >
          Make Zero-Sum
        </button>
      </div>

      <p className="text-xs text-muted">
        Zero-sum games have A + A<sup>T</sup> = 0 (skew-symmetric)
      </p>
    </div>
  );
}

export default MatrixEditor;
