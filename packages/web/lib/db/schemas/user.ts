import { Schema, model, models } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface IUser {
  _id: string;
  email: string;
  password: string;
  name: string;
  plan: 'free' | 'pro' | 'enterprise';
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
      required: true,
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
  },
  {
    timestamps: true,
  },
);

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();

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
