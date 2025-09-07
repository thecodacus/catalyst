'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { Circle, CircleDot, CheckCircle2 } from 'lucide-react';

export interface TodoItem {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  priority?: 'high' | 'medium' | 'low';
}

interface TodoDisplayProps {
  todos: TodoItem[];
  className?: string;
}

const StatusIcon = ({ status }: { status: TodoItem['status'] }) => {
  switch (status) {
    case 'pending':
      return <Circle className="h-4 w-4 text-gray-400" />;
    case 'in_progress':
      return <CircleDot className="h-4 w-4 text-indigo-600 animate-pulse" />;
    case 'completed':
      return <CheckCircle2 className="h-4 w-4 text-green-600" />;
  }
};

export const TodoDisplay: React.FC<TodoDisplayProps> = ({ todos, className }) => {
  if (!todos || todos.length === 0) {
    return null;
  }

  // Group todos by status
  const pending = todos.filter(t => t.status === 'pending');
  const inProgress = todos.filter(t => t.status === 'in_progress');
  const completed = todos.filter(t => t.status === 'completed');

  return (
    <div className={cn("space-y-3", className)}>
      {/* In Progress */}
      {inProgress.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">In Progress</h4>
          <div className="space-y-1">
            {inProgress.map((todo) => (
              <TodoItemRow key={todo.id} todo={todo} />
            ))}
          </div>
        </div>
      )}

      {/* Pending */}
      {pending.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Pending</h4>
          <div className="space-y-1">
            {pending.map((todo) => (
              <TodoItemRow key={todo.id} todo={todo} />
            ))}
          </div>
        </div>
      )}

      {/* Completed */}
      {completed.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Completed</h4>
          <div className="space-y-1">
            {completed.map((todo) => (
              <TodoItemRow key={todo.id} todo={todo} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

interface TodoItemRowProps {
  todo: TodoItem;
}

const TodoItemRow: React.FC<TodoItemRowProps> = ({ todo }) => {
  const isCompleted = todo.status === 'completed';
  const isInProgress = todo.status === 'in_progress';

  const priorityColors = {
    high: 'text-red-600 dark:text-red-400',
    medium: 'text-yellow-600 dark:text-yellow-400',
    low: 'text-gray-600 dark:text-gray-400',
  };

  return (
    <div
      className={cn(
        "flex items-start gap-2 px-3 py-2 rounded-lg transition-colors",
        "bg-gray-50 dark:bg-gray-900/50",
        isInProgress && "bg-indigo-50 dark:bg-indigo-900/20 ring-1 ring-indigo-200 dark:ring-indigo-800",
        isCompleted && "opacity-60"
      )}
    >
      <div className="mt-0.5">
        <StatusIcon status={todo.status} />
      </div>
      <div className="flex-1 min-w-0">
        <p
          className={cn(
            "text-sm",
            isCompleted && "line-through text-gray-500 dark:text-gray-400",
            isInProgress && "text-gray-900 dark:text-white font-medium"
          )}
        >
          {todo.content}
        </p>
        {todo.priority && (
          <span className={cn("text-xs mt-1 inline-block", priorityColors[todo.priority])}>
            {todo.priority} priority
          </span>
        )}
      </div>
    </div>
  );
};