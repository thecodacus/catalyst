import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { loadUserAISettings } from '@/lib/ai/load-user-settings';

// Define available models for each provider
const PROVIDER_MODELS = {
  openai: [
    { id: 'gpt-4-turbo-preview', name: 'GPT-4 Turbo', description: 'Most capable, latest GPT-4' },
    { id: 'gpt-4', name: 'GPT-4', description: 'Advanced reasoning' },
    { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', description: 'Fast and efficient' },
  ],
  anthropic: [
    { id: 'claude-3-5-sonnet-latest', name: 'Claude 3.5 Sonnet', description: 'Best balance of intelligence and speed' },
    { id: 'claude-3-5-haiku-latest', name: 'Claude 3.5 Haiku', description: 'Fast and efficient' },
    { id: 'claude-3-opus-latest', name: 'Claude 3 Opus', description: 'Most capable Claude model' },
  ],
  openrouter: [
    { id: 'openai/gpt-4-turbo-preview', name: 'GPT-4 Turbo', description: 'via OpenRouter' },
    { id: 'anthropic/claude-3-opus', name: 'Claude 3 Opus', description: 'via OpenRouter' },
    { id: 'anthropic/claude-3-sonnet', name: 'Claude 3 Sonnet', description: 'via OpenRouter' },
    { id: 'google/gemini-pro', name: 'Gemini Pro', description: 'Google\'s model via OpenRouter' },
    { id: 'meta-llama/llama-2-70b-chat', name: 'Llama 2 70B', description: 'Open source via OpenRouter' },
    { id: 'mistralai/mixtral-8x7b-instruct', name: 'Mixtral 8x7B', description: 'MoE model via OpenRouter' },
  ],
  gemini: [
    { id: 'gemini-pro', name: 'Gemini Pro', description: 'Google\'s advanced model' },
    { id: 'gemini-pro-vision', name: 'Gemini Pro Vision', description: 'Multimodal model' },
  ],
  custom: [
    { id: 'custom', name: 'Custom Model', description: 'User-defined model' },
  ],
};

// GET /api/ai/models - Get available models for the user's configured provider
export async function GET(request: NextRequest) {
  return withAuth(request, async (_req, authUser) => {
    try {
      // Load user's AI settings
      const userSettings = await loadUserAISettings(authUser.userId);
      const { User } = await import('@/lib/db/schemas/user');
      const { connectMongoose } = await import('@/lib/db/mongodb');
      
      await connectMongoose();
      const user = await User.findById(authUser.userId).select('settings');
      
      if (!userSettings || !userSettings.provider || !user?.settings) {
        // Return default provider and models if not configured
        return NextResponse.json({
          provider: 'anthropic',
          currentModel: 'claude-3-5-sonnet-latest',
          models: PROVIDER_MODELS.anthropic,
          isConfigured: false,
          configuredProviders: [],
        });
      }
      
      const availableModels = PROVIDER_MODELS[userSettings.provider as keyof typeof PROVIDER_MODELS] || [];
      
      // Get list of configured providers
      const configuredProviders = user.settings.providers 
        ? Object.keys(user.settings.providers).filter(
            providerId => {
              const provider = user.settings.providers[providerId];
              return provider?.apiKey?.encrypted ? true : false;
            }
          )
        : [];
      
      // Check if the current provider is configured
      const isCurrentProviderConfigured = user.settings.providers && 
        user.settings.providers[userSettings.provider] && 
        user.settings.providers[userSettings.provider].apiKey?.encrypted;
      
      return NextResponse.json({
        provider: userSettings.provider,
        currentModel: userSettings.model || availableModels[0]?.id,
        models: availableModels,
        isConfigured: !!isCurrentProviderConfigured || !!userSettings.apiKey,
        configuredProviders,
      });
    } catch (error) {
      console.error('Error fetching AI models:', error);
      return NextResponse.json(
        { error: 'Failed to fetch models' },
        { status: 500 }
      );
    }
  });
}

// POST /api/ai/models - Update the selected model
export async function POST(request: NextRequest) {
  return withAuth(request, async (req, authUser) => {
    try {
      const { model } = await req.json();
      
      if (!model) {
        return NextResponse.json(
          { error: 'Model is required' },
          { status: 400 }
        );
      }
      
      // Update only the model in user settings
      const { User } = await import('@/lib/db/schemas/user');
      const { connectMongoose } = await import('@/lib/db/mongodb');
      
      await connectMongoose();
      
      const user = await User.findById(authUser.userId);
      if (!user) {
        return NextResponse.json(
          { error: 'User not found' },
          { status: 404 }
        );
      }
      
      if (!user.settings) {
        user.settings = {};
      }
      
      user.settings.model = model;
      await user.save();
      
      return NextResponse.json({ success: true });
    } catch (error) {
      console.error('Error updating model:', error);
      return NextResponse.json(
        { error: 'Failed to update model' },
        { status: 500 }
      );
    }
  });
}