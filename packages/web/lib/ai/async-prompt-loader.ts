import { SandboxClient } from '@codesandbox/sdk/browser';
import { getCodeSandboxService } from '@/lib/sandbox/codesandbox-service';
import { getCoreSystemPrompt } from '@catalyst/core';
import { SANDBOX_REPO_PATH } from '../constants/sandbox-paths';

export interface SystemPromptConfig {
  customPromptPath?: string;
  userMemory?: string;
  modelMappings?: Array<{
    baseUrls?: string[];
    modelNames?: string[];
    template?: string;
  }>;
}

/**
 * Async prompt loader for remote sandbox environments
 * Loads system prompts from sandbox filesystem or uses defaults
 */
export class AsyncPromptLoader {
  private projectId: string;
  private clientPromise: Promise<SandboxClient>;
  private cachedPrompts: Map<string, string> = new Map();

  constructor(projectId: string) {
    this.projectId = projectId;
    this.clientPromise = this.initializeClient();
  }

  private async initializeClient(): Promise<SandboxClient> {
    const service = getCodeSandboxService();
    const { client } = await service.getSandboxForProject(this.projectId);
    return client;
  }

  /**
   * Load system prompt - tries custom path first, falls back to default
   */
  async loadSystemPrompt(config?: SystemPromptConfig): Promise<string> {
    const customPath = config?.customPromptPath;

    // Check cache first
    if (customPath && this.cachedPrompts.has(customPath)) {
      return this.cachedPrompts.get(customPath)!;
    }

    // Try to load custom prompt from sandbox
    if (customPath) {
      try {
        const client = await this.clientPromise;
        const content = await client.fs.readTextFile(customPath);

        // Cache the loaded prompt
        this.cachedPrompts.set(customPath, content);

        // Add user memory if provided
        if (config.userMemory) {
          return `${content}\n\n---\n\n${config.userMemory}`;
        }

        return content;
      } catch (error) {
        console.warn(
          `Failed to load custom prompt from ${customPath}, using default:`,
          error,
        );
      }
    }

    // Fall back to default prompt
    return this.getDefaultPrompt(config);
  }

  /**
   * Get the default system prompt
   */
  private getDefaultPrompt(config?: SystemPromptConfig): string {
    // Use the core system prompt generator with remote-specific modifications
    const basePrompt = getCoreSystemPrompt(config?.userMemory, {
      systemPromptMappings: config?.modelMappings,
    });

    // Add remote-specific context
    const remoteContext = `

# Remote Sandbox Environment
You are operating in a remote CodeSandbox environment. File system operations are performed through the sandbox client API. 
All paths are relative to the sandbox root at ${SANDBOX_REPO_PATH}.

- File operations are asynchronous and may have network latency
- The sandbox environment is isolated and secure
- You have access to the full project directory structure within the sandbox
- Terminal commands execute within the sandbox container
`;

    return basePrompt + remoteContext;
  }

  /**
   * Save a custom prompt to the sandbox
   */
  async saveCustomPrompt(path: string, content: string): Promise<void> {
    const client = await this.clientPromise;

    // Ensure directory exists
    const dir = path.substring(0, path.lastIndexOf('/'));
    if (dir) {
      try {
        await client.fs.mkdir(dir, true);
      } catch {
        // Directory might already exist
      }
    }

    // Save the prompt
    await client.fs.writeTextFile(path, content);

    // Update cache
    this.cachedPrompts.set(path, content);
  }

  /**
   * List available prompt files in the sandbox
   */
  async listPromptFiles(directory: string = '.prompts'): Promise<string[]> {
    const client = await this.clientPromise;
    const files: string[] = [];

    try {
      const entries = await client.fs.readdir(directory);

      for (const entry of entries) {
        if (entry.name.endsWith('.md') || entry.name.endsWith('.txt')) {
          files.push(`${directory}/${entry.name}`);
        }
      }
    } catch {
      // Directory doesn't exist or can't be read
      return [];
    }

    return files;
  }

  /**
   * Clear the prompt cache
   */
  clearCache(): void {
    this.cachedPrompts.clear();
  }

  /**
   * Check if a prompt file exists in the sandbox
   */
  async promptExists(path: string): Promise<boolean> {
    try {
      const client = await this.clientPromise;
      await client.fs.stat(path);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete a custom prompt from the sandbox
   */
  async deleteCustomPrompt(path: string): Promise<void> {
    const client = await this.clientPromise;

    try {
      await client.fs.remove(path);

      // Remove from cache
      this.cachedPrompts.delete(path);
    } catch (error) {
      console.error(`Failed to delete prompt at ${path}:`, error);
      throw error;
    }
  }
}
