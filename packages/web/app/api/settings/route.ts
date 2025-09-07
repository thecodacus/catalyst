import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { connectMongoose } from '@/lib/db/mongodb';
import { User } from '@/lib/db/schemas/user';
import crypto from 'crypto';

// Simple encryption for API keys
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-encryption-key-change-this';
const algorithm = 'aes-256-gcm';

function encrypt(text: string): { encrypted: string; iv: string; tag: string } {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(
    algorithm,
    Buffer.from(crypto.createHash('sha256').update(ENCRYPTION_KEY).digest()),
    iv
  );
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();
  
  return {
    encrypted,
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
  };
}

function decrypt(encryptedData: { encrypted: string; iv: string; tag: string }): string {
  const decipher = crypto.createDecipheriv(
    algorithm,
    Buffer.from(crypto.createHash('sha256').update(ENCRYPTION_KEY).digest()),
    Buffer.from(encryptedData.iv, 'hex')
  );
  
  decipher.setAuthTag(Buffer.from(encryptedData.tag, 'hex'));
  
  let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

// GET /api/settings - Get user settings
export async function GET(request: NextRequest) {
  return withAuth(request, async (_req, authUser) => {
    try {
      await connectMongoose();
      
      const user = await User.findOne({ _id: authUser.userId }).exec();
      console.log('GET settings - User ID:', authUser.userId);
      console.log('GET settings - Settings ID:', user?.settings?._id);
      
      if (!user?.settings) {
        return NextResponse.json({
          provider: 'anthropic',
          model: 'claude-3-5-sonnet-latest',
          providers: {},
        });
      }
      
      // Build response with provider info but without API keys
      const response: any = {
        provider: user.settings.provider,
        model: user.settings.model,
        customEndpoint: user.settings.customEndpoint,
        providers: {},
      };
      
      // Add provider configuration status
      if (user.settings.providers) {
        const providers = ['openai', 'anthropic', 'openrouter', 'gemini', 'custom'];
        
        providers.forEach(providerId => {
          const providerData = user.settings.providers[providerId];
          if (providerData) {
            response.providers[providerId] = {
              apiKey: !!(providerData.apiKey && providerData.apiKey.encrypted),
              model: providerData.model || null,
              endpoint: providerData.endpoint || null,
            };
          }
        });
      }
      
      return NextResponse.json(response);
    } catch (error) {
      console.error('Error fetching settings:', error);
      return NextResponse.json(
        { error: 'Failed to fetch settings' },
        { status: 500 }
      );
    }
  });
}

// POST /api/settings - Update user settings
export async function POST(request: NextRequest) {
  return withAuth(request, async (req, authUser) => {
    try {
      const data = await req.json();
      
      await connectMongoose();
      
      // Handle provider-specific settings
      const providers = ['openai', 'anthropic', 'openrouter', 'gemini', 'custom'];
      
      // Get the current user first
      const currentUser = await User.findById(authUser.userId);
      if (!currentUser) {
        return NextResponse.json(
          { error: 'User not found' },
          { status: 404 }
        );
      }
      
      // Initialize settings and providers if they don't exist
      if (!currentUser.settings) {
        currentUser.settings = {
          provider: 'anthropic',
          providers: {}
        };
      }
      if (!currentUser.settings.providers) {
        currentUser.settings.providers = {};
      }
      
      // Apply updates manually to ensure proper structure
      if (data.provider !== undefined) {
        console.log('Updating provider from', currentUser.settings.provider, 'to', data.provider);
        currentUser.settings.provider = data.provider;
      }
      if (data.model !== undefined) {
        console.log('Updating model from', currentUser.settings.model, 'to', data.model);
        currentUser.settings.model = data.model;
      }
      if (data.customEndpoint !== undefined) {
        currentUser.settings.customEndpoint = data.customEndpoint;
      }
      
      // Update provider-specific settings
      providers.forEach(providerId => {
        const apiKeyField = `${providerId}_apiKey`;
        const modelField = `${providerId}_model`;
        
        // Initialize provider object if it doesn't exist
        if (!currentUser.settings.providers[providerId]) {
          currentUser.settings.providers[providerId] = {};
        }
        
        if (data[apiKeyField]) {
          const encryptedData = encrypt(data[apiKeyField]);
          currentUser.settings.providers[providerId].apiKey = encryptedData;
        }
        
        if (data[modelField] !== undefined) {
          currentUser.settings.providers[providerId].model = data[modelField];
        }
        
        if (providerId === 'custom' && data.customEndpoint) {
          currentUser.settings.providers[providerId].endpoint = data.customEndpoint;
        }
      });
      
      // Mark as modified since we're using mixed type
      currentUser.markModified('settings');
      currentUser.markModified('settings.providers');
      
      // Save the document
      const result = await currentUser.save();
      
      if (!result) {
        return NextResponse.json(
          { error: 'Failed to update user' },
          { status: 500 }
        );
      }
      
      console.log('Settings saved. Final provider:', result.settings.provider);
      console.log('Final settings:', {
        provider: result.settings.provider,
        model: result.settings.model,
        hasProviders: !!result.settings.providers,
      });
      
      return NextResponse.json({ success: true });
    } catch (error) {
      console.error('Error updating settings:', error);
      return NextResponse.json(
        { error: 'Failed to update settings' },
        { status: 500 }
      );
    }
  });
}

// Export decrypt function for use in AI service
export { decrypt };