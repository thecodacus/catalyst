import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SandboxToolExecutor } from './sandbox-tool-executor';
import { Config, ToolCallRequestInfo } from '@catalyst/core';

// Create service mock instance
const mockSandboxServiceInstance = {
  readFile: vi.fn(),
  writeFile: vi.fn(),
  executeCommand: vi.fn(),
  listDirectory: vi.fn(),
};

// Mock the sandbox service
vi.mock('@/lib/sandbox/codesandbox-service', () => ({
  getCodeSandboxService: vi.fn(() => mockSandboxServiceInstance),
}));

// Create mock tool registry
const mockToolRegistry = {
  getTool: vi.fn((toolName: string) => {
    // Return a mock tool for known tools, null for unknown
    const knownTools = [
      'read',
      'read_file',
      'write',
      'write_file',
      'str_replace',
      'str_replace_editor',
      'ls',
      'list_directory',
      'bash',
      'run_bash_command',
      'grep',
      'glob',
    ];
    return knownTools.includes(toolName) ? {} : null;
  }),
};

// Mock the Config class
vi.mock('@catalyst/core', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as object),
    Config: vi.fn().mockImplementation(() => ({
      getToolRegistry: vi.fn().mockResolvedValue(mockToolRegistry),
    })),
  };
});

describe('SandboxToolExecutor', () => {
  let executor: SandboxToolExecutor;
  let mockSandboxService: any;
  const projectId = 'test-project';
  const mockConfig = new Config({} as any);

  beforeEach(async () => {
    vi.clearAllMocks();

    // Use the global mock instance
    mockSandboxService = mockSandboxServiceInstance;

    executor = new SandboxToolExecutor(projectId, mockConfig);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('read tool', () => {
    it('should read files from sandbox', async () => {
      const fileContent = 'const x = 42;\nconsole.log(x);';
      mockSandboxServiceInstance.readFile.mockResolvedValue(fileContent);

      const request: ToolCallRequestInfo = {
        name: 'read',
        callId: 'test-call-1',
        args: {
          file_path: '/src/index.js',
        },
      };

      const result = await executor.executeToolCall(request);

      expect(mockSandboxServiceInstance.readFile).toHaveBeenCalledWith(
        projectId,
        '/src/index.js',
      );
      expect(result.error).toBeUndefined();
      expect(result.responseParts).toContainEqual(
        expect.objectContaining({
          text: expect.stringContaining('1→const x = 42;'),
        }),
      );
      expect(result.responseParts).toContainEqual(
        expect.objectContaining({
          text: expect.stringContaining('2→console.log(x);'),
        }),
      );
    });

    it('should handle file not found errors', async () => {
      mockSandboxServiceInstance.readFile.mockRejectedValue(
        new Error('File not found: /missing.js'),
      );

      const request: ToolCallRequestInfo = {
        name: 'read',
        callId: 'test-call-2',
        args: {
          file_path: '/missing.js',
        },
      };

      const result = await executor.executeToolCall(request);

      expect(result.error).toBeUndefined(); // Graceful handling
      expect(result.responseParts[0].text).toContain(
        'File not found: /missing.js',
      );
    });

    it('should support offset and limit parameters', async () => {
      const content = Array(100)
        .fill(null)
        .map((_, i) => `Line ${i + 1}`)
        .join('\n');
      mockSandboxServiceInstance.readFile.mockResolvedValue(content);

      const request: ToolCallRequestInfo = {
        name: 'read',
        callId: 'test-call-3',
        args: {
          file_path: '/large.txt',
          offset: 10,
          limit: 5,
        },
      };

      const result = await executor.executeToolCall(request);

      expect(result.responseParts[0].text).toContain('11→Line 11');
      expect(result.responseParts[0].text).toContain('15→Line 15');
      expect(result.responseParts[0].text).not.toContain('16→Line 16');
    });
  });

  describe('write tool', () => {
    it('should create new files', async () => {
      mockSandboxServiceInstance.readFile.mockRejectedValue(
        new Error('File not found'),
      );
      mockSandboxServiceInstance.writeFile.mockResolvedValue(undefined);

      const request: ToolCallRequestInfo = {
        name: 'write',
        callId: 'test-call-4',
        args: {
          file_path: '/new-file.js',
          content: 'console.log("Hello");',
        },
      };

      const result = await executor.executeToolCall(request);

      expect(mockSandboxServiceInstance.writeFile).toHaveBeenCalledWith(
        projectId,
        '/new-file.js',
        'console.log("Hello");',
      );
      expect(result.responseParts[0].text).toContain(
        'Created file: /new-file.js',
      );
    });

    it('should update existing files', async () => {
      mockSandboxServiceInstance.readFile.mockResolvedValue('old content');
      mockSandboxServiceInstance.writeFile.mockResolvedValue(undefined);

      const request: ToolCallRequestInfo = {
        name: 'write',
        callId: 'test-call-5',
        args: {
          file_path: '/existing.txt',
          content: 'new content',
        },
      };

      const result = await executor.executeToolCall(request);

      expect(result.responseParts[0].text).toContain(
        'Updated file: /existing.txt',
      );
    });
  });

  describe('str_replace tool', () => {
    it('should replace strings in files', async () => {
      const originalContent = 'const name = "old";\nconsole.log(name);';
      mockSandboxServiceInstance.readFile.mockResolvedValue(originalContent);
      mockSandboxServiceInstance.writeFile.mockResolvedValue(undefined);

      const request: ToolCallRequestInfo = {
        name: 'str_replace',
        callId: 'test-call-6',
        args: {
          file_path: '/app.js',
          old_string: '"old"',
          new_string: '"new"',
        },
      };

      const result = await executor.executeToolCall(request);

      expect(mockSandboxServiceInstance.writeFile).toHaveBeenCalledWith(
        projectId,
        '/app.js',
        'const name = "new";\nconsole.log(name);',
      );
      expect(result.responseParts[0].text).toContain(
        'Replaced 1 occurrence(s)',
      );
    });

    it('should handle replace_all option', async () => {
      const content = 'foo bar foo baz foo';
      mockSandboxServiceInstance.readFile.mockResolvedValue(content);
      mockSandboxServiceInstance.writeFile.mockResolvedValue(undefined);

      const request: ToolCallRequestInfo = {
        name: 'str_replace',
        callId: 'test-call-7',
        args: {
          file_path: '/test.txt',
          old_string: 'foo',
          new_string: 'qux',
          replace_all: true,
        },
      };

      const result = await executor.executeToolCall(request);

      expect(mockSandboxServiceInstance.writeFile).toHaveBeenCalledWith(
        projectId,
        '/test.txt',
        'qux bar qux baz qux',
      );
      expect(result.responseParts[0].text).toContain(
        'Replaced 3 occurrence(s)',
      );
    });

    it('should handle string not found', async () => {
      mockSandboxServiceInstance.readFile.mockResolvedValue('some content');

      const request: ToolCallRequestInfo = {
        name: 'str_replace',
        callId: 'test-call-8',
        args: {
          file_path: '/test.txt',
          old_string: 'not found',
          new_string: 'replacement',
        },
      };

      const result = await executor.executeToolCall(request);

      expect(mockSandboxServiceInstance.writeFile).not.toHaveBeenCalled();
      expect(result.responseParts[0].text).toContain('String not found');
    });
  });

  describe('bash tool', () => {
    it('should execute bash commands', async () => {
      mockSandboxServiceInstance.executeCommand.mockResolvedValue(
        'node v18.0.0',
      );

      const request: ToolCallRequestInfo = {
        name: 'bash',
        callId: 'test-call-9',
        args: {
          command: 'node --version',
        },
      };

      const result = await executor.executeToolCall(request);

      expect(mockSandboxServiceInstance.executeCommand).toHaveBeenCalledWith(
        projectId,
        'node --version',
      );
      expect(result.responseParts[0].text).toBe('node v18.0.0');
    });

    it('should handle empty command output', async () => {
      mockSandboxServiceInstance.executeCommand.mockResolvedValue('');

      const request: ToolCallRequestInfo = {
        name: 'bash',
        callId: 'test-call-10',
        args: {
          command: 'true',
        },
      };

      const result = await executor.executeToolCall(request);

      expect(result.responseParts[0].text).toBe('(no output)');
    });
  });

  describe('ls tool', () => {
    it('should list directory contents', async () => {
      mockSandboxServiceInstance.listDirectory.mockResolvedValue([
        'd src',
        'd tests',
        'f package.json',
        'f README.md',
      ]);

      const request: ToolCallRequestInfo = {
        name: 'ls',
        callId: 'test-call-11',
        args: {
          path: '/',
        },
      };

      const result = await executor.executeToolCall(request);

      expect(mockSandboxServiceInstance.listDirectory).toHaveBeenCalledWith(
        projectId,
        '/',
      );
      expect(result.responseParts[0].text).toContain('d src');
      expect(result.responseParts[0].text).toContain('f package.json');
    });

    it('should apply ignore patterns', async () => {
      mockSandboxServiceInstance.listDirectory.mockResolvedValue([
        'd node_modules',
        'd src',
        'f package.json',
        'f .gitignore',
      ]);

      const request: ToolCallRequestInfo = {
        name: 'ls',
        callId: 'test-call-12',
        args: {
          path: '/',
          ignore: ['node_modules', '.git'],
        },
      };

      const result = await executor.executeToolCall(request);

      expect(result.responseParts[0].text).not.toContain('node_modules');
      expect(result.responseParts[0].text).toContain('src');
      expect(result.responseParts[0].text).toContain('.gitignore');
    });
  });

  describe('grep tool', () => {
    it('should search for patterns in files', async () => {
      const grepOutput =
        'src/index.js:10:const result = calculate();\nsrc/utils.js:5:function calculate() {';
      mockSandboxServiceInstance.executeCommand.mockResolvedValue(grepOutput);

      const request: ToolCallRequestInfo = {
        name: 'grep',
        callId: 'test-call-13',
        args: {
          pattern: 'calculate',
          path: './src',
        },
      };

      const result = await executor.executeToolCall(request);

      expect(mockSandboxServiceInstance.executeCommand).toHaveBeenCalledWith(
        projectId,
        expect.stringContaining('rg "calculate" "./src"'),
      );
      expect(result.responseParts[0].text).toBe(grepOutput);
      expect(result.resultDisplay).toEqual({
        type: 'grep_results',
        pattern: 'calculate',
        matches: 2,
        files: 2,
      });
    });

    it('should handle case insensitive search', async () => {
      mockSandboxServiceInstance.executeCommand.mockResolvedValue(
        'Found matches',
      );

      const request: ToolCallRequestInfo = {
        name: 'grep',
        callId: 'test-call-14',
        args: {
          pattern: 'test',
          path: '.',
          '-i': true,
        },
      };

      const result = await executor.executeToolCall(request);

      expect(mockSandboxServiceInstance.executeCommand).toHaveBeenCalledWith(
        projectId,
        expect.stringContaining('rg -i "test"'),
      );
    });

    it('should handle no matches found', async () => {
      mockSandboxServiceInstance.executeCommand.mockResolvedValue(
        'No matches found',
      );

      const request: ToolCallRequestInfo = {
        name: 'grep',
        callId: 'test-call-15',
        args: {
          pattern: 'nonexistent',
        },
      };

      const result = await executor.executeToolCall(request);

      expect(result.responseParts[0].text).toContain('No matches found');
      expect(result.resultDisplay).toMatchObject({
        matches: 0,
        files: 0,
      });
    });
  });

  describe('glob tool', () => {
    it('should find files matching patterns', async () => {
      const files =
        '/project/src/app.js\n/project/src/utils.js\n/project/test/app.test.js';
      mockSandboxServiceInstance.executeCommand.mockResolvedValue(files);

      const request: ToolCallRequestInfo = {
        name: 'glob',
        callId: 'test-call-16',
        args: {
          pattern: '*.js',
          path: '/project',
        },
      };

      const result = await executor.executeToolCall(request);

      expect(mockSandboxServiceInstance.executeCommand).toHaveBeenCalledWith(
        projectId,
        expect.stringContaining('find "/project" -name "*.js"'),
      );
      expect(result.responseParts[0].text).toBe(files);
      expect(result.resultDisplay).toMatchObject({
        type: 'glob_results',
        pattern: '*.js',
        count: 3,
      });
    });

    it('should handle no matches', async () => {
      mockSandboxServiceInstance.executeCommand.mockResolvedValue('');

      const request: ToolCallRequestInfo = {
        name: 'glob',
        callId: 'test-call-17',
        args: {
          pattern: '*.xyz',
        },
      };

      const result = await executor.executeToolCall(request);

      expect(result.responseParts[0].text).toContain(
        'No files matching pattern',
      );
      expect(result.resultDisplay?.count).toBe(0);
    });
  });

  describe('error handling', () => {
    it('should handle unknown tools', async () => {
      const mockRegistry = {
        getTool: vi.fn().mockReturnValue(null),
      };
      (mockConfig.getToolRegistry as any).mockResolvedValue(mockRegistry);

      const request: ToolCallRequestInfo = {
        name: 'unknown_tool',
        callId: 'test-call-18',
        args: {},
      };

      const result = await executor.executeToolCall(request);

      expect(result.error).toBeDefined();
      expect(result.responseParts[0].text).toContain(
        'Unknown tool unknown_tool',
      );
    });

    it('should handle tool execution errors', async () => {
      mockSandboxServiceInstance.executeCommand.mockRejectedValue(
        new Error('Command failed'),
      );

      const request: ToolCallRequestInfo = {
        name: 'bash',
        callId: 'test-call-19',
        args: {
          command: 'invalid-command',
        },
      };

      const result = await executor.executeToolCall(request);

      expect(result.error).toBeDefined();
      expect(result.responseParts[0].text).toContain(
        'Error executing bash: Command failed',
      );
    });

    it('should log execution time and errors', async () => {
      const consoleSpy = vi.spyOn(console, 'log');
      const consoleErrorSpy = vi.spyOn(console, 'error');

      mockSandboxServiceInstance.readFile.mockResolvedValue('content');

      // Successful execution
      await executor.executeToolCall({
        name: 'read',
        callId: 'test-log-1',
        args: { file_path: '/test.txt' },
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('🔧 Sandbox tool execution started'),
        expect.any(Object),
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('✅ Sandbox tool execution completed'),
        expect.any(Object),
      );

      // Failed execution
      mockSandboxServiceInstance.readFile.mockRejectedValue(
        new Error('Read error'),
      );

      await executor.executeToolCall({
        name: 'read',
        callId: 'test-log-2',
        args: { file_path: '/error.txt' },
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('❌ Sandbox tool execution error for read'),
        expect.any(Object),
      );
    });
  });

  describe('sanitization', () => {
    it('should sanitize sensitive parameters in logs', async () => {
      const consoleSpy = vi.spyOn(console, 'log');

      const longContent = 'x'.repeat(200);
      mockSandboxServiceInstance.writeFile.mockResolvedValue(undefined);

      await executor.executeToolCall({
        name: 'write',
        callId: 'test-sanitize',
        args: {
          file_path: '/test.txt',
          content: longContent,
        },
      });

      const logCall = consoleSpy.mock.calls.find((call) =>
        call[0].includes('🔧 Sandbox tool execution started'),
      );

      expect(logCall).toBeDefined();
      const loggedParams = JSON.parse(logCall![1].parameters);
      expect(loggedParams.content).toContain('... (200 chars total)');
      expect(loggedParams.content.length).toBeLessThan(150);
    });
  });
});
