import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AIService, getAIService, destroyAIService } from './ai-service';
import { AuthType } from '@catalyst/core';

// Mock the core package
vi.mock('@catalyst/core', () => ({
  Config: vi.fn().mockImplementation(() => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    refreshAuth: vi.fn().mockResolvedValue(undefined),
    getGeminiClient: vi.fn().mockReturnValue({
      sendMessageStream: vi.fn(),
    }),
    getModel: vi.fn().mockReturnValue('gemini-2.5-flash'),
    setModel: vi.fn(),
  })),
  GeminiClient: vi.fn(),
  createContentGeneratorConfig: vi.fn(),
  AuthType: {
    USE_OPENAI: 'USE_OPENAI',
    USE_GEMINI: 'USE_GEMINI',
    USE_VERTEX_AI: 'USE_VERTEX_AI',
    LOGIN_WITH_GOOGLE: 'LOGIN_WITH_GOOGLE',
  },
  ServerGeminiStreamEvent: {},
  GeminiEventType: {
    Content: 'Content',
    ToolCallRequest: 'ToolCallRequest',
    ToolCallResponse: 'ToolCallResponse',
    Error: 'Error',
    UserCancelled: 'UserCancelled',
    Finished: 'Finished',
  },
}));

describe('AIService', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    // Clear any existing instances
    destroyAIService();
  });

  afterEach(() => {
    process.env = originalEnv;
    destroyAIService();
  });

  describe('initialization', () => {
    it('should initialize with Anthropic Claude when ANTHROPIC_API_KEY is set', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
      process.env.CLAUDE_MODEL = 'claude-3-5-sonnet-latest';

      const service = new AIService({});
      await service.initialize();

      // Verify environment variables were set for OpenAI compatibility
      expect(process.env.OPENAI_API_KEY).toBe('test-anthropic-key');
      expect(process.env.OPENAI_BASE_URL).toBe('https://api.anthropic.com/v1');
      expect(process.env.OPENAI_MODEL).toBe('claude-3-5-sonnet-latest');
    });

    it('should initialize with OpenAI when OPENAI_API_KEY is set', async () => {
      process.env.OPENAI_API_KEY = 'test-openai-key';
      process.env.OPENAI_MODEL = 'gpt-4';

      const service = new AIService({});
      await service.initialize();

      expect(process.env.OPENAI_API_KEY).toBe('test-openai-key');
    });

    it('should initialize with Gemini when GEMINI_API_KEY is set', async () => {
      process.env.GEMINI_API_KEY = 'test-gemini-key';

      const service = new AIService({});
      await service.initialize();

      // Should not modify OpenAI env vars
      expect(process.env.OPENAI_API_KEY).toBeUndefined();
    });

    it('should throw error when no API key is provided', async () => {
      const service = new AIService({});

      await expect(service.initialize()).rejects.toThrow(
        'No API key provided for AI service',
      );
    });

    it('should prioritize service config over environment variables', async () => {
      process.env.GEMINI_API_KEY = 'test-gemini-key';

      const service = new AIService({
        apiKey: 'custom-api-key',
        authType: AuthType.USE_OPENAI,
        model: 'custom-model',
      });
      await service.initialize();

      expect(process.env.OPENAI_API_KEY).toBe('custom-api-key');
      expect(process.env.OPENAI_MODEL).toBe('custom-model');
    });
  });

  describe('singleton management', () => {
    it('should return the same instance when called multiple times', async () => {
      process.env.OPENAI_API_KEY = 'test-key';

      const service1 = await getAIService();
      const service2 = await getAIService();

      expect(service1).toBe(service2);
    });

    it('should create new instance when auth config changes', async () => {
      process.env.OPENAI_API_KEY = 'test-key-1';
      const service1 = await getAIService();

      // Change the API key
      process.env.OPENAI_API_KEY = 'test-key-2';
      process.env.ANTHROPIC_API_KEY = 'new-anthropic-key';
      const service2 = await getAIService();

      expect(service1).not.toBe(service2);
    });

    it('should destroy singleton properly', async () => {
      process.env.OPENAI_API_KEY = 'test-key';
      const service1 = await getAIService();

      destroyAIService();

      const service2 = await getAIService();
      expect(service1).not.toBe(service2);
    });
  });

  describe('sendMessage', () => {
    it('should handle successful message sending', async () => {
      process.env.OPENAI_API_KEY = 'test-key';
      const service = new AIService({});
      await service.initialize();

      // Mock the geminiClient
      const mockStream = {
        async *[Symbol.asyncIterator]() {
          yield { type: 'Content', value: 'Hello' };
          yield { type: 'Content', value: ' world!' };
          yield { type: 'Finished' };
        },
      };

      const mockGeminiClient = {
        sendMessageStream: vi.fn().mockReturnValue(mockStream),
      };
      (service as any)._geminiClient = mockGeminiClient;

      const result = await service.sendMessage('Test message', 'project-123');

      expect(result.response).toBe('Hello world!');
      expect(result.toolCalls).toEqual([]);
      expect(mockGeminiClient.sendMessageStream).toHaveBeenCalledWith(
        [{ text: 'Test message' }],
        expect.any(AbortSignal),
        expect.stringContaining('project-123'),
      );
    });

    it('should handle tool calls', async () => {
      process.env.OPENAI_API_KEY = 'test-key';
      const service = new AIService({});
      await service.initialize();

      const mockStream = {
        async *[Symbol.asyncIterator]() {
          yield { type: 'Content', value: 'I will write a file for you.' };
          yield {
            type: 'ToolCallRequest',
            value: {
              name: 'write-file',
              args: { path: 'test.js', content: 'console.log("test")' },
            },
          };
          yield { type: 'Finished' };
        },
      };

      const mockGeminiClient = {
        sendMessageStream: vi.fn().mockReturnValue(mockStream),
      };
      (service as any)._geminiClient = mockGeminiClient;

      const result = await service.sendMessage(
        'Write a test file',
        'project-123',
      );

      expect(result.response).toBe('I will write a file for you.');
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0].name).toBe('write-file');
      expect(result.taskId).toBeDefined();
    });

    it('should handle errors', async () => {
      process.env.OPENAI_API_KEY = 'test-key';
      const service = new AIService({});
      await service.initialize();

      const mockStream = {
        async *[Symbol.asyncIterator]() {
          yield { type: 'Error', value: { error: { message: 'API Error' } } };
        },
      };

      const mockGeminiClient = {
        sendMessageStream: vi.fn().mockReturnValue(mockStream),
      };
      (service as any)._geminiClient = mockGeminiClient;

      await expect(service.sendMessage('Test', 'project-123')).rejects.toThrow(
        'API Error',
      );
    });

    it('should throw error if not initialized', async () => {
      const service = new AIService({});

      await expect(service.sendMessage('Test', 'project-123')).rejects.toThrow(
        'AI service not initialized',
      );
    });
  });

  describe('cancel', () => {
    it('should abort ongoing requests', async () => {
      process.env.OPENAI_API_KEY = 'test-key';
      const service = new AIService({});
      await service.initialize();

      // Start a request
      const mockStream = {
        async *[Symbol.asyncIterator]() {
          yield { type: 'Content', value: 'Processing...' };
          // Simulate a long-running operation
          await new Promise((resolve) => setTimeout(resolve, 1000));
          yield { type: 'Finished' };
        },
      };

      const mockGeminiClient = {
        sendMessageStream: vi.fn().mockReturnValue(mockStream),
      };
      (service as any)._geminiClient = mockGeminiClient;

      // Don't await - we want to cancel it
      const messagePromise = service.sendMessage('Test', 'project-123');

      // Cancel immediately
      service.cancel();

      // The promise should still resolve but potentially with partial results
      await expect(messagePromise).resolves.toBeDefined();
    });
  });
});
