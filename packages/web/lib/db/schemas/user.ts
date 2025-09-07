import { Schema, model, models } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface IUser {
  _id: string;
  email: string;
  password?: string;
  name: string;
  plan: 'free' | 'pro' | 'enterprise';
  githubId?: string;
  githubUsername?: string;
  githubAccessToken?: string;
  avatar?: string;
  gitIntegrations?: {
    github?: {
      accessToken: string;
      username: string;
      email: string;
      connectedAt: Date;
    };
    gitlab?: {
      accessToken: string;
      username: string;
      email: string;
      connectedAt: Date;
    };
  };
  settings?: {
    provider?: 'openai' | 'anthropic' | 'openrouter' | 'gemini' | 'custom';
    model?: string;
    customEndpoint?: string;
    providers?: any; // Using any to match the Object type in schema
  };
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const userSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: function() {
        return !this.githubId;
      },
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    plan: {
      type: String,
      enum: ['free', 'pro', 'enterprise'],
      default: 'free',
    },
    githubId: {
      type: String,
      unique: true,
      sparse: true,
    },
    githubUsername: String,
    githubAccessToken: {
      type: String,
      select: false,
    },
    avatar: String,
    gitIntegrations: {
      github: {
        accessToken: {
          type: String,
          select: false, // Don't include in queries by default
        },
        username: String,
        email: String,
        connectedAt: Date,
      },
      gitlab: {
        accessToken: {
          type: String,
          select: false, // Don't include in queries by default
        },
        username: String,
        email: String,
        connectedAt: Date,
      },
    },
    settings: {
      type: {
        provider: {
          type: String,
          enum: ['openai', 'anthropic', 'openrouter', 'gemini', 'custom'],
          default: 'anthropic',
        },
        model: String,
        customEndpoint: String,
        providers: {
          type: Object,
          default: {},
        },
      },
      default: {
        provider: 'anthropic',
        providers: {},
      },
      _id: false,  // Prevent subdocument from having its own _id
    },
  },
  {
    timestamps: true,
  },
);

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password') || !this.password) return next();

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error as Error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function (
  candidatePassword: string,
): Promise<boolean> {
  if (!this.password) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

// Remove password from JSON output
userSchema.set('toJSON', {
  transform: function (_doc, ret) {
    const { password: _password, ...userWithoutPassword } = ret;
    return userWithoutPassword;
  },
});

export const User = models.User || model<IUser>('User', userSchema);
