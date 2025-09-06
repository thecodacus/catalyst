'use client';

import * as React from 'react';
import { ChevronDown, Loader2, CheckCircle, XCircle, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

interface ToolProps extends React.ComponentProps<typeof Collapsible> {
  className?: string;
  state?:
    | 'input-streaming'
    | 'input-available'
    | 'output-available'
    | 'output-error';
}

export function Tool({ children, className, state, ...props }: ToolProps) {
  const getBackgroundColor = () => {
    switch (state) {
      case 'input-streaming':
        return 'bg-blue-50 dark:bg-blue-950/50 border-blue-200 dark:border-blue-800';
      case 'input-available':
        return 'bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800';
      case 'output-available':
        return 'bg-green-50 dark:bg-green-950/50 border-green-200 dark:border-green-800';
      case 'output-error':
        return 'bg-red-50 dark:bg-red-950/50 border-red-200 dark:border-red-800';
      default:
        return 'border-border/50';
    }
  };

  return (
    <Collapsible
      className={cn(
        'rounded-md border transition-colors',
        getBackgroundColor(),
        className,
      )}
      {...props}
    >
      {children}
    </Collapsible>
  );
}

interface ToolHeaderProps
  extends React.ComponentProps<typeof CollapsibleTrigger> {
  type: string;
  state:
    | 'input-streaming'
    | 'input-available'
    | 'output-available'
    | 'output-error';
  className?: string;
}

export function ToolHeader({
  type,
  state,
  className,
  ...props
}: ToolHeaderProps) {
  const getIcon = () => {
    switch (state) {
      case 'input-streaming':
        return (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
        );
      case 'input-available':
        return <Play className="h-3 w-3 text-muted-foreground" />;
      case 'output-available':
        return <CheckCircle className="h-3 w-3 text-green-600/70" />;
      case 'output-error':
        return <XCircle className="h-3 w-3 text-red-600/70" />;
    }
  };

  const getStateText = () => {
    switch (state) {
      case 'input-streaming':
        return 'Preparing...';
      case 'input-available':
        return 'Running';
      case 'output-available':
        return 'Completed';
      case 'output-error':
        return 'Failed';
    }
  };

  const formattedType = type.replace(/^tool-/, '').replace(/_/g, ' ');

  return (
    <CollapsibleTrigger
      className={cn(
        'group flex w-full items-center justify-between rounded-md p-2 text-xs transition-all hover:bg-muted/30',
        className,
      )}
      {...props}
    >
      <div className="flex items-center gap-2">
        {getIcon()}
        <span className="font-medium">{formattedType}</span>
        <span className="text-muted-foreground text-xs">{getStateText()}</span>
      </div>
      <ChevronDown className="h-3 w-3 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
    </CollapsibleTrigger>
  );
}

export function ToolContent({
  children,
  ...props
}: React.ComponentProps<typeof CollapsibleContent>) {
  return (
    <CollapsibleContent
      className="mt-1 overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up"
      {...props}
    >
      <div className="p-3">{children}</div>
    </CollapsibleContent>
  );
}

interface ToolInputProps extends React.ComponentProps<'div'> {
  input: unknown;
}

export function ToolInput({ input, className, ...props }: ToolInputProps) {
  return (
    <div className={cn(className)} {...props}>
      <h4 className="mb-1.5 text-xs font-medium">Parameters</h4>
      <pre className="rounded bg-white dark:bg-black border border-gray-200 dark:border-gray-700 p-3 text-xs overflow-x-auto shadow-sm">
        <code className="text-gray-700 dark:text-gray-300">
          {JSON.stringify(input, null, 2)}
        </code>
      </pre>
    </div>
  );
}

interface ToolOutputProps extends React.ComponentProps<'div'> {
  output?: React.ReactNode;
  errorText?: string;
}

export function ToolOutput({
  output,
  errorText,
  className,
  ...props
}: ToolOutputProps) {
  if (errorText) {
    return (
      <div className={cn('mt-2', className)} {...props}>
        <h4 className="mb-1.5 text-xs text-red-600 dark:text-red-400">Error</h4>
        <div className="rounded bg-red-100 dark:bg-red-950/50 p-2 text-xs text-red-700 dark:text-red-300">
          {errorText}
        </div>
      </div>
    );
  }

  if (output) {
    return (
      <div className={cn('mt-2', className)} {...props}>
        <h4 className="mb-1.5 text-xs font-medium">Output</h4>
        <div className="rounded bg-white dark:bg-black border border-gray-200 dark:border-gray-700 p-3 text-xs shadow-sm">
          {output}
        </div>
      </div>
    );
  }

  return null;
}
