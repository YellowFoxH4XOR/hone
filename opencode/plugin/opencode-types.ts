// Minimal structural mirror of the parts of `@opencode-ai/plugin` that Hone
// uses. Kept local so the plugin type-checks and ships with ZERO dependencies
// (Hone's core principle) and CI needs no network. At runtime under OpenCode
// these annotations are erased; OpenCode passes the real objects, which are
// structurally compatible. If you build against the real package instead,
// `import type { Plugin } from "@opencode-ai/plugin"` is a drop-in replacement.
//
// Verified against @opencode-ai/plugin (opencode.ai/docs/plugins, July 2026).

// A message part. User text arrives as { type: "text", text: "..." } parts;
// a plugin injects context by pushing more text parts.
export interface Part {
  type: string;
  text?: string;
  [key: string]: unknown;
}

export interface UserMessage {
  id?: string;
  role?: string;
  [key: string]: unknown;
}

// The bus event delivered to the `event` hook. `type` is e.g. "session.idle",
// "session.created", "message.updated". The session id lives under a few
// possible keys across versions, so read it defensively.
export interface PluginEvent {
  type: string;
  properties?: { sessionID?: string; session_id?: string; [key: string]: unknown };
  sessionID?: string;
  session_id?: string;
  [key: string]: unknown;
}

export interface ChatMessageInput {
  sessionID: string;
  agent?: string;
  model?: { providerID: string; modelID: string };
  messageID?: string;
  variant?: string;
}
export interface ChatMessageOutput {
  message: UserMessage;
  parts: Part[];
}

export interface ToolExecuteBeforeInput {
  tool: string;
  sessionID: string;
  callID: string;
}
export interface ToolExecuteBeforeOutput {
  args: Record<string, unknown>;
}

export interface ToolExecuteAfterInput {
  tool: string;
  sessionID: string;
  callID: string;
  args: Record<string, unknown>;
}
export interface ToolExecuteAfterOutput {
  title: string;
  output: string;
  metadata: unknown;
}

export interface Hooks {
  'chat.message'?: (input: ChatMessageInput, output: ChatMessageOutput) => Promise<void>;
  'tool.execute.before'?: (
    input: ToolExecuteBeforeInput,
    output: ToolExecuteBeforeOutput,
  ) => Promise<void>;
  'tool.execute.after'?: (
    input: ToolExecuteAfterInput,
    output: ToolExecuteAfterOutput,
  ) => Promise<void>;
  event?: (input: { event: PluginEvent }) => Promise<void>;
}

export interface PluginContext {
  client?: unknown;
  project?: unknown;
  $?: unknown;
  directory?: string;
  worktree?: string;
}

export type Plugin = (ctx: PluginContext) => Promise<Hooks>;
