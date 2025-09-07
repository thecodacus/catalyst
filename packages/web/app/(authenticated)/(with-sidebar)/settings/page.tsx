'use client';

import { useState, useEffect } from 'react';
import { Save, Sparkles, Key, Check, AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

interface AIProvider {
  id: string;
  name: string;
  description: string;
  requiresApiKey: boolean;
  requiresModel: boolean;
  requiresEndpoint?: boolean;
  defaultModel?: string;
  models?: string[];
}

const AI_PROVIDERS: AIProvider[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT-4, GPT-3.5 and other OpenAI models',
    requiresApiKey: true,
    requiresModel: true,
    defaultModel: 'gpt-4-turbo-preview',
    models: ['gpt-4-turbo-preview', 'gpt-4', 'gpt-3.5-turbo', 'gpt-5'],
  },
  {
    id: 'anthropic',
    name: 'Anthropic Claude',
    description: 'Claude 3 Opus, Sonnet, and Haiku models',
    requiresApiKey: true,
    requiresModel: true,
    defaultModel: 'claude-3-5-sonnet-latest',
    models: [
      'claude-3-5-sonnet-latest',
      'claude-3-5-haiku-latest',
      'claude-3-opus-latest',
    ],
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    description: 'Access 100+ LLMs with one API',
    requiresApiKey: true,
    requiresModel: true,
    defaultModel: 'openai/gpt-4-turbo-preview',
    models: [
      'openai/gpt-4-turbo-preview',
      'anthropic/claude-3-opus',
      'anthropic/claude-3-sonnet',
      'google/gemini-pro',
      'meta-llama/llama-2-70b-chat',
      'mistralai/mixtral-8x7b-instruct',
    ],
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    description: "Google's Gemini Pro models",
    requiresApiKey: true,
    requiresModel: false,
  },
  {
    id: 'custom',
    name: 'Custom OpenAI-compatible',
    description: 'Any OpenAI-compatible API endpoint',
    requiresApiKey: true,
    requiresModel: true,
    requiresEndpoint: true,
  },
];

interface ProviderSettings {
  apiKey: string;
  model?: string;
  endpoint?: string;
  isConfigured?: boolean;
}

