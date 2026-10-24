/**
 * App — root component wiring together the full layout.
 *
 * Layout: [ChatSidebar | ChatPanel] | Viewport | ParamPanel
 *
 * - ChatSidebar: collapsible session history (GPT-style)
 * - ChatPanel: active conversation window with GPT-style input bar
 * - Viewport: Three.js STL renderer
 * - ParamPanel: dynamic parametric sliders
 *
 * Side panels separated by draggable ResizeHandle dividers.
 */

import { useState, useCallback } from "react";
import ChatSidebar from "./components/ChatSidebar";
import ChatPanel from "./components/ChatPanel";
import Viewport from "./components/Viewport";
import ParamPanel from "./components/ParamPanel";
import ResizeHandle from "./components/ResizeHandle";
import { useGenerate } from "./hooks/useGenerate";

// Min/max widths for side panels (pixels)
const MIN_PANEL = 240;
const MAX_PANEL = 560;
const DEFAULT_LEFT = 360;
const DEFAULT_RIGHT = 300;

export default function App() {
  const {
    state,
    generate,
    updateParam,
    newSession,
    deleteSession,
    switchSession,
    describeAndGenerate,
  } = useGenerate();

  // Panel widths
  const [leftWidth, setLeftWidth] = useState(DEFAULT_LEFT);
  const [rightWidth, setRightWidth] = useState(DEFAULT_RIGHT);

  // Sidebar collapsed state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const handleLeftResize = useCallback((delta: number) => {
    setLeftWidth((w) => Math.min(MAX_PANEL, Math.max(MIN_PANEL, w + delta)));
  }, []);

  const handleRightResize = useCallback((delta: number) => {
    setRightWidth((w) => Math.min(MAX_PANEL, Math.max(MIN_PANEL, w - delta)));
  }, []);

  return (
    <div className="h-screen w-screen bg-zinc-950 text-zinc-100 flex flex-col overflow-hidden">
      {/* ── Top bar ───────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-5 py-2.5 border-b border-zinc-800 bg-zinc-900 shrink-0">
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm shadow"
            style={{ background: "linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)" }}
          >
            P
          </div>
          <h1 className="text-base font-semibold tracking-tight">
            PolyCAD <span className="text-blue-400">AI</span>
          </h1>
        </div>
        <span className="text-xs text-zinc-500">
          Text · Image → Parametric 3D CAD
        </span>
        {/* Status indicator */}
        <div className="flex items-center gap-2">
          {state.recompiling && (
            <span className="text-[11px] text-amber-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              Recompiling…
            </span>
          )}
          {state.status === "success" && !state.recompiling && (
            <span className="text-[11px] text-green-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
              Ready
            </span>
          )}
          {state.status === "loading" && (
            <span className="text-[11px] text-blue-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
              Generating…
            </span>
          )}
        </div>
      </header>

      {/* ── Main layout ───────────────────────────────────────── */}
      <main className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left section: Sidebar + Chat */}
        <div
          className="flex min-h-0 shrink-0"
          style={{ width: leftWidth }}
        >
          {/* Session sidebar */}
          <ChatSidebar
            sessions={state.sessionList}
            activeSessionId={state.sessionId}
            onNewChat={newSession}
            onSelectSession={switchSession}
            onDeleteSession={deleteSession}
            collapsed={sidebarCollapsed}
            onToggle={() => setSidebarCollapsed((v) => !v)}
          />

          {/* Chat window */}
          <div className="flex-1 min-w-0 h-full">
            <ChatPanel
              onSubmit={generate}
              onImageUpload={describeAndGenerate}
              loading={state.status === "loading"}
              attempts={state.attempts}
              chatMessages={state.chatMessages}
            />
          </div>
        </div>

        {/* Left resize handle */}
        <div className="flex items-stretch">
          <ResizeHandle onResize={handleLeftResize} />
        </div>

        {/* Center: 3D Viewport */}
        <div className="flex-1 min-w-0 p-2">
          <Viewport
            stlPath={state.stlUrl}
            loading={state.status === "loading"}
            recompiling={state.recompiling}
            stlRevision={state.stlRevision}
          />
        </div>

        {/* Right resize handle */}
        <div className="flex items-stretch">
          <ResizeHandle onResize={handleRightResize} />
        </div>

        {/* Right: Param panel */}
        <div className="shrink-0 p-2 pl-0" style={{ width: rightWidth }}>
          <ParamPanel
            params={state.params}
            code={state.code}
            stlPath={state.stlUrl}
            scadPath={state.scadUrl}
            onParamChange={updateParam}
            recompiling={state.recompiling}
          />
        </div>
      </main>
    </div>
  );
}
