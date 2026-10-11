/**
 * App — root component wiring together the three-panel layout.
 *
 * Layout: ChatPanel (left) | Viewport (center) | ParamPanel (right)
 * All state flows through the useGenerate hook.
 */

import ChatPanel from "./components/ChatPanel";
import Viewport from "./components/Viewport";
import ParamPanel from "./components/ParamPanel";
import { useGenerate } from "./hooks/useGenerate";

export default function App() {
  const { state, generate, updateParam } = useGenerate();

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

      {/* Main three-column layout */}
      <main className="flex-1 flex gap-3 p-3 min-h-0">
        {/* Left: Chat/Prompt panel (20%) */}
        <div className="w-[280px] shrink-0">
          <ChatPanel
            onSubmit={generate}
            loading={state.status === "loading"}
            attempts={state.attempts}
            errorMsg={state.errorMsg}
          />
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

        {/* Right: Param panel (25%) */}
        <div className="w-[280px] shrink-0">
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
