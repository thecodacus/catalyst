import { useEffect, useState, useCallback, useRef } from 'react';
import { apiClient } from '@/lib/api/client';
import { useFileCacheStore } from '@/stores/file-cache-store';
import { connectToSandbox, SandboxClient } from '@codesandbox/sdk/browser';
import {
  SANDBOX_REPO_PATH,
  SANDBOX_REPO_RELATIVE,
  toSandboxPath,
} from '@/lib/constants/sandbox-paths';
import { toast } from 'sonner';

// Dynamic import for client-side only
interface IframeClientInstance {
  fs: {
    readTextFile: (path: string) => Promise<string>;
    writeTextFile: (path: string, content: string) => Promise<void>;
    readdir: (path: string) => Promise<{ name: string }[]>;
    mkdir: (path: string, options?: { recursive?: boolean }) => Promise<void>;
    rm: (path: string, options?: { recursive?: boolean }) => Promise<void>;
    watch: (
      path: string,
      callback: (event: { type: string; path: string }) => void,
    ) => { dispose: () => void };
  };
  commands: {
    run: (command: string) => Promise<string>;
  };
}

interface UseSandboxClientOptions {
  projectId: string;
  enabled?: boolean;
}

interface SandboxFile {
  name: string;
  path: string;
  type: 'file' | 'directory';
}

interface PreviewUrl {
  port: number;
  url: string;
}

