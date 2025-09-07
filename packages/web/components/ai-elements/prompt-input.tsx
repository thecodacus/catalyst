'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowUp, Loader2 } from 'lucide-react';

export interface PromptInputProps extends React.HTMLAttributes<HTMLFormElement> {
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
}

const PromptInput = React.forwardRef<HTMLFormElement, PromptInputProps>(
  ({ className, onSubmit, ...props }, ref) => {
    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      onSubmit(e);
    };

    return (
      <form
        ref={ref}
        onSubmit={handleSubmit}
        className={cn('relative w-full', className)}
        {...props}
      />
    );
  }
);
PromptInput.displayName = 'PromptInput';

export interface PromptInputTextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const PromptInputTextarea = React.forwardRef<
  HTMLTextAreaElement,
  PromptInputTextareaProps
>(({ className, ...props }, ref) => {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  React.useImperativeHandle(ref, () => textareaRef.current!);

  React.useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const adjustHeight = () => {
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight}px`;
    };

    adjustHeight();
    textarea.addEventListener('input', adjustHeight);

    return () => {
      textarea.removeEventListener('input', adjustHeight);
    };
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      const form = e.currentTarget.form;
      if (form) {
        const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
        form.dispatchEvent(submitEvent);
      }
    }
  };

  return (
    <Textarea
      ref={textareaRef}
      className={cn(
        'min-h-[52px] w-full resize-none px-4 py-3 text-sm shadow-none',
        'scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-700',
        className
      )}
      rows={1}
      onKeyDown={handleKeyDown}
      {...props}
    />
  );
});
PromptInputTextarea.displayName = 'PromptInputTextarea';

export interface PromptInputToolbarProps
  extends React.HTMLAttributes<HTMLDivElement> {}

const PromptInputToolbar = React.forwardRef<
  HTMLDivElement,
  PromptInputToolbarProps
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        'flex items-center justify-between gap-2 px-1 py-1',
        className
      )}
      {...props}
    />
  );
});
PromptInputToolbar.displayName = 'PromptInputToolbar';

export interface PromptInputToolsProps
  extends React.HTMLAttributes<HTMLDivElement> {}

const PromptInputTools = React.forwardRef<
  HTMLDivElement,
  PromptInputToolsProps
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn('flex items-center gap-1', className)}
      {...props}
    />
  );
});
PromptInputTools.displayName = 'PromptInputTools';

export interface PromptInputButtonProps
  extends React.ComponentProps<typeof Button> {}

const PromptInputButton = React.forwardRef<
  HTMLButtonElement,
  PromptInputButtonProps
>(({ className, ...props }, ref) => {
  return (
    <Button
      ref={ref}
      type="button"
      variant="ghost"
      size="icon"
      className={cn(
        'h-8 w-auto gap-1 rounded-md px-2 text-xs text-muted-foreground hover:text-foreground',
        className
      )}
      {...props}
    />
  );
});
PromptInputButton.displayName = 'PromptInputButton';

export interface PromptInputSubmitProps
  extends React.ComponentProps<typeof Button> {
  status?: 'ready' | 'thinking' | 'error';
}

const PromptInputSubmit = React.forwardRef<
  HTMLButtonElement,
  PromptInputSubmitProps
>(({ className, status = 'ready', disabled, ...props }, ref) => {
  const Icon = status === 'thinking' ? Loader2 : ArrowUp;
  
  return (
    <Button
      ref={ref}
      type="submit"
      size="icon"
      disabled={disabled || status === 'thinking'}
      className={cn(
        'h-8 w-8 rounded-lg',
        status === 'thinking' && 'animate-pulse',
        className
      )}
      {...props}
    >
      <Icon className={cn('h-4 w-4', status === 'thinking' && 'animate-spin')} />
      <span className="sr-only">Submit</span>
    </Button>
  );
});
PromptInputSubmit.displayName = 'PromptInputSubmit';

// Model Select Components
const PromptInputModelSelect = Select;
const PromptInputModelSelectTrigger = SelectTrigger;
const PromptInputModelSelectContent = SelectContent;
const PromptInputModelSelectItem = SelectItem;
const PromptInputModelSelectValue = SelectValue;

export {
  PromptInput,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
  PromptInputButton,
  PromptInputSubmit,
  PromptInputModelSelect,
  PromptInputModelSelectTrigger,
  PromptInputModelSelectContent,
  PromptInputModelSelectItem,
  PromptInputModelSelectValue,
};