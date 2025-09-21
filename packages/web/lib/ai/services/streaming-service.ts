import { SSEEventType } from './types';

export class StreamingService {
  private encoder: TextEncoder;
  private controller: ReadableStreamDefaultController;

  constructor(controller: ReadableStreamDefaultController) {
    this.controller = controller;
    this.encoder = new TextEncoder();
  }

  /**
   * Send an SSE event
   */
  sendEvent(type: SSEEventType, data: unknown): void {
    const event = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
    this.controller.enqueue(this.encoder.encode(event));
  }

  /**
   * Send user message event
   */
  sendUserMessage(messageId: string): void {
    this.sendEvent(SSEEventType.UserMessage, { messageId });
  }

  /**
   * Send AI start event
   */
  sendAIStart(taskId: string, messageId: string): void {
    this.sendEvent(SSEEventType.AIStart, { taskId, messageId });
  }

  /**
   * Send AI content event
   */
  sendAIContent(content: string): void {
    this.sendEvent(SSEEventType.AIContent, { content });
  }

  /**
   * Send tool call start event
   */
  sendToolCallStart(tool: string, callId: string, params: any): void {
    this.sendEvent(SSEEventType.ToolCallStart, {
      tool,
      callId,
      params,
    });
  }

  /**
   * Send tool call output event
   */
  sendToolCallOutput(tool: string, callId: string, output: string): void {
    this.sendEvent(SSEEventType.ToolCallOutput, {
      tool,
      callId,
      output,
    });
  }

  /**
   * Send tool call end event
   */
  sendToolCallEnd(
    tool: string,
    callId: string,
    success: boolean,
    result?: string,
    resultDisplay?: any,
    error?: string
  ): void {
    const data: any = {
      tool,
      callId,
      success,
    };
    
    if (result !== undefined) {
      data.result = result;
    }
    if (resultDisplay !== undefined) {
      data.resultDisplay = resultDisplay;
    }
    if (error !== undefined) {
      data.error = error;
    }
    
    this.sendEvent(SSEEventType.ToolCallEnd, data);
  }

  /**
   * Send AI complete event
   */
  sendAIComplete(messageId: string, taskId: string): void {
    this.sendEvent(SSEEventType.AIComplete, {
      messageId,
      taskId,
    });
  }

  /**
   * Send error event
   */
  sendError(error: string, message: string): void {
    this.sendEvent(SSEEventType.Error, {
      error,
      message,
    });
  }

  /**
   * Close the stream
   */
  close(): void {
    this.controller.close();
  }
}