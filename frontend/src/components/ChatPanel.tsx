/**
 * ChatPanel — main chat window with GPT-style input bar.
 *
 * Features:
 * - Chat message bubbles (user right / assistant left)
 * - Image thumbnail preview above the input bar (ChatGPT-style)
 * - Paperclip attach button + send button inline in the bar
 * - Collapsible heal log attached to relevant messages
 * - Auto-scroll to latest message
 */

import { useState, useRef, useEffect } from "react";
import type { Attempt, ChatMessage } from "../types";

interface ChatPanelProps {
  onSubmit: (prompt: string) => void;
  onImageUpload: (file: File) => void;
  loading: boolean;
  attempts: Attempt[];
  chatMessages: ChatMessage[];
}

// ── Subcomponents ──────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="bg-zinc-700/80 rounded-2xl rounded-bl-sm px-4 py-3">
        <div className="flex items-center gap-1">
          {[0, 150, 300].map((delay) => (
            <span
              key={delay}
              className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce"
              style={{ animationDelay: `${delay}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function HealLog({ attempts }: { attempts: Attempt[] }) {
  const [open, setOpen] = useState(false);
  if (attempts.length === 0) return null;
  return (
    <div className="mt-1 ml-1">
      <button
        onClick={() => setOpen(!open)}
        className="text-[11px] text-zinc-500 hover:text-zinc-300 flex items-center gap-1 transition-colors"
      >
        <span>{open ? "▾" : "▸"}</span>
        <span>
          Heal log · {attempts.length} attempt{attempts.length > 1 ? "s" : ""}
        </span>
      </button>
      {open && (
        <div className="mt-1 space-y-1">
          {attempts.map((a) => (
            <div
              key={a.attempt}
              className={`text-xs rounded-lg p-2 border ${
                a.success
                  ? "bg-green-950/40 border-green-800/40 text-green-300"
                  : "bg-red-950/40 border-red-800/40 text-red-300"
              }`}
            >
              <span className="font-medium">
                {a.success ? "✓" : "✗"} Attempt {a.attempt}
              </span>
              {a.error && (
                <pre className="mt-1 text-[10px] whitespace-pre-wrap break-words max-h-20 overflow-y-auto font-mono opacity-80">
                  {a.error}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MessageBubble({
  msg,
  attempts,
}: {
  msg: ChatMessage;
  attempts: Attempt[];
}) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          isUser
            ? "bg-blue-600 text-white rounded-br-sm"
            : "bg-zinc-700/80 text-zinc-100 rounded-bl-sm"
        }`}
      >
        {/* Image thumbnail (for image-upload messages) */}
        {msg.imagePreview && (
          <img
            src={msg.imagePreview}
            alt="uploaded"
            className="w-32 h-24 object-cover rounded-lg mb-2 border border-white/20"
          />
        )}
        <p className="whitespace-pre-wrap break-words">{msg.content}</p>
        {msg.model_id && (
          <span className="block text-[10px] mt-1 opacity-40 font-mono">
            {msg.model_id}
          </span>
        )}
      </div>
      {/* Attach heal log to last assistant message */}
      {!isUser && msg.model_id && attempts.length > 0 && (
        <HealLog attempts={attempts} />
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────

export default function ChatPanel({
  onSubmit,
  onImageUpload,
  loading,
  attempts,
  chatMessages,
}: ChatPanelProps) {
  const [prompt, setPrompt] = useState("");
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatMessages, loading]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
  }, [prompt]);

  const handleImageSelect = (file: File) => {
    setPendingImage(file);
    setImagePreviewUrl(URL.createObjectURL(file));
  };

  const removePendingImage = () => {
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setPendingImage(null);
    setImagePreviewUrl(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    if (pendingImage) {
      // Image submit: pass to describeAndGenerate
      // Optional text is prepended to description (future enhancement)
      onImageUpload(pendingImage);
      removePendingImage();
      setPrompt("");
      return;
    }

    const trimmed = prompt.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setPrompt("");
  };

  const canSend = !loading && (pendingImage !== null || prompt.trim().length > 0);

  return (
    <div className="flex flex-col h-full bg-zinc-900 overflow-hidden">
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {chatMessages.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
              style={{
                background: "linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)",
              }}
            >
              <span className="text-2xl">🧊</span>
            </div>
            <p className="text-zinc-300 font-semibold text-base mb-1">
              PolyCAD AI
            </p>
            <p className="text-zinc-500 text-sm mb-4">
              Describe a 3D object or upload a photo
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              {[
                "Phone stand with 60mm slot",
                "Mechanical gear, 24 teeth",
                "Box with snap-fit lid",
              ].map((s) => (
                <button
                  key={s}
                  onClick={() => { onSubmit(s); }}
                  className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white px-3 py-1.5 rounded-full border border-zinc-700 hover:border-zinc-500 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {chatMessages.map((msg, i) => (
          <MessageBubble
            key={i}
            msg={msg}
            attempts={i === chatMessages.length - 1 ? attempts : []}
          />
        ))}

        {loading && <TypingIndicator />}
      </div>

      {/* Input area */}
      <div className="px-3 pb-3">
        <form
          onSubmit={handleSubmit}
          className="relative bg-zinc-800 border border-zinc-700 rounded-2xl focus-within:border-zinc-500 transition-colors shadow-lg"
        >
          {/* Image preview strip */}
          {pendingImage && imagePreviewUrl && (
            <div className="px-3 pt-3 pb-1">
              <div className="relative inline-block">
                <img
                  src={imagePreviewUrl}
                  alt="preview"
                  className="w-20 h-16 object-cover rounded-xl border border-zinc-600"
                />
                <button
                  type="button"
                  onClick={removePendingImage}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-zinc-600 hover:bg-red-600 text-white rounded-full flex items-center justify-center text-[10px] font-bold transition-colors shadow"
                >
                  ✕
                </button>
                <div className="absolute bottom-1 left-1 bg-black/60 text-[9px] text-white px-1.5 py-0.5 rounded-md backdrop-blur-sm">
                  {pendingImage.name.length > 12
                    ? pendingImage.name.slice(0, 12) + "…"
                    : pendingImage.name}
                </div>
              </div>
            </div>
          )}

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e as unknown as React.FormEvent);
              }
            }}
            placeholder={
              pendingImage
                ? "Add context (optional)…"
                : "Describe a 3D model…"
            }
            className="w-full bg-transparent text-zinc-200 text-sm px-4 pt-3 pb-1 resize-none focus:outline-none placeholder-zinc-500 min-h-[44px] max-h-[160px]"
            rows={1}
            disabled={loading}
          />

          {/* Bottom toolbar */}
          <div className="flex items-center justify-between px-3 pb-2 pt-1">
            {/* Left — attach image */}
            <div className="flex items-center gap-1">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImageSelect(file);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
                className="text-zinc-500 hover:text-zinc-300 disabled:opacity-40 p-1.5 rounded-lg hover:bg-zinc-700 transition-colors"
                title="Attach image"
              >
                {/* Paperclip icon */}
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>
                </svg>
              </button>
              <span className="text-[10px] text-zinc-600">
                {pendingImage ? "Image attached" : "Attach image"}
              </span>
            </div>

            {/* Right — send button */}
            <button
              type="submit"
              disabled={!canSend}
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                canSend
                  ? "bg-blue-600 hover:bg-blue-500 text-white shadow-md"
                  : "bg-zinc-700 text-zinc-500 cursor-not-allowed"
              }`}
              title="Send"
            >
              {loading ? (
                <span className="w-4 h-4 border-2 border-zinc-400/30 border-t-zinc-400 rounded-full animate-spin" />
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z"/>
                </svg>
              )}
            </button>
          </div>
        </form>

        <p className="text-center text-[10px] text-zinc-600 mt-1.5">
          Shift+Enter for newline · Enter to send
        </p>
      </div>
    </div>
  );
}
