'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ChatInterface } from '@/components/chat/chat-interface';
import { FileExplorer } from '@/components/file-explorer/file-explorer';
import { CodeEditor } from '@/components/code-editor/code-editor';
import { GitControls } from '@/components/git/git-controls';
import {
  ArrowLeft,
  Save,
  Play,
  Settings,
  PanelLeftClose,
  PanelLeft,
} from 'lucide-react';
import { apiClient } from '@/lib/api/client';
import { toast } from 'sonner';

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
  const [isChatCollapsed, setIsChatCollapsed] = useState(false);

  useEffect(() => {
    // Fetch project details
    const fetchProject = async () => {
      try {
        const data = await apiClient.getProject(projectId);
        setProject(data);
      } catch (error) {
        console.error('Failed to fetch project:', error);
        toast.error('Failed to load project');
      }
    };

    fetchProject();
  }, [projectId]);

  return (
    <div className="flex flex-col h-screen">
      {/* Header Bar */}
      <header className="border-b bg-background px-4 py-3 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push('/projects')}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-lg font-semibold">
                {project?.name || 'Loading...'}
              </h1>
              {project?.description && (
                <p className="text-sm text-muted-foreground">
                  {project.description}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <GitControls projectId={projectId} />
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm">
                <Play className="h-4 w-4 mr-2" />
                Run
              </Button>
              <Button variant="outline" size="sm">
                <Save className="h-4 w-4 mr-2" />
                Save
              </Button>
              <Button variant="ghost" size="icon">
                <Settings className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area - 2 Column Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Column - AI Chat */}
        <div
          className={`border-r bg-background transition-all duration-300 ${
            isChatCollapsed ? 'w-0' : 'w-[400px]'
          } relative`}
        >
          {!isChatCollapsed && (
            <div className="h-full flex flex-col">
              <div className="border-b px-4 py-2 flex items-center justify-between">
                <h2 className="font-semibold">AI Assistant</h2>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsChatCollapsed(true)}
                  className="h-8 w-8"
                >
                  <PanelLeftClose className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex-1 overflow-hidden">
                <ChatInterface projectId={projectId} />
              </div>
            </div>
          )}
        </div>

        {/* Right Column - Editor with File Explorer */}
        <div className="flex-1 flex">
          {/* Show expand button when chat is collapsed */}
          {isChatCollapsed && (
            <div className="border-r">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsChatCollapsed(false)}
                className="h-full rounded-none"
              >
                <PanelLeft className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* File Explorer */}
          <div className="w-64 border-r bg-muted/30">
            <FileExplorer
              projectId={projectId}
              onFileSelect={setSelectedFile}
            />
          </div>

          {/* Code Editor */}
          <div className="flex-1">
            <CodeEditor projectId={projectId} filePath={selectedFile} useBrowserClient={true} />
          </div>
        </div>
      </div>
    </div>
  );
}
