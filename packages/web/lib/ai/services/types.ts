import { ToolCallRequestInfo, ToolCallResponseInfo } from '@catalyst/core';

// SSE event types
export enum SSEEventType {
  UserMessage = 'user_message',
  AIStart = 'ai_start',
  AIContent = 'ai_content',
  ToolCallStart = 'tool_call_start',
  ToolCallOutput = 'tool_call_output',
  ToolCallEnd = 'tool_call_end',
  AIComplete = 'ai_complete',
  Error = 'error',
}

export interface ConversationEvent {
  type: 'text' | 'tool_call';
  content?: string;
  toolCall?: ToolCallRequestInfo;
}

export interface MessagePart {
  type: string;
  data: any;
}

export interface MessageMetadata {
  model?: string;
  tokenCount?: number;
  toolCalls?: number;
  toolResponses?: number;
  hasTask?: boolean;
  error?: string;
}

export interface UserContext {
  userId: string;
  email: string;
}

export interface ProjectAccess {
  projectId: string;
  userId: string;
  role?: string;
}

export interface StreamContext {
  projectId: string;
  userId: string;
  message: string;
  userMessage: any;
  task: any;
  aiMessage?: any;
}

export interface ToolExecutionResult {
  toolCall: ToolCallRequestInfo;
  response: ToolCallResponseInfo;
  success: boolean;
  error?: Error;
}

export interface AIServiceSettings {
  provider?: string;
  apiKey?: string;
  model?: string;
  customEndpoint?: string;
  userMemory?: string;
}