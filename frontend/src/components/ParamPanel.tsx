/**
 * ParamPanel — right sidebar with parameter sliders, download buttons,
 * and a collapsible code viewer.
 *
 * Each slider is generated dynamically from the params[] returned by the backend.
 * Slider label shows the variable name (formatted), current value, and range.
 */

import { useState } from "react";
import type { Param } from "../types";
import { stlUrl, scadUrl } from "../api/client";

interface ParamPanelProps {
  params: Param[];
  code: string;
  stlPath: string | null;
  scadPath: string | null;
  onParamChange: (name: string, value: number) => void;
  recompiling: boolean;
}

/** Format variable names: snake_case → Title Case */
function formatName(name: string): string {
  return name
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function ParamPanel({
  params,
  code,
  stlPath,
  scadPath,
  onParamChange,
  recompiling,
}: ParamPanelProps) {
  const [codeOpen, setCodeOpen] = useState(false);

  return (
    <div className="flex flex-col h-full bg-zinc-800 rounded-lg border border-zinc-700">
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-700 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide">
          Parameters
        </h2>
        {recompiling && (
          <span className="text-xs text-blue-400 flex items-center gap-1">
            <span className="w-3 h-3 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
            Recompiling
          </span>
        )}
      </div>

      {/* Sliders */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {params.length === 0 && (
          <p className="text-zinc-500 text-sm italic">
            No parameters yet — generate a model first.
          </p>
        )}

        {params.map((p) => (
          <div key={p.name} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <label className="text-zinc-300 font-medium">
                {formatName(p.name)}
              </label>
              <span className="text-zinc-400 font-mono">{p.value}</span>
            </div>
            <input
              type="range"
              min={p.min}
              max={p.max}
              step={p.step}
              value={p.value}
              onChange={(e) => onParamChange(p.name, parseFloat(e.target.value))}
              className="w-full h-1.5 bg-zinc-600 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
            <div className="flex justify-between text-[10px] text-zinc-500">
              <span>{p.min}</span>
              <span>{p.max}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Download buttons */}
      <div className="p-3 space-y-2 border-t border-zinc-700">
        <div className="flex gap-2">
          <a
            href={stlPath ? stlUrl(stlPath) : "#"}
            download
            className={`flex-1 text-center text-sm py-2 rounded-md font-medium transition-colors ${
              stlPath
                ? "bg-green-600 hover:bg-green-500 text-white"
                : "bg-zinc-700 text-zinc-500 cursor-not-allowed"
            }`}
            onClick={(e) => !stlPath && e.preventDefault()}
          >
            ↓ STL
          </a>
          <a
            href={scadPath ? scadUrl(scadPath) : "#"}
            download
            className={`flex-1 text-center text-sm py-2 rounded-md font-medium transition-colors ${
              scadPath
                ? "bg-purple-600 hover:bg-purple-500 text-white"
                : "bg-zinc-700 text-zinc-500 cursor-not-allowed"
            }`}
            onClick={(e) => !scadPath && e.preventDefault()}
          >
            ↓ SCAD
          </a>
        </div>

        {/* Code viewer toggle */}
        <button
          onClick={() => setCodeOpen(!codeOpen)}
          className="w-full text-left text-xs text-zinc-400 hover:text-zinc-200 py-1 transition-colors"
        >
          {codeOpen ? "▼" : "▶"} OpenSCAD Code
        </button>
        {codeOpen && code && (
          <pre className="text-xs text-zinc-300 bg-zinc-900 p-3 rounded-md max-h-64 overflow-auto font-mono whitespace-pre-wrap border border-zinc-700">
            {code}
          </pre>
        )}
      </div>
    </div>
  );
}
