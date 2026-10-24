/**
 * Shared TypeScript types matching the backend API responses.
 */

/** A single parameter extracted from OpenSCAD code */
export interface Param {
  name: string;
  value: number;
  min: number;
  max: number;
  step: number;
}

/** A single attempt in the auto-heal loop */
export interface Attempt {
  attempt: number;
  code: string;
  error: string | null;
  success: boolean;
}

/** Response from POST /api/generate */
export interface GenerateResponse {
  id: string;
  status: "success" | "failed";
  code: string;
  params: Param[];
  stl_url: string | null;
  scad_url: string | null;
  attempts: Attempt[];
  session_id: string;
}

/** Response from POST /api/recompile */
export interface RecompileResponse {
  id: string;
  status: "success" | "failed";
  code: string;
  stl_url: string | null;
  error: string | null;
}

/** A chat message in the conversation */
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  model_id?: string | null;
  timestamp?: string;
}

/** Response from POST /api/chat/session */
export interface SessionResponse {
  session_id: string;
}

/** Response from GET /api/chat/{session_id}/history */
export interface HistoryResponse {
  session_id: string;
  messages: ChatMessage[];
}

/** Response from POST /api/describe-image */
export interface DescribeImageResponse {
  description: string;
  session_id: string | null;
}
