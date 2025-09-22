import {
  AuthType,
  ServerGeminiStreamEvent,
  GeminiEventType,
  ToolCallRequestInfo,
  ApprovalMode,
} from '@catalyst/core';
import { CatalystClient } from './catalyst-client';
import { sandboxTools } from './sandbox-tools';
import { AsyncSandboxConfig } from './sandbox-config';
import { SANDBOX_REPO_PATH } from '@/lib/constants/sandbox-paths';
import { AsyncPromptLoader } from './async-prompt-loader';
import { AsyncRemoteLogger } from './async-logger';

export interface AsyncAIServiceConfig {
  apiKey?: string;
  model?: string;
  authType?: AuthType;
  baseUrl?: string;
  projectId: string;
  sandboxId?: string;
  provider?: 'openai' | 'anthropic' | 'openrouter' | 'gemini' | 'custom';
  customEndpoint?: string;
  temperature?: number;
  userMemory?: string;
}

export class AsyncAIService {
  private _catalystClient: CatalystClient | null = null;
  private _config: AsyncSandboxConfig;
  private abortController: AbortController | null = null;
  private promptLoader: AsyncPromptLoader;
  private logger: AsyncRemoteLogger;
  private initialized = false;

  get config(): AsyncSandboxConfig {
    return this._config;
  }

  get catalystClient(): CatalystClient {
    if (!this._catalystClient) {
      throw new Error(
        'CatalystClient not initialized. Call initialize() first.',
      );
    }
    return this._catalystClient;
  }

