import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { CodeSandboxService, getCodeSandboxService } from './codesandbox-service';

// Use the manual mock
vi.mock('@codesandbox/sdk');

// Import mocks after vi.mock
import { mockClient, mockSandbox, mockSDK } from '../../__mocks__/@codesandbox/sdk';
import { VMTier } from '@codesandbox/sdk';

describe('CodeSandboxService', () => {
  let service: CodeSandboxService;
  const mockConfig = {
    apiKey: 'test-api-key',
    templateId: 'test-template',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset process env
    process.env.CODESANDBOX_API_KEY = 'test-api-key';
    service = new CodeSandboxService(mockConfig);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('getSandboxForProject', () => {
    it('should create a new sandbox for a new project', async () => {
      
      const result = await service.getSandboxForProject('test-project-1');

      expect(mockSDK.sandboxes.create).toHaveBeenCalledWith({
        id: 'test-template',
        title: 'Project test-project-1',
        privacy: 'private',
        vmTier: VMTier.Pico,
        hibernationTimeoutSeconds: 1800,
        automaticWakeupConfig: {
          http: true,
          websocket: true,
        },
      });
      expect(mockSandbox.connect).toHaveBeenCalled();
      expect(result.sandbox).toBe(mockSandbox);
      expect(result.client).toBe(mockClient);
    });

    it('should reuse existing sandbox for the same project', async () => {
      
      // First call creates sandbox
      const result1 = await service.getSandboxForProject('test-project-2');
      expect(mockSDK.sandboxes.create).toHaveBeenCalledTimes(1);

      // Second call should reuse
      const result2 = await service.getSandboxForProject('test-project-2');
      expect(mockSDK.sandboxes.create).toHaveBeenCalledTimes(1); // Still only 1
      expect(result2.sandbox).toBe(result1.sandbox);
      expect(result2.client).toBe(result1.client);
    });

    it('should resume a hibernated sandbox', async () => {
      
      // Create and then clear the sandbox (simulating hibernation)
      await service.getSandboxForProject('test-project-3');
      await service.hibernateSandbox('test-project-3');

      // Clear mocks
      vi.clearAllMocks();

      // Should resume instead of creating new
      const result = await service.getSandboxForProject('test-project-3');
      expect(mockSDK.sandboxes.resume).toHaveBeenCalledWith('test-sandbox-id');
      expect(mockSDK.sandboxes.create).not.toHaveBeenCalled();
      expect(result.sandbox).toBe(mockSandbox);
      expect(result.client).toBe(mockClient);
    });
  });

  describe('executeCommand', () => {
    it('should execute commands in the sandbox', async () => {
      mockClient.commands.run.mockResolvedValueOnce({ output: 'Hello World' });

      const result = await service.executeCommand('test-project', 'echo "Hello World"');
      
      expect(mockClient.commands.run).toHaveBeenCalledWith('echo "Hello World"');
      expect(result).toBe('Hello World');
    });

    it('should handle empty command output', async () => {
      mockClient.commands.run.mockResolvedValueOnce({ output: null });

      const result = await service.executeCommand('test-project', 'true');
      expect(result).toBe('');
    });
  });

  describe('readFile', () => {
    it('should read files from the sandbox', async () => {
      const fileContent = 'console.log("test");';
      mockClient.commands.run.mockResolvedValueOnce({ output: fileContent });

      const result = await service.readFile('test-project', '/src/index.js');
      
      expect(mockClient.commands.run).toHaveBeenCalledWith('cat "/src/index.js"');
      expect(result).toBe(fileContent);
    });

    it('should throw error for non-existent files', async () => {
      const error = new Error('Command failed') as Error & { output?: string };
      error.output = 'cat: /nonexistent: No such file or directory';
      mockClient.commands.run.mockRejectedValueOnce(error);

      await expect(service.readFile('test-project', '/nonexistent'))
        .rejects.toThrow('File not found: /nonexistent');
    });
  });

  describe('writeFile', () => {
    it('should write files to the sandbox', async () => {
      mockClient.commands.run.mockResolvedValue({ output: '' });

      const content = 'const x = 42;\nconsole.log(x);';
      await service.writeFile('test-project', '/src/test.js', content);
      
      // Should create directory first
      expect(mockClient.commands.run).toHaveBeenCalledWith('mkdir -p "/src"');
      
      // Then write the file
      expect(mockClient.commands.run).toHaveBeenCalledWith(
        expect.stringContaining("printf '%b'")
      );
    });

    it('should escape special characters in content', async () => {
      mockClient.commands.run.mockResolvedValue({ output: '' });

      const content = "const msg = 'Hello\nWorld';\nconsole.log(msg);";
      await service.writeFile('test-project', '/test.js', content);
      
      const writeCall = mockClient.commands.run.mock.calls[0][0];
      expect(writeCall).toContain('\\n');
      expect(writeCall).toContain("'\"'\"'");
    });
  });

  describe('listDirectory', () => {
    it('should list directory contents', async () => {
      const lsOutput = `total 16
drwxr-xr-x  4 user  group   128 Dec  3 10:00 .
drwxr-xr-x  3 user  group    96 Dec  3 09:00 ..
drwxr-xr-x  2 user  group    64 Dec  3 10:00 src
-rw-r--r--  1 user  group   123 Dec  3 10:00 package.json`;
      
      mockClient.commands.run.mockResolvedValueOnce({ output: lsOutput });

      const result = await service.listDirectory('test-project', '/');
      
      expect(mockClient.commands.run).toHaveBeenCalledWith('ls -la "/"');
      expect(result).toEqual([
        'd src',
        'f package.json',
      ]);
    });

    it('should handle empty directories', async () => {
      mockClient.commands.run.mockResolvedValueOnce({ output: '' });

      const result = await service.listDirectory('test-project', '/empty');
      expect(result).toEqual([]);
    });
  });

  describe('lifecycle management', () => {
    it('should hibernate sandboxes', async () => {
      
      // Create a sandbox first
      await service.getSandboxForProject('test-project');
      
      // Hibernate it
      await service.hibernateSandbox('test-project');
      
      expect(mockSDK.sandboxes.hibernate).toHaveBeenCalledWith('test-sandbox-id');
    });

    it('should fork sandboxes', async () => {
      const forkedSandbox = { ...mockSandbox, id: 'forked-sandbox-id' };
      mockSandbox.fork.mockResolvedValueOnce(forkedSandbox);
      
      await service.getSandboxForProject('original-project');
      await service.forkSandbox('original-project', 'forked-project');
      
      expect(mockSandbox.fork).toHaveBeenCalled();
    });

    it('should clean up inactive sandboxes', async () => {
      // Create sandboxes with different last access times
      await service.getSandboxForProject('active-project');
      await service.getSandboxForProject('inactive-project');
      
      // Manually set last accessed time for inactive project to 40 minutes ago
      const sessions = (service as any).sessions;
      const inactiveSession = sessions.get('inactive-project');
      if (inactiveSession) {
        inactiveSession.lastAccessedAt = new Date(Date.now() - 40 * 60 * 1000);
      }
      
      // Run cleanup
      await service.cleanupInactiveSandboxes(30);
      
      // Only inactive sandbox should be hibernated
      expect(mockSDK.sandboxes.hibernate).toHaveBeenCalledWith('test-sandbox-id');
      expect(mockSDK.sandboxes.hibernate).toHaveBeenCalledTimes(1);
    });
  });

  describe('getCodeSandboxService', () => {
    it('should create singleton instance', async () => {
      process.env.CODESANDBOX_API_KEY = 'test-key';
      
      const service1 = getCodeSandboxService();
      const service2 = getCodeSandboxService();
      
      expect(service1).toBe(service2);
    });

    it('should throw error if API key is not set', () => {
      // Import the module to access the singleton
      vi.resetModules();
      delete process.env.CODESANDBOX_API_KEY;
      
      // Re-import to trigger the error
      expect(() => {
        const { getCodeSandboxService: getService } = require('./codesandbox-service');
        getService();
      }).toThrow('CODESANDBOX_API_KEY environment variable is required');
      
      // Restore for other tests
      process.env.CODESANDBOX_API_KEY = 'test-key';
    });
  });

  describe('getRemoteSandboxInfo', () => {
    it('should fetch sandbox info from API', async () => {
      
      const info = await service.getRemoteSandboxInfo('test-sandbox-id');
      
      expect(mockSDK.sandboxes.get).toHaveBeenCalledWith('test-sandbox-id');
      expect(info).toEqual({ id: 'test-sandbox-id', title: 'Test Sandbox' });
    });

    it('should return null on error', async () => {
      mockSDK.sandboxes.get.mockRejectedValueOnce(new Error('API Error'));
      
      const info = await service.getRemoteSandboxInfo('invalid-id');
      expect(info).toBeNull();
    });
  });

  describe('listRunningSandboxes', () => {
    it('should list running sandboxes', async () => {
      
      const result = await service.listRunningSandboxes();
      
      expect(mockSDK.sandboxes.listRunning).toHaveBeenCalled();
      expect(result).toEqual({
        concurrentVmCount: 2,
        concurrentVmLimit: 10,
        vms: expect.any(Array),
      });
    });
  });
});