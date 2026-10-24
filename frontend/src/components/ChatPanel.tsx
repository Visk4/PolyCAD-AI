/**
 * ChatPanel — left sidebar with chat history, prompt input, and auto-heal log.
 *
 * Displays conversation messages as bubbles (user right, assistant left).
 * Shows auto-heal attempts inline when expanded.
 */

import { useState, useRef, useEffect } from "react";
import type { Attempt, ChatMessage } from "../types";

interface ChatPanelProps {
  onSubmit: (prompt: string) => void;
  onNewSession: () => void;
  onImageUpload: (file: File) => void;
  loading: boolean;
  attempts: Attempt[];
  errorMsg: string | null;
  chatMessages: ChatMessage[];
  sessionId: string | null;
}

export default function ChatPanel({
  onSubmit,
  onNewSession,
  onImageUpload,
  loading,
  attempts,
  errorMsg,
  chatMessages,
  sessionId,
}: ChatPanelProps) {
  const [prompt, setPrompt] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [healOpen, setHealOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatMessages, attempts]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed || loading) return;
    onSubmit(trimmed);
    setPrompt("");
  };

  return (
    <div className="flex flex-col h-full bg-zinc-800 rounded-lg border border-zinc-700">
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-700 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide">
          Chat
        </h2>
        <div className="flex items-center gap-2">
          {sessionId && (
            <span className="text-[10px] text-zinc-500 font-mono">
              {sessionId}
            </span>
          )}
          <button
            onClick={onNewSession}
            className="text-xs text-zinc-400 hover:text-zinc-200 bg-zinc-700 hover:bg-zinc-600 px-2 py-1 rounded transition-colors"
            title="Start new conversation"
          >
            + New
          </button>
        </div>
      </div>

      {/* Chat messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
        {chatMessages.length === 0 && !errorMsg && (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div className="w-12 h-12 bg-zinc-700 rounded-xl flex items-center justify-center mb-3">
              <span className="text-2xl">🧊</span>
            </div>
            <p className="text-zinc-400 text-sm font-medium mb-1">
              Describe a 3D object
            </p>
            <p className="text-zinc-500 text-xs">
              e.g. "phone stand with 60mm slot"
            </p>
          </div>
        )}

        {chatMessages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                msg.role === "user"
                  ? "bg-blue-600 text-white rounded-br-sm"
                  : "bg-zinc-700 text-zinc-200 rounded-bl-sm"
              }`}
            >
              <p className="whitespace-pre-wrap break-words">{msg.content}</p>
              {msg.model_id && (
                <span className="block text-[10px] mt-1 opacity-60 font-mono">
                  model: {msg.model_id}
                </span>
              )}
            </div>
          </div>
        ))}

        {/* Loading indicator */}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-zinc-700 rounded-xl rounded-bl-sm px-4 py-3">
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}

        {/* Heal log (collapsible) */}
        {attempts.length > 0 && (
          <div className="mt-2">
            <button
              onClick={() => setHealOpen(!healOpen)}
              className="w-full text-left text-xs text-zinc-400 hover:text-zinc-200 py-1 transition-colors flex items-center gap-1"
            >
              <span>{healOpen ? "▼" : "▶"}</span>
              <span>Heal Log ({attempts.length} attempt{attempts.length > 1 ? "s" : ""})</span>
            </button>
            {healOpen &&
              attempts.map((a) => (
                <div
                  key={a.attempt}
                  className={`text-xs rounded-md p-2 mt-1 ${
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
                  </div>
                  {a.error && (
                    <pre className="text-[10px] text-red-300 mt-1 whitespace-pre-wrap break-words max-h-24 overflow-y-auto font-mono bg-zinc-900/50 p-2 rounded">
                      {a.error}
                    </pre>
                  )}
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Prompt input */}
      <form onSubmit={handleSubmit} className="p-3 border-t border-zinc-700">
        <div className="flex gap-2">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            placeholder="Describe a 3D model..."
            className="flex-1 bg-zinc-900 text-zinc-200 text-sm rounded-lg p-2.5 border border-zinc-600 resize-none focus:outline-none focus:border-blue-500 placeholder-zinc-500"
            rows={2}
            disabled={loading}
          />
          <div className="flex flex-col gap-1 self-end">
            {/* Image upload button */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  onImageUpload(file);
                  e.target.value = ""; // reset so same file can be re-uploaded
                }
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
              className="bg-zinc-700 hover:bg-zinc-600 disabled:bg-zinc-700 disabled:cursor-not-allowed text-zinc-300 hover:text-white text-sm font-medium py-2.5 px-3 rounded-lg transition-colors"
              title="Upload image to generate from"
            >
              📷
            </button>
            <button
              type="submit"
              disabled={loading || !prompt.trim()}
              className="bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-600 disabled:cursor-not-allowed text-white text-sm font-medium py-2.5 px-4 rounded-lg transition-colors shrink-0"
            >
              {loading ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" />
              ) : (
                "→"
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
