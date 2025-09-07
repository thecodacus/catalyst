import { connectMongoose } from '@/lib/db/mongodb';
import { User } from '@/lib/db/schemas/user';
import { decrypt } from '@/app/api/settings/route';

export interface UserAISettings {
  provider?: string;
  model?: string;
  apiKey?: string;
  customEndpoint?: string;
}

export async function loadUserAISettings(
  userId: string,
): Promise<UserAISettings | null> {
  try {
    await connectMongoose();
    console.log('[AI SETTINGS] Loading settings for userId:', userId);

    const user = await User.findById(userId).select('settings email');

    console.log('[AI SETTINGS] User found:', {
      userId: user?._id.toString(),
      email: user?.email,
      hasSettings: !!user?.settings,
      provider: user?.settings?.provider,
    });

    if (!user?.settings || !user.settings.provider) {
      // Check if there's a default provider configured via environment variables
      if (process.env.ANTHROPIC_API_KEY) {
        return {
          provider: 'anthropic',
          model: process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-latest',
          apiKey: process.env.ANTHROPIC_API_KEY,
        };
      } else if (process.env.OPENAI_API_KEY) {
        return {
          provider: 'openai',
          model: process.env.OPENAI_MODEL || 'gpt-4-turbo-preview',
          apiKey: process.env.OPENAI_API_KEY,
        };
      } else if (process.env.OPENROUTER_API_KEY) {
        return {
          provider: 'openrouter',
          model: process.env.OPENROUTER_MODEL || 'openai/gpt-4-turbo-preview',
          apiKey: process.env.OPENROUTER_API_KEY,
        };
      } else if (process.env.GEMINI_API_KEY) {
        return {
          provider: 'gemini',
          model: 'gemini-pro',
          apiKey: process.env.GEMINI_API_KEY,
        };
      }
      return null;
    }

    const settings: UserAISettings = {
      provider: user.settings.provider,
      model: user.settings.model,
      customEndpoint: user.settings.customEndpoint,
    };

    // Get the API key for the selected provider
    if (user.settings.providers && user.settings.provider) {
      const providerData = user.settings.providers[user.settings.provider];

      if (providerData?.apiKey?.encrypted) {
        try {
          settings.apiKey = decrypt(providerData.apiKey);
        } catch (error) {
          console.error('Failed to decrypt API key:', error);
        }
      }

      // Use provider-specific model if set
      if (providerData?.model) {
        settings.model = providerData.model;
      }

      // For custom provider, get the endpoint
      if (user.settings.provider === 'custom' && providerData?.endpoint) {
        settings.customEndpoint = providerData.endpoint;
      }
    }

    console.log('[AI SETTINGS] Returning settings:', {
      userId: userId,
      provider: settings.provider,
      model: settings.model,
      hasApiKey: !!settings.apiKey,
      customEndpoint: settings.customEndpoint,
    });

    return settings;
  } catch (error) {
    console.error('Failed to load user settings:', error);
    return null;
  }
}

// Note: We no longer modify environment variables to avoid multi-user conflicts
// Settings are passed directly to the AI service instance
