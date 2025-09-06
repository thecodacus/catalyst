'use client';

import * as React from 'react';
import { ITask } from '@/lib/db/schemas/task';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Square,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolOutput,
  ToolInput,
} from '@/components/tool';
import { Response } from '@/components/response';
import { ShellCommandDisplay } from '@/components/shell-command-display';

interface TaskCardProps {
  task: ITask;
  onCancel?: (taskId: string) => void;
  onRetry?: (taskId: string) => void;
  onViewDetails?: (taskId: string) => void;
}

export function TaskCard({
  task,
  onCancel,
  onRetry,
  onViewDetails,
}: TaskCardProps) {
  // Provide default values to handle incomplete task objects
  const taskType = task?.type || 'code_generation';
  const taskStatus = task?.status || 'queued';
  const taskPrompt = task?.prompt || 'Processing task...';

  const getStatusIcon = () => {
    switch (taskStatus) {
      case 'queued':
        return <AlertCircle className="h-4 w-4" />;
      case 'processing':
        return <Loader2 className="h-4 w-4 animate-spin" />;
      case 'completed':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'cancelled':
        return <Square className="h-4 w-4 text-gray-500" />;
      default:
        return <AlertCircle className="h-4 w-4" />;
    }
  };

  const getStatusBadgeVariant = () => {
    switch (taskStatus) {
      case 'queued':
        return 'secondary';
      case 'processing':
        return 'default';
      case 'completed':
        return 'success';
      case 'failed':
        return 'destructive';
      case 'cancelled':
        return 'outline';
      default:
        return 'secondary';
    }
  };

  const formatTaskType = (type: string) => {
    return type.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
  };

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            {getStatusIcon()}
            <div>
              <CardTitle className="text-sm font-medium">
                {formatTaskType(taskType)}
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                {taskPrompt.length > 100
                  ? taskPrompt.substring(0, 100) + '...'
                  : taskPrompt}
              </p>
            </div>
          </div>
          <Badge variant={getStatusBadgeVariant()}>{taskStatus}</Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Progress bar for processing tasks */}
        {taskStatus === 'processing' && task?.progress && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{task.progress.currentStep || 'Processing...'}</span>
              <span>
                {task.progress.completedSteps || 0}/
                {task.progress.totalSteps || 0} steps
              </span>
            </div>
            <Progress value={task.progress.percentage || 0} />
          </div>
        )}

        {/* Tool calls section */}
        {task?.toolCalls && task.toolCalls.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-medium">Tool Calls:</p>
            <div className="space-y-1">
              {task.toolCalls.slice(0, 3).map((toolCall, index) => (
                <div
                  key={toolCall.id || index}
                  className="flex items-center gap-2 text-xs text-muted-foreground"
                >
                  <span
                    className={cn(
                      'w-2 h-2 rounded-full',
                      toolCall.status === 'completed' && 'bg-green-500',
                      toolCall.status === 'running' &&
                        'bg-blue-500 animate-pulse',
                      toolCall.status === 'failed' && 'bg-red-500',
                      toolCall.status === 'pending' && 'bg-gray-400',
                    )}
                  />
                  <span>{toolCall.tool || 'Unknown tool'}</span>
                  {toolCall.duration && (
                    <span className="text-xs">
                      ({(toolCall.duration / 1000).toFixed(1)}s)
                    </span>
                  )}
                </div>
              ))}
              {task.toolCalls.length > 3 && (
                <p className="text-xs text-muted-foreground">
                  +{task.toolCalls.length - 3} more...
                </p>
              )}
            </div>
          </div>
        )}

        {/* Error message */}
        {task?.error && (
          <div className="rounded-md bg-destructive/10 p-2">
            <p className="text-xs text-destructive">{task.error}</p>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-2 pt-2">
          {taskStatus === 'processing' && onCancel && task?._id && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onCancel(task._id)}
              className="h-7 text-xs"
            >
              Cancel
            </Button>
          )}
          {taskStatus === 'failed' && onRetry && task?._id && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onRetry(task._id)}
              className="h-7 text-xs"
            >
              Retry
            </Button>
          )}
          {onViewDetails && task?._id && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onViewDetails(task._id)}
              className="h-7 text-xs ml-auto"
            >
              View Details
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

interface ToolCallDisplayProps {
  toolCall: {
    id: string;
    tool: string;
    params: Record<string, unknown>;
    status: 'pending' | 'running' | 'completed' | 'failed';
    result?: unknown;
    streamingOutput?: string;
  };
}

export function ToolCallDisplay({ toolCall }: ToolCallDisplayProps) {
  // Check if this is a shell command
  const isShellCommand = ['bash', 'run_bash_command', 'run_shell_command'].includes(toolCall.tool);
  
  // Debug logging
  console.log('ToolCallDisplay - tool name:', toolCall.tool, 'isShellCommand:', isShellCommand);
  
  if (isShellCommand) {
    return <ShellCommandDisplay toolCall={toolCall} />;
  }
  
  // Map our status to Tool component states
  const getToolState = () => {
    switch (toolCall.status) {
      case 'pending':
        return 'input-streaming';
      case 'running':
        return 'input-available';
      case 'completed':
        return 'output-available';
      case 'failed':
        return 'output-error';
      default:
        return 'input-streaming';
    }
  };

  // Format the result for display
  const formatResult = (result: unknown) => {
    if (result === undefined || result === null) return null;
    
    // Handle error results
    if (typeof result === 'object' && result !== null && 'error' in result) {
      return (result as { error: string }).error;
    }
    
    // Handle text results
    if (typeof result === 'string') {
      return <Response>{result}</Response>;
    }
    
    // Handle array results
    if (Array.isArray(result)) {
      if (result.length > 0 && typeof result[0] === 'string') {
        // File listings or similar
        return (
          <Response>
            {result.join('\n')}
          </Response>
        );
      }
    }
    
    // Default to JSON display
    return (
      <pre className="text-xs overflow-x-auto">
        <code>{JSON.stringify(result, null, 2)}</code>
      </pre>
    );
  };

  // Auto-open tools that are running, completed, or failed
  const defaultOpen = toolCall.status === 'running' || toolCall.status === 'completed' || toolCall.status === 'failed';

  const toolState = getToolState();
  
  return (
    <Tool defaultOpen={defaultOpen} state={toolState} className="my-2">
      <ToolHeader 
        type={`tool-${toolCall.tool}`} 
        state={toolState} 
      />
      <ToolContent>
        <ToolInput input={toolCall.params} />
        <ToolOutput
          output={
            toolCall.streamingOutput ? (
              <div className="space-y-2">
                {toolCall.streamingOutput && (
                  <div className="bg-muted/50 rounded-md p-2">
                    <pre className="text-xs whitespace-pre-wrap font-mono">
                      {toolCall.streamingOutput}
                    </pre>
                  </div>
                )}
                {toolCall.result !== undefined && formatResult(toolCall.result)}
              </div>
            ) : (
              toolCall.result !== undefined ? formatResult(toolCall.result) : undefined
            )
          }
          errorText={
            toolCall.status === 'failed' && 
            typeof toolCall.result === 'object' && 
            toolCall.result !== null &&
            'error' in toolCall.result
              ? (toolCall.result as { error: string }).error
              : undefined
          }
        />
      </ToolContent>
    </Tool>
  );
}
