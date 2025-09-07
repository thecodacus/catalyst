'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputSubmit,
  PromptInputButton,
  PromptInputTools,
} from '@/components/ai-elements/prompt-input';
import { Github, GitBranch, X, Sparkles, ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import Link from 'next/link';

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
  showGitHubImport?: boolean;
  onGitHubImport?: () => void;
  selectedRepo?: { repo: any; branch: string } | null;
  onClearRepo?: () => void;
}

interface Model {
  id: string;
  name: string;
  description: string;
}

interface AIModelsResponse {
  provider: string;
  currentModel: string;
  models: Model[];
  isConfigured: boolean;
  configuredProviders?: string[];
}

export function CatalystPromptInput({
  onSubmit,
  placeholder = 'Ask me to help with your code...',
  className,
  disabled = false,
  isLoading = false,
  autoFocus = false,
  value: externalValue,
  onChange: externalOnChange,
  showGlow = true,
  minHeight = '60px',
  showGitHubImport = false,
  onGitHubImport,
  selectedRepo,
  onClearRepo,
}: CatalystPromptInputProps) {
  const [internalValue, setInternalValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [aiModels, setAiModels] = useState<AIModelsResponse | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>('');

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

  // Fetch available AI models
  useEffect(() => {
    const fetchModels = async () => {
      try {
        const response = await fetch('/api/ai/models');
        if (response.ok) {
          const data = await response.json();
          console.log('AI models data:', data);
          setAiModels(data);
          setSelectedModel(data.currentModel);
        }
      } catch (error) {
        console.error('Failed to fetch AI models:', error);
      }
    };

    fetchModels();
  }, []);

  const handleModelChange = async (modelId: string) => {
    try {
      const response = await fetch('/api/ai/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelId }),
      });

      if (response.ok) {
        setSelectedModel(modelId);
        toast.success('Model updated');
      } else {
        toast.error('Failed to update model');
      }
    } catch (error) {
      console.error('Failed to update model:', error);
      toast.error('Failed to update model');
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
    <div
      className={cn(
        'relative transition-all duration-300',
        showGlow && isFocused && 'scale-[1.02]',
        className,
      )}
    >
      {/* Glow effect */}
      {showGlow && (
        <div
          className={cn(
            'absolute -inset-0.5 rounded-2xl bg-gradient-to-r from-indigo-500 to-indigo-400 opacity-0 blur transition-opacity duration-300',
            isFocused && 'opacity-20',
          )}
        />
      )}

      <PromptInput onSubmit={handleSubmit} className="relative">
        <div className="relative bg-white dark:bg-gray-900 rounded-2xl border border-gray-200/50 dark:border-gray-700/50 shadow-sm hover:shadow-md transition-shadow">
          <PromptInputTextarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={placeholder}
            className={cn(
              'border-0 bg-transparent focus-visible:ring-0',
              'text-gray-900 dark:text-white',
              'placeholder:text-gray-500 dark:placeholder:text-gray-400',
              'resize-none pr-12',
            )}
            style={{ minHeight }}
            disabled={disabled || isLoading}
            autoFocus={autoFocus}
          />
          <PromptInputToolbar className="right-2 bottom-2 left-2 top-2">
            <PromptInputTools>
              {/* Model Selector */}
              {aiModels && aiModels.isConfigured ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-sm"
                    >
                      <Sparkles className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                      <span className="font-medium text-gray-700 dark:text-gray-300">
                        {aiModels.models.find(m => m.id === selectedModel)?.name || 'Select Model'}
                      </span>
                      <ChevronDown className="h-3 w-3 text-gray-500" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-64">
                    <DropdownMenuLabel>
                      {aiModels.provider.charAt(0).toUpperCase() + aiModels.provider.slice(1)} Models
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {aiModels.models.map((model) => (
                      <DropdownMenuItem
                        key={model.id}
                        onClick={() => handleModelChange(model.id)}
                        className={cn(
                          "flex flex-col items-start py-2",
                          selectedModel === model.id && "bg-gray-100 dark:bg-gray-800"
                        )}
                      >
                        <span className="font-medium">{model.name}</span>
                        <span className="text-xs text-muted-foreground">{model.description}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : aiModels && !aiModels.isConfigured ? (
                <Link href="/settings">
                  <button
                    type="button"
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-orange-50 dark:bg-orange-950/50 border border-orange-200 dark:border-orange-800 text-sm"
                  >
                    <Sparkles className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                    <span className="font-medium text-orange-900 dark:text-orange-100">
                      Configure AI Provider
                    </span>
                  </button>
                </Link>
              ) : null}

              {/* GitHub Repository */}
              {selectedRepo ? (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-950/50 rounded-lg border border-indigo-200 dark:border-indigo-800">
                  <Github className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                  <span className="text-sm font-medium text-indigo-900 dark:text-indigo-100">
                    {selectedRepo.repo.name}
                  </span>
                  <GitBranch className="h-3 w-3 text-indigo-600 dark:text-indigo-400" />
                  <span className="text-sm text-indigo-700 dark:text-indigo-300">
                    {selectedRepo.branch}
                  </span>
                  {onClearRepo && (
                    <button
                      onClick={onClearRepo}
                      type="button"
                      className="ml-1 hover:bg-indigo-200 dark:hover:bg-indigo-800 rounded p-0.5 transition-colors"
                    >
                      <X className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                    </button>
                  )}
                </div>
              ) : (
                showGitHubImport && onGitHubImport && (
                  <PromptInputButton
                    onClick={onGitHubImport}
                    type="button"
                    disabled={disabled || isLoading}
                    className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                  >
                    <Github className="h-4 w-4" />
                    <span>Import from GitHub</span>
                  </PromptInputButton>
                )
              )}
            </PromptInputTools>
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
