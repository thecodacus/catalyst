import { SandboxClient } from '@codesandbox/sdk/browser';
import { getCodeSandboxService } from '@/lib/sandbox/codesandbox-service';

export interface LogEntry {
  timestamp: number;
  type: string;
  data: any;
  sessionId?: string;
}

/**
 * Async logger for remote sandbox environments
 * Stores logs in memory with optional persistence to sandbox
 */
export class AsyncRemoteLogger {
  private logs: LogEntry[] = [];
  private projectId: string;
  private sessionId: string;
  private clientPromise?: Promise<SandboxClient>;
  private persistToFile: boolean;
  private logFilePath: string = '.logs/session.json';

  constructor(projectId: string, sessionId: string, persistToFile: boolean = false) {
    this.projectId = projectId;
    this.sessionId = sessionId;
    this.persistToFile = persistToFile;
  }

  async initialize(): Promise<void> {
    if (this.persistToFile && !this.clientPromise) {
      this.clientPromise = this.initializeClient();
      
      // Try to load existing logs
      try {
        const client = await this.clientPromise;
        const existingLogs = await client.fs.readTextFile(this.logFilePath);
        this.logs = JSON.parse(existingLogs);
      } catch {
        // No existing logs or file doesn't exist, start fresh
        this.logs = [];
      }
    }
  }

  private async initializeClient(): Promise<SandboxClient> {
    const service = getCodeSandboxService();
    const { client } = await service.getSandboxForProject(this.projectId);
    return client;
  }

  async log(entry: Omit<LogEntry, 'timestamp' | 'sessionId'>): Promise<void> {
    const fullEntry: LogEntry = {
      ...entry,
      timestamp: Date.now(),
      sessionId: this.sessionId,
    };
    
    this.logs.push(fullEntry);
    
    // Persist to sandbox if enabled
    if (this.persistToFile && this.clientPromise) {
      try {
        const client = await this.clientPromise;
        
        // Ensure directory exists
        const dir = this.logFilePath.substring(0, this.logFilePath.lastIndexOf('/'));
        if (dir) {
          try {
            await client.fs.mkdir(dir, true);
          } catch {
            // Directory might already exist
          }
        }
        
        // Write logs to file
        await client.fs.writeTextFile(
          this.logFilePath,
          JSON.stringify(this.logs, null, 2)
        );
      } catch (error) {
        console.error('Failed to persist logs to sandbox:', error);
        // Continue anyway - logging shouldn't break the application
      }
    }
  }

  async getLogs(): Promise<LogEntry[]> {
    return [...this.logs];
  }

  async getSessionLogs(sessionId?: string): Promise<LogEntry[]> {
    const targetSession = sessionId || this.sessionId;
    return this.logs.filter(log => log.sessionId === targetSession);
  }

  async checkpoint(tag: string, data: any): Promise<void> {
    await this.log({
      type: 'checkpoint',
      data: { tag, ...data }
    });
  }

  async saveCheckpoint(tag: string, conversation: any[]): Promise<void> {
    if (!this.clientPromise) return;

    try {
      const client = await this.clientPromise;
      const checkpointPath = `.checkpoints/checkpoint-${tag}.json`;
      
      // Ensure directory exists
      try {
        await client.fs.mkdir('.checkpoints', true);
      } catch {
        // Directory might already exist
      }
      
      // Save checkpoint
      await client.fs.writeTextFile(
        checkpointPath,
        JSON.stringify(conversation, null, 2)
      );
      
      // Log the checkpoint save
      await this.log({
        type: 'checkpoint_saved',
        data: { tag, path: checkpointPath }
      });
    } catch (error) {
      console.error('Failed to save checkpoint:', error);
      throw error;
    }
  }

  async loadCheckpoint(tag: string): Promise<any[]> {
    if (!this.clientPromise) return [];

    try {
      const client = await this.clientPromise;
      const checkpointPath = `.checkpoints/checkpoint-${tag}.json`;
      
      const content = await client.fs.readTextFile(checkpointPath);
      return JSON.parse(content);
    } catch (error) {
      console.error('Failed to load checkpoint:', error);
      return [];
    }
  }

  async checkpointExists(tag: string): Promise<boolean> {
    if (!this.clientPromise) return false;

    try {
      const client = await this.clientPromise;
      const checkpointPath = `.checkpoints/checkpoint-${tag}.json`;
      
      await client.fs.stat(checkpointPath);
      return true;
    } catch {
      return false;
    }
  }

  async deleteCheckpoint(tag: string): Promise<boolean> {
    if (!this.clientPromise) return false;

    try {
      const client = await this.clientPromise;
      const checkpointPath = `.checkpoints/checkpoint-${tag}.json`;
      
      await client.fs.remove(checkpointPath);
      
      // Log the deletion
      await this.log({
        type: 'checkpoint_deleted',
        data: { tag, path: checkpointPath }
      });
      
      return true;
    } catch (error) {
      console.error('Failed to delete checkpoint:', error);
      return false;
    }
  }

  // Clear logs from memory
  clearLogs(): void {
    this.logs = [];
  }

  // Get logs filtered by type
  async getLogsByType(type: string): Promise<LogEntry[]> {
    return this.logs.filter(log => log.type === type);
  }

  // Get logs within a time range
  async getLogsInTimeRange(startTime: number, endTime: number): Promise<LogEntry[]> {
    return this.logs.filter(
      log => log.timestamp >= startTime && log.timestamp <= endTime
    );
  }
}