export default function SettingsPage() {
  const router = useRouter();
  const [activeProvider, setActiveProvider] = useState<string>('anthropic');
  const [providerSettings, setProviderSettings] = useState<
    Record<string, ProviderSettings>
  >({});
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<
    Record<string, boolean>
  >({});

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const response = await fetch('/api/settings');
      if (response.ok) {
        const data = await response.json();
        console.log('Settings loaded:', data);
        setActiveProvider(data.provider || 'anthropic');

        // Initialize provider settings
        const settings: Record<string, ProviderSettings> = {};
        AI_PROVIDERS.forEach((provider) => {
          const providerData = data.providers?.[provider.id];
          console.log(`Provider ${provider.id} data:`, providerData);
          settings[provider.id] = {
            apiKey: '', // Don't show actual keys
            model:
              providerData?.model || data.model || provider.defaultModel || '',
            endpoint: providerData?.endpoint || data.customEndpoint || '',
            isConfigured: !!providerData?.apiKey,
          };
        });

        setProviderSettings(settings);
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleProviderSettingChange = (
    providerId: string,
    field: keyof ProviderSettings,
    value: string,
  ) => {
    setProviderSettings((prev) => ({
      ...prev,
      [providerId]: {
        ...prev[providerId],
        [field]: value,
      },
    }));
    setHasUnsavedChanges((prev) => ({ ...prev, [providerId]: true }));
  };

  const handleSaveProvider = async (providerId: string) => {
    try {
      setIsSaving(true);

      const settings = providerSettings[providerId];
      const provider = AI_PROVIDERS.find((p) => p.id === providerId);

      const payload: any = {
        provider: activeProvider,
        [`${providerId}_apiKey`]: settings.apiKey,
        [`${providerId}_model`]: settings.model,
      };

      if (providerId === 'custom' && settings.endpoint) {
        payload.customEndpoint = settings.endpoint;
      }

      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error('Failed to save settings');
      }

      // Reload settings to get the updated configuration status from the server
      await loadSettings();

      setHasUnsavedChanges((prev) => ({ ...prev, [providerId]: false }));
      toast.success(`${provider?.name} settings saved successfully!`);

      // If this is the active provider, refresh the page to update AI model selector
      if (providerId === activeProvider) {
        router.refresh();
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
      toast.error('Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSetActive = async (providerId: string) => {
    try {
      console.log('Setting active provider to:', providerId);
      console.log('Provider settings:', providerSettings[providerId]);
      
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: providerId,
          model: providerSettings[providerId]?.model,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update active provider');
      }

      setActiveProvider(providerId);
      toast.success(
        `Switched to ${AI_PROVIDERS.find((p) => p.id === providerId)?.name}`,
      );
      
      // Refresh to ensure all components get the updated provider
      router.refresh();
    } catch (error) {
      console.error('Failed to update active provider:', error);
      toast.error('Failed to update active provider');
    }
  };

  const handleCleanupSettings = async () => {
    try {
      const response = await fetch('/api/settings/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw new Error('Failed to clean up settings');
      }

      const data = await response.json();
      
      // Reload settings after cleanup
      await loadSettings();
      
      toast.success('Settings cleaned up successfully!');
      
      // Refresh the page to ensure all components are in sync
      router.refresh();
    } catch (error) {
      console.error('Failed to clean up settings:', error);
      toast.error('Failed to clean up settings');
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="container max-w-5xl py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          Configure your AI providers and preferences
        </p>
      </div>

      {/* AI Provider Settings */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-indigo-600" />
                AI Providers
              </CardTitle>
              <CardDescription>
                Configure multiple AI providers and switch between them
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCleanupSettings}
              title="Clean up settings if you're experiencing issues"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Clean Up Settings
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue={AI_PROVIDERS[0].id} className="w-full">
            <TabsList className="grid w-full grid-cols-5">
              {AI_PROVIDERS.map((provider) => (
                <TabsTrigger
                  key={provider.id}
                  value={provider.id}
                  className="relative"
                >
                  <span className="flex items-center gap-1">
                    {provider.name}
                    {providerSettings[provider.id]?.isConfigured && (
                      <Check className="h-3 w-3 text-green-600" />
                    )}
                    {activeProvider === provider.id && (
                      <Badge
                        variant="secondary"
                        className="ml-1 px-1 py-0 text-xs"
                      >
                        Active
                      </Badge>
                    )}
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>

            {AI_PROVIDERS.map((provider) => {
              const settings = providerSettings[provider.id] || {};
              const hasChanges = hasUnsavedChanges[provider.id];

              return (
                <TabsContent
                  key={provider.id}
                  value={provider.id}
                  className="space-y-6 mt-6"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-lg font-semibold">{provider.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {provider.description}
                      </p>
                    </div>
                    {settings.isConfigured &&
                      activeProvider !== provider.id && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSetActive(provider.id)}
                        >
                          Set as Active
                        </Button>
                      )}
                  </div>

                  {/* API Key */}
                  {provider.requiresApiKey && (
                    <div className="space-y-2">
                      <Label
                        htmlFor={`${provider.id}-apiKey`}
                        className="flex items-center gap-2"
                      >
                        <Key className="h-4 w-4" />
                        API Key
                        {settings.isConfigured && (
                          <Badge variant="secondary" className="text-xs">
                            Configured
                          </Badge>
                        )}
                      </Label>
                      <Input
                        id={`${provider.id}-apiKey`}
                        type="password"
                        placeholder={
                          settings.isConfigured
                            ? 'Enter new API key to update'
                            : `Enter your ${provider.name} API key`
                        }
                        value={settings.apiKey || ''}
                        onChange={(e) =>
                          handleProviderSettingChange(
                            provider.id,
                            'apiKey',
                            e.target.value,
                          )
                        }
                      />
                      <p className="text-xs text-muted-foreground">
                        Your API key is encrypted and stored securely
                      </p>
                    </div>
                  )}

                  {/* Model Selection */}
                  {provider.requiresModel && (
                    <div className="space-y-2">
                      <Label htmlFor={`${provider.id}-model`}>
                        Default Model
                      </Label>
                      {provider.models ? (
                        <Select
                          value={settings.model || provider.defaultModel}
                          onValueChange={(value) =>
                            handleProviderSettingChange(
                              provider.id,
                              'model',
                              value,
                            )
                          }
                        >
                          <SelectTrigger id={`${provider.id}-model`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {provider.models.map((modelOption) => (
                              <SelectItem key={modelOption} value={modelOption}>
                                {modelOption}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          id={`${provider.id}-model`}
                          placeholder="Enter model name"
                          value={settings.model || ''}
                          onChange={(e) =>
                            handleProviderSettingChange(
                              provider.id,
                              'model',
                              e.target.value,
                            )
                          }
                        />
                      )}
                    </div>
                  )}

                  {/* Custom Endpoint */}
                  {provider.requiresEndpoint && (
                    <div className="space-y-2">
                      <Label htmlFor={`${provider.id}-endpoint`}>
                        API Endpoint
                      </Label>
                      <Input
                        id={`${provider.id}-endpoint`}
                        type="url"
                        placeholder="https://your-api.com/v1"
                        value={settings.endpoint || ''}
                        onChange={(e) =>
                          handleProviderSettingChange(
                            provider.id,
                            'endpoint',
                            e.target.value,
                          )
                        }
                      />
                      <p className="text-xs text-muted-foreground">
                        Must be OpenAI-compatible API endpoint
                      </p>
                    </div>
                  )}

                  {/* Save Button */}
                  <div className="flex items-center justify-between pt-4">
                    <div className="flex items-center gap-2 text-sm">
                      {!settings.isConfigured && (
                        <div className="flex items-center gap-1 text-orange-600">
                          <AlertCircle className="h-4 w-4" />
                          Not configured
                        </div>
                      )}
                      {hasChanges && (
                        <div className="text-muted-foreground">
                          Unsaved changes
                        </div>
                      )}
                    </div>
                    <Button
                      onClick={() => handleSaveProvider(provider.id)}
                      disabled={
                        isSaving || (!settings.apiKey && !settings.isConfigured)
                      }
                      size="sm"
                    >
                      {isSaving ? (
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      ) : (
                        <>
                          <Save className="h-4 w-4 mr-2" />
                          Save {provider.name} Settings
                        </>
                      )}
                    </Button>
                  </div>
                </TabsContent>
              );
            })}
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
