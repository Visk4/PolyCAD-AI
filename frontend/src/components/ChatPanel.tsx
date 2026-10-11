/**
 * ChatPanel — left sidebar with prompt input, message history, and auto-heal log.
 *
 * Shows each auto-heal attempt with status icon (✓/✗) and error details.
 */

import { useState } from "react";
import type { Attempt } from "../types";

interface ChatPanelProps {
  onSubmit: (prompt: string) => void;
  loading: boolean;
  attempts: Attempt[];
  errorMsg: string | null;
}

export default function ChatPanel({ onSubmit, loading, attempts, errorMsg }: ChatPanelProps) {
  const [prompt, setPrompt] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed || loading) return;
    onSubmit(trimmed);
  };

  return (
    <div className="flex flex-col h-full bg-zinc-800 rounded-lg border border-zinc-700">
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-700">
        <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide">
          Prompt
        </h2>
      </div>

      {/* Message / Heal log area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {attempts.length === 0 && !errorMsg && (
          <p className="text-zinc-500 text-sm italic">
            Describe a 3D object to generate...
          </p>
        )}

        {attempts.map((a) => (
          <div
            key={a.attempt}
            className={`text-sm rounded-md p-3 ${
              a.success
                ? "bg-green-900/30 border border-green-700/50"
                : "bg-red-900/30 border border-red-700/50"
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className={a.success ? "text-green-400" : "text-red-400"}>
                {a.success ? "✓" : "✗"}
              </span>
              <span className="text-zinc-300 font-medium">
                Attempt {a.attempt}
              </span>
              {a.success && (
                <span className="text-green-400 text-xs ml-auto">Compiled</span>
              )}
              {!a.success && (
                <span className="text-red-400 text-xs ml-auto">Failed</span>
              )}
            </div>
            {a.error && (
              <pre className="text-xs text-red-300 mt-2 whitespace-pre-wrap break-words max-h-32 overflow-y-auto font-mono bg-zinc-900/50 p-2 rounded">
                {a.error}
              </pre>
            )}
          </div>
        ))}

        {errorMsg && (
          <div className="text-sm rounded-md p-3 bg-red-900/30 border border-red-700/50">
            <p className="text-red-300">{errorMsg}</p>
          </div>
        )}
      </div>

      {/* Prompt input */}
      <form onSubmit={handleSubmit} className="p-3 border-t border-zinc-700">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e);
            }
          }}
          placeholder="e.g. phone stand with 60mm slot"
          className="w-full bg-zinc-900 text-zinc-200 text-sm rounded-md p-3 border border-zinc-600 resize-none focus:outline-none focus:border-blue-500 placeholder-zinc-500"
          rows={3}
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !prompt.trim()}
          className="mt-2 w-full bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-600 disabled:cursor-not-allowed text-white text-sm font-medium py-2 px-4 rounded-md transition-colors"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Generating...
            </span>
          ) : (
            "Generate"
          )}
        </button>
      </form>
    </div>
  );
}
