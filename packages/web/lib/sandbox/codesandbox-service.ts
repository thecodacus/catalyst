import { CodeSandbox, VMTier } from '@codesandbox/sdk';
import type { Sandbox, SandboxClient } from '@codesandbox/sdk';
import {
  SANDBOX_REPO_PATH,
  SANDBOX_REPO_RELATIVE,
  SANDBOX_WORKSPACE_PATH,
  toSandboxPath,
} from '@/lib/constants/sandbox-paths';
import { getGitServiceFromEnv } from '@/lib/git/git-service';
import { SandboxSession } from '@/lib/db/schemas/sandbox-session';
import { connectMongoose } from '@/lib/db/mongodb';

export interface CodeSandboxConfig {
  apiKey: string;
  templateId?: string;
}

export interface SandboxSession {
  sandboxId: string;
  projectId: string;
  createdAt: Date;
  lastAccessedAt: Date;
}

export class CodeSandboxService {
  private sdk: CodeSandbox;
  private sandboxes: Map<string, { sandbox: Sandbox; client?: SandboxClient }> =
    new Map();
  private sessions: Map<string, SandboxSession> = new Map();

  constructor(private config: CodeSandboxConfig) {
    this.sdk = new CodeSandbox(config.apiKey);
  }

  /**
   * Create or get existing sandbox for a project
   */
  async getSandboxForProject(
    projectId: string,
    gitConfig?: {
      email: string;
      name: string;
      accessToken?: string;
      provider?: string;
      repoUrl?: string;
    },
  ): Promise<{ sandbox: Sandbox; client: SandboxClient }> {
    // Use environment Git config if not provided
    if (!gitConfig) {
      const gitService = getGitServiceFromEnv();
      if (
        gitService &&
        process.env.GITHUB_TOKEN &&
        process.env.GITHUB_USERNAME &&
        process.env.GITHUB_EMAIL
      ) {
        gitConfig = {
          email: process.env.GITHUB_EMAIL,
          name: process.env.GITHUB_USERNAME,
          accessToken: process.env.GITHUB_TOKEN,
          provider: 'github.com',
        };
      }
    }

    // Ensure MongoDB connection
    await connectMongoose();

    // Check if we already have a sandbox client in memory
    const existing = this.sandboxes.get(projectId);
    if (existing?.client) {
      await this.updateLastAccessed(projectId);
      return { sandbox: existing.sandbox, client: existing.client };
    }

    // Check for existing session in database
    const dbSession = await SandboxSession.findOne({
      projectId,
      status: { $ne: 'terminated' },
    });

    if (dbSession) {
      try {
        console.log(
          `🔄 Resuming sandbox ${dbSession.sandboxId} for project ${projectId} (status: ${dbSession.status})`,
        );

        // Get sandbox info from CodeSandbox
        const sandboxInfo = await this.sdk.sandboxes.get(dbSession.sandboxId);
        console.log(`Sandbox status: ${sandboxInfo.status}`);

        // Resume or wake up the sandbox if needed
        const sandbox = await this.sdk.sandboxes.resume(dbSession.sandboxId);

        // Connect with git config if provided
        // Use a shorter session ID (CodeSandbox limits to 20 chars)
        const sessionId = projectId.substring(0, 20);
        const client = gitConfig
          ? await sandbox.connect({
              id: sessionId,
              git: {
                email: gitConfig.email,
                name: gitConfig.name,
                accessToken: gitConfig.accessToken,
                provider: gitConfig.provider,
              },
            })
          : await sandbox.connect({ id: sessionId });

        // Update session status and cache
        await SandboxSession.findByIdAndUpdate(dbSession._id, {
          status: 'active',
          lastAccessedAt: new Date(),
        });

        this.sandboxes.set(projectId, { sandbox, client });
        this.sessions.set(projectId, {
          sandboxId: sandbox.id,
          projectId,
          createdAt: dbSession.createdAt,
          lastAccessedAt: new Date(),
        });

        return { sandbox, client };
      } catch (error) {
        console.error('Failed to resume sandbox:', error);
        // Mark session as terminated if resume fails
        await SandboxSession.findByIdAndUpdate(dbSession._id, {
          status: 'terminated',
        });
        // Fall through to create new sandbox
      }
    } else {
      console.log(
        `🔄 No existing session found for project ${projectId}, creating new sandbox`,
      );
    }

    // Create new sandbox
    console.log(`🚀 Creating new sandbox for project ${projectId}`);
    const sandbox = await this.sdk.sandboxes.create({
      id: this.config.templateId, // Use 'id' instead of 'template'
      title: `Project ${projectId}`,
      privacy: 'private', // Keep sandboxes private by default
      vmTier: VMTier.Pico, // Use Pico tier for now
      hibernationTimeoutSeconds: 500, // 30 minutes
      automaticWakeupConfig: {
        http: true,
        websocket: true,
      },
    });

    // Connect with git config if provided
    // Use a shorter session ID (CodeSandbox limits to 20 chars)
    const sessionId = projectId.substring(0, 20);
    const client = gitConfig
      ? await sandbox.connect({
          id: sessionId,
          git: {
            email: gitConfig.email,
            name: gitConfig.name,
            accessToken: gitConfig.accessToken,
            provider: gitConfig.provider,
          },
        })
      : await sandbox.connect({ id: sessionId });

    // Store the sandbox and session
    this.sandboxes.set(projectId, { sandbox, client });
    this.sessions.set(projectId, {
      sandboxId: sandbox.id,
      projectId,
      createdAt: new Date(),
      lastAccessedAt: new Date(),
    });

    // Save session to database
    await SandboxSession.create({
      projectId,
      sandboxId: sandbox.id,
      status: 'active',
      vmTier: VMTier.Pico,
      metadata: {
        title: `Project ${projectId}`,
        templateId: this.config.templateId,
      },
    });

    console.log(
      `✅ Saved sandbox session to database for project ${projectId}`,
    );

    // Initialize the sandbox with a basic structure
    await this.initializeSandbox(client, gitConfig?.repoUrl, gitConfig);

    return { sandbox, client };
  }

