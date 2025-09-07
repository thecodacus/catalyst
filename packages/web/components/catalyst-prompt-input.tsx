'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputSubmit,
} from '@/components/ai-elements/prompt-input';

interface CatalystPromptInputProps {
  onSubmit: (query: string) => void | Promise<void>;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  isLoading?: boolean;
  autoFocus?: boolean;
  value?: string;
  onChange?: (value: string) => void;
  showGlow?: boolean;
  minHeight?: string;
}

export function CatalystPromptInput({
  onSubmit,
  placeholder = "Ask me to help with your code...",
  className,
  disabled = false,
  isLoading = false,
  autoFocus = false,
  value: externalValue,
  onChange: externalOnChange,
  showGlow = true,
  minHeight = "60px",
}: CatalystPromptInputProps) {
  const [internalValue, setInternalValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);

  // Support both controlled and uncontrolled modes
  const isControlled = externalValue !== undefined;
  const value = isControlled ? externalValue : internalValue;
  const setValue = (newValue: string) => {
    if (isControlled && externalOnChange) {
      externalOnChange(newValue);
    } else {
      setInternalValue(newValue);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!value.trim() || disabled || isLoading) return;

    await onSubmit(value.trim());
    
    // Clear input after submission if uncontrolled
    if (!isControlled) {
      setInternalValue('');
    }
  };

  return (
    <div className={cn(
      "relative transition-all duration-300",
      showGlow && isFocused && "scale-[1.02]",
      className
    )}>
      {/* Glow effect */}
      {showGlow && (
        <div className={cn(
          "absolute -inset-0.5 rounded-2xl bg-gradient-to-r from-indigo-500 to-indigo-400 opacity-0 blur transition-opacity duration-300",
          isFocused && "opacity-20"
        )} />
      )}
      
      <PromptInput 
        onSubmit={handleSubmit} 
        className="relative"
      >
        <div className="relative bg-white dark:bg-gray-900 rounded-2xl border border-gray-200/50 dark:border-gray-700/50 shadow-sm hover:shadow-md transition-shadow">
          <PromptInputTextarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={placeholder}
            className={cn(
              "border-0 bg-transparent focus-visible:ring-0",
              "text-gray-900 dark:text-white",
              "placeholder:text-gray-500 dark:placeholder:text-gray-400",
              "resize-none pr-12"
            )}
            style={{ minHeight }}
            disabled={disabled || isLoading}
            autoFocus={autoFocus}
          />
          <PromptInputToolbar className="absolute right-2 bottom-2">
            <PromptInputSubmit
              className="bg-indigo-500 hover:bg-indigo-600 text-white h-8 w-8"
              disabled={!value.trim() || disabled || isLoading}
              status={isLoading ? 'thinking' : 'ready'}
            />
          </PromptInputToolbar>
        </div>
      </PromptInput>
    </div>
  );
}