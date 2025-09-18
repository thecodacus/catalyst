'use client';

import * as React from 'react';
import { FileText, Plus, Minus, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tool, ToolContent, ToolHeader } from '@/components/tool';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

// @ts-ignore - prismjs types are available but not being resolved correctly
import Prism from 'prismjs';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-c';
import 'prismjs/components/prism-cpp';
import 'prismjs/components/prism-csharp';
import 'prismjs/components/prism-go';
import 'prismjs/components/prism-rust';
import 'prismjs/components/prism-ruby';
import 'prismjs/components/prism-php';
import 'prismjs/components/prism-swift';
import 'prismjs/components/prism-kotlin';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-markdown';

interface FileWriteDisplayProps {
  toolCall: {
    id: string;
    tool: string;
    params: Record<string, unknown>;
    status: 'pending' | 'running' | 'completed' | 'failed';
    result?: unknown;
  };
}

function getLanguageFromFilePath(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase();
  const languageMap: Record<string, string> = {
    js: 'javascript',
    jsx: 'jsx',
    ts: 'typescript',
    tsx: 'tsx',
    json: 'json',
    css: 'css',
    scss: 'css',
    sass: 'css',
    less: 'css',
    html: 'html',
    xml: 'xml',
    md: 'markdown',
    py: 'python',
    java: 'java',
    c: 'c',
    cpp: 'cpp',
    cs: 'csharp',
    go: 'go',
    rs: 'rust',
    rb: 'ruby',
    php: 'php',
    swift: 'swift',
    kt: 'kotlin',
    yml: 'yaml',
    yaml: 'yaml',
  };
  return languageMap[ext || ''] || 'plain';
}

export function FileWriteDisplay({
  toolCall,
}: FileWriteDisplayProps): React.ReactElement {
  const [copiedContent, setCopiedContent] = React.useState(false);
  const [showDiff, setShowDiff] = React.useState(true);

  // Extract parameters
  const filePath = (toolCall.params.file_path as string) || '';
  const content = (toolCall.params.content as string) || '';

  // Extract result data
  const result = toolCall.result as
    | {
        fileDiff?: string;
        fileName?: string;
        originalContent?: string | null;
        newContent?: string;
        diffStat?: {
          ai_added_lines: number;
          ai_removed_lines: number;
          user_added_lines: number;
          user_removed_lines: number;
        };
      }
    | undefined;

  // Get file name from path
  const language = getLanguageFromFilePath(filePath);

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

  const handleCopyContent = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedContent(true);
      setTimeout(() => setCopiedContent(false), 2000);
    } catch (error) {
      console.error('Failed to copy content:', error);
    }
  };

  // Parse diff for display
  const renderDiff = (diff: string): React.ReactNode => {
    const lines = diff.split('\n');
    return (
      <>
        {lines.map((line, index) => {
          if (line.startsWith('+++') || line.startsWith('---')) {
            return null; // Skip file headers
          }

          const isAddition = line.startsWith('+');
          const isRemoval = line.startsWith('-');
          const isDiffLine = isAddition || isRemoval;

          return (
            <div
              key={index}
              className={cn(
                'font-mono text-xs leading-6 px-3',
                isAddition &&
                  'bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300',
                isRemoval &&
                  'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300',
                !isDiffLine && 'text-gray-600 dark:text-gray-400',
              )}
            >
              <span className="select-none inline-block w-4 mr-2 text-center">
                {isAddition ? '+' : isRemoval ? '-' : ' '}
              </span>
              {isDiffLine ? line.substring(1) : line}
            </div>
          );
        })}
      </>
    );
  };

  // Auto-open completed or failed operations
  const defaultOpen =
    toolCall.status === 'completed' || toolCall.status === 'failed';
  const toolState = getToolState();
  const isNewFile = !result?.originalContent;

  return (
    <Tool defaultOpen={defaultOpen} state={toolState} className="my-2">
      <ToolHeader
        type={isNewFile ? 'create file' : 'write file'}
        state={toolState}
      />
      <ToolContent>
        {/* File Path */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <code className="text-sm font-mono text-gray-700 dark:text-gray-300">
              {filePath}
            </code>
            {isNewFile && (
              <span className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-xs rounded">
                new file
              </span>
            )}
          </div>

          {/* Stats */}
          {result?.diffStat && (
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Plus className="h-3 w-3 text-green-600" />
                {result.diffStat.ai_added_lines} added
              </span>
              <span className="flex items-center gap-1">
                <Minus className="h-3 w-3 text-red-600" />
                {result.diffStat.ai_removed_lines} removed
              </span>
            </div>
          )}

          {/* Content Toggle */}
          {result && (
            <div className="flex items-center gap-2">
              <Button
                variant={showDiff ? 'default' : 'outline'}
                size="sm"
                className="h-7 text-xs"
                onClick={() => setShowDiff(true)}
              >
                Show Diff
              </Button>
              <Button
                variant={!showDiff ? 'default' : 'outline'}
                size="sm"
                className="h-7 text-xs"
                onClick={() => setShowDiff(false)}
              >
                Show Content
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs ml-auto"
                onClick={handleCopyContent}
              >
                {copiedContent ? (
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
          )}

          {/* Content Display */}
          {result && (
            <div className="rounded-md border border-gray-200 dark:border-gray-800 overflow-hidden">
              {showDiff && result.fileDiff ? (
                <div className="bg-gray-50 dark:bg-gray-950">
                  {renderDiff(result.fileDiff)}
                </div>
              ) : (
                <pre className="p-3 text-xs bg-gray-950 dark:bg-gray-900 overflow-x-auto max-h-[400px] overflow-y-auto">
                  <code
                    className="text-gray-100 dark:text-gray-200"
                    dangerouslySetInnerHTML={{
                      __html:
                        Prism.highlight(
                          result.newContent || content,
                          Prism.languages[language] || Prism.languages.plain,
                          language,
                        ) || '',
                    }}
                  />
                </pre>
              )}
            </div>
          )}

          {/* Error Display */}
          {toolCall.status === 'failed' &&
            toolCall.result &&
            typeof toolCall.result === 'object' &&
            'error' in toolCall.result && (
              <div className="rounded bg-red-100 dark:bg-red-950/50 border border-red-200 dark:border-red-800 p-3 text-xs text-red-700 dark:text-red-300">
                {(toolCall.result as { error: string }).error}
              </div>
            )}
        </div>
      </ToolContent>
    </Tool>
  );
}