  /**
   * Initialize sandbox with basic project structure
   */
  private async initializeSandbox(
    client: SandboxClient,
    repoUrl?: string,
    gitConfig?: { repoUrl?: string },
  ): Promise<void> {
    try {
      if (repoUrl) {
        // Clone existing repository
        console.log(`📦 Cloning repository: ${repoUrl}`);

        try {
          // Check if there's already a git repo in the workspace
          const gitCheckWorkspace = await client.commands.run(
            `git status 2>&1 || echo "NO_GIT"`,
            {
              cwd: SANDBOX_WORKSPACE_PATH,
            },
          );
          console.log('Git status in workspace:', gitCheckWorkspace);

          // Clone into 'repo' subdirectory
          const cloneResult = await client.commands.run(
            `git submodule add ${repoUrl} repo && git commit -m "Add child repo as submodule"`,
            {
              cwd: SANDBOX_WORKSPACE_PATH,
            },
          );
          console.log('Clone result:', cloneResult);

          // Check if clone was successful
          const checkResult = await client.commands.run(`ls -la`, {
            cwd: SANDBOX_REPO_PATH,
          });
          console.log('Repo contents:', checkResult);

          // Also check git status in repo directory
          const gitCheckRepo = await client.commands.run(`git status 2>&1`, {
            cwd: SANDBOX_REPO_PATH,
          });
          console.log('Git status in repo:', gitCheckRepo);

          console.log(
            `✅ Repository cloned successfully to ${SANDBOX_REPO_PATH}`,
          );
        } catch (cloneError) {
          console.error('Failed to clone repository:', cloneError);
          // Fall back to creating default structure
          await this.createDefaultStructure(client);
        }
      } else {
        // No repository URL, create default structure
        await this.createDefaultStructure(client);

        // If we have git config but no repo URL (new repo was created), set remote
        if (gitConfig?.repoUrl) {
          try {
            await client.commands.run(
              `cd ${SANDBOX_REPO_PATH} && git remote add origin ${gitConfig.repoUrl}`,
            );
            console.log(`✅ Added remote origin: ${gitConfig.repoUrl}`);
          } catch (error) {
            console.error('Failed to add git remote:', error);
          }
        }
      }
    } catch (error) {
      console.error('Failed to initialize sandbox:', error);
    }
  }

