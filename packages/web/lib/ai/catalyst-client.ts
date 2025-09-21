import {
  GoogleGenerativeAI,
  GenerativeModel,
  Content,
  Part,
  RequestOptions,
} from '@google/generative-ai';
import { OpenAI } from 'openai';
import { 
  AuthType, 
  ServerGeminiStreamEvent, 
  GeminiEventType,
  ToolCallRequestInfo,
  ServerTool,
} from '@catalyst/core';
import { AsyncSandboxConfig } from './sandbox-config';
import { AsyncPromptLoader } from './async-prompt-loader';

interface CatalystClientConfig {
  model: string;
  authType: AuthType;
  apiKey?: string;
  baseUrl?: string;
  temperature?: number;
  promptLoader: AsyncPromptLoader;
  config: AsyncSandboxConfig;
}

/**
 * CatalystClient - A unified AI client that supports both Gemini and OpenAI APIs
 * with async configuration and remote filesystem support
 */
export class CatalystClient {
  private genAI?: GoogleGenerativeAI;
  private openAI?: OpenAI;
  private model?: GenerativeModel;
  private history: Content[] = [];
  private tools: Map<string, ServerTool> = new Map();
  private promptId: string = '';
  
  constructor(private clientConfig: CatalystClientConfig) {}

  /**
   * Initialize the client based on auth type
   */
  async initialize(): Promise<void> {
    const { authType, apiKey, baseUrl, model, temperature } = this.clientConfig;

    switch (authType) {
      case AuthType.USE_GEMINI:
        if (!apiKey) throw new Error('Gemini API key is required');
        this.genAI = new GoogleGenerativeAI(apiKey);
        
        // Load system prompt
        const systemPrompt = await this.clientConfig.promptLoader.loadSystemPrompt({
          userMemory: this.clientConfig.config.getUserMemory(),
        });
        
        // Create model with system instruction
        this.model = this.genAI.getGenerativeModel({
          model: model || 'gemini-2.0-flash-latest',
          systemInstruction: systemPrompt,
          generationConfig: {
            temperature: temperature ?? 0.7,
            topP: 1,
          },
        });
        break;

      case AuthType.USE_OPENAI:
        if (!apiKey) throw new Error('OpenAI API key is required');
        
        this.openAI = new OpenAI({
          apiKey,
          baseURL: baseUrl,
          defaultHeaders: this.getDefaultHeaders(),
        });
        break;

      default:
        throw new Error(`Unsupported auth type: ${authType}`);
    }
  }

  /**
   * Set conversation history
   */
  setHistory(history: Content[]): void {
    this.history = history;
  }

  /**
   * Get conversation history
   */
  getHistory(): Content[] {
    return this.history;
  }

  /**
   * Register tools for function calling
   */
  registerTools(tools: ServerTool[]): void {
    tools.forEach(tool => {
      this.tools.set(tool.name, tool);
    });
  }

  /**
   * Send message and stream response
   */
  async *sendMessageStream(
    message: Part[],
    signal: AbortSignal,
    promptId: string,
  ): AsyncGenerator<ServerGeminiStreamEvent, void, unknown> {
    this.promptId = promptId;
    
    try {
      if (this.clientConfig.authType === AuthType.USE_GEMINI) {
        yield* this.streamGemini(message, signal);
      } else if (this.clientConfig.authType === AuthType.USE_OPENAI) {
        yield* this.streamOpenAI(message, signal);
      }
    } catch (error) {
      if (signal.aborted) {
        yield { type: GeminiEventType.UserCancelled };
      } else {
        yield {
          type: GeminiEventType.Error,
          value: {
            error: {
              message: error instanceof Error ? error.message : 'Unknown error',
            },
          },
        };
      }
    } finally {
      yield { type: GeminiEventType.Finished, value: 'STOP' as any };
    }
  }

