import { useState, useEffect } from 'react';
import { socketClient } from '@/lib/socket/client';
import { apiClient } from '@/lib/api/client';

interface Task {
  _id: string;
  projectId: string;
  userId: string;
  type: string;
  status: string;
  progress: {
    percentage: number;
    currentStep: string;
    totalSteps: number;
    completedSteps: number;
  };
  toolCalls: any[];
  logs: LogEntry[];
  createdAt: Date;
  updatedAt: Date;
}

interface LogEntry {
  timestamp: Date;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  data?: any;
}

interface TaskUpdate {
  taskId: string;
  status?: string;
  progress?: Task['progress'];
  logs?: LogEntry[];
}

export function useRealtimeTask(taskId: string) {
  const [task, setTask] = useState<Task | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Fetch initial task data
    const fetchTask = async () => {
      try {
        const data = await apiClient.getTask(taskId);
        setTask(data.task);
        setLogs(data.logs || []);
      } catch (error) {
        console.error('Failed to fetch task:', error);
      }
    };

    fetchTask();

    // Socket event handlers
    const handleTaskUpdate = (data: unknown) => {
      const update = data as TaskUpdate;
      if (update.taskId === taskId) {
        setTask((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            ...(update.status && { status: update.status }),
            ...(update.progress && { progress: update.progress }),
            updatedAt: new Date(),
          };
        });

        if (update.logs) {
          setLogs((prev) => {
            const newLogs = update.logs!.filter(
              (log) => !prev.some((l) => l.timestamp === log.timestamp),
            );
            return [...prev, ...newLogs];
          });
        }
      }
    };

    const handleToolStart = (data: unknown) => {
      const typedData = data as {
        taskId: string;
        toolIndex: number;
        tool: string;
      };
      if (typedData.taskId === taskId) {
        setTask((prev) => {
          if (!prev) return null;
          const updated = { ...prev };
          if (updated.toolCalls[typedData.toolIndex]) {
            updated.toolCalls[typedData.toolIndex].status = 'running';
            updated.toolCalls[typedData.toolIndex].startedAt = new Date();
          }
          return updated;
        });
      }
    };

    const handleToolComplete = (data: unknown) => {
      const typedData = data as {
        taskId: string;
        toolIndex: number;
        result: any;
      };
      if (typedData.taskId === taskId) {
        setTask((prev) => {
          if (!prev) return null;
          const updated = { ...prev };
          if (updated.toolCalls[typedData.toolIndex]) {
            updated.toolCalls[typedData.toolIndex].status = 'completed';
            updated.toolCalls[typedData.toolIndex].result = typedData.result;
            updated.toolCalls[typedData.toolIndex].completedAt = new Date();
          }
          return updated;
        });
      }
    };

    const handleConnected = () => {
      setIsConnected(true);
      socketClient.subscribeToTask(taskId);
    };

    const handleDisconnected = () => {
      setIsConnected(false);
    };

    // Subscribe to socket events
    socketClient.on('connected', handleConnected);
    socketClient.on('disconnected', handleDisconnected);
    socketClient.on('task:update', handleTaskUpdate);
    socketClient.on('task:tool:start', handleToolStart);
    socketClient.on('task:tool:complete', handleToolComplete);

    // Connect socket if not already connected
    socketClient.connect();

    // Cleanup
    return () => {
      socketClient.unsubscribeFromTask(taskId);
      socketClient.off('connected', handleConnected);
      socketClient.off('disconnected', handleDisconnected);
      socketClient.off('task:update', handleTaskUpdate);
      socketClient.off('task:tool:start', handleToolStart);
      socketClient.off('task:tool:complete', handleToolComplete);
    };
  }, [taskId]);

  return { task, logs, isConnected };
}
