import { VMTier } from '@codesandbox/sdk';
import { Schema, model, models, Document } from 'mongoose';

export interface ISandboxSession extends Document {
  projectId: string;
  sandboxId: string;
  status: 'active' | 'hibernated' | 'terminated';
  vmTier: {
    name: VMTier['name'];
    cpuCores: VMTier['cpuCores'];
    memoryGiB: VMTier['memoryGiB'];
    diskGB: VMTier['diskGB'];
  };
  createdAt: Date;
  lastAccessedAt: Date;
  expiresAt: Date;
  metadata?: {
    title?: string;
    templateId?: string;
  };
}

const sandboxSessionSchema = new Schema<ISandboxSession>({
  projectId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  sandboxId: {
    type: String,
    required: true,
    index: true,
  },
  status: {
    type: String,
    enum: ['active', 'hibernated', 'terminated'],
    default: 'active',
  },
  vmTier: {
    name: String,
    cpuCores: Number,
    memoryGiB: Number,
    diskGB: Number,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  lastAccessedAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    index: true,
  },
  metadata: {
    title: String,
    templateId: String,
  },
});

// Add index for cleanup queries
sandboxSessionSchema.index({ status: 1, lastAccessedAt: 1 });

export const SandboxSession =
  models.SandboxSession ||
  model<ISandboxSession>('SandboxSession', sandboxSessionSchema);