  /**
   * Create default project structure
   */
  private async createDefaultStructure(client: SandboxClient): Promise<void> {
    // Create repo directory
    await client.fs.mkdir('./repo', true);
    await client.fs.mkdir('./repo/src', true);
    await client.fs.mkdir('./repo/tests', true);

    // Create a simple package.json in repo
    const packageJson = {
      name: 'sandbox-project',
      version: '1.0.0',
      description: 'CodeSandbox VM project',
      main: 'src/index.js',
      scripts: {
        start: 'node src/index.js',
        test: 'echo "No tests configured"',
      },
    };

    await client.fs.writeTextFile(
      './repo/package.json',
      JSON.stringify(packageJson, null, 2),
    );

    // Create a simple index.js
    await client.fs.writeTextFile(
      './repo/src/index.js',
      'console.log("Hello from CodeSandbox VM!");',
    );

    // Initialize git repository
    await client.commands.run(`cd ${SANDBOX_REPO_PATH} && git init`);
    await client.commands.run(`cd ${SANDBOX_REPO_PATH} && git add -A`);
    await client.commands.run(
      `cd ${SANDBOX_REPO_PATH} && git commit -m "Initial commit"`,
    );

    console.log(
      `✅ Sandbox initialized with default structure at ${SANDBOX_REPO_PATH}`,
    );
  }

  /**
   * Convert paths to work with sandbox
   */
  private convertToRepoPath(path: string): string {
    return toSandboxPath(path, true);
  }

  /**
   * Execute a command in the sandbox
   */
  async executeCommand(
    projectId: string,
    command: string,
    background: boolean = false,
    onOutput?: (output: string) => void,
  ): Promise<string> {
    const { client } = await this.getSandboxForProject(projectId);

    console.log(`🔧 Executing command in sandbox: ${command}`);

    // Always execute commands from the repo directory
    const fullCommand = `${command}`;

    if (background) {
      const result = await client.commands.runBackground(fullCommand, {
        cwd: SANDBOX_REPO_PATH,
        env: {
          GIT_DIR: `${SANDBOX_REPO_PATH}/.git`,
          GIT_WORK_TREE: `${SANDBOX_REPO_PATH}`,
        },
      });

      return result.status || '';
    } else {
      const command = await client.commands.runBackground(fullCommand, {
        cwd: SANDBOX_REPO_PATH,
        env: {
          GIT_DIR: `${SANDBOX_REPO_PATH}/.git`,
          GIT_WORK_TREE: `${SANDBOX_REPO_PATH}`,
        },
      });
      let listener = command.onOutput((output) => {
        onOutput?.(output);
      });
      let result = await command.waitUntilComplete();
      listener.dispose();
      return result || '';
    }
  }

  /**
   * Read a file from the sandbox
   */
  async readFile(projectId: string, path: string): Promise<string> {
    const { client } = await this.getSandboxForProject(projectId);

    // Convert path to repo path
    const relativePath = this.convertToRepoPath(path);

    try {
      const content = await client.fs.readTextFile(relativePath);
      return content;
    } catch (error) {
      if ((error as Error).message?.includes('ENOENT')) {
        throw new Error(`File not found: ${path}`);
      }
      throw error;
    }
  }

  /**
   * Write a file to the sandbox
   */
  async writeFile(
    projectId: string,
    path: string,
    content: string,
  ): Promise<void> {
    const { client } = await this.getSandboxForProject(projectId);

    // Convert path to repo path
    const relativePath = this.convertToRepoPath(path);

    try {
      await client.fs.writeTextFile(relativePath, content);
    } catch (error) {
      // If directory doesn't exist, create it and retry
      if ((error as Error).message?.includes('ENOENT')) {
        const dir = relativePath.substring(0, relativePath.lastIndexOf('/'));
        if (dir && dir !== '.' && dir !== './') {
          await client.fs.mkdir(dir, true);
          await client.fs.writeTextFile(relativePath, content);
        } else {
          throw error;
        }
      } else {
        throw error;
      }
    }
  }

