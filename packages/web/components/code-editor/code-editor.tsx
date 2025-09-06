'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { Loader2, Save, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDebounce } from '@/hooks/use-debounce';
import { toast } from 'sonner';
import { useCachedFileContent } from '@/stores/file-cache-store';
import { useSandboxClient } from '@/hooks/use-sandbox-client';
import { apiClient } from '@/lib/api/client';

interface CodeEditorProps {
  projectId: string;
  filePath: string | null;
  useBrowserClient?: boolean;
}

export function CodeEditor({ projectId, filePath, useBrowserClient = true }: CodeEditorProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const [saving, setSaving] = useState(false);
  const [content, setContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const fileWatcherRef = useRef<(() => void) | null>(null);
  
  // Use sandbox client for direct file operations
  const { 
    client: sandboxClient, 
    readFile: sandboxReadFile,
    writeFile: sandboxWriteFile,
    loading: sandboxLoading,
    error: sandboxError 
  } = useSandboxClient({ 
    projectId, 
    enabled: useBrowserClient 
  });
  
  // Use cached file content
  const {
    content: cachedContent,
    isLoading: cacheLoading,
    error: cacheError,
    lastModified,
    updateContent: updateCachedContent,
    setLoading: setCacheLoading,
    setError: setCacheError
  } = useCachedFileContent(filePath);

  // Track if content has unsaved changes
  // Track if content has unsaved changes
  const hasChanges = content !== originalContent;

  // Debounce content changes for auto-save
  const debouncedContent = useDebounce(content, 2000);

  const handleEditorDidMount = (
    editor: editor.IStandaloneCodeEditor,
    _monaco: unknown,
  ) => {
    editorRef.current = editor;
    // Focus editor when mounted
    editor.focus();
  };

  // Load file content
  const loadFile = useCallback(async () => {
    if (!filePath) return;
    
    try {
      setCacheLoading(true);
      setCacheError('');
      
      let fileContent = '';
      
      if (useBrowserClient && sandboxClient) {
        // Direct read from sandbox
        fileContent = await sandboxReadFile(filePath);
      } else if (cachedContent) {
        // Use cached content if available
        fileContent = cachedContent;
      } else {
        // Fallback to API
        const response = await apiClient.readFile(projectId, filePath);
        fileContent = response.content;
      }
      
      setContent(fileContent);
      setOriginalContent(fileContent);
      updateCachedContent(fileContent);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load file';
      setError(message);
      setCacheError(message);
    } finally {
      setCacheLoading(false);
    }
  }, [filePath, projectId, useBrowserClient, sandboxClient, sandboxReadFile, 
      cachedContent, updateCachedContent, setCacheLoading, setCacheError]);

  // React to cache updates (from file watcher)
  useEffect(() => {
    // When cached content changes externally, update editor if no local changes
    if (cachedContent && !hasChanges && cachedContent !== content) {
      setContent(cachedContent);
      setOriginalContent(cachedContent);
    }
  }, [cachedContent, hasChanges]);

  // Load file when path changes or from cache updates
  useEffect(() => {
    if (filePath) {
      // If we have cached content that's newer, use it
      if (cachedContent && lastModified && lastModified > Date.now() - 1000) {
        setContent(cachedContent);
        setOriginalContent(cachedContent);
      } else {
        loadFile();
      }
    } else {
      setContent('');
      setOriginalContent('');
    }
  }, [filePath, cachedContent, lastModified]);

  // Save file content
  const saveFile = useCallback(async () => {
    if (!filePath || !hasChanges) return;

    try {
      setSaving(true);
      
      if (useBrowserClient && sandboxClient) {
        // Direct write to sandbox
        await sandboxWriteFile(filePath, content);
      } else {
        // Fallback to API
        await apiClient.writeFile(projectId, filePath, content);
      }
      
      setOriginalContent(content);
      updateCachedContent(content);
      toast.success('File saved');
    } catch (error) {
      console.error('Failed to save file:', error);
      toast.error('Failed to save file');
    } finally {
      setSaving(false);
    }
  }, [projectId, filePath, content, hasChanges, useBrowserClient, 
      sandboxClient, sandboxWriteFile, updateCachedContent]);

  // Handle editor content change
  const handleContentChange = (value: string | undefined) => {
    setContent(value || '');
  };

  // Auto-save on debounced content change
  useEffect(() => {
    if (debouncedContent !== originalContent && debouncedContent !== '') {
      saveFile();
    }
  }, [debouncedContent, originalContent, saveFile]);

  // Keyboard shortcut for save (Cmd/Ctrl + S)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        saveFile();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [saveFile]);

  if (!filePath) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Select a file to start editing</p>
      </div>
    );
  }

  // Show loading state
  if (cacheLoading || sandboxLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Show error state
  if (error || sandboxError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2">
        <AlertCircle className="h-8 w-8 text-destructive" />
        <p className="text-sm text-muted-foreground">{error || sandboxError}</p>
        <Button size="sm" variant="outline" onClick={loadFile}>
          Retry
        </Button>
      </div>
    );
  }

  const language = getLanguageFromFilePath(filePath);

  return (
    <div className="relative h-full">
      {/* Save indicator */}
      {(hasChanges || saving) && (
        <div className="absolute top-2 right-2 z-10 flex items-center gap-2 rounded-md bg-background/80 backdrop-blur-sm px-3 py-1 text-sm">
          {saving ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Saving...</span>
            </>
          ) : hasChanges ? (
            <>
              <div className="h-2 w-2 rounded-full bg-yellow-500" />
              <span className="text-muted-foreground">Unsaved changes</span>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                onClick={saveFile}
                title="Save (Cmd/Ctrl + S)"
              >
                <Save className="h-3 w-3" />
              </Button>
            </>
          ) : null}
        </div>
      )}

      <Editor
        height="100%"
        language={language}
        theme="vs-dark"
        value={content}
        onChange={handleContentChange}
        onMount={handleEditorDidMount}
        options={{
          minimap: { enabled: false },
          fontSize: 14,
          fontFamily: "'Geist Mono', 'Monaco', 'Courier New', monospace",
          wordWrap: 'on',
          automaticLayout: true,
          tabSize: 2,
        }}
      />
    </div>
  );
}

function getLanguageFromFilePath(filePath: string): string {
  const extension = filePath.split('.').pop()?.toLowerCase();

  const languageMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    json: 'json',
    md: 'markdown',
    py: 'python',
    rs: 'rust',
    go: 'go',
    java: 'java',
    cpp: 'cpp',
    c: 'c',
    cs: 'csharp',
    php: 'php',
    rb: 'ruby',
    swift: 'swift',
    kt: 'kotlin',
    yaml: 'yaml',
    yml: 'yaml',
    xml: 'xml',
    html: 'html',
    css: 'css',
    scss: 'scss',
    sass: 'sass',
    less: 'less',
    sql: 'sql',
    sh: 'shell',
    bash: 'shell',
  };

  return languageMap[extension || ''] || 'plaintext';
}
