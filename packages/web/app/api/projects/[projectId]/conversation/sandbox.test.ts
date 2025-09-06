import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';
import { connectMongoose } from '@/lib/db/mongodb';
import { Project } from '@/lib/db/schemas/project';
import { Message } from '@/lib/db/schemas/message';
import { Task } from '@/lib/db/schemas/task';
import mongoose from 'mongoose';

// Mock authentication middleware
vi.mock('@/lib/auth/middleware', () => ({
  withAuth: (req: NextRequest, handler: any) => {
    return handler(req, { userId: 'test-user-id' });
  },
}));

// Mock CodeSandbox service
const mockSandboxService = {
  getSandboxForProject: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  executeCommand: vi.fn(),
  listDirectory: vi.fn(),
};

vi.mock('@/lib/sandbox/codesandbox-service', () => ({
  getCodeSandboxService: () => mockSandboxService,
}));

// Mock AI service
const mockAIService = {
  sendMessage: vi.fn(),
  config: {
    getToolRegistry: vi.fn().mockResolvedValue({
      getTool: vi.fn().mockReturnValue({}),
    }),
  },
};

vi.mock('@/lib/ai/ai-service', () => ({
  getAIService: vi.fn().mockResolvedValue(mockAIService),
}));

describe('Conversation API with CodeSandbox Integration', () => {
  let testProjectId: string;
  
  beforeAll(async () => {
    // Connect to test database
    await connectMongoose();
    
    // Create test project
    const project = await Project.create({
      name: 'Test Sandbox Project',
      userId: 'test-user-id',
      framework: 'node',
      status: 'active',
    });
    testProjectId = project._id.toString();
    
    // Mock sandbox setup
    mockSandboxService.getSandboxForProject.mockResolvedValue({
      sandbox: { id: 'test-sandbox-id' },
      client: { commands: { run: vi.fn() } },
    });
  });

  afterAll(async () => {
    // Clean up
    await Project.deleteMany({ userId: 'test-user-id' });
    await Message.deleteMany({ projectId: testProjectId });
    await Task.deleteMany({ projectId: testProjectId });
    await mongoose.disconnect();
  });

  it('should handle a code generation request with sandbox tools', async () => {
    // Setup AI mock to simulate tool calls
    let streamCallback: any;
    mockAIService.sendMessage.mockImplementation(async (message, projectId, callback) => {
      streamCallback = callback;
      
      // Simulate AI response with tool calls
      await callback({
        type: 'Content',
        value: 'I\'ll create a simple Node.js application for you.',
      });
      
      await callback({
        type: 'ToolCallRequest',
        value: {
          name: 'write',
          callId: 'call-1',
          args: {
            file_path: '/app.js',
            content: 'console.log("Hello from CodeSandbox!");',
          },
        },
      });
      
      return {
        response: 'I\'ve created a simple Node.js application.',
        toolCalls: [{
          name: 'write',
          callId: 'call-1',
          args: {
            file_path: '/app.js',
            content: 'console.log("Hello from CodeSandbox!");',
          },
        }],
      };
    });

    // Mock file operations
    mockSandboxService.readFile.mockRejectedValueOnce(new Error('File not found')); // For checking if file exists
    mockSandboxService.writeFile.mockResolvedValueOnce(undefined);

    // Create request
    const request = new NextRequest('http://localhost:3000/api/projects/' + testProjectId + '/conversation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: 'Create a simple Node.js hello world application',
      }),
    });

    const response = await POST(request, { params: Promise.resolve({ projectId: testProjectId }) });
    
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/event-stream');

    // Read the SSE stream
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    const events: any[] = [];
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');
      
      for (const line of lines) {
        if (line.startsWith('event: ')) {
          const eventType = line.slice(7);
          const dataLine = lines[lines.indexOf(line) + 1];
          if (dataLine?.startsWith('data: ')) {
            events.push({
              type: eventType,
              data: JSON.parse(dataLine.slice(6)),
            });
          }
        }
      }
    }

    // Verify events
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'user_message' })
    );
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'ai_start' })
    );
    expect(events).toContainEqual(
      expect.objectContaining({ 
        type: 'tool_call_start',
        data: expect.objectContaining({ tool: 'write' })
      })
    );
    expect(events).toContainEqual(
      expect.objectContaining({ 
        type: 'tool_call_end',
        data: expect.objectContaining({ success: true })
      })
    );
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'ai_complete' })
    );

    // Verify sandbox service was called
    expect(mockSandboxService.writeFile).toHaveBeenCalledWith(
      testProjectId,
      '/app.js',
      'console.log("Hello from CodeSandbox!");'
    );

    // Verify messages were saved
    const messages = await Message.find({ projectId: testProjectId }).sort({ createdAt: 1 });
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('user');
    expect(messages[1].role).toBe('assistant');
    expect(messages[1].parts).toContainEqual(
      expect.objectContaining({
        type: 'tool-call',
        data: expect.objectContaining({
          tool: 'write',
          params: expect.objectContaining({
            file_path: '/app.js',
          }),
        }),
      })
    );

    // Verify task was created and completed
    const tasks = await Task.find({ projectId: testProjectId });
    expect(tasks).toHaveLength(1);
    expect(tasks[0].status).toBe('completed');
    expect(tasks[0].toolCalls).toHaveLength(1);
    expect(tasks[0].toolCalls[0]).toMatchObject({
      tool: 'write',
      status: 'completed',
    });
  });

  it('should handle multiple tool calls in sequence', async () => {
    // Setup for multiple tool calls
    mockAIService.sendMessage
      .mockImplementationOnce(async (message, projectId, callback) => {
        await callback({ type: 'Content', value: 'Creating a more complex app...' });
        await callback({
          type: 'ToolCallRequest',
          value: {
            name: 'bash',
            callId: 'call-2',
            args: { command: 'npm init -y' },
          },
        });
        await callback({
          type: 'ToolCallRequest',
          value: {
            name: 'write',
            callId: 'call-3',
            args: {
              file_path: '/index.js',
              content: 'const express = require("express");',
            },
          },
        });
        
        return {
          response: 'Created project structure',
          toolCalls: [
            { name: 'bash', callId: 'call-2', args: { command: 'npm init -y' } },
            { name: 'write', callId: 'call-3', args: { file_path: '/index.js', content: 'const express = require("express");' } },
          ],
        };
      })
      .mockImplementationOnce(async (message, projectId, callback) => {
        // Continuation after tool responses
        await callback({ type: 'Content', value: 'Project setup complete!' });
        return { response: 'Project setup complete!', toolCalls: [] };
      });

    mockSandboxService.executeCommand.mockResolvedValueOnce('{"name": "sandbox-project"}');
    mockSandboxService.readFile.mockRejectedValueOnce(new Error('File not found'));
    mockSandboxService.writeFile.mockResolvedValueOnce(undefined);

    const request = new NextRequest('http://localhost:3000/api/projects/' + testProjectId + '/conversation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: 'Set up an Express.js project',
      }),
    });

    const response = await POST(request, { params: Promise.resolve({ projectId: testProjectId }) });
    expect(response.status).toBe(200);

    // Verify both tools were called
    expect(mockSandboxService.executeCommand).toHaveBeenCalledWith(
      testProjectId,
      'npm init -y'
    );
    expect(mockSandboxService.writeFile).toHaveBeenCalledWith(
      testProjectId,
      '/index.js',
      'const express = require("express");'
    );
  });

  it('should handle tool execution errors gracefully', async () => {
    mockAIService.sendMessage.mockImplementationOnce(async (message, projectId, callback) => {
      await callback({
        type: 'ToolCallRequest',
        value: {
          name: 'bash',
          callId: 'call-4',
          args: { command: 'invalid-command-xyz' },
        },
      });
      
      return {
        response: 'Attempting to run command',
        toolCalls: [{
          name: 'bash',
          callId: 'call-4',
          args: { command: 'invalid-command-xyz' },
        }],
      };
    });

    // Simulate command failure
    mockSandboxService.executeCommand.mockRejectedValueOnce(
      new Error('Command not found: invalid-command-xyz')
    );

    const request = new NextRequest('http://localhost:3000/api/projects/' + testProjectId + '/conversation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: 'Run an invalid command',
      }),
    });

    const response = await POST(request, { params: Promise.resolve({ projectId: testProjectId }) });
    expect(response.status).toBe(200);

    // Read stream to verify error handling
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let hasErrorEvent = false;
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value);
      if (chunk.includes('tool_call_end') && chunk.includes('"success":false')) {
        hasErrorEvent = true;
      }
    }

    expect(hasErrorEvent).toBe(true);
  });

  it('should use CodeSandbox VM context in AI service config', async () => {
    const { getAIService } = await import('@/lib/ai/ai-service');
    
    const request = new NextRequest('http://localhost:3000/api/projects/' + testProjectId + '/conversation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: 'Check AI config',
      }),
    });

    await POST(request, { params: Promise.resolve({ projectId: testProjectId }) });

    // Verify AI service was initialized with sandbox config
    expect(getAIService).toHaveBeenCalledWith(
      expect.objectContaining({
        targetDir: '/',
        cwd: '/',
        isSandboxed: true,
        sandboxId: testProjectId,
      })
    );
  });
});