  constructor(private serviceConfig: AsyncAIServiceConfig) {
    // Create async config for remote sandbox
    this._config = new AsyncSandboxConfig({
      sessionId: `web-${Date.now()}`,
      targetDir: SANDBOX_REPO_PATH,
      debugMode: false,
      model: serviceConfig.model || 'gemini-2.0-flash-latest',
      approvalMode: ApprovalMode.AUTO_EDIT,
      projectId: serviceConfig.projectId,
      sandboxId: serviceConfig.sandboxId,
      userMemory: serviceConfig.userMemory,
      cwd: SANDBOX_REPO_PATH,
    });

    // Initialize async services
    this.promptLoader = new AsyncPromptLoader(serviceConfig.projectId);
    this.logger = new AsyncRemoteLogger(
      serviceConfig.projectId,
      this._config.getSessionId(),
      true, // persist to file
    );
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Initialize the logger first
      await this.logger.initialize();
      await this.logger.log({
        type: 'ai_service_init',
        data: { config: this.serviceConfig },
      });

      // Load system prompt
      const systemPrompt = await this.promptLoader.loadSystemPrompt({
        userMemory: this.serviceConfig.userMemory,
      });

      // Determine auth type and configure for different providers
      let authType = this.serviceConfig.authType;
      let apiKey = this.serviceConfig.apiKey;
      let baseUrl = this.serviceConfig.baseUrl;
      let model = this.serviceConfig.model;

      console.log(
        'Async AI Service initialization - Provider:',
        this.serviceConfig.provider,
        'Model:',
        model,
      );

      if (!authType && this.serviceConfig.provider) {
        // Configure based on provider
        switch (this.serviceConfig.provider) {
          case 'openrouter':
            authType = AuthType.USE_OPENAI;
            baseUrl = 'https://openrouter.ai/api/v1';
            model = model || 'openai/gpt-4-turbo-preview';
            break;
          case 'anthropic':
            authType = AuthType.USE_OPENAI;
            baseUrl = 'https://api.anthropic.com/v1';
            model = model || 'claude-3-5-sonnet-latest';
            break;
          case 'openai':
            authType = AuthType.USE_OPENAI;
            baseUrl = baseUrl || 'https://api.openai.com/v1';
            model = model || 'gpt-4-turbo-preview';
            break;
          case 'gemini':
            authType = AuthType.USE_GEMINI;
            model = model || 'gemini-2.0-flash-latest';
            break;
          case 'custom':
            authType = AuthType.USE_OPENAI;
            baseUrl = baseUrl || this.serviceConfig.customEndpoint;
            break;
          default:
            authType = AuthType.USE_GEMINI;
        }
      }

      // Create and initialize CatalystClient
      this._catalystClient = new CatalystClient({
        model: model || 'gemini-2.0-flash-latest',
        authType: authType || AuthType.USE_GEMINI,
        apiKey,
        baseUrl,
        temperature: this.serviceConfig.temperature,
        promptLoader: this.promptLoader,
        config: this._config,
      });

      await this._catalystClient.initialize();
      
      // Register sandbox tools
      this._catalystClient.registerTools(sandboxTools);

      await this.logger.log({
        type: 'ai_service_initialized',
        data: {
          authType,
          model: model || 'gemini-2.0-flash-latest',
          provider: this.serviceConfig.provider,
        },
      });

      this.initialized = true;
    } catch (error) {
      await this.logger.log({
        type: 'ai_service_init_error',
        data: { error: error instanceof Error ? error.message : String(error) },
      });
      throw error;
    }
  }

  async *streamChat(
    message: string | any[],
    projectId: string,
    onStream?: (event: ServerGeminiStreamEvent) => void | Promise<void>,
  ): AsyncGenerator<ServerGeminiStreamEvent, void, unknown> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      // Handle different message types
      let parts: any[];
      if (typeof message === 'string') {
        parts = [{ text: message }];
      } else if (Array.isArray(message)) {
        parts = message;
      } else {
        parts = [message];
      }

      // Log the chat request
      await this.logger.log({
        type: 'chat_request',
        data: {
          message: typeof message === 'string' ? message : 'Complex message',
          projectId,
        },
      });

      // Create new abort controller for this stream
      this.abortController = new AbortController();
      const promptId = `${projectId}-${Date.now()}`;

      // Get the stream from CatalystClient
      const stream = this._catalystClient!.sendMessageStream(
        parts,
        this.abortController.signal,
        promptId,
      );

      // Process and yield events
      for await (const event of stream) {
        // Forward events to the callback if provided
        if (onStream) {
          await onStream(event);
        }

        // Log significant events
        if (event.type === GeminiEventType.ToolCallRequest) {
          await this.logger.log({
            type: 'tool_call',
            data: {
              toolName: event.value.name,
              args: event.value.args,
            },
          });
        }

        yield event;
      }

      await this.logger.log({ type: 'chat_complete', data: {} });
    } catch (error) {
      await this.logger.log({
        type: 'chat_error',
        data: { error: error instanceof Error ? error.message : String(error) },
      });
      throw error;
    }
  }

  async sendMessage(
    message: string | any[],
    projectId: string,
    onStream?: (event: ServerGeminiStreamEvent) => void | Promise<void>,
  ): Promise<{
    response: string;
    toolCalls: ToolCallRequestInfo[];
    taskId?: string;
  }> {
    if (!this.initialized) {
      await this.initialize();
    }

    // Cancel any existing request
    if (this.abortController) {
      this.abortController.abort();
    }

    this.abortController = new AbortController();
    const promptId = `${projectId}-${Date.now()}`;

    try {
      // Handle different message types
      let parts: any[];
      if (typeof message === 'string') {
        parts = [{ text: message }];
      } else if (Array.isArray(message)) {
        parts = message;
      } else {
        parts = [message];
      }

      await this.logger.log({
        type: 'message_request',
        data: {
          message: typeof message === 'string' ? message : 'Complex message',
          projectId,
        },
      });

      const responseText: string[] = [];
      const toolCalls: ToolCallRequestInfo[] = [];
      let taskId: string | undefined;

      // Use the streaming API
      const stream = this._catalystClient!.sendMessageStream(
        parts,
        this.abortController.signal,
        promptId,
      );

      for await (const event of stream) {
        // Forward events to the callback if provided
        if (onStream) {
          await onStream(event);
        }

        // Handle different event types
        switch (event.type) {
          case GeminiEventType.Content:
            if (event.value) {
              responseText.push(event.value);
            }
            break;

          case GeminiEventType.ToolCallRequest:
            toolCalls.push(event.value);

            // If this is a code generation tool call, we might want to create a task
            if (
              event.value.name === 'write' ||
              event.value.name === 'str_replace' ||
              event.value.name === 'multi_edit'
            ) {
              // This would be handled by the task system
              taskId = `task-${Date.now()}`;
            }
            break;

          case GeminiEventType.ToolCallResponse:
            // Tool execution completed
            break;

          case GeminiEventType.Error:
            throw new Error(event.value.error.message);

          case GeminiEventType.UserCancelled:
            throw new Error('Request cancelled by user');

          case GeminiEventType.Finished:
            // Stream completed successfully
            break;
        }
      }

      await this.logger.log({
        type: 'message_complete',
        data: {
          responseLength: responseText.join('').length,
          toolCallsCount: toolCalls.length,
        },
      });

      return {
        response: responseText.join(''),
        toolCalls,
        taskId,
      };
    } catch (error) {
      await this.logger.log({
        type: 'message_error',
        data: { error: error instanceof Error ? error.message : String(error) },
      });
      throw error;
    }
  }

  cancel(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  /**
   * Set conversation history
   */
  async setHistory(messages: any[]): Promise<void> {
    // Ensure service is initialized
    if (!this.initialized) {
      await this.initialize();
    }
    
    if (!this._catalystClient) {
      throw new Error('AI service not initialized');
    }
    
    // Convert message format to Content format expected by Gemini
    const history = messages.map(msg => {
      // Convert parts if they exist, otherwise use content
      let parts: any[] = [];
      
      if (msg.parts && Array.isArray(msg.parts)) {
        // Convert from database parts format to Gemini format
        parts = msg.parts.map((part: any) => {
          if (part.type === 'text') {
            return { text: part.data || '' };
          } else if (typeof part === 'string') {
            return { text: part };
          } else if (part.text) {
            return { text: part.text };
          }
          return { text: JSON.stringify(part) };
        });
      } else if (msg.content) {
        parts = [{ text: msg.content }];
      }
      
      return {
        role: msg.role === 'user' ? 'user' : 'model',
        parts: parts.length > 0 ? parts : [{ text: '' }]
      };
    });
    
    console.log('🎨 AsyncAIService: Setting history with', history.length, 'messages');
    
    // Log detailed history for debugging tool responses
    history.forEach((msg, idx) => {
      const role = msg.role === 'user' ? 'user' : 'model';
      const partsSummary = msg.parts.map((p: any) => {
        if (p.type === 'tool-call') {
          return `tool-call(${p.data.tool}:${p.data.id})`;
        } else if (p.type === 'text') {
          return `text(${p.data?.length || 0} chars)`;
        } else if ('functionCall' in p) {
          return `functionCall(${p.functionCall?.name}:${p.functionCall?.id})`;
        } else if ('functionResponse' in p) {
          return `functionResponse(${p.functionResponse?.name}:${p.functionResponse?.id})`;
        }
        return `${p.type || 'unknown'}`;
      });
      console.log(`  [${idx}] ${role}: ${partsSummary.join(', ')}`);
    });
    
    this._catalystClient.setHistory(history);
  }

  async updateConfig(updates: Partial<AsyncAIServiceConfig>): Promise<void> {
    // Update service config
    this.serviceConfig = { ...this.serviceConfig, ...updates };

    // Reinitialize if needed
    if (
      updates.apiKey ||
      updates.model ||
      updates.provider ||
      updates.authType
    ) {
      this.initialized = false;
      this._catalystClient = null;
      await this.initialize();
    }
  }

  async getLogger(): Promise<AsyncRemoteLogger> {
    return this.logger;
  }

  async getPromptLoader(): Promise<AsyncPromptLoader> {
    return this.promptLoader;
  }

  async validatePath(path: string): Promise<boolean> {
    const ctx = await this._config.getWorkspaceContext();
    return ctx.isPathWithinWorkspace(path);
  }

  async cleanup(): Promise<void> {
    this.cancel();
    await this.logger.log({ type: 'ai_service_cleanup', data: {} });
  }

  destroy(): void {
    this.cancel();
    this._catalystClient = null;
  }
}

// Create a new async AI service instance per request to avoid state sharing
export async function getAsyncAIService(
  config: AsyncAIServiceConfig,
): Promise<AsyncAIService> {
  const aiService = new AsyncAIService(config);
  await aiService.initialize();
  return aiService;
}

// Helper to convert sync config to async config
export function toAsyncAIServiceConfig(
  config: Partial<AsyncAIServiceConfig> & { projectId: string },
): AsyncAIServiceConfig {
  return {
    projectId: config.projectId,
    apiKey: config.apiKey,
    model: config.model || 'gemini-2.0-flash-latest',
    authType: config.authType,
    baseUrl: config.baseUrl,
    sandboxId: config.sandboxId,
    provider: config.provider,
    customEndpoint: config.customEndpoint,
    temperature: config.temperature,
    userMemory: config.userMemory,
  };
}