  /**
   * Stream response from Gemini
   */
  private async *streamGemini(
    message: Part[],
    signal: AbortSignal,
  ): AsyncGenerator<ServerGeminiStreamEvent, void, unknown> {
    if (!this.model) throw new Error('Gemini model not initialized');

    // Create chat with history and tools
    const chat = this.model.startChat({
      history: this.history,
      tools: Array.from(this.tools.values()).map(tool => ({
        functionDeclarations: [tool.schema],
      })),
    });

    // Send message and stream response
    const result = await chat.sendMessageStream(message, { signal } as RequestOptions);
    
    for await (const chunk of result.stream) {
      if (signal.aborted) {
        yield { type: GeminiEventType.UserCancelled };
        return;
      }

      // Handle text content
      const text = chunk.text();
      if (text) {
        yield { type: GeminiEventType.Content, value: text };
      }

      // Handle function calls
      const functionCalls = chunk.functionCalls();
      if (functionCalls) {
        for (const call of functionCalls) {
          const toolCall: ToolCallRequestInfo = {
            callId: `${call.name}-${Date.now()}`,
            name: call.name,
            args: call.args as Record<string, unknown>,
            isClientInitiated: false,
            prompt_id: this.promptId,
          };

          yield {
            type: GeminiEventType.ToolCallRequest,
            value: toolCall,
          };

          // Execute tool if registered
          const tool = this.tools.get(call.name);
          if (tool) {
            try {
              const result = await tool.execute(call.args as Record<string, unknown>, signal);
              
              // Send tool response back to model
              const responseText = result.content?.find((c: any) => 'text' in c)?.text || 'Tool executed successfully';
              const toolResponse = {
                functionResponses: [{
                  name: call.name,
                  response: { text: responseText },
                }],
              };

              // Continue conversation with tool response
              const continuationResult = await chat.sendMessageStream([toolResponse], { signal } as RequestOptions);
              
              for await (const continuationChunk of continuationResult.stream) {
                const continuationText = continuationChunk.text();
                if (continuationText) {
                  yield { type: GeminiEventType.Content, value: continuationText };
                }
              }
            } catch (error) {
              yield {
                type: GeminiEventType.ToolCallResponse,
                value: {
                  callId: toolCall.callId,
                  responseParts: [{ text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` }],
                  resultDisplay: undefined,
                  error: error instanceof Error ? error : new Error('Unknown error'),
                  errorType: undefined,
                },
              };
            }
          }
        }
      }
    }

    // Update history after successful completion
    const response = await result.response;
    this.history.push({ role: 'user', parts: message });
    this.history.push({ role: 'model', parts: response.candidates?.[0]?.content?.parts || [] });
  }

  /**
   * Stream response from OpenAI
   */
  private async *streamOpenAI(
    message: Part[],
    signal: AbortSignal,
  ): AsyncGenerator<ServerGeminiStreamEvent, void, unknown> {
    if (!this.openAI) throw new Error('OpenAI client not initialized');

    // Convert message parts to OpenAI format
    const openAIMessage = this.convertToOpenAIMessage(message);
    
    // Prepare messages with history
    const messages = [
      ...this.convertHistoryToOpenAI(),
      openAIMessage,
    ];

    // Add system prompt
    const systemPrompt = await this.clientConfig.promptLoader.loadSystemPrompt({
      userMemory: this.clientConfig.config.getUserMemory(),
    });
    
    messages.unshift({
      role: 'system',
      content: systemPrompt,
    });

    // Stream completion
    const stream = await this.openAI.chat.completions.create({
      model: this.clientConfig.model,
      messages,
      temperature: this.clientConfig.temperature ?? 0.7,
      stream: true,
      tools: Array.from(this.tools.values()).map(tool => ({
        type: 'function' as const,
        function: {
          name: tool.name,
          description: tool.schema.description || '',
          parameters: tool.schema.parameters || {},
        },
      })),
    });

    let fullContent = '';
    const toolCallsById = new Map<number, any>();

    for await (const chunk of stream) {
      if (signal.aborted) {
        yield { type: GeminiEventType.UserCancelled };
        return;
      }

      // Handle content
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        fullContent += content;
        yield { type: GeminiEventType.Content, value: content };
      }

      // Handle tool calls - OpenAI streams these incrementally
      const toolCalls = chunk.choices[0]?.delta?.tool_calls;
      if (toolCalls) {
        for (const toolCallDelta of toolCalls) {
          const index = toolCallDelta.index;
          
          if (!toolCallsById.has(index)) {
            // First chunk for this tool call
            toolCallsById.set(index, {
              id: toolCallDelta.id,
              type: 'function',
              function: {
                name: toolCallDelta.function?.name || '',
                arguments: toolCallDelta.function?.arguments || '',
              }
            });
          } else {
            // Subsequent chunks - accumulate arguments
            const existing = toolCallsById.get(index);
            if (toolCallDelta.function?.name) {
              existing.function.name = toolCallDelta.function.name;
            }
            if (toolCallDelta.function?.arguments) {
              existing.function.arguments += toolCallDelta.function.arguments;
            }
          }
        }
      }

      // Process completed tool calls
      if (chunk.choices[0]?.finish_reason === 'tool_calls' && toolCallsById.size > 0) {
        for (const [index, toolCall] of toolCallsById) {
          let args;
          try {
            args = JSON.parse(toolCall.function.arguments || '{}');
          } catch (error) {
            console.error('Failed to parse complete tool call arguments:', toolCall.function.arguments);
            args = {};
          }
          const toolCallInfo: ToolCallRequestInfo = {
            callId: toolCall.id || `${toolCall.function.name}-${Date.now()}`,
            name: toolCall.function.name,
            args,
            isClientInitiated: false,
            prompt_id: this.promptId,
          };

          yield {
            type: GeminiEventType.ToolCallRequest,
            value: toolCallInfo,
          };
        }
        
        // Clear for next set of tool calls
        toolCallsById.clear();
      }
    }

    // Update history
    this.history.push({ role: 'user', parts: message });
    this.history.push({ role: 'model', parts: [{ text: fullContent }] });
  }

  /**
   * Convert Part[] to OpenAI message format
   */
  private convertToOpenAIMessage(parts: Part[]): any {
    const textParts = parts.filter(p => 'text' in p).map(p => (p as any).text).join('\n');
    return {
      role: 'user',
      content: textParts,
    };
  }

  /**
   * Convert history to OpenAI format
   */
  private convertHistoryToOpenAI(): any[] {
    return this.history.map(content => ({
      role: content.role === 'user' ? 'user' : 'assistant',
      content: content.parts.filter((p: Part) => 'text' in p).map((p: Part) => (p as any).text).join('\n'),
    }));
  }

  /**
   * Get default headers for the provider
   */
  private getDefaultHeaders(): Record<string, string> | undefined {
    if (this.clientConfig.baseUrl?.includes('openrouter')) {
      return {
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'Catalyst',
      };
    }
    return undefined;
  }
}