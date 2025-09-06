import { Schema, model, models } from 'mongoose';

export interface IProject {
  _id: string;
  userId: string;
  vmId?: string;
  name: string;
  description?: string;
  createdAt: Date;
  lastAccessed: Date;
  settings: {
    aiModel: string;
    temperature: number;
    maxTokens: number;
  };
  git?: {
    provider: 'github' | 'gitlab' | 'bitbucket';
    repoUrl: string;
    repoName: string;
    repoOwner: string;
    branch?: string;
    isPrivate: boolean;
    createdAt: Date;
  };
  collaborators: Array<{
    userId: string;
    role: 'owner' | 'editor' | 'viewer';
    addedAt: Date;
  }>;
  tags: string[];
}

const projectSchema = new Schema<IProject>(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    vmId: {
      type: String,
      sparse: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    lastAccessed: {
      type: Date,
      default: Date.now,
      index: true,
    },
    settings: {
      aiModel: {
        type: String,
        default: 'gpt-4',
      },
      temperature: {
        type: Number,
        default: 0.7,
        min: 0,
        max: 2,
      },
      maxTokens: {
        type: Number,
        default: 2000,
        min: 1,
        max: 8000,
      },
    },
    git: {
      provider: {
        type: String,
        enum: ['github', 'gitlab', 'bitbucket'],
      },
      repoUrl: String,
      repoName: String,
      repoOwner: String,
      branch: {
        type: String,
        default: 'main',
      },
      isPrivate: {
        type: Boolean,
        default: true,
      },
      createdAt: {
        type: Date,
        default: Date.now,
      },
    },
    collaborators: [
      {
        userId: {
          type: String,
          required: true,
        },
        role: {
          type: String,
          enum: ['owner', 'editor', 'viewer'],
          default: 'viewer',
        },
        addedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    tags: [String],
  },
  {
    timestamps: true,
  },
);

// Compound indexes
projectSchema.index({ userId: 1, lastAccessed: -1 });
projectSchema.index({ 'collaborators.userId': 1 });
projectSchema.index({ tags: 1 });

// Update lastAccessed on find
projectSchema.pre(['findOne', 'findOneAndUpdate'], async function () {
  this.set({ lastAccessed: new Date() });
});

export const Project =
  models.Project || model<IProject>('Project', projectSchema);