  /**
   * List directory contents
   */
  async listDirectory(
    projectId: string,
    path: string = '.',
  ): Promise<string[]> {
    const { client } = await this.getSandboxForProject(projectId);

    // Convert path to repo path
    const relativePath = this.convertToRepoPath(path);

    try {
      const entries = await client.fs.readdir(relativePath);

      // Format entries with type prefix (d for directory, f for file)
      const formattedEntries: string[] = [];

      for (const entry of entries) {
        try {
          // Get the full path for this entry
          const entryPath =
            relativePath === './'
              ? entry.name
              : `${relativePath}/${entry.name}`.replace(/\/+/g, '/');

          // Check if it's a directory by trying to list it
          // This is a workaround since the SDK doesn't provide file type info directly
          let isDirectory = false;
          try {
            await client.fs.readdir(entryPath);
            isDirectory = true;
          } catch {
            // If readdir fails, it's likely a file
            isDirectory = false;
          }

          formattedEntries.push(
            isDirectory ? `d ${entry.name}` : `f ${entry.name}`,
          );
        } catch {
          // If we can't determine the type, assume it's a file
          formattedEntries.push(`f ${entry.name}`);
        }
      }

      return formattedEntries;
    } catch (error) {
      if ((error as Error).message?.includes('ENOENT')) {
        return []; // Return empty array for non-existent directories
      }
      throw error;
    }
  }

  /**
   * Hibernate a sandbox to save resources
   */
  async hibernateSandbox(projectId: string): Promise<void> {
    const existing = this.sandboxes.get(projectId);
    if (!existing?.sandbox) return;

    try {
      console.log(`💤 Hibernating sandbox for project ${projectId}`);
      await this.sdk.sandboxes.hibernate(existing.sandbox.id);

      // Update status in database
      await SandboxSession.updateOne(
        { projectId },
        { status: 'hibernated', lastAccessedAt: new Date() },
      );

      // Clear the client connection
      if (existing.client) {
        existing.client = undefined;
      }
    } catch (error) {
      console.error('Failed to hibernate sandbox:', error);
    }
  }

  /**
   * Fork a sandbox
   */
  async forkSandbox(projectId: string, newProjectId: string): Promise<void> {
    const { sandbox } = await this.getSandboxForProject(projectId);

    console.log(`🍴 Forking sandbox from ${projectId} to ${newProjectId}`);
    const forkedSandbox = await sandbox.fork();
    const client = await forkedSandbox.connect();

    this.sandboxes.set(newProjectId, { sandbox: forkedSandbox, client });
    this.sessions.set(newProjectId, {
      sandboxId: forkedSandbox.id,
      projectId: newProjectId,
      createdAt: new Date(),
      lastAccessedAt: new Date(),
    });
  }

  /**
   * Destroy a sandbox
   */
  async destroySandbox(projectId: string): Promise<void> {
    const existing = this.sandboxes.get(projectId);
    if (!existing) return;

    try {
      console.log(`🗑️ Destroying sandbox for project ${projectId}`);

      // Disconnect if connected
      if (existing.client) {
        // Note: disconnect() may not be available, just clear the reference
        existing.client = undefined;
      }

      // Hibernate the sandbox to save state before removing
      await this.sdk.sandboxes.hibernate(existing.sandbox.id);

      // Remove from our maps
      this.sandboxes.delete(projectId);
      this.sessions.delete(projectId);
    } catch (error) {
      console.error('Failed to destroy sandbox:', error);
    }
  }

  /**
   * Get sandbox info
   */
  getSandboxInfo(projectId: string): SandboxSession | undefined {
    return this.sessions.get(projectId);
  }

  /**
   * Get detailed sandbox metadata from CodeSandbox
   */
  async getRemoteSandboxInfo(sandboxId: string) {
    try {
      return await this.sdk.sandboxes.get(sandboxId);
    } catch (error) {
      console.error('Failed to get sandbox info:', error);
      return null;
    }
  }

  /**
   * List all currently running sandboxes
   */
  async listRunningSandboxes() {
    try {
      const runningInfo = await this.sdk.sandboxes.listRunning();
      console.log(
        `🏃 Running VMs: ${runningInfo.concurrentVmCount}/${runningInfo.concurrentVmLimit}`,
      );
      return runningInfo;
    } catch (error) {
      console.error('Failed to list running sandboxes:', error);
      return null;
    }
  }

