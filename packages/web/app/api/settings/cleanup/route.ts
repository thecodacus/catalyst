import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { connectMongoose } from '@/lib/db/mongodb';
import { User } from '@/lib/db/schemas/user';

// POST /api/settings/cleanup - Clean up and consolidate settings
export async function POST(request: NextRequest) {
  return withAuth(request, async (_req, authUser) => {
    try {
      await connectMongoose();
      
      // Find the user document
      const user = await User.findById(authUser.userId);
      
      if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }
      
      // Log current state
      console.log('Cleanup - User ID:', authUser.userId);
      console.log('Cleanup - Current settings:', user.settings);
      
      // If settings exist, we'll reconstruct them to ensure consistency
      if (user.settings) {
        const currentProvider = user.settings.provider || 'anthropic';
        const currentModel = user.settings.model;
        const currentProviders = user.settings.providers || {};
        const currentEndpoint = user.settings.customEndpoint;
        
        // Clear the settings field completely
        user.settings = undefined;
        await user.save();
        
        // Now reconstruct with clean structure
        user.settings = {
          provider: currentProvider,
          model: currentModel,
          customEndpoint: currentEndpoint,
          providers: currentProviders,
        };
        
        // Mark as modified to ensure Mongoose saves it
        user.markModified('settings');
        await user.save();
        
        console.log('Cleanup - Settings after cleanup:', user.settings);
      } else {
        // Initialize with defaults if no settings exist
        user.settings = {
          provider: 'anthropic',
          providers: {},
        };
        user.markModified('settings');
        await user.save();
      }
      
      // Return the cleaned settings
      const response = {
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
      
      return NextResponse.json({ 
        success: true, 
        message: 'Settings cleaned up successfully',
        settings: response,
      });
    } catch (error) {
      console.error('Error cleaning up settings:', error);
      return NextResponse.json(
        { error: 'Failed to clean up settings' },
        { status: 500 }
      );
    }
  });
}