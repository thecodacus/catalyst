import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock dependencies
vi.mock('@/lib/auth/middleware');
vi.mock('@/lib/db/mongodb');
vi.mock('@/lib/db/schemas/project');
vi.mock('@/lib/db/schemas/task');
vi.mock('@/lib/db/schemas/message');
vi.mock('@/lib/ai/ai-service');
vi.mock('fs/promises');

describe('POST /api/projects/[projectId]/conversation', () => {
  let mockUser: any;
  let mockProject: any;
  let mockTask: any;
  let mockMessage: any;
  let mockAIService: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Mock user
    mockUser = { userId: 'test-user-123' };

    // Mock project
    mockProject = {
      _id: '68b74f48f07de93c0a3d19c4',
      userId: 'test-user-123',
      name: 'Test Project',
    };

    // Mock task
    mockTask = {
      _id: 'task-123',
      save: vi.fn().mockResolvedValue(true),
      toolCalls: [],
      progress: {
        percentage: 0,
        currentStep: '',
        totalSteps: 3,
        completedSteps: 0,
      },
      results: [],
    };

    // Mock message
    mockMessage = {
      _id: 'msg-123',
      save: vi.fn().mockResolvedValue(true),
      toObject: vi.fn().mockReturnValue({ _id: 'msg-123', content: 'test' }),
    };

    // Mock AI service
    mockAIService = {
      config: {
        getToolRegistry: vi.fn().mockResolvedValue({
          getTool: vi.fn().mockReturnValue({ name: 'test-tool' }),
        }),
      },
      sendMessage: vi.fn(),
    };

    // Set up mocks
    const authMock = vi.mocked(await import('@/lib/auth/middleware'));
    authMock.withAuth.mockImplementation((req: any, handler: any) =>
      handler(req, mockUser),
    );

    const mongoMock = vi.mocked(await import('@/lib/db/mongodb'));
    mongoMock.connectMongoose.mockResolvedValue(undefined as any);

    const projectMock = vi.mocked(await import('@/lib/db/schemas/project'));
    projectMock.Project.findOne = vi.fn().mockResolvedValue(mockProject);
    projectMock.Project.findByIdAndUpdate = vi
      .fn()
      .mockResolvedValue(mockProject);

    const taskMock = vi.mocked(await import('@/lib/db/schemas/task'));
    taskMock.Task.prototype.save = mockTask.save;
    taskMock.Task.findById = vi.fn().mockResolvedValue(mockTask);
    taskMock.Task.findOne = vi.fn().mockResolvedValue(mockTask);
    vi.mocked(taskMock.Task).mockImplementation(() => mockTask as any);

    const messageMock = vi.mocked(await import('@/lib/db/schemas/message'));
    messageMock.Message.find = vi.fn().mockResolvedValue([]);
    messageMock.Message.prototype.save = mockMessage.save;
    vi.mocked(messageMock.Message).mockImplementation(() => mockMessage as any);

    const aiServiceMock = vi.mocked(await import('@/lib/ai/ai-service'));
    aiServiceMock.getAIService.mockResolvedValue(mockAIService);

    // Mock file system
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    vi.mocked(fs.readFile).mockResolvedValue('test content');
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should handle a simple conversation without tools', async () => {
    // Mock AI response without tool calls
    mockAIService.sendMessage.mockImplementation(
      async (message: string, projectId: string, onStream?: any) => {
        if (onStream) {
          await onStream({
            type: 'content',
            value: 'Hello! How can I help you?',
          });
        }
        return {
          response: 'Hello! How can I help you?',
          toolCalls: [],
        };
      },
    );

    const request = new NextRequest(
      'http://localhost:3000/api/projects/68b74f48f07de93c0a3d19c4/conversation',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: 'Hello',
        }),
      },
    );

    const response = await POST(request, {
      params: Promise.resolve({ projectId: '68b74f48f07de93c0a3d19c4' }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.message).toBeDefined();
    expect(data.aiMessage).toBeDefined();
    expect(data.aiMessage.content).toContain('Hello! How can I help you?');
  });

  it('should handle tool execution', async () => {
    // Mock AI response with write_file tool call
    let toolCallRequestSent = false;
    mockAIService.sendMessage.mockImplementation(
      async (message: any, projectId: string, onStream?: any) => {
        if (!toolCallRequestSent) {
          // First call - AI wants to use write_file tool
          toolCallRequestSent = true;
          if (onStream) {
            await onStream({
              type: 'tool_call_request',
              value: {
                callId: 'tool-1',
                name: 'write_file',
                args: { file_path: 'test.txt', content: 'Hello World' },
                isClientInitiated: false,
                prompt_id: 'test',
              },
            });
          }
          return {
            response: '',
            toolCalls: [
              {
                callId: 'tool-1',
                name: 'write_file',
                args: { file_path: 'test.txt', content: 'Hello World' },
                isClientInitiated: false,
                prompt_id: 'test',
              },
            ],
          };
        } else {
          // Second call - AI responds after tool execution
          if (onStream) {
            await onStream({
              type: 'content',
              value:
                'I\'ve created the test.txt file with "Hello World" content.',
            });
          }
          return {
            response:
              'I\'ve created the test.txt file with "Hello World" content.',
            toolCalls: [],
          };
        }
      },
    );

    const request = new NextRequest(
      'http://localhost:3000/api/projects/68b74f48f07de93c0a3d19c4/conversation',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: 'Create a file test.txt with content "Hello World"',
        }),
      },
    );

    const response = await POST(request, {
      params: Promise.resolve({ projectId: '68b74f48f07de93c0a3d19c4' }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.aiMessage.content).toContain('created the test.txt file');
    expect(mockTask.toolCalls.length).toBeGreaterThan(0);
    expect(mockTask.toolCalls[0].tool).toBe('write_file');
    expect(mockTask.save).toHaveBeenCalled();
  });

  it('should handle multiple tool calls', async () => {
    let callCount = 0;
    mockAIService.sendMessage.mockImplementation(
      async (message: any, projectId: string, onStream?: any) => {
        callCount++;

        if (callCount === 1) {
          // First call - AI wants to write and then read
          if (onStream) {
            await onStream({
              type: 'tool_call_request',
              value: {
                callId: 'tool-1',
                name: 'write_file',
                args: { file_path: 'test.txt', content: 'Test content' },
                isClientInitiated: false,
                prompt_id: 'test',
              },
            });
            await onStream({
              type: 'tool_call_request',
              value: {
                callId: 'tool-2',
                name: 'read_file',
                args: { file_path: 'test.txt' },
                isClientInitiated: false,
                prompt_id: 'test',
              },
            });
          }
          return {
            response: '',
            toolCalls: [
              {
                callId: 'tool-1',
                name: 'write_file',
                args: { file_path: 'test.txt', content: 'Test content' },
                isClientInitiated: false,
                prompt_id: 'test',
              },
              {
                callId: 'tool-2',
                name: 'read_file',
                args: { file_path: 'test.txt' },
                isClientInitiated: false,
                prompt_id: 'test',
              },
            ],
          };
        } else {
          // Second call - AI responds after tools execution
          if (onStream) {
            await onStream({
              type: 'content',
              value:
                'I\'ve created and read the file. The content is "Test content".',
            });
          }
          return {
            response:
              'I\'ve created and read the file. The content is "Test content".',
            toolCalls: [],
          };
        }
      },
    );

    const request = new NextRequest(
      'http://localhost:3000/api/projects/68b74f48f07de93c0a3d19c4/conversation',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message:
            'Create a file test.txt with "Test content" and then read it back',
        }),
      },
    );

    const response = await POST(request, {
      params: Promise.resolve({ projectId: '68b74f48f07de93c0a3d19c4' }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.aiMessage.content).toContain('created and read the file');
    expect(mockTask.toolCalls.length).toBe(2);
    expect(mockTask.toolCalls[0].tool).toBe('write_file');
    expect(mockTask.toolCalls[1].tool).toBe('read_file');
  });

  it('should handle tool execution errors', async () => {
    // Mock file write to fail
    vi.mocked(fs.writeFile).mockRejectedValue(new Error('Permission denied'));

    let toolCallRequestSent = false;
    mockAIService.sendMessage.mockImplementation(
      async (message: any, projectId: string, onStream?: any) => {
        if (!toolCallRequestSent) {
          toolCallRequestSent = true;
          if (onStream) {
            await onStream({
              type: 'tool_call_request',
              value: {
                callId: 'tool-1',
                name: 'write_file',
                args: { file_path: '/etc/passwd', content: 'hack' },
                isClientInitiated: false,
                prompt_id: 'test',
              },
            });
          }
          return {
            response: '',
            toolCalls: [
              {
                callId: 'tool-1',
                name: 'write_file',
                args: { file_path: '/etc/passwd', content: 'hack' },
                isClientInitiated: false,
                prompt_id: 'test',
              },
            ],
          };
        } else {
          if (onStream) {
            await onStream({
              type: 'content',
              value: 'I encountered an error trying to write to that file.',
            });
          }
          return {
            response: 'I encountered an error trying to write to that file.',
            toolCalls: [],
          };
        }
      },
    );

    const request = new NextRequest(
      'http://localhost:3000/api/projects/68b74f48f07de93c0a3d19c4/conversation',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: 'Write to /etc/passwd',
        }),
      },
    );

    const response = await POST(request, {
      params: Promise.resolve({ projectId: '68b74f48f07de93c0a3d19c4' }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.aiMessage.content).toContain('error');
    expect(mockTask.toolCalls[0].status).toBe('failed');
  });

  it('should handle invalid project ID', async () => {
    const request = new NextRequest(
      'http://localhost:3000/api/projects/invalid-id/conversation',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: 'Hello',
        }),
      },
    );

    const response = await POST(request, {
      params: Promise.resolve({ projectId: 'invalid-id' }),
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid project ID');
  });

  it('should handle missing message', async () => {
    const request = new NextRequest(
      'http://localhost:3000/api/projects/68b74f48f07de93c0a3d19c4/conversation',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      },
    );

    const response = await POST(request, {
      params: Promise.resolve({ projectId: '68b74f48f07de93c0a3d19c4' }),
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Message is required');
  });
});