  /**
   * Get detailed sandbox usage statistics
   */
  async getSandboxStats() {
    await connectMongoose();

    const [dbStats, runningInfo] = await Promise.all([
      SandboxSession.aggregate([
        {
          $facet: {
            byStatus: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
            total: [{ $count: 'count' }],
            oldestActive: [
              { $match: { status: 'active' } },
              { $sort: { lastAccessedAt: 1 } },
              { $limit: 1 },
            ],
            recentlyCreated: [
              { $sort: { createdAt: -1 } },
              { $limit: 5 },
              {
                $project: {
                  projectId: 1,
                  sandboxId: 1,
                  createdAt: 1,
                  status: 1,
                },
              },
            ],
          },
        },
      ]),
      this.listRunningSandboxes(),
    ]);

    const stats = dbStats[0];
    const statusMap = stats.byStatus.reduce((acc: any, item: any) => {
      acc[item._id] = item.count;
      return acc;
    }, {});

    return {
      database: {
        total: stats.total[0]?.count || 0,
        active: statusMap.active || 0,
        hibernated: statusMap.hibernated || 0,
        terminated: statusMap.terminated || 0,
        oldestActive: stats.oldestActive[0],
        recentlyCreated: stats.recentlyCreated,
      },
      codesandbox: runningInfo,
      memory: {
        cached: this.sandboxes.size,
        sessions: this.sessions.size,
      },
    };
  }

  /**
   * Update last accessed time
   */
  private async updateLastAccessed(projectId: string): Promise<void> {
    const session = this.sessions.get(projectId);
    if (session) {
      session.lastAccessedAt = new Date();
      // Also update in database
      await SandboxSession.updateOne(
        { projectId },
        { lastAccessedAt: new Date() },
      );
    }
  }

  /**
   * Clean up inactive sandboxes
   */
  async cleanupInactiveSandboxes(
    maxInactiveMinutes: number = 30,
  ): Promise<void> {
    await connectMongoose();

    const inactiveDate = new Date(Date.now() - maxInactiveMinutes * 60 * 1000);

    // Find active sandboxes that haven't been accessed recently
    const inactiveSessions = await SandboxSession.find({
      status: 'active',
      lastAccessedAt: { $lt: inactiveDate },
    });

    console.log(
      `🧹 Found ${inactiveSessions.length} inactive sandboxes to clean up`,
    );

    for (const session of inactiveSessions) {
      try {
        // Try to hibernate the sandbox
        await this.sdk.sandboxes.hibernate(session.sandboxId);

        // Update status in database
        await SandboxSession.findByIdAndUpdate(session._id, {
          status: 'hibernated',
        });

        // Remove from memory cache
        this.sandboxes.delete(session.projectId);
        this.sessions.delete(session.projectId);

        console.log(
          `💤 Hibernated sandbox ${session.sandboxId} for project ${session.projectId}`,
        );
      } catch (error) {
        console.error(
          `Failed to hibernate sandbox ${session.sandboxId}:`,
          error,
        );
      }
    }

    // Also clean up expired sessions
    const expiredSessions = await SandboxSession.find({
      expiresAt: { $lt: new Date() },
    });

    for (const session of expiredSessions) {
      await SandboxSession.findByIdAndUpdate(session._id, {
        status: 'terminated',
      });
    }

    console.log(
      `🧹 Cleanup complete. Hibernated ${inactiveSessions.length} sandboxes`,
    );
  }

  /**
   * Create a browser session for direct VM connection
   * This allows the frontend to connect directly to the sandbox
   */
  async createBrowserSession(projectId: string): Promise<any> {
    const { sandbox } = await this.getSandboxForProject(projectId);

    console.log(`🌐 Creating browser session for project ${projectId}`);

    // Create a session that the browser can use to connect directly
    // Use a shorter session ID for browser (CodeSandbox limits to 20 chars)
    const browserSessionId = `browser-${projectId.substring(0, 12)}`;
    const session = await sandbox.createSession({
      id: browserSessionId,
    });

    return session;
  }
}

// Singleton instance
let sandboxService: CodeSandboxService | null = null;

export function getCodeSandboxService(): CodeSandboxService {
  if (!sandboxService) {
    const apiKey = process.env.CODESANDBOX_API_KEY;
    if (!apiKey) {
      throw new Error('CODESANDBOX_API_KEY environment variable is required');
    }

    sandboxService = new CodeSandboxService({
      apiKey,
      templateId: process.env.CODESANDBOX_TEMPLATE_ID,
    });
  }

  return sandboxService;
}