export function useSandboxClient({
  projectId,
  enabled = true,
}: UseSandboxClientOptions) {
  const [client, setClient] = useState<SandboxClient | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrls, setPreviewUrls] = useState<Map<number, PreviewUrl>>(
    new Map(),
  );

  // Initialize the sandbox client
  const portListenersRef = useRef<{
    openListener?: { dispose: () => void };
    closeListener?: { dispose: () => void };
  }>({});

  useEffect(() => {
    if (!enabled || !projectId) return;

    let mounted = true;

    const initializeClient = async () => {
      try {
        setLoading(true);
        setError(null);

        // Get sandbox session from API
        const { session } = await apiClient.getSandboxSession(projectId);

        if (!mounted) return;

        const sandboxClient = await connectToSandbox({
          session,
          getSession: async () => {
            const updated = await apiClient.getSandboxSession(projectId);
            return updated.session;
          },
        });

        if (!mounted) return;

        setClient(sandboxClient);
        console.log('✅ Connected to CodeSandbox VM');

        // Set up port monitoring
        console.log('🔌 Setting up port monitoring for sandbox');

        portListenersRef.current.openListener =
          sandboxClient.ports.onDidPortOpen((portInfo) => {
            console.log(`🟢 Port ${portInfo.port} opened`, portInfo);
            const url = sandboxClient.hosts.getUrl(portInfo.port);
            console.log(
              `🔗 Generated preview URL for port ${portInfo.port}: ${url}`,
            );

            // Show toast notification
            toast.success(`Dev server detected on port ${portInfo.port}`, {
              description: 'Preview panel will open automatically',
              duration: 3000,
            });

            setPreviewUrls((prev) => {
              const newMap = new Map(prev);
              newMap.set(portInfo.port, { port: portInfo.port, url });
              console.log(
                `📊 Updated preview URLs map:`,
                Array.from(newMap.entries()),
              );
              return newMap;
            });
          });

        portListenersRef.current.closeListener =
          sandboxClient.ports.onDidPortClose((port) => {
            console.log(`🔴 Port ${port} closed`);
            setPreviewUrls((prev) => {
              const newMap = new Map(prev);
              newMap.delete(port);
              console.log(
                `📊 Updated preview URLs map after close:`,
                Array.from(newMap.entries()),
              );
              return newMap;
            });
          });

        // Get initially opened ports
        console.log('🔍 Checking for initially opened ports...');
        const openPorts = await sandboxClient.ports.getAll();
        console.log(
          `📋 Found ${openPorts.length} initially open ports:`,
          openPorts,
        );

        const initialUrls = new Map<number, PreviewUrl>();
        for (const portInfo of openPorts) {
          const url = sandboxClient.hosts.getUrl(portInfo.port);
          console.log(`🔗 Initial port ${portInfo.port} -> ${url}`);
          initialUrls.set(portInfo.port, { port: portInfo.port, url });
        }
        if (initialUrls.size > 0) {
          console.log(
            `📊 Setting initial preview URLs:`,
            Array.from(initialUrls.entries()),
          );
          setPreviewUrls(initialUrls);
        }
      } catch (err) {
        console.error('Failed to initialize sandbox client:', err);
        if (mounted) {
          setError(
            err instanceof Error ? err.message : 'Failed to connect to sandbox',
          );
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    initializeClient();

    return () => {
      mounted = false;
      setClient(null);

      // Clean up port listeners
      if (portListenersRef.current.openListener) {
        portListenersRef.current.openListener.dispose();
      }
      if (portListenersRef.current.closeListener) {
        portListenersRef.current.closeListener.dispose();
      }
      portListenersRef.current = {};

      // Clear preview URLs
      setPreviewUrls(new Map());
    };
  }, [projectId, enabled]);

  // File system operations
  const readFile = useCallback(
    async (path: string): Promise<string> => {
      if (!client) throw new Error('Sandbox client not initialized');

      const relativePath = toSandboxPath(path);
      return await client.fs.readTextFile(relativePath);
    },
    [client],
  );

  const writeFile = useCallback(
    async (path: string, content: string): Promise<void> => {
      if (!client) throw new Error('Sandbox client not initialized');

      const relativePath = toSandboxPath(path);
      await client.fs.writeTextFile(relativePath, content);
    },
    [client],
  );

  const listDirectory = useCallback(
    async (path: string = '/'): Promise<SandboxFile[]> => {
      if (!client) throw new Error('Sandbox client not initialized');

      const relativePath = toSandboxPath(path);

      try {
        const entries = await client.fs.readdir(relativePath);
        const files: SandboxFile[] = [];

        for (const entry of entries) {
          const entryPath =
            relativePath === SANDBOX_REPO_RELATIVE
              ? `repo/${entry.name}`
              : `${relativePath}/${entry.name}`.replace(/\/+/g, '/');

          // Try to determine if it's a directory
          let isDirectory = false;
          try {
            // Use stat to determine file type instead of trying to readdir
            const stats = await client.fs.stat(entryPath);
            isDirectory = stats.type === 'directory';
          } catch (statError) {
            // If stat fails, try readdir as fallback
            try {
              await client.fs.readdir(entryPath);
              isDirectory = true;
            } catch {
              isDirectory = false;
            }
          }

          const fullPath =
            path === '/'
              ? `/${entry.name}`
              : `${path}/${entry.name}`.replace(/\/+/g, '/');

          files.push({
            name: entry.name,
            path: fullPath,
            type: isDirectory ? 'directory' : 'file',
          });
        }

        return files.sort((a, b) => {
          if (a.type === b.type) return a.name.localeCompare(b.name);
          return a.type === 'directory' ? -1 : 1;
        });
      } catch (error) {
        if ((error as Error).message?.includes('ENOENT')) {
          return [];
        }
        throw error;
      }
    },
    [client],
  );

  const createDirectory = useCallback(
    async (path: string): Promise<void> => {
      if (!client) throw new Error('Sandbox client not initialized');

      const relativePath = toSandboxPath(path);
      await client.fs.mkdir(relativePath, true);
    },
    [client],
  );

  const deleteFile = useCallback(
    async (path: string): Promise<void> => {
      if (!client) throw new Error('Sandbox client not initialized');

      const relativePath = toSandboxPath(path);
      await client.fs.remove(relativePath, true);
    },
    [client],
  );

  const executeCommand = useCallback(
    async (command: string): Promise<string> => {
      if (!client) throw new Error('Sandbox client not initialized');

      // Always execute from repo directory
      const fullCommand = `cd ${SANDBOX_REPO_PATH} && ${command}`;
      return await client.commands.run(fullCommand);
    },
    [client],
  );

  // File watching functionality
  const activeWatchers = useRef<Map<string, { dispose: () => void }>>(
    new Map(),
  );
  const {
    setFileContent,
    invalidateFile,
    invalidateDirectory,
    addWatcher,
    removeWatcher,
  } = useFileCacheStore();

  const waitForPort = useCallback(
    async (
      port: number,
      timeout: number = 30000,
    ): Promise<PreviewUrl | null> => {
      if (!client) throw new Error('Sandbox client not initialized');

      try {
        const portInfo = await client.ports.waitForPort(port, {
          timeoutMs: timeout,
        });
        const url = client.hosts.getUrl(portInfo.port);
        const preview = { port: portInfo.port, url };

        // Update state with the new port
        setPreviewUrls((prev) => {
          const newMap = new Map(prev);
          newMap.set(portInfo.port, preview);
          return newMap;
        });

        return preview;
      } catch (error) {
        console.error(`Timeout waiting for port ${port}:`, error);
        return null;
      }
    },
    [client],
  );

  const watchDirectory = useCallback(
    async (path: string): Promise<() => void> => {
      if (!client) throw new Error('Sandbox client not initialized');

      const relativePath = toSandboxPath(path);

      // Set up directory watcher
      const watcher = await client.fs.watch(relativePath, {
        recursive: true,
      });
      watcher.onEvent(async (event) => {
        for (path of event.paths) {
          if (event.type === 'change' || event.type === 'add') {
            try {
              let stat = await client.fs.stat(path);
              if (stat.type === 'directory') {
                // Invalidate directory cache
                invalidateDirectory(path);
                continue;
              }
              // Read the updated content
              const content = await client.fs.readTextFile(path);
              // Update cache
              setFileContent(path, content);
            } catch (error) {
              console.error(`Failed to read file after change: ${path}`, error);
              invalidateFile(path);
            }
          } else if (event.type === 'remove') {
            // Invalidate cache for deleted files
            invalidateFile(path);
          }
        }
      });
      const dispose = () => {
        watcher.dispose();
      };

      // Store the dispose function, not a function that calls removeWatcher
      addWatcher(path, dispose);

      // Return a cleanup function that handles both
      return () => {
        removeWatcher(path);
        dispose();
      };
    },
    [client, invalidateDirectory],
  );

  // Cleanup watchers on unmount
  useEffect(() => {
    return () => {
      activeWatchers.current.forEach((watcher) => watcher.dispose());
      activeWatchers.current.clear();
    };
  }, []);

  return {
    client,
    loading,
    error,
    // Preview URLs for opened ports
    previewUrls,
    waitForPort,
    // File operations
    readFile,
    writeFile,
    listDirectory,
    createDirectory,
    deleteFile,
    executeCommand,
    // Watch operations
    watchDirectory,
  };
}
