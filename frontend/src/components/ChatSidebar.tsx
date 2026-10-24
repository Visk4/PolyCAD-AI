/**
 * ChatSidebar — GPT/Claude-style conversation history panel.
 *
 * Shows all past chat sessions (stored in localStorage) with titles,
 * a "New Chat" button at the top, and a trash icon on hover.
 * Clicking a session loads its history.
 */

import type { SessionMeta } from "../types";

interface ChatSidebarProps {
  sessions: SessionMeta[];
  activeSessionId: string | null;
  onNewChat: () => void;
  onSelectSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  collapsed: boolean;
  onToggle: () => void;
}

function timeAgo(ts: number): string {
  const diffMs = Date.now() - ts;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function ChatSidebar({
  sessions,
  activeSessionId,
  onNewChat,
  onSelectSession,
  onDeleteSession,
  collapsed,
  onToggle,
}: ChatSidebarProps) {
  return (
    <div
      className={`h-full flex flex-col bg-zinc-900 border-r border-zinc-800 transition-all duration-200 ${
        collapsed ? "w-10" : "w-52"
      } shrink-0`}
    >
      {/* Toggle + New Chat header */}
      <div className={`flex items-center gap-2 p-2 border-b border-zinc-800 ${collapsed ? "justify-center" : "justify-between"}`}>
        {!collapsed && (
          <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider px-1">
            Chats
          </span>
        )}
        <div className={`flex gap-1 ${collapsed ? "flex-col" : ""}`}>
          {/* New chat */}
          <button
            onClick={onNewChat}
            className="text-zinc-400 hover:text-white hover:bg-zinc-700 rounded p-1.5 transition-colors"
            title="New chat"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14"/>
            </svg>
          </button>
          {/* Collapse toggle */}
          <button
            onClick={onToggle}
            className="text-zinc-500 hover:text-white hover:bg-zinc-700 rounded p-1.5 transition-colors"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {collapsed
                ? <path d="M9 18l6-6-6-6"/>
                : <path d="M15 18l-6-6 6-6"/>
              }
            </svg>
          </button>
        </div>
      </div>

      {/* Session list */}
      {!collapsed && (
        <div className="flex-1 overflow-y-auto py-1">
          {sessions.length === 0 && (
            <p className="text-[11px] text-zinc-600 text-center px-3 py-6">
              No conversations yet
            </p>
          )}
          {sessions.map((s) => (
            <div
              key={s.id}
              onClick={() => onSelectSession(s.id)}
              className={`group relative flex items-start gap-2 px-3 py-2.5 mx-1 rounded-lg cursor-pointer transition-colors ${
                activeSessionId === s.id
                  ? "bg-zinc-700 text-white"
                  : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              }`}
            >
              {/* Chat icon */}
              <svg className="mt-0.5 shrink-0 opacity-50" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>

              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-medium leading-snug truncate">
                  {s.title || "Untitled"}
                </p>
                <p className="text-[10px] text-zinc-500 mt-0.5">
                  {timeAgo(s.timestamp)}
                </p>
              </div>

              {/* Delete button — shows on hover */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteSession(s.id);
                }}
                className="opacity-0 group-hover:opacity-100 shrink-0 text-zinc-500 hover:text-red-400 p-0.5 rounded transition-all"
                title="Delete conversation"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 6h18M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2"/>
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
