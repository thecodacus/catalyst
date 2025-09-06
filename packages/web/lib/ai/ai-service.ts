import {
  GeminiClient,
  AuthType,
  Config,
  ServerGeminiStreamEvent,
  GeminiEventType,
  ToolCallRequestInfo,
} from '@catalyst/core';
import { SandboxConfig } from './sandbox-config';
import { SANDBOX_REPO_PATH } from '@/lib/constants/sandbox-paths';

export interface AIServiceConfig {
  apiKey?: string;
  model?: string;
  authType?: AuthType;
  baseUrl?: string;
  targetDir?: string;
  cwd?: string;
  isSandboxed?: boolean;
  sandboxId?: string;
}

export class AIService {
  private _geminiClient: GeminiClient | null = null;
  private _config: Config;
  private abortController: AbortController | null = null;

  get config(): Config {
    return this._config;
  }

  get geminiClient(): GeminiClient {
    if (!this._geminiClient) {
      throw new Error('GeminiClient not initialized');
    }
    return this._geminiClient;
  }

  constructor(private serviceConfig: AIServiceConfig) {
    // Create appropriate Config instance based on sandbox mode
    const configParams = {
      sessionId: `web-${Date.now()}`,
      targetDir: serviceConfig.targetDir || process.cwd(),
      debugMode: false,
      cwd: serviceConfig.cwd || process.cwd(),
      model: serviceConfig.model || 'gemini-2.5-flash',
      proxy: process.env.HTTP_PROXY || process.env.HTTPS_PROXY,
    };

    // Use SandboxConfig for sandboxed environments
    if (serviceConfig.isSandboxed) {
      this._config = new SandboxConfig({
        ...configParams,
        targetDir: SANDBOX_REPO_PATH, // Use sandbox repo path
        cwd: SANDBOX_REPO_PATH,
      });
    } else {
      this._config = new Config(configParams);
    }
  }

  async initialize() {
    try {
      // First initialize the config to set up tool registry
      await this._config.initialize();

      // Determine auth type and configure for different providers
      let authType = this.serviceConfig.authType;
      let apiKey = this.serviceConfig.apiKey;
      let baseUrl = this.serviceConfig.baseUrl;
      let model = this.serviceConfig.model;

      if (!authType) {
        // Check for Anthropic Claude configuration
        if (process.env.ANTHROPIC_API_KEY) {
          authType = AuthType.USE_OPENAI; // Use OpenAI-compatible interface
          apiKey = process.env.ANTHROPIC_API_KEY;
          baseUrl = 'https://api.anthropic.com/v1';
          model = process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-latest';
        }
        // Check for OpenAI configuration
        else if (apiKey || process.env.OPENAI_API_KEY) {
          authType = AuthType.USE_OPENAI;
          apiKey = apiKey || process.env.OPENAI_API_KEY;
          baseUrl = baseUrl || process.env.OPENAI_BASE_URL;
          model = model || process.env.OPENAI_MODEL;
        }
        // Check for Gemini configuration
        else if (process.env.GEMINI_API_KEY) {
          authType = AuthType.USE_GEMINI;
        } else {
          throw new Error(
            'No API key provided for AI service. Please set OPENAI_API_KEY, ANTHROPIC_API_KEY, or GEMINI_API_KEY',
          );
        }
      }

      // Update config with determined model if needed
      if (model && model !== this._config.getModel()) {
        this._config.setModel(model);
      }

      // Set environment variables for OpenAI auth type to work with custom config
      if (authType === AuthType.USE_OPENAI) {
        if (apiKey) process.env.OPENAI_API_KEY = apiKey;
        if (baseUrl) process.env.OPENAI_BASE_URL = baseUrl;
        if (model) process.env.OPENAI_MODEL = model;
      }

      // Use refreshAuth which creates ContentGeneratorConfig and initializes GeminiClient
      await this._config.refreshAuth(authType);

      // Get the initialized GeminiClient from config
      this._geminiClient = this._config.getGeminiClient();
    } catch (error) {
      console.error('Failed to initialize AI service:', error);
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
    if (!this._geminiClient) {
      throw new Error('AI service not initialized');
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
        // If sandboxed, prepend workspace context
        if (this.serviceConfig.isSandboxed) {
          parts = [{ text: message }];
        } else {
          parts = [{ text: message }];
        }
      } else if (Array.isArray(message)) {
        parts = message;
      } else {
        parts = [message];
      }

      const responseText: string[] = [];
      const toolCalls: ToolCallRequestInfo[] = [];
      let taskId: string | undefined;

      // Use the streaming API
      const stream = this._geminiClient.sendMessageStream(
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

      return {
        response: responseText.join(''),
        toolCalls,
        taskId,
      };
    } catch (error) {
      console.error('AI service error:', error);
      throw error;
    }
  }

  cancel() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  destroy() {
    this.cancel();
    this._geminiClient = null;
  }
}

// Singleton instance for the application
let aiServiceInstance: AIService | null = null;
let lastAuthConfig: string | null = null;

export async function getAIService(
  config?: AIServiceConfig,
): Promise<AIService> {
  // Create a fingerprint of the current configuration including directories
  const currentAuthConfig = JSON.stringify({
    anthropicKey: !!process.env.ANTHROPIC_API_KEY,
    openaiKey: !!process.env.OPENAI_API_KEY,
    geminiKey: !!process.env.GEMINI_API_KEY,
    model:
      config?.model || process.env.CLAUDE_MODEL || process.env.OPENAI_MODEL,
    targetDir: config?.targetDir,
    cwd: config?.cwd,
    isSandboxed: config?.isSandboxed,
    sandboxId: config?.sandboxId,
  });

  // If auth config changed, destroy the old instance
  if (aiServiceInstance && lastAuthConfig !== currentAuthConfig) {
    destroyAIService();
  }

  if (!aiServiceInstance) {
    aiServiceInstance = new AIService(config || {});
    await aiServiceInstance.initialize();
    lastAuthConfig = currentAuthConfig;
  }
  return aiServiceInstance;
}

export function destroyAIService() {
  if (aiServiceInstance) {
    aiServiceInstance.destroy();
    aiServiceInstance = null;
  }
}
