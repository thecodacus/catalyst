'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ChatInterface } from '@/components/chat/chat-interface';
import { FileExplorer } from '@/components/file-explorer/file-explorer';
import { CodeEditor } from '@/components/code-editor/code-editor';
import { GitControls } from '@/components/git/git-controls';
import { Animated, Skeleton } from '@/components/ui/animated';
import {
  WebPreview,
  WebPreviewNavigation,
  WebPreviewUrl,
  WebPreviewBody,
  WebPreviewBackButton,
  WebPreviewForwardButton,
  WebPreviewRefreshButton,
  WebPreviewExternalButton,
} from '@/components/ai-elements/web-preview';
import { useSandboxClient } from '@/hooks/use-sandbox-client';
import { Loader2 } from '@/components/ui/loader';
import {
  ArrowLeft,
  PanelRightClose,
  FolderOpen,
  Code2,
  X,
  Globe,
} from 'lucide-react';
import { apiClient } from '@/lib/api/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface ProjectClientProps {
  projectId: string;
}

interface Project {
  name: string;
  description?: string;
}

export function ProjectClient({ projectId }: ProjectClientProps) {
  const router = useRouter();
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Get preview URLs from sandbox client
  const { previewUrls, loading: sandboxLoading } = useSandboxClient({
    projectId,
    enabled: true,
  });

  // Log preview URLs changes
  useEffect(() => {
    console.log('🌐 Preview URLs updated in ProjectClient:', {
      size: previewUrls.size,
      urls: Array.from(previewUrls.entries()),
    });
  }, [previewUrls]);

  // Get the first available preview URL
  const previewUrl = React.useMemo(() => {
    if (previewUrls.size === 0) {
      console.log('❌ No preview URLs available');
      return null;
    }
    // Common development ports in order of preference
    const commonPorts = [3000, 5173, 5174, 8080, 8000, 4200, 3001];

    for (const port of commonPorts) {
      const preview = previewUrls.get(port);
      if (preview) {
        console.log(
          `✅ Using preview URL from common port ${port}: ${preview.url}`,
        );
        return preview.url;
      }
    }

    // If no common port found, return the first available
    const firstPreview = previewUrls.values().next().value;
    if (firstPreview) {
      console.log(
        `✅ Using first available preview URL (port ${firstPreview.port}): ${firstPreview.url}`,
      );
      return firstPreview.url;
    }
    return null;
  }, [previewUrls]);

  useEffect(() => {
    // Fetch project details
    const fetchProject = async () => {
      try {
        setIsLoading(true);
        const data = await apiClient.getProject(projectId);
        setProject(data);
      } catch (error) {
        console.error('Failed to fetch project:', error);
        toast.error('Failed to load project');
      } finally {
        setIsLoading(false);
      }
    };

    fetchProject();
  }, [projectId]);

  // Log when a file is selected
  useEffect(() => {
    if (selectedFile) {
      console.log('📄 File selected:', selectedFile);
    }
  }, [selectedFile]);

  // Log when preview URL changes
  useEffect(() => {
    console.log('🎯 Preview URL updated:', {
      previewUrl,
      isPreviewOpen,
    });
  }, [previewUrl, isPreviewOpen]);

  // Handle Escape key to close preview
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isPreviewOpen) {
        setIsPreviewOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPreviewOpen]);

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Enhanced Header Bar */}
      <Animated animation="fade-in-down" className="relative z-20">
        <header className="border-b border-gray-200/50 dark:border-gray-700/50 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm">
          <div className="px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => router.push('/projects')}
                  className="hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>

                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="absolute inset-0 animate-pulse bg-indigo-500/20 rounded-full blur-md" />
                    <Code2 className="relative h-5 w-5 text-indigo-500 dark:text-indigo-400" />
                  </div>
                  <div>
                    {isLoading ? (
                      <>
                        <Skeleton variant="text" width={150} height={20} />
                        <Skeleton
                          variant="text"
                          width={200}
                          height={16}
                          className="mt-1"
                        />
                      </>
                    ) : (
                      <>
                        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
                          {project?.name}
                        </h1>
                        {project?.description && (
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            {project.description}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <GitControls projectId={projectId} />

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsPreviewOpen((prev) => !prev)}
                  className={cn(
                    'hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors',
                    isPreviewOpen && 'bg-gray-100 dark:bg-gray-800',
                  )}
                  title={isPreviewOpen ? 'Hide preview' : 'Show preview'}
                  disabled={!previewUrl}
                >
                  <Globe className="h-4 w-4" />
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsEditorOpen((prev) => !prev)}
                  className={cn(
                    'hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors',
                    isEditorOpen && 'bg-gray-100 dark:bg-gray-800',
                  )}
                  title={isEditorOpen ? 'Hide code panel' : 'Show code panel'}
                >
                  <Code2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </header>
      </Animated>

      {/* Main Content Area */}
      <div className="flex-1 flex relative overflow-hidden bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-950 dark:to-gray-900">
        {/* Chat/Content Area - Takes full width when editor is hidden, adjusts when shown */}
        <div
          className={cn(
            'flex-1 transition-all duration-500 ease-out flex justify-center',
            isEditorOpen ? 'mr-[65%]' : 'mr-0',
          )}
        >
          <div className="w-full max-w-4xl">
            <ChatInterface projectId={projectId} />
          </div>
        </div>

        {/* Floating Editor Panel with File Explorer */}
        <div
          className={cn(
            'absolute top-0 right-0 h-full shadow-2xl transition-all duration-500 ease-out',
            'w-[65%] flex',
            isEditorOpen
              ? 'translate-x-0'
              : 'translate-x-full pointer-events-none',
          )}
        >
          {/* File Explorer and Code Editor */}
          <div className="flex flex-1">
            {/* File Explorer Section */}
            <div className="w-64 flex-shrink-0 bg-white dark:bg-gray-900 border-l border-gray-200/30 dark:border-gray-700/30">
              <div className="h-14 px-4 flex items-center border-b border-gray-200/30 dark:border-gray-700/30 bg-gray-50/50 dark:bg-gray-900/50">
                <FolderOpen className="h-4 w-4 text-gray-600 dark:text-gray-400 mr-2" />
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  Files
                </span>
              </div>
              <div className="h-[calc(100%-3.5rem)] overflow-auto">
                <FileExplorer
                  projectId={projectId}
                  onFileSelect={setSelectedFile}
                />
              </div>
            </div>

            {/* Code Editor Section */}
            <div className="flex-1 bg-white dark:bg-gray-900 border-l border-gray-200/30 dark:border-gray-700/30">
              {/* Editor Header */}
              <div className="flex items-center justify-between h-14 px-4 border-b border-gray-200/30 dark:border-gray-700/30 bg-gray-50/50 dark:bg-gray-900/50">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Code2 className="h-4 w-4 text-indigo-500 dark:text-indigo-400" />
                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                      {selectedFile
                        ? selectedFile.split('/').pop()
                        : 'Code Editor'}
                    </span>
                  </div>
                  {selectedFile && (
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {selectedFile}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setSelectedFile(null)}
                    className="h-8 w-8 hover:bg-gray-100 dark:hover:bg-gray-800"
                    title="Close file"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsEditorOpen(false)}
                    className="h-8 w-8 hover:bg-gray-100 dark:hover:bg-gray-800"
                    title="Hide editor panel"
                  >
                    <PanelRightClose className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Editor Content */}
              <div className="h-[calc(100%-3.5rem)]">
                {selectedFile ? (
                  <CodeEditor
                    projectId={projectId}
                    filePath={selectedFile}
                    useBrowserClient={true}
                  />
                ) : (
                  <div className="h-full flex items-center justify-center bg-gray-50 dark:bg-gray-950">
                    <div className="text-center">
                      <Code2 className="h-12 w-12 text-gray-300 dark:text-gray-700 mx-auto mb-4" />
                      <h3 className="text-lg font-medium text-gray-600 dark:text-gray-400 mb-2">
                        No file selected
                      </h3>
                      <p className="text-sm text-gray-500 dark:text-gray-500">
                        Select a file from the explorer to start coding
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          {/* Web Preview Overlay - Inside editor panel */}
          {isPreviewOpen && previewUrl && (
            <div
              className={cn(
                'absolute inset-0 z-20',
                'bg-white dark:bg-gray-900',
                'flex flex-col overflow-hidden',
                'animate-in fade-in-0 slide-in-from-bottom-2 duration-200',
              )}
            >
              <WebPreview defaultUrl={previewUrl}>
                <WebPreviewNavigation className="h-12 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                  <WebPreviewBackButton />
                  <WebPreviewForwardButton />
                  <WebPreviewRefreshButton />
                  <WebPreviewUrl className="mx-2" />
                  <WebPreviewExternalButton />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsPreviewOpen(false);
                    }}
                    className="h-8 w-8 hover:bg-gray-100 dark:hover:bg-gray-800 ml-auto"
                    title="Close preview (Esc)"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </WebPreviewNavigation>
                <WebPreviewBody
                  className="flex-1"
                  // loadingIndicator={
                  //   <div className="flex items-center gap-2">
                  //     <Loader2 className="h-4 w-4 animate-spin" />
                  //     <span className="text-sm text-gray-500">
                  //       Loading preview...
                  //     </span>
                  //   </div>
                  // }
                />
              </WebPreview>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
