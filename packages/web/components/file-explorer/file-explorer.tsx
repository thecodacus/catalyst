'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  ChevronRight,
  File,
  Folder,
  FolderOpen,
  Loader2,
  RefreshCw,
  WifiOff,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiClient } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { useSandboxClient } from '@/hooks/use-sandbox-client';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useCachedDirectoryContent, useFileCacheStore } from '@/stores/file-cache-store';

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
}

interface FileExplorerProps {
  projectId: string;
  onFileSelect: (path: string) => void;
  useBrowserClient?: boolean; // Option to use direct browser connection
}

export function FileExplorer({
  projectId,
  onFileSelect,
  useBrowserClient = true, // Enable browser client by default
}: FileExplorerProps) {
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingDirs, setLoadingDirs] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [dirCache, setDirCache] = useState<Map<string, FileNode[]>>(new Map());

  // Use sandbox client if enabled
  const {
    client: sandboxClient,
    listDirectory: sandboxListDirectory,
    watchDirectory,
    loading: sandboxLoading,
    error: sandboxError,
  } = useSandboxClient({
    projectId,
    enabled: useBrowserClient,
  });

  // Root directory cache
  const { nodes: cachedRootNodes, updateNodes: updateRootNodes } =
    useCachedDirectoryContent('/');

  // Fetch directory contents
  const fetchDirectoryContents = useCallback(
    async (
      path: string = '/',
      useCache: boolean = true,
    ): Promise<FileNode[]> => {
      // Check cache first
      if (useCache && dirCache.has(path)) {
        return dirCache.get(path)!;
      }

      try {
        setLoadingDirs((prev) => new Set([...prev, path]));

        let nodes: FileNode[];

        if (useBrowserClient && sandboxClient) {
          // Use direct browser connection to sandbox
          try {
            const items = await sandboxListDirectory(path);
            // Ensure items have the correct structure
            nodes = items.map(item => ({
              ...item,
              children: item.type === 'directory' ? [] : undefined
            }));
          } catch (sandboxError) {
            // Fallback to API
            const items = await apiClient.getFiles(
              projectId,
              path === '/' ? '' : path,
            );
            nodes = items.map(
              (item: { name: string; path: string; type: string }) => ({
                name: item.name,
                path: item.path,
                type: item.type as 'file' | 'directory',
                children: item.type === 'directory' ? [] : undefined,
              }),
            );
          }
        } else {
          // Use API endpoint (server-side connection)
          const items = await apiClient.getFiles(
            projectId,
            path === '/' ? '' : path,
          );

          // Transform items to FileNode format
          nodes = items.map(
            (item: { name: string; path: string; type: string }) => ({
              name: item.name,
              path: item.path,
              type: item.type as 'file' | 'directory',
              children: item.type === 'directory' ? [] : undefined,
            }),
          );
        }

        // Update local cache
        setDirCache((prev) => new Map([...prev, [path, nodes]]));

        // Update global cache for root directory
        if (path === '/') {
          updateRootNodes(nodes);
        }

        return nodes;
      } catch (error) {
        console.error(`Failed to fetch directory ${path}:`, error);
        throw error;
      } finally {
        setLoadingDirs((prev) => {
          const next = new Set(prev);
          next.delete(path);
          return next;
        });
      }
    },
    [
      projectId,
      dirCache,
      useBrowserClient,
      sandboxClient,
      sandboxListDirectory,
      updateRootNodes,
    ],
  );

  // Set up directory watching and cache invalidation
  useEffect(() => {
    if (!watchDirectory || !sandboxClient || !useBrowserClient) return;

    // Watch root directory for changes
    watchDirectory('/').then((unsubscribe) => {
      // Store the unsubscribe function for cleanup
      return () => {
        unsubscribe();
      };
    });
  }, [watchDirectory, sandboxClient, useBrowserClient]);

  // React to cache invalidation - disabled for now to prevent loops
  // useEffect(() => {
  //   const unsubscribe = useFileCacheStore.subscribe(
  //     (state) => state.directoryCache,
  //     (directoryCache) => {
  //       // When root directory cache is invalidated, refresh the tree
  //       if (!directoryCache.has('/')) {
  //         fetchDirectoryContents('/', false).then(setFileTree);
  //       }
  //     }
  //   );

  //   return unsubscribe;
  // }, [fetchDirectoryContents]);

  // Load root directory on mount
  useEffect(() => {
    // Wait for sandbox client to be ready
    if (useBrowserClient && (sandboxLoading || !sandboxClient)) {
      return;
    }
    
    // Prevent duplicate loads by checking if we already have data
    if (fileTree.length > 0) return;
    
    let cancelled = false;

    const loadRootDirectory = async () => {
      try {
        setLoading(true);
        setError(null);

        const rootItems = await fetchDirectoryContents('/');
        if (!cancelled) {
          setFileTree(rootItems);
        }
      } catch (error) {
        if (!cancelled) {
          setError('Failed to load file explorer');
          console.error('Failed to load root directory:', error);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadRootDirectory();

    return () => {
      cancelled = true;
    };
  }, [sandboxClient, sandboxLoading, useBrowserClient]); // Remove fetchDirectoryContents from deps to prevent loops

  const toggleDirectory = async (node: FileNode) => {
    const isExpanded = expandedDirs.has(node.path);

    if (
      !isExpanded &&
      node.type === 'directory' &&
      (!node.children || node.children.length === 0)
    ) {
      // Load children if not loaded yet
      try {
        const children = await fetchDirectoryContents(node.path);
        // Update the node in the tree
        updateNodeChildren(node.path, children);
      } catch (error) {
        console.error('Failed to load directory contents:', error);
      }
    }

    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(node.path)) {
        next.delete(node.path);
      } else {
        next.add(node.path);
      }
      return next;
    });
  };

  // Helper to update node children in the tree
  const updateNodeChildren = (path: string, children: FileNode[]) => {
    setFileTree((prev) => {
      const updated = updateTreeNode(prev, path, children);
      return updated;
    });
  };

  const updateTreeNode = (
    nodes: FileNode[],
    targetPath: string,
    children: FileNode[],
  ): FileNode[] => {
    return nodes.map((node) => {
      if (node.path === targetPath) {
        return { ...node, children };
      } else if (node.type === 'directory' && targetPath.startsWith(node.path + '/')) {
        // Important: We need to check if node.children exists, not just if it's truthy
        // because an empty array [] is falsy in this context
        return {
          ...node,
          children: node.children ? updateTreeNode(node.children, targetPath, children) : [],
        };
      }
      return node;
    });
  };

  const handleFileClick = async (node: FileNode) => {
    if (node.type === 'directory') {
      await toggleDirectory(node);
    } else {
      setSelectedFile(node.path);
      onFileSelect(node.path);
    }
  };

  const { invalidateDirectory } = useFileCacheStore();

  const refreshFileTree = async () => {
    // Clear local and global cache
    setDirCache(new Map());
    invalidateDirectory('/');
    setExpandedDirs(new Set());
    setSelectedFile(null);

    try {
      setLoading(true);
      setError(null);
      // Force refresh without cache
      const rootItems = await fetchDirectoryContents('/', false);
      setFileTree(rootItems);
    } catch (error) {
      setError('Failed to refresh file explorer');
      console.error('Failed to refresh:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderFileNode = (node: FileNode, level: number = 0) => {
    if (!node) {
      return null;
    }
    const isExpanded = expandedDirs.has(node.path);
    const isSelected = selectedFile === node.path;
    const isLoading = loadingDirs.has(node.path);
    const Icon =
      node.type === 'directory' ? (isExpanded ? FolderOpen : Folder) : File;
    

    return (
      <div key={node.path}>
        <div
          className={cn(
            'flex items-center gap-1 px-2 py-1 cursor-pointer hover:bg-accent',
            isSelected && 'bg-accent',
          )}
          style={{ paddingLeft: `${level * 12 + 8}px` }}
          onClick={() => handleFileClick(node)}
        >
          {node.type === 'directory' &&
            (isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ChevronRight
                className={cn(
                  'h-4 w-4 transition-transform',
                  isExpanded && 'rotate-90',
                )}
              />
            ))}
          <Icon className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm">{node.name}</span>
        </div>
        {node.type === 'directory' && isExpanded && (
          <div>
            {node.children && node.children.length > 0 ? (
              node.children.map((child) => {
                return renderFileNode(child, level + 1);
              })
            ) : (
              <div className="text-sm text-muted-foreground italic" style={{ paddingLeft: `${(level + 1) * 12 + 8}px` }}>
                (empty)
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  if (loading && !sandboxError) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || sandboxError) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2 p-4">
        <p className="text-sm text-muted-foreground text-center">
          {error || sandboxError}
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={refreshFileTree}
          className="gap-2"
        >
          <RefreshCw className="h-3 w-3" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="h-full overflow-y-auto">
        <div className="p-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">Files</h3>
            {useBrowserClient && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center">
                    {sandboxLoading ? (
                      <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                    ) : sandboxError ? (
                      <WifiOff className="h-3 w-3 text-red-500" />
                    ) : sandboxClient ? (
                      <div className="h-2 w-2 bg-green-500 rounded-full" />
                    ) : null}
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  {sandboxLoading
                    ? 'Connecting to sandbox...'
                    : sandboxError
                      ? `Connection failed: ${sandboxError}`
                      : sandboxClient
                        ? 'Connected directly to sandbox'
                        : 'No connection'}
                </TooltipContent>
              </Tooltip>
            )}
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={refreshFileTree}
            disabled={loading || sandboxLoading}
            className="h-7 w-7"
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
        <div className="py-2">
          {fileTree.length === 0 ? (
            <p className="text-sm text-muted-foreground px-4 py-2">
              No files found in workspace
            </p>
          ) : (
            fileTree.map((node) => renderFileNode(node))
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
