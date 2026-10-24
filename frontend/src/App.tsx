/**
 * App — root component wiring together the three-panel layout.
 *
 * Layout: ChatPanel (left) | Viewport (center) | ParamPanel (right)
 * All state flows through the useGenerate hook.
 * Panels are separated by draggable resize handles.
 */

import { useState, useCallback } from "react";
import ChatPanel from "./components/ChatPanel";
import Viewport from "./components/Viewport";
import ParamPanel from "./components/ParamPanel";
import ResizeHandle from "./components/ResizeHandle";
import { useGenerate } from "./hooks/useGenerate";

// Min/max widths for side panels (pixels)
const MIN_PANEL = 200;
const MAX_PANEL = 500;
const DEFAULT_LEFT = 300;
const DEFAULT_RIGHT = 300;

export default function App() {
  const { state, generate, updateParam, newSession, describeAndGenerate } = useGenerate();

  // Panel widths in pixels
  const [leftWidth, setLeftWidth] = useState(DEFAULT_LEFT);
  const [rightWidth, setRightWidth] = useState(DEFAULT_RIGHT);

  const handleLeftResize = useCallback((delta: number) => {
    setLeftWidth((w) => Math.min(MAX_PANEL, Math.max(MIN_PANEL, w + delta)));
  }, []);

  const handleRightResize = useCallback((delta: number) => {
    // Dragging right handle to the RIGHT should shrink the right panel
    setRightWidth((w) => Math.min(MAX_PANEL, Math.max(MIN_PANEL, w - delta)));
  }, []);

  return (
    <div className="h-screen w-screen bg-zinc-950 text-zinc-100 flex flex-col overflow-hidden">
      {/* Top bar */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-zinc-800 bg-zinc-900 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">
            P
          </div>
          <h1 className="text-lg font-semibold tracking-tight">
            PolyCAD <span className="text-blue-400">AI</span>
          </h1>
        </div>
        <span className="text-xs text-zinc-500">Text → Parametric 3D CAD</span>
      </header>

      {/* Main three-column layout with resize handles */}
      <main className="flex-1 flex p-3 min-h-0 gap-0">
        {/* Left: Chat/Prompt panel */}
        <div className="shrink-0" style={{ width: leftWidth }}>
          <ChatPanel
            onSubmit={generate}
            onNewSession={newSession}
            onImageUpload={describeAndGenerate}
            loading={state.status === "loading"}
            attempts={state.attempts}
            errorMsg={state.errorMsg}
            chatMessages={state.chatMessages}
            sessionId={state.sessionId}
          />
        </div>

        {/* Left resize handle */}
        <div className="flex items-stretch px-1">
          <ResizeHandle onResize={handleLeftResize} />
        </div>

        {/* Center: 3D Viewport (flex-1) */}
        <div className="flex-1 min-w-0">
          <Viewport
            stlPath={state.stlUrl}
            loading={state.status === "loading"}
            recompiling={state.recompiling}
            stlRevision={state.stlRevision}
          />
        </div>

        {/* Right resize handle */}
        <div className="flex items-stretch px-1">
          <ResizeHandle onResize={handleRightResize} />
        </div>

        {/* Right: Param panel */}
        <div className="shrink-0" style={{ width: rightWidth }}>
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
