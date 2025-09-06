import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

interface FileContent {
  content: string;
  lastModified: number;
  isLoading?: boolean;
  error?: string;
}

interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileTreeNode[];
}

interface FileCacheState {
  // File content cache
  fileCache: Map<string, FileContent>;
  
  // Directory structure cache
  directoryCache: Map<string, FileTreeNode[]>;
  
  // File watchers map
  watchers: Map<string, () => void>;
  
  // Actions
  setFileContent: (path: string, content: string) => void;
  setFileLoading: (path: string, isLoading: boolean) => void;
  setFileError: (path: string, error: string) => void;
  getFileContent: (path: string) => FileContent | undefined;
  
  setDirectoryContent: (path: string, nodes: FileTreeNode[]) => void;
  getDirectoryContent: (path: string) => FileTreeNode[] | undefined;
  
  invalidateFile: (path: string) => void;
  invalidateDirectory: (path: string) => void;
  
  clearCache: () => void;
  
  // Watcher management
  addWatcher: (path: string, unsubscribe: () => void) => void;
  removeWatcher: (path: string) => void;
  clearWatchers: () => void;
}

export const useFileCacheStore = create<FileCacheState>()(
  subscribeWithSelector((set, get) => ({
    fileCache: new Map(),
    directoryCache: new Map(),
    watchers: new Map(),

    setFileContent: (path: string, content: string) => {
      set((state) => {
        const newCache = new Map(state.fileCache);
        newCache.set(path, {
          content,
          lastModified: Date.now(),
          isLoading: false,
        });
        return { fileCache: newCache };
      });
    },

    setFileLoading: (path: string, isLoading: boolean) => {
      set((state) => {
        const newCache = new Map(state.fileCache);
        const existing = newCache.get(path);
        if (existing) {
          newCache.set(path, { ...existing, isLoading });
        } else {
          newCache.set(path, {
            content: '',
            lastModified: 0,
            isLoading,
          });
        }
        return { fileCache: newCache };
      });
    },

    setFileError: (path: string, error: string) => {
      set((state) => {
        const newCache = new Map(state.fileCache);
        const existing = newCache.get(path);
        if (existing) {
          newCache.set(path, { ...existing, error, isLoading: false });
        } else {
          newCache.set(path, {
            content: '',
            lastModified: 0,
            error,
            isLoading: false,
          });
        }
        return { fileCache: newCache };
      });
    },

    getFileContent: (path: string) => {
      return get().fileCache.get(path);
    },

    setDirectoryContent: (path: string, nodes: FileTreeNode[]) => {
      set((state) => {
        const newCache = new Map(state.directoryCache);
        newCache.set(path, nodes);
        return { directoryCache: newCache };
      });
    },

    getDirectoryContent: (path: string) => {
      return get().directoryCache.get(path);
    },

    invalidateFile: (path: string) => {
      set((state) => {
        const newCache = new Map(state.fileCache);
        newCache.delete(path);
        return { fileCache: newCache };
      });
    },

    invalidateDirectory: (path: string) => {
      set((state) => {
        const newCache = new Map(state.directoryCache);
        // Invalidate the directory and all its subdirectories
        const keysToDelete = Array.from(newCache.keys()).filter(
          key => key === path || key.startsWith(path + '/')
        );
        keysToDelete.forEach(key => newCache.delete(key));
        return { directoryCache: newCache };
      });
    },

    clearCache: () => {
      set({
        fileCache: new Map(),
        directoryCache: new Map(),
      });
    },

    addWatcher: (path: string, unsubscribe: () => void) => {
      set((state) => {
        const newWatchers = new Map(state.watchers);
        // Remove existing watcher if any
        const existing = newWatchers.get(path);
        if (existing) {
          existing();
        }
        newWatchers.set(path, unsubscribe);
        return { watchers: newWatchers };
      });
    },

    removeWatcher: (path: string) => {
      set((state) => {
        const newWatchers = new Map(state.watchers);
        // Just delete without calling unsubscribe to avoid circular dependency
        newWatchers.delete(path);
        return { watchers: newWatchers };
      });
    },

    clearWatchers: () => {
      const state = get();
      // Unsubscribe all watchers
      state.watchers.forEach(unsubscribe => unsubscribe());
      set({ watchers: new Map() });
    },
  }))
);

// Helper hook to use file content with automatic caching
export function useCachedFileContent(path: string | null) {
  const { getFileContent, setFileContent, setFileLoading, setFileError } = useFileCacheStore();
  
  const cached = path ? getFileContent(path) : undefined;
  
  return {
    content: cached?.content,
    isLoading: cached?.isLoading || false,
    error: cached?.error,
    lastModified: cached?.lastModified,
    
    // Actions
    updateContent: (content: string) => {
      if (path) setFileContent(path, content);
    },
    setLoading: (loading: boolean) => {
      if (path) setFileLoading(path, loading);
    },
    setError: (error: string) => {
      if (path) setFileError(path, error);
    },
  };
}

// Helper hook to use directory content with automatic caching
export function useCachedDirectoryContent(path: string) {
  const { getDirectoryContent, setDirectoryContent } = useFileCacheStore();
  
  const cached = getDirectoryContent(path);
  
  return {
    nodes: cached,
    
    // Actions
    updateNodes: (nodes: FileTreeNode[]) => {
      setDirectoryContent(path, nodes);
    },
  };
}