import React, { useState, useCallback } from 'react';

interface MatrixEditorProps {
  matrix: number[][];
  onChange: (matrix: number[][]) => void;
  disabled?: boolean;
  minSize?: number;
  maxSize?: number;
}

export function MatrixEditor({
  matrix,
  onChange,
  disabled = false,
  minSize = 2,
  maxSize = 20,
}: MatrixEditorProps) {
  const rows = matrix.length;
  const cols = matrix[0]?.length || 0;

  const updateCell = (row: number, col: number, value: number) => {
    const newMatrix = matrix.map((r, ri) =>
      r.map((c, ci) => (ri === row && ci === col ? value : c))
    );
    onChange(newMatrix);
  };

  const setSize = (newRows: number, newCols: number) => {
    const safeRows = Math.max(minSize, Math.min(maxSize, newRows));
    const safeCols = Math.max(minSize, Math.min(maxSize, newCols));
    
    const newMatrix: number[][] = [];
    for (let i = 0; i < safeRows; i++) {
      const row: number[] = [];
      for (let j = 0; j < safeCols; j++) {
        row.push(matrix[i]?.[j] ?? 0);
      }
      newMatrix.push(row);
    }
    onChange(newMatrix);
  };

  const applyTemplate = (template: 'zero-sum' | 'diagonal' | 'rps') => {
    let newMatrix: number[][];
    
    switch (template) {
      case 'zero-sum':
        newMatrix = matrix.map((row, i) =>
          row.map((_, j) => (i === j ? 0 : i < j ? 1 : -1))
        );
        break;
      case 'diagonal':
        newMatrix = matrix.map((row, i) =>
          row.map((_, j) => (i === j ? 1 : 0))
        );
        break;
      case 'rps':
        newMatrix = [
          [0, -1, 1],
          [1, 0, -1],
          [-1, 1, 0],
        ];
        break;
      default:
        return;
    }
    
    onChange(newMatrix);
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-4 items-center text-sm">
        <div className="flex items-center gap-2">
          <span className="text-muted">Rows:</span>
          <input
            type="number"
            value={rows}
            onChange={e => setSize(parseInt(e.target.value) || minSize, cols)}
            disabled={disabled}
            min={minSize}
            max={maxSize}
            className="w-16 text-center"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted">Cols:</span>
          <input
            type="number"
            value={cols}
            onChange={e => setSize(rows, parseInt(e.target.value) || minSize)}
            disabled={disabled}
            min={minSize}
            max={maxSize}
            className="w-16 text-center"
          />
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => applyTemplate('zero-sum')}
          disabled={disabled}
          className="text-xs bg-gray-700 px-2 py-1 rounded hover:bg-gray-600 disabled:opacity-50"
        >
          Zero-Sum
        </button>
        <button
          onClick={() => applyTemplate('diagonal')}
          disabled={disabled}
          className="text-xs bg-gray-700 px-2 py-1 rounded hover:bg-gray-600 disabled:opacity-50"
        >
          Diagonal
        </button>
        <button
          onClick={() => applyTemplate('rps')}
          disabled={disabled}
          className="text-xs bg-gray-700 px-2 py-1 rounded hover:bg-gray-600 disabled:opacity-50"
        >
          Rock-Paper-Scissors
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="border-collapse">
          <thead>
            <tr>
              <th className="w-10"></th>
              {Array.from({ length: cols }, (_, j) => (
                <th key={j} className="text-sm text-muted px-1 pb-1 text-center">
                  C{j}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.map((row, i) => (
              <tr key={i}>
                <td className="text-sm text-muted pr-2 text-right">R{i}</td>
                {row.map((val, j) => (
                  <td key={j} className="p-1">
                    <input
                      type="number"
                      value={val}
                      onChange={e =>
                        updateCell(i, j, parseFloat(e.target.value) || 0)
                      }
                      disabled={disabled}
                      step="0.1"
                      className="no-spinner w-24 text-center text-base px-3 py-2 font-mono"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
