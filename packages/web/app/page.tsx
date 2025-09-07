'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, Code2, Bug, TestTube2, Zap, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/stores/auth-store';
import { Animated } from '@/components/ui/animated';
import { CatalystPromptInput } from '@/components/catalyst-prompt-input';
import { cn } from '@/lib/utils';

export default function Home() {
  const [query, setQuery] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const router = useRouter();
  const { user } = useAuthStore();

  const handleSubmit = async (submittedQuery: string) => {
    try {
      setIsCreating(true);
      
      // Create a new project with the query as the initial prompt
      const project = await apiClient.createProject({
        name: submittedQuery.slice(0, 50), // Use first 50 chars of query as project name
        description: `Created from search: ${submittedQuery}`
      });

      // Navigate to the project with the query as initial message
      router.push(`/projects/${project._id}?q=${encodeURIComponent(submittedQuery)}`);
    } catch (error) {
      console.error('Failed to create project:', error);
      // If not authenticated, redirect to login
      if (!user) {
        router.push('/login');
      }
    } finally {
      setIsCreating(false);
    }
  };

  const quickActions = [
    {
      icon: Code2,
      label: "Create React Component",
      query: "Help me create a new React component",
      color: "text-indigo-500 dark:text-indigo-400"
    },
    {
      icon: Bug,
      label: "Debug Code",
      query: "Debug my code and fix errors",
      color: "text-red-500 dark:text-red-400"
    },
    {
      icon: TestTube2,
      label: "Write Tests",
      query: "Write unit tests for my function",
      color: "text-green-500 dark:text-green-400"
    },
    {
      icon: Zap,
      label: "Refactor Code",
      query: "Refactor this code for better performance",
      color: "text-yellow-500 dark:text-yellow-400"
    }
  ];

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center px-4 overflow-hidden bg-background">
      {/* Background gradient effect */}
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 via-transparent to-indigo-500/5 pointer-events-none" />
      
      {/* Animated particles */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="animate-pulse absolute top-20 left-20 h-32 w-32 rounded-full bg-indigo-500/10 blur-3xl" />
        <div className="animate-pulse absolute bottom-20 right-20 h-48 w-48 rounded-full bg-indigo-500/10 blur-3xl [animation-delay:1000ms]" />
      </div>

      {/* Logo/Title */}
      <Animated animation="fade-in-down" className="mb-12 text-center">
        <div className="flex items-center justify-center gap-3 mb-4">
          <div className="relative">
            <div className="absolute inset-0 animate-pulse bg-indigo-500/20 rounded-full blur-xl" />
            <Sparkles className="relative h-12 w-12 text-indigo-500 dark:text-indigo-400" />
          </div>
          <h1 className="text-6xl font-light tracking-tight">
            <span className="bg-gradient-to-r from-gray-900 to-indigo-600 dark:from-white dark:to-indigo-400 bg-clip-text text-transparent">
              Catalyst
            </span>
          </h1>
        </div>
        <p className="text-lg text-gray-600 dark:text-gray-400">
          AI-powered code assistant that understands your vision
        </p>
      </Animated>

      {/* Search Form with CatalystPromptInput */}
      <Animated animation="scale-in" delay={200} className="w-full max-w-lg">
        <CatalystPromptInput
          value={query}
          onChange={setQuery}
          onSubmit={handleSubmit}
          placeholder="Ask me to help with your code..."
          isLoading={isCreating}
          autoFocus
          showGlow
        />
      </Animated>

      {/* Quick action buttons */}
      <Animated animation="fade-in-up" delay={400}>
        <div className="mt-10 grid grid-cols-2 md:grid-cols-4 gap-3 max-w-3xl">
          {quickActions.map((action, index) => {
            const Icon = action.icon;
            
            return (
              <button
                key={index}
                onClick={() => setQuery(action.query)}
                className={cn(
                  "group relative p-4 rounded-xl",
                  "bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm",
                  "border border-gray-200/30 dark:border-gray-700/30",
                  "hover:border-indigo-300/50 dark:hover:border-indigo-700/50",
                  "shadow-sm hover:shadow-md",
                  "transition-all duration-200",
                  "hover:scale-[1.02] active:scale-[0.98]"
                )}
              >
                {/* Hover glow */}
                <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-indigo-500/10 to-indigo-400/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                
                <div className="relative flex flex-col items-center gap-3">
                  <Icon className={cn(
                    "h-8 w-8 transition-all duration-200",
                    action.color,
                    "group-hover:scale-110"
                  )} />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-white transition-colors">
                    {action.label}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </Animated>

      {/* Stats or features */}
      <Animated animation="fade-in" delay={600} className="mt-16 flex gap-8 text-center">
        <div className="group">
          <div className="text-2xl font-semibold text-indigo-600 dark:text-indigo-400 group-hover:scale-110 transition-transform">
            10k+
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400">Developers</div>
        </div>
        <div className="w-px bg-gray-200/30 dark:bg-gray-700/30" />
        <div className="group">
          <div className="text-2xl font-semibold text-indigo-600 dark:text-indigo-400 group-hover:scale-110 transition-transform">
            50M+
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400">Lines Generated</div>
        </div>
        <div className="w-px bg-gray-200/30 dark:bg-gray-700/30" />
        <div className="group">
          <div className="text-2xl font-semibold text-indigo-600 dark:text-indigo-400 group-hover:scale-110 transition-transform">
            99.9%
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400">Uptime</div>
        </div>
      </Animated>

      {/* Footer */}
      <Animated animation="fade-in-up" delay={800} className="absolute bottom-6">
        <div className="text-center">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
            Start typing to create a new project and begin coding with AI
          </p>
          <Button
            variant="link"
            size="sm"
            onClick={() => router.push('/projects')}
            className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 group"
          >
            Or view existing projects 
            <ArrowRight className="ml-1 h-3 w-3 inline-block group-hover:translate-x-1 transition-transform" />
          </Button>
        </div>
      </Animated>
    </div>
  );
}