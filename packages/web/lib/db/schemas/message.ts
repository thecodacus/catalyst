import { Schema, model, models } from 'mongoose';

export interface IMessage {
  _id: string;
  projectId: string;
  userId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;

  // Message parts for rich content
  parts?: Array<{
    type: 'text' | 'task' | 'tool-call' | 'file' | 'code';
    data: unknown; // Flexible data based on type
  }>;

  // Related entities
  taskId?: string;
  parentMessageId?: string;

  // Metadata
  metadata?: {
    model?: string;
    tokenCount?: number;
    processingTime?: number;
  };

  createdAt: Date;
  updatedAt: Date;
}

const messageSchema = new Schema<IMessage>(
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
    role: {
      type: String,
      enum: ['user', 'assistant', 'system'],
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    parts: [
      {
        type: {
          type: String,
          enum: ['text', 'task', 'tool-call', 'file', 'code'],
          required: true,
        },
        data: Schema.Types.Mixed,
      },
    ],
    taskId: {
      type: String,
      index: true,
    },
    parentMessageId: {
      type: String,
      index: true,
    },
    metadata: {
      model: String,
      tokenCount: Number,
      processingTime: Number,
    },
  },
  {
    timestamps: true,
  },
);

// Indexes for efficient queries
messageSchema.index({ projectId: 1, createdAt: -1 });
messageSchema.index({ projectId: 1, userId: 1, createdAt: -1 });

export const Message =
  models.Message || model<IMessage>('Message', messageSchema);
