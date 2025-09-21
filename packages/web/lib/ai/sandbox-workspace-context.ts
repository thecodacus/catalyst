import * as path from 'path';
import { SandboxClient } from '@codesandbox/sdk/browser';
import { getCodeSandboxService } from '@/lib/sandbox/codesandbox-service';

/**
 * Async version of WorkspaceContext for CodeSandbox environments
 * All file system operations are performed through the sandbox client
 */
export class AsyncSandboxWorkspaceContext {
  private directories: Set<string>;
  private initialDirectories: Set<string>;
  private projectId: string;
  private clientPromise: Promise<SandboxClient>;

  constructor(
    initialDirectory: string,
    additionalDirectories: string[] = [],
    projectId: string,
  ) {
    this.directories = new Set<string>([initialDirectory, ...additionalDirectories]);
    this.initialDirectories = new Set<string>([initialDirectory, ...additionalDirectories]);
    this.projectId = projectId;
    
    // Lazy load the client
    this.clientPromise = this.initializeClient();
  }

  private async initializeClient(): Promise<SandboxClient> {
    const service = getCodeSandboxService();
    const { client } = await service.getSandboxForProject(this.projectId);
    return client;
  }

  async addDirectory(directory: string, basePath: string = '/'): Promise<void> {
    const client = await this.clientPromise;
    const absolutePath = path.isAbsolute(directory)
      ? directory
      : path.resolve(basePath, directory);

    try {
      const stats = await client.fs.stat(absolutePath);
      if (stats.type === 'directory') {
        this.directories.add(absolutePath);
      } else {
        throw new Error(`Path is not a directory: ${absolutePath}`);
      }
    } catch (error) {
      throw new Error(`Directory does not exist or cannot be accessed: ${absolutePath}`);
    }
  }

  async getDirectories(): Promise<readonly string[]> {
    const client = await this.clientPromise;
    const validDirectories: string[] = [];

    for (const dir of this.directories) {
      try {
        const stats = await client.fs.stat(dir);
        if (stats.type === 'directory') {
          validDirectories.push(dir);
        }
      } catch {
        // Directory doesn't exist, skip it
      }
    }

    return validDirectories;
  }

  async getInitialDirectories(): Promise<readonly string[]> {
    const client = await this.clientPromise;
    const validDirectories: string[] = [];

    for (const dir of this.initialDirectories) {
      try {
        const stats = await client.fs.stat(dir);
        if (stats.type === 'directory') {
          validDirectories.push(dir);
        }
      } catch {
        // Directory doesn't exist, skip it
      }
    }

    return validDirectories;
  }

  async setDirectories(directories: readonly string[]): Promise<void> {
    const client = await this.clientPromise;
    this.directories.clear();
    
    for (const dir of directories) {
      try {
        const stats = await client.fs.stat(dir);
        if (stats.type === 'directory') {
          this.directories.add(dir);
        }
      } catch {
        // Skip invalid directories
      }
    }
  }

  async isPathWithinWorkspace(pathToCheck: string): Promise<boolean> {
    const client = await this.clientPromise;
    
    try {
      // Check if path exists
      await client.fs.stat(pathToCheck);
      
      const absolutePath = path.resolve(pathToCheck);
      const validDirs = await this.getDirectories();
      
      for (const dir of validDirs) {
        if (this.isPathWithinRoot(absolutePath, dir)) {
          return true;
        }
      }
      
      return false;
    } catch {
      return false;
    }
  }

  private isPathWithinRoot(pathToCheck: string, rootDirectory: string): boolean {
    const relative = path.relative(rootDirectory, pathToCheck);
    return (
      !relative.startsWith(`..${path.sep}`) &&
      relative !== '..' &&
      !path.isAbsolute(relative)
    );
  }
}