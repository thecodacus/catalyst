import { ApprovalMode, Config, ConfigParameters } from '@catalyst/core';
import * as path from 'path';
import { SANDBOX_REPO_PATH } from '@/lib/constants/sandbox-paths';
import { AsyncSandboxWorkspaceContext } from './sandbox-workspace-context';

/**
 * Async Config class for sandboxed environments
 * Works entirely with CodeSandbox VM paths without local filesystem access
 */
export class AsyncSandboxConfig {
  private workspaceContext: AsyncSandboxWorkspaceContext;
  private sandboxId: string;
  private sandboxPath: string;

  // Store config properties that don't need async
  private model: string;
  private approvalMode: ApprovalMode;
  private debugMode: boolean;
  private embeddingModel?: string;
  private sessionId: string;
  private userMemory: string;

  constructor(
    params: ConfigParameters & { sandboxId?: string; projectId: string },
  ) {
    this.sandboxPath = params.targetDir || SANDBOX_REPO_PATH;
    this.sandboxId = params.sandboxId || `sandbox-${Date.now()}`;

    // Initialize non-async properties from ConfigParameters
    this.model = params.model;
    this.approvalMode = params.approvalMode || ApprovalMode.AUTO_EDIT;
    this.debugMode = params.debugMode || false;
    this.embeddingModel = params.embeddingModel;
    this.sessionId = params.sessionId;
    this.userMemory = params.userMemory || '';

    // Create async workspace context
    this.workspaceContext = new AsyncSandboxWorkspaceContext(
      this.sandboxPath,
      params.includeDirectories ?? [],
      params.projectId,
    );
  }

  // Async version of workspace context getter
  async getWorkspaceContext(): Promise<AsyncSandboxWorkspaceContext> {
    return this.workspaceContext;
  }

  // Non-async getters that don't require file system
  getTargetDir(): string {
    return this.sandboxPath;
  }

  getProjectRoot(): string {
    return this.sandboxPath;
  }

  getSandboxId(): string {
    return this.sandboxId;
  }

  getModel(): string {
    return this.model;
  }

  getApprovalMode(): ApprovalMode {
    return this.approvalMode;
  }

  getDebugMode(): boolean {
    return this.debugMode;
  }

  getCwd(): string {
    return this.sandboxPath;
  }

  getDebugLogPath(): string | undefined {
    return undefined; // No local file system logging
  }

  getEmbeddingModel(): string | undefined {
    return this.embeddingModel;
  }

  getSessionId(): string {
    return this.sessionId;
  }

  getUserMemory(): string {
    return this.userMemory;
  }

  // For compatibility with tools that expect a sync Config instance
  // Returns a partial config object with non-async properties
  getSyncConfig(): Partial<Config> {
    return {
      getModel: () => this.model,
      getTargetDir: () => this.sandboxPath,
      getProjectRoot: () => this.sandboxPath,
      getCwd: () => this.sandboxPath,
      getDebugMode: () => this.debugMode,
      getApprovalMode: () => this.approvalMode as any,
      getSessionId: () => this.sessionId,
      getUserMemory: () => this.userMemory,
      getEmbeddingModel: () => this.embeddingModel,
    } as Partial<Config>;
  }
}

/**
 * Legacy SandboxConfig for backward compatibility
 * @deprecated Use AsyncSandboxConfig instead
 */
export class SandboxConfig extends Config {
  private sandboxWorkspaceContext?: AsyncSandboxWorkspaceContext;
  private sandboxId: string;
  private sandboxPath: string;

  constructor(
    params: ConfigParameters & { sandboxId?: string; projectId?: string },
    getFs?: () => Promise<any>,
    cwd?: string,
  ) {
    const sandboxPath = params.targetDir || SANDBOX_REPO_PATH;
    const sandboxId = params.sandboxId || `sandbox-${Date.now()}`;

    // Call parent constructor with current working directory to avoid validation errors
    super({
      ...params,
      targetDir: cwd || process.cwd(),
      cwd: cwd || process.cwd(),
    });

    this.sandboxPath = sandboxPath;
    this.sandboxId = sandboxId;

    // Create async workspace context if projectId provided
    if (params.projectId) {
      this.sandboxWorkspaceContext = new AsyncSandboxWorkspaceContext(
        sandboxPath,
        params.includeDirectories ?? [],
        params.projectId,
      );
    }

    // Override the targetDir to use sandbox path
    const configWithTargetDir = this as unknown as { targetDir: string };
    configWithTargetDir.targetDir = this.sandboxPath;
  }

  override getTargetDir(): string {
    return this.sandboxPath;
  }

  override getProjectRoot(): string {
    return this.sandboxPath;
  }

  getSandboxId(): string {
    return this.sandboxId;
  }
}
