'use client';

import * as React from 'react';
import { Terminal, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tool,
  ToolContent,
  ToolHeader,
} from '@/components/tool';
import Anser from 'anser';

interface ShellCommandDisplayProps {
  toolCall: {
    id: string;
    tool: string;
    params: Record<string, unknown>;
    status: 'pending' | 'running' | 'completed' | 'failed';
    result?: unknown;
    streamingOutput?: string;
  };
}

export function ShellCommandDisplay({ toolCall }: ShellCommandDisplayProps) {
  const [copied, setCopied] = React.useState(false);
  
  // Extract command and other parameters
  const command = toolCall.params.command as string || '';
  const description = toolCall.params.description as string || 'Running shell command';
  const isBackground = toolCall.params.is_background as boolean || false;
  
  // Map status to Tool component states
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
  
  // Convert ANSI to styled spans
  const renderAnsiText = (text: string) => {
    const parsed = Anser.ansiToJson(text, {
      json: true,
      remove_empty: true,
      use_classes: false
    });
    
    return parsed.map((chunk, index) => {
      const style: React.CSSProperties = {};
      
      // Map ANSI colors to CSS colors
      if (chunk.fg) {
        style.color = chunk.fg;
      }
      if (chunk.bg) {
        style.backgroundColor = chunk.bg;
      }
      if (chunk.decoration) {
        if (chunk.decoration.includes('bold')) {
          style.fontWeight = 'bold';
        }
        if (chunk.decoration.includes('italic')) {
          style.fontStyle = 'italic';
        }
        if (chunk.decoration.includes('underline')) {
          style.textDecoration = 'underline';
        }
      }
      
      return (
        <span key={index} style={style}>
          {chunk.content}
        </span>
      );
    });
  };
  
  // Format the result for display
  const formatResult = (result: unknown) => {
    if (result === undefined || result === null) return null;
    
    // Handle error results
    if (typeof result === 'object' && result !== null && 'error' in result) {
      return (result as { error: string }).error;
    }
    
    // Handle text results (command output)
    if (typeof result === 'string') {
      // Check if the result contains [blocked] message
      const isBlocked = result.includes('[blocked]');
      
      return (
        <div className="space-y-2">
          {isBlocked && (
            <div className="rounded-md bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 p-2">
              <p className="text-xs text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                <Terminal className="h-3 w-3" />
                Command blocked by hook
              </p>
            </div>
          )}
          <pre className="rounded bg-gray-950 dark:bg-gray-900 p-3 text-xs overflow-x-auto max-h-[400px] overflow-y-auto">
            <code className="text-gray-100 dark:text-gray-200 font-mono whitespace-pre-wrap">
              {renderAnsiText(result)}
            </code>
          </pre>
        </div>
      );
    }
    
    // Default to JSON display for non-string results
    return (
      <pre className="rounded bg-gray-950 dark:bg-gray-900 p-3 text-xs overflow-x-auto max-h-[400px] overflow-y-auto">
        <code className="text-gray-100 dark:text-gray-200 font-mono">
          {JSON.stringify(result, null, 2)}
        </code>
      </pre>
    );
  };
  
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy command:', error);
    }
  };
  
  // Auto-open tools that are running, completed, or failed
  const defaultOpen = toolCall.status === 'running' || toolCall.status === 'completed' || toolCall.status === 'failed';
  const toolState = getToolState();
  
  return (
    <Tool defaultOpen={defaultOpen} state={toolState} className="my-2">
      <ToolHeader 
        type="run shell command" 
        state={toolState} 
      />
      <ToolContent>
        {/* Command Section */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-medium">Command</h4>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={handleCopy}
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3 mr-1" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3 mr-1" />
                  Copy
                </>
              )}
            </Button>
          </div>
          
          <div className="relative">
            <div className="absolute left-3 top-3 flex items-center pointer-events-none">
              <span className="text-gray-500 dark:text-gray-400 text-xs font-mono">$</span>
            </div>
            <pre className="rounded bg-gray-900 dark:bg-gray-950 border border-gray-800 dark:border-gray-700 pl-7 pr-3 py-3 text-xs overflow-x-auto">
              <code className="text-emerald-400 dark:text-emerald-300 font-mono">
                {command}
              </code>
            </pre>
          </div>
          
          {/* Metadata */}
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>{description}</span>
            {isBackground && (
              <span className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-xs">
                background
              </span>
            )}
          </div>
        </div>
        
        {/* Output Section */}
        {(toolCall.streamingOutput || toolCall.result !== undefined || toolCall.status === 'failed') && (
          <div className="mt-3 space-y-2">
            <h4 className="text-xs font-medium">
              {toolCall.status === 'failed' ? 'Error' : 'Output'}
            </h4>
            
            {/* Show streaming output if available, or final result */}
            {(toolCall.streamingOutput || toolCall.result !== undefined) && (
              <>
                {toolCall.status === 'running' && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <div className="h-2 w-2 bg-emerald-500 rounded-full animate-pulse" />
                    <span>Running...</span>
                  </div>
                )}
                
                {/* For shell commands, prefer streaming output over final result to avoid duplication */}
                {toolCall.streamingOutput ? (
                  <pre className="rounded bg-gray-950 dark:bg-gray-900 p-3 text-xs overflow-x-auto max-h-[400px] overflow-y-auto">
                    <code className="text-gray-100 dark:text-gray-200 font-mono whitespace-pre-wrap">
                      {renderAnsiText(toolCall.streamingOutput)}
                    </code>
                  </pre>
                ) : toolCall.status === 'failed' && typeof toolCall.result === 'object' && toolCall.result !== null && 'error' in toolCall.result ? (
                  <div className="rounded bg-red-100 dark:bg-red-950/50 border border-red-200 dark:border-red-800 p-3 text-xs text-red-700 dark:text-red-300">
                    {(toolCall.result as { error: string }).error}
                  </div>
                ) : (
                  formatResult(toolCall.result)
                )}
              </>
            )}
          </div>
        )}
      </ToolContent>
    </Tool>
  );
}