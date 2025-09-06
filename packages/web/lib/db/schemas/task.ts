import { Schema, model, models } from 'mongoose';

export interface ITask {
  _id: string;
  projectId: string;
  userId: string;
  type: 'code_generation' | 'refactoring' | 'analysis' | 'multi_file_edit';
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
  priority: number;

  progress: {
    percentage: number;
    currentStep: string;
    totalSteps: number;
    completedSteps: number;
  };

  prompt: string;
  context: {
    files?: string[];
    previousTurns?: number;
  };

  toolCalls: Array<{
    id: string;
    tool: string;
    params: Record<string, unknown>;
    status: 'pending' | 'running' | 'completed' | 'failed';
    result?: unknown;
    error?: string;
    startedAt?: Date;
    completedAt?: Date;
    duration?: number;
  }>;

  results: unknown[];
  logs: Array<{
    timestamp: Date;
    level: 'info' | 'warn' | 'error' | 'debug';
    message: string;
    data?: unknown;
  }>;

  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  updatedAt: Date;

  retryCount: number;
  error?: string;
  cancelledBy?: string;
}

const taskSchema = new Schema<ITask>(
  {
    projectId: {
      type: String,
      required: true,
      index: true,
    },
    userId: {
      type: String,
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['code_generation', 'refactoring', 'analysis', 'multi_file_edit'],
      required: true,
    },
    status: {
      type: String,
      enum: ['queued', 'processing', 'completed', 'failed', 'cancelled'],
      default: 'queued',
      index: true,
    },
    priority: {
      type: Number,
      default: 5,
      min: 0,
      max: 10,
      index: true,
    },
    progress: {
      percentage: { type: Number, default: 0 },
      currentStep: { type: String, default: '' },
      totalSteps: { type: Number, default: 0 },
      completedSteps: { type: Number, default: 0 },
    },
    prompt: {
      type: String,
      required: true,
    },
    context: {
      files: [String],
      previousTurns: Number,
    },
    toolCalls: [
      {
        id: String,
        tool: String,
        params: Schema.Types.Mixed,
        status: {
          type: String,
          enum: ['pending', 'running', 'completed', 'failed'],
          default: 'pending',
        },
        result: Schema.Types.Mixed,
        error: String,
        startedAt: Date,
        completedAt: Date,
        duration: Number,
      },
    ],
    results: [Schema.Types.Mixed],
    logs: [
      {
        timestamp: { type: Date, default: Date.now },
        level: {
          type: String,
          enum: ['info', 'warn', 'error', 'debug'],
          default: 'info',
        },
        message: String,
        data: Schema.Types.Mixed,
      },
    ],
    startedAt: Date,
    completedAt: Date,
    retryCount: { type: Number, default: 0 },
    error: String,
    cancelledBy: String,
  },
  {
    timestamps: true,
  },
);

// Indexes for efficient queries
taskSchema.index({ projectId: 1, status: 1, createdAt: -1 });
taskSchema.index({ userId: 1, status: 1 });
taskSchema.index({ status: 1, priority: -1, createdAt: 1 }); // For job queue
taskSchema.index({ updatedAt: 1 }); // For change streams

export const Task = models.Task || model<ITask>('Task', taskSchema);
