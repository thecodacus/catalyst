'use client';

import { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  MoreVertical,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface Task {
  id: string;
  type: 'code_generation' | 'refactoring' | 'analysis' | 'multi_file_edit';
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
  prompt: string;
  progress: {
    percentage: number;
    currentStep: string;
    totalSteps: number;
    completedSteps: number;
  };
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

interface TaskListProps {
  projectId: string;
}

// Mock data
const mockTasks: Task[] = [
  {
    id: '1',
    type: 'code_generation',
    status: 'processing',
    prompt: 'Create a React component for user authentication',
    progress: {
      percentage: 65,
      currentStep: 'Generating component code',
      totalSteps: 4,
      completedSteps: 2,
    },
    createdAt: new Date(Date.now() - 5 * 60 * 1000),
    startedAt: new Date(Date.now() - 3 * 60 * 1000),
  },
  {
    id: '2',
    type: 'refactoring',
    status: 'completed',
    prompt: 'Refactor the database connection module to use connection pooling',
    progress: {
      percentage: 100,
      currentStep: 'Complete',
      totalSteps: 5,
      completedSteps: 5,
    },
    createdAt: new Date(Date.now() - 60 * 60 * 1000),
    startedAt: new Date(Date.now() - 58 * 60 * 1000),
    completedAt: new Date(Date.now() - 45 * 60 * 1000),
  },
  {
    id: '3',
    type: 'analysis',
    status: 'queued',
    prompt: 'Analyze the codebase for potential performance improvements',
    progress: {
      percentage: 0,
      currentStep: 'Waiting in queue',
      totalSteps: 0,
      completedSteps: 0,
    },
    createdAt: new Date(Date.now() - 2 * 60 * 1000),
  },
];

export function TaskList({ projectId: _projectId }: TaskListProps) {
  const [tasks] = useState<Task[]>(mockTasks);

  const getStatusIcon = (status: Task['status']) => {
    switch (status) {
      case 'processing':
        return <Loader2 className="h-4 w-4 animate-spin" />;
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-600" />;
      case 'queued':
        return <Clock className="h-4 w-4 text-yellow-600" />;
      default:
        return null;
    }
  };

  const getStatusBadgeVariant = (status: Task['status']) => {
    switch (status) {
      case 'processing':
        return 'default';
      case 'completed':
        return 'secondary';
      case 'failed':
        return 'destructive';
      case 'queued':
        return 'secondary';
      default:
        return 'secondary';
    }
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Tasks</h2>
      </div>

      <div className="space-y-4">
        {tasks.map((task) => (
          <Card key={task.id}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <CardTitle className="flex items-center gap-2">
                    {getStatusIcon(task.status)}
                    <span className="text-base">{task.prompt}</span>
                  </CardTitle>
                  <CardDescription>
                    <div className="flex items-center gap-4 text-xs">
                      <Badge variant={getStatusBadgeVariant(task.status)}>
                        {task.status}
                      </Badge>
                      <span>{task.type.replace('_', ' ')}</span>
                      <span>Created {getRelativeTime(task.createdAt)}</span>
                    </div>
                  </CardDescription>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem>View Details</DropdownMenuItem>
                    <DropdownMenuItem>View Logs</DropdownMenuItem>
                    {task.status === 'processing' && (
                      <DropdownMenuItem className="text-destructive">
                        Cancel Task
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </CardHeader>
            {task.status === 'processing' && (
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>{task.progress.currentStep}</span>
                    <span>{task.progress.percentage}%</span>
                  </div>
                  <Progress value={task.progress.percentage} />
                  <p className="text-xs text-muted-foreground">
                    Step {task.progress.completedSteps} of{' '}
                    {task.progress.totalSteps}
                  </p>
                </div>
              </CardContent>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

function getRelativeTime(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  return `${Math.floor(seconds / 86400)} days ago`;
}
