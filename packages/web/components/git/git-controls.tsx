'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  GitBranch,
  GitCommit,
  GitPullRequest,
  Upload,
  Download,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface GitControlsProps {
  projectId: string;
  className?: string;
}

interface GitStatus {
  branch: string;
  remoteUrl: string;
  hasRemote: boolean;
  lastCommit: string;
  status: {
    clean: boolean;
    modified: number;
    added: number;
    deleted: number;
    total: number;
    files: string[];
  };
  gitInfo: {
    provider: string;
    repoUrl: string;
    repoName: string;
    repoOwner: string;
  } | null;
}

export function GitControls({ projectId, className }: GitControlsProps) {
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [pulling, setPulling] = useState(false);

  useEffect(() => {
    fetchGitStatus();
  }, [projectId]);

  const fetchGitStatus = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/projects/${projectId}/git`);
      if (response.ok) {
        const data = await response.json();
        setGitStatus(data);
      }
    } catch (error) {
      console.error('Failed to fetch git status:', error);
    } finally {
      setLoading(false);
    }
  };

  const executeGitCommand = async (command: 'push' | 'pull') => {
    const isCommand = command === 'push';
    const setLoadingFn = isCommand ? setPushing : setPulling;

    try {
      setLoadingFn(true);
      const response = await fetch(`/api/projects/${projectId}/git`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ command }),
      });

      const data = await response.json();

      if (response.ok) {
        toast(`Git ${command} successful`, {
          description: data.message,
        });
        // Refresh status after command
        await fetchGitStatus();
      } else {
        toast.error(`Git ${command} failed`, {
          description: data.error || `Failed to ${command}`,
        });
      }
    } catch (error) {
      toast.error(`Failed to execute git ${command}`);
    } finally {
      setLoadingFn(false);
    }
  };

  if (!gitStatus || !gitStatus.gitInfo) {
    return null;
  }

  const hasChanges = !gitStatus.status.clean;

  return (
    <TooltipProvider>
      <div
        className={cn(
          'flex items-center gap-2 px-3 py-2 border rounded-md bg-background',
          className,
        )}
      >
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <GitBranch className="h-4 w-4" />
          <span>{gitStatus.branch}</span>
          {hasChanges && (
            <span className="text-amber-600">
              ({gitStatus.status.total} changes)
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 ml-auto">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => fetchGitStatus()}
                disabled={loading}
                className="h-8 w-8 p-0"
              >
                <RefreshCw
                  className={cn('h-4 w-4', loading && 'animate-spin')}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Refresh git status</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => executeGitCommand('pull')}
                disabled={pulling || pushing}
                className="h-8 w-8 p-0"
              >
                <Download
                  className={cn('h-4 w-4', pulling && 'animate-pulse')}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Pull from remote</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => executeGitCommand('push')}
                disabled={pushing || pulling}
                className="h-8 w-8 p-0"
              >
                <Upload className={cn('h-4 w-4', pushing && 'animate-pulse')} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {hasChanges
                ? `Push ${gitStatus.status.total} changes to remote`
                : 'Push to remote'}
            </TooltipContent>
          </Tooltip>

          {gitStatus.gitInfo && (
            <Tooltip>
              <TooltipTrigger asChild>
                <a
                  href={gitStatus.gitInfo.repoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-accent hover:text-accent-foreground"
                >
                  <GitCommit className="h-4 w-4" />
                </a>
              </TooltipTrigger>
              <TooltipContent>
                Open repository: {gitStatus.gitInfo.repoOwner}/
                {gitStatus.gitInfo.repoName}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
