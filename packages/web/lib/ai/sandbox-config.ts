import { Config, ConfigParameters, WorkspaceContext } from '@catalyst/core';
import * as path from 'path';
import { SANDBOX_REPO_PATH } from '@/lib/constants/sandbox-paths';

/**
 * Mock WorkspaceContext for CodeSandbox environments
 * This bypasses filesystem checks and works with virtual sandbox paths
 */
class SandboxWorkspaceContext implements WorkspaceContext {
  private directories: Set<string>;
  private initialDirectories: Set<string>;

  constructor(initialDirectory: string, additionalDirectories: string[] = []) {
    this.directories = new Set<string>();
    this.initialDirectories = new Set<string>();

    // Add directories without filesystem validation
    this.addDirectory(initialDirectory);
    this.initialDirectories.add(initialDirectory);

    for (const dir of additionalDirectories) {
      this.addDirectory(dir);
      this.initialDirectories.add(dir);
    }
  }

  addDirectory(
    directory: string,
    basePath: string = '/project/workspace',
  ): void {
    const absolutePath = path.posix.isAbsolute(directory)
      ? directory
      : path.posix.join(basePath, directory);

    this.directories.add(absolutePath);
  }

  hasDirectory(directory: string): boolean {
    const normalizedPath = path.posix.normalize(directory);
    return Array.from(this.directories).some(
      (dir) => normalizedPath === dir || normalizedPath.startsWith(dir + '/'),
    );
  }

  getDirectories(): readonly string[] {
    return Array.from(this.directories);
  }

  getInitialDirectories(): readonly string[] {
    return Array.from(this.initialDirectories);
  }

  setDirectories(directories: readonly string[]): void {
    this.directories.clear();
    for (const dir of directories) {
      this.addDirectory(dir);
    }
  }

  isPathWithinWorkspace(pathToCheck: string): boolean {
    // In sandbox environment, all paths within /project/workspace are valid
    const normalizedPath = path.posix.normalize(pathToCheck);
    return normalizedPath.startsWith('/project/workspace');
  }
}

/**
 * Custom Config class for sandboxed environments
 * Works entirely with CodeSandbox VM paths without local filesystem access
 */
export class SandboxConfig extends Config {
  private sandboxWorkspaceContext: SandboxWorkspaceContext;
  private sandboxId: string;
  private sandboxPath: string;

  constructor(params: ConfigParameters & { sandboxId?: string }) {
    // Store sandbox configuration - now using repo subdirectory
    const sandboxPath = params.targetDir || SANDBOX_REPO_PATH;
    const sandboxId = params.sandboxId || `sandbox-${Date.now()}`;

    // Create a sandbox workspace context that doesn't validate filesystem
    const sandboxWorkspaceContext = new SandboxWorkspaceContext(
      sandboxPath,
      params.includeDirectories ?? [],
    );

    // Call parent constructor with current working directory to avoid validation errors
    // We'll override the workspace context afterward
    super({
      ...params,
      targetDir: process.cwd(),
      cwd: process.cwd(),
    });

    // Override with sandbox-specific properties
    this.sandboxPath = sandboxPath;
    this.sandboxWorkspaceContext = sandboxWorkspaceContext;
    this.sandboxId = sandboxId;

    // Replace the workspace context with our sandbox version
    const configWithWorkspace = this as unknown as {
      workspaceContext: SandboxWorkspaceContext;
    };
    configWithWorkspace.workspaceContext = this.sandboxWorkspaceContext;
    // Also override the targetDir to use sandbox path
    const configWithTargetDir = this as unknown as { targetDir: string };
    configWithTargetDir.targetDir = this.sandboxPath;
  }

  // Override to return sandbox workspace context
  override getWorkspaceContext(): WorkspaceContext {
    return this.sandboxWorkspaceContext;
  }

  // Override to return sandbox target directory
  override getTargetDir(): string {
    return this.sandboxPath;
  }

  // Override to return sandbox project root
  override getProjectRoot(): string {
    return this.sandboxPath;
  }

  // Custom method to get sandbox ID
  getSandboxId(): string {
    return this.sandboxId;
  }
}
