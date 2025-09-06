import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { BackendToolExecutor } from './backend-tool-executor';
import { Config, ToolCallRequestInfo } from '@catalyst/core';

vi.mock('fs/promises');
vi.mock('minimatch');

describe('BackendToolExecutor', () => {
  let executor: BackendToolExecutor;
  let mockConfig: Config;
  const projectDir = '/test/project';

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock Config with a registry that returns a mock tool for known tools
    mockConfig = {
      getToolRegistry: vi.fn().mockResolvedValue({
        getTool: vi.fn().mockImplementation((name: string) => {
          // Return a mock tool for known tools
          const knownTools = [
            'read',
            'read_file',
            'write',
            'write_file',
            'str_replace',
            'str_replace_editor',
            'multi_edit',
            'ls',
            'list_directory',
            'glob',
            'grep',
            'bash',
            'run_bash_command',
          ];

          if (knownTools.includes(name)) {
            return { name, displayName: name };
          }
          return null;
        }),
      }),
    } as any;

    executor = new BackendToolExecutor(projectDir, mockConfig);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('executeToolCall', () => {
    it('should handle unknown tools', async () => {
      const request: ToolCallRequestInfo = {
        callId: 'test-1',
        name: 'unknown_tool',
        args: {},
        isClientInitiated: false,
        prompt_id: 'test',
      };

      const result = await executor.executeToolCall(request);

      expect(result.callId).toBe('test-1');
      expect(result.error).toBeDefined();
      expect(result.responseParts[0].text).toContain(
        'Unknown tool unknown_tool',
      );
    });
  });

  describe('read tool', () => {
    it('should read file successfully', async () => {
      const mockContent = 'function test() {\n  return "hello";\n}';
      vi.mocked(fs.readFile).mockResolvedValue(mockContent);

      const request: ToolCallRequestInfo = {
        callId: 'test-1',
        name: 'read',
        args: { file_path: 'test.js' },
        isClientInitiated: false,
        prompt_id: 'test',
      };

      const result = await executor.executeToolCall(request);

      expect(result.error).toBeUndefined();
      expect(result.responseParts[0].text).toContain('1→function test()');
      expect(result.responseParts[0].text).toContain('2→  return "hello";');
    });

    it('should handle file not found', async () => {
      vi.mocked(fs.readFile).mockRejectedValue({ code: 'ENOENT' });

      const request: ToolCallRequestInfo = {
        callId: 'test-1',
        name: 'read_file',
        args: { file_path: 'missing.js' },
        isClientInitiated: false,
        prompt_id: 'test',
      };

      const result = await executor.executeToolCall(request);

      expect(result.responseParts[0].text).toContain('File not found');
    });

    it('should handle undefined file path', async () => {
      const request: ToolCallRequestInfo = {
        callId: 'test-1',
        name: 'read',
        args: {},
        isClientInitiated: false,
        prompt_id: 'test',
      };

      const result = await executor.executeToolCall(request);

      expect(result.error).toBeDefined();
      expect(result.responseParts[0].text).toContain('File path is required');
    });
  });

  describe('write tool', () => {
    it('should write file successfully', async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.readFile).mockRejectedValue({ code: 'ENOENT' });
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const request: ToolCallRequestInfo = {
        callId: 'test-1',
        name: 'write',
        args: {
          file_path: 'new.js',
          content: 'console.log("test");',
        },
        isClientInitiated: false,
        prompt_id: 'test',
      };

      const result = await executor.executeToolCall(request);

      expect(result.error).toBeUndefined();
      expect(result.responseParts[0].text).toContain('Created file: new.js');
      expect(vi.mocked(fs.mkdir)).toHaveBeenCalled();
      expect(vi.mocked(fs.writeFile)).toHaveBeenCalledWith(
        expect.stringContaining('new.js'),
        'console.log("test");',
      );
    });

    it('should update existing file', async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.readFile).mockResolvedValue('old content');
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const request: ToolCallRequestInfo = {
        callId: 'test-1',
        name: 'write_file',
        args: {
          file_path: 'existing.js',
          content: 'new content',
        },
        isClientInitiated: false,
        prompt_id: 'test',
      };

      const result = await executor.executeToolCall(request);

      expect(result.error).toBeUndefined();
      expect(result.responseParts[0].text).toContain(
        'Updated file: existing.js',
      );
    });
  });

  describe('str_replace tool', () => {
    it('should replace string successfully', async () => {
      const originalContent = 'Hello World\nHello Universe';
      vi.mocked(fs.readFile).mockResolvedValue(originalContent);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const request: ToolCallRequestInfo = {
        callId: 'test-1',
        name: 'str_replace',
        args: {
          file_path: 'test.txt',
          old_string: 'Hello',
          new_string: 'Hi',
        },
        isClientInitiated: false,
        prompt_id: 'test',
      };

      const result = await executor.executeToolCall(request);

      expect(result.error).toBeUndefined();
      expect(result.responseParts[0].text).toContain(
        'Replaced 1 occurrence(s)',
      );
      expect(vi.mocked(fs.writeFile)).toHaveBeenCalledWith(
        expect.any(String),
        'Hi World\nHello Universe',
      );
    });

    it('should replace all occurrences when replace_all is true', async () => {
      const originalContent = 'Hello World\nHello Universe';
      vi.mocked(fs.readFile).mockResolvedValue(originalContent);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const request: ToolCallRequestInfo = {
        callId: 'test-1',
        name: 'str_replace_editor',
        args: {
          file_path: 'test.txt',
          old_string: 'Hello',
          new_string: 'Hi',
          replace_all: true,
        },
        isClientInitiated: false,
        prompt_id: 'test',
      };

      const result = await executor.executeToolCall(request);

      expect(result.error).toBeUndefined();
      expect(result.responseParts[0].text).toContain(
        'Replaced 2 occurrence(s)',
      );
      expect(vi.mocked(fs.writeFile)).toHaveBeenCalledWith(
        expect.any(String),
        'Hi World\nHi Universe',
      );
    });

    it('should handle string not found', async () => {
      vi.mocked(fs.readFile).mockResolvedValue('Hello World');

      const request: ToolCallRequestInfo = {
        callId: 'test-1',
        name: 'str_replace',
        args: {
          file_path: 'test.txt',
          old_string: 'Goodbye',
          new_string: 'Hi',
        },
        isClientInitiated: false,
        prompt_id: 'test',
      };

      const result = await executor.executeToolCall(request);

      expect(result.responseParts[0].text).toContain('String not found');
    });
  });

  describe('ls tool', () => {
    it('should list directory contents', async () => {
      vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as any);
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'file1.js', isDirectory: () => false },
        { name: 'folder1', isDirectory: () => true },
        { name: 'file2.txt', isDirectory: () => false },
      ] as any);

      const request: ToolCallRequestInfo = {
        callId: 'test-1',
        name: 'ls',
        args: { path: '.' },
        isClientInitiated: false,
        prompt_id: 'test',
      };

      const result = await executor.executeToolCall(request);

      expect(result.error).toBeUndefined();
      expect(result.responseParts[0].text).toContain('f file1.js');
      expect(result.responseParts[0].text).toContain('d folder1');
      expect(result.responseParts[0].text).toContain('f file2.txt');
    });

    it('should handle empty directory', async () => {
      vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as any);
      vi.mocked(fs.readdir).mockResolvedValue([]);

      const request: ToolCallRequestInfo = {
        callId: 'test-1',
        name: 'list_directory',
        args: { directory: '.' },
        isClientInitiated: false,
        prompt_id: 'test',
      };

      const result = await executor.executeToolCall(request);

      expect(result.error).toBeUndefined();
      expect(result.responseParts[0].text).toBe('(empty directory)');
    });

    it('should handle not a directory error', async () => {
      vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => false } as any);

      const request: ToolCallRequestInfo = {
        callId: 'test-1',
        name: 'ls',
        args: { path: 'file.txt' },
        isClientInitiated: false,
        prompt_id: 'test',
      };

      const result = await executor.executeToolCall(request);

      expect(result.responseParts[0].text).toContain('Not a directory');
    });
  });

  describe('multi_edit tool', () => {
    it('should apply multiple edits successfully', async () => {
      const originalContent = 'Line 1\nLine 2\nLine 3';
      vi.mocked(fs.readFile).mockResolvedValue(originalContent);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const request: ToolCallRequestInfo = {
        callId: 'test-1',
        name: 'multi_edit',
        args: {
          file_path: 'test.txt',
          edits: [
            { old_string: 'Line 1', new_string: 'First line' },
            { old_string: 'Line 3', new_string: 'Third line' },
          ],
        },
        isClientInitiated: false,
        prompt_id: 'test',
      };

      const result = await executor.executeToolCall(request);

      expect(result.error).toBeUndefined();
      expect(result.responseParts[0].text).toContain('Applied 2 edits');
      expect(vi.mocked(fs.writeFile)).toHaveBeenCalledWith(
        expect.any(String),
        'First line\nLine 2\nThird line',
      );
    });

    it('should create new file when first edit has empty old_string', async () => {
      vi.mocked(fs.readFile).mockRejectedValue({ code: 'ENOENT' });
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const request: ToolCallRequestInfo = {
        callId: 'test-1',
        name: 'multi_edit',
        args: {
          file_path: 'new.txt',
          edits: [{ old_string: '', new_string: 'Initial content' }],
        },
        isClientInitiated: false,
        prompt_id: 'test',
      };

      const result = await executor.executeToolCall(request);

      expect(result.error).toBeUndefined();
      expect(result.responseParts[0].text).toContain('Created file');
      expect(vi.mocked(fs.writeFile)).toHaveBeenCalledWith(
        expect.any(String),
        'Initial content',
      );
    });
  });

  describe('path resolution', () => {
    it('should handle relative paths correctly', async () => {
      vi.mocked(fs.readFile).mockResolvedValue('content');

      const request: ToolCallRequestInfo = {
        callId: 'test-1',
        name: 'read',
        args: { file_path: 'subfolder/file.js' },
        isClientInitiated: false,
        prompt_id: 'test',
      };

      await executor.executeToolCall(request);

      expect(vi.mocked(fs.readFile)).toHaveBeenCalledWith(
        path.join(projectDir, 'subfolder/file.js'),
        'utf-8',
      );
    });

    it('should handle absolute paths by extracting filename', async () => {
      vi.mocked(fs.readFile).mockResolvedValue('content');

      const request: ToolCallRequestInfo = {
        callId: 'test-1',
        name: 'read',
        args: { file_path: '/some/absolute/path/file.js' },
        isClientInitiated: false,
        prompt_id: 'test',
      };

      await executor.executeToolCall(request);

      expect(vi.mocked(fs.readFile)).toHaveBeenCalledWith(
        path.join(projectDir, 'file.js'),
        'utf-8',
      );
    });

    it('should prevent directory traversal', async () => {
      const request: ToolCallRequestInfo = {
        callId: 'test-1',
        name: 'read',
        args: { file_path: '../../../etc/passwd' },
        isClientInitiated: false,
        prompt_id: 'test',
      };

      const result = await executor.executeToolCall(request);

      // Should strip the ../ parts, leaving 'etc/passwd'
      expect(vi.mocked(fs.readFile)).toHaveBeenCalledWith(
        path.join(projectDir, 'etc/passwd'),
        'utf-8',
      );
    });
  });
});
