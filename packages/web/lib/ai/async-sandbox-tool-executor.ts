import { ToolCallRequestInfo, ToolCallResponseInfo } from '@catalyst/core';
import { getCodeSandboxService } from '@/lib/sandbox/codesandbox-service';
import { AsyncSandboxConfig } from './sandbox-config';
import { SandboxClient } from '@codesandbox/sdk/browser';

/**
 * Async version of the SandboxToolExecutor that works with remote filesystem
 */
export class AsyncSandboxToolExecutor {
  private projectId: string;
  private outputCallbacks: Map<string, (chunk: string) => void> = new Map();
  private clientPromise: Promise<SandboxClient>;

  constructor(projectId: string, config: AsyncSandboxConfig) {
    this.projectId = projectId;
    // config is passed but not used in this implementation
    this.clientPromise = this.initializeClient();
  }

  private async initializeClient(): Promise<SandboxClient> {
    const service = getCodeSandboxService();
    const { client } = await service.getSandboxForProject(this.projectId);
    return client;
  }

  /**
   * Set output stream callback for a specific tool call
   */
  setOutputStreamCallback(
    callId: string,
    callback: (chunk: string) => void,
  ): void {
    this.outputCallbacks.set(callId, callback);
  }

  /**
   * Execute a tool call
   */
  async executeToolCall(
    toolCall: ToolCallRequestInfo,
  ): Promise<ToolCallResponseInfo> {
    try {
      const client = await this.clientPromise;

      switch (toolCall.name) {
        case 'bash':
        case 'run_bash_command':
        case 'run_shell_command':
          return await this.executeBashCommand(toolCall, client);

        case 'write':
        case 'write_file':
          return await this.writeFile(toolCall, client);

        case 'read':
        case 'read_file':
          return await this.readFile(toolCall, client);

        case 'str_replace':
        case 'str_replace_editor':
          return await this.strReplace(toolCall, client);

        case 'multi_edit':
          return await this.multiEdit(toolCall, client);

        case 'list_files':
        case 'ls':
        case 'list_directory':
          return await this.listFiles(toolCall, client);

        case 'mkdir':
          return await this.makeDirectory(toolCall, client);

        case 'rm':
        case 'remove':
          return await this.removeFile(toolCall, client);

        case 'search_file_content':
        case 'grep':
          return await this.searchFiles(toolCall, client);

        case 'glob':
          return await this.globFiles(toolCall, client);

        default:
          return {
            callId: toolCall.callId,
            responseParts: [{ text: `Unknown tool: ${toolCall.name}` }],
            resultDisplay: undefined,
            error: new Error(`Unknown tool: ${toolCall.name}`),
            errorType: undefined,
          };
      }
    } catch (error) {
      return {
        callId: toolCall.callId,
        responseParts: [
          {
            text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        resultDisplay: undefined,
        error: error instanceof Error ? error : new Error('Unknown error'),
        errorType: undefined,
      };
    }
  }

  /**
   * Execute bash command in sandbox
   */
  private async executeBashCommand(
    toolCall: ToolCallRequestInfo,
    client: SandboxClient,
  ): Promise<ToolCallResponseInfo> {
    const command = toolCall.args.command as string;
    const is_background = (toolCall.args.is_background as boolean) || false;
    const callback = this.outputCallbacks.get(toolCall.callId);

    if (!command) {
      throw new Error('Command is required');
    }

    console.log('🖥️ Async sandbox bash tool - executing:', command);

    try {
      // For background processes, wait 5 seconds then push to background
      if (is_background) {
        console.log(
          '⏳ Starting background process with 5 second initial wait...',
        );

        let outputBuffer = '';
        let initialOutputComplete = false;

        // Set up a promise that resolves after 5 seconds
        const waitPromise = new Promise<void>((resolve) => {
          setTimeout(() => {
            initialOutputComplete = true;
            resolve();
          }, 5000);
        });

        // Start the command with output callback
        const process = await client.commands.runBackground(command);
        const disposable = process.onOutput((chunk: string) => {
          if (!initialOutputComplete) {
            outputBuffer += chunk;
            if (callback) {
              callback(chunk);
            }
          }
        });

        // Wait for 5 seconds to collect initial output
        await waitPromise;

        // Clean up the output listener but keep process running
        disposable.dispose();

        console.log('✅ Background process started, initial output collected');

        return {
          callId: toolCall.callId,
          responseParts: [
            {
              text:
                outputBuffer ||
                'Background process started successfully\n\nProcess is now running in background.',
            },
          ],
          resultDisplay: outputBuffer || 'Background process started',
          error: undefined,
          errorType: undefined,
        };
      }

      // For non-background processes, wait for completion
      let output = '';
      const process = await client.commands.runBackground(command);

      // Set up output collection
      const disposable = process.onOutput((chunk: string) => {
        output += chunk;
        if (callback) {
          callback(chunk);
        }
      });

      // Wait for process to complete
      const result = await process.waitUntilComplete();
      disposable.dispose();

      const status = process.status;

      return {
        callId: toolCall.callId,
        responseParts: [{ text: output || result || 'Command completed' }],
        resultDisplay: output || result || 'Command completed',
        error: status === 'ERROR' ? new Error(`Command failed`) : undefined,
        errorType: undefined,
      };
    } finally {
      // Clean up callback
      this.outputCallbacks.delete(toolCall.callId);
    }
  }

  /**
   * Write file to sandbox
   */
  private async writeFile(
    toolCall: ToolCallRequestInfo,
    client: SandboxClient,
  ): Promise<ToolCallResponseInfo> {
    const filePath = toolCall.args.path as string;
    const content = toolCall.args.content as string;

    await client.fs.writeTextFile(filePath, content);

    return {
      callId: toolCall.callId,
      responseParts: [{ text: `File written: ${filePath}` }],
      resultDisplay: `File written: ${filePath} (${content.length} bytes)`,
      error: undefined,
      errorType: undefined,
    };
  }

  /**
   * Read file from sandbox
   */
  private async readFile(
    toolCall: ToolCallRequestInfo,
    client: SandboxClient,
  ): Promise<ToolCallResponseInfo> {
    const filePath = toolCall.args.path as string;

    const content = await client.fs.readTextFile(filePath);

    return {
      callId: toolCall.callId,
      responseParts: [{ text: content }],
      resultDisplay: content,
      error: undefined,
      errorType: undefined,
    };
  }

  /**
   * String replace in file
   */
  private async strReplace(
    toolCall: ToolCallRequestInfo,
    client: SandboxClient,
  ): Promise<ToolCallResponseInfo> {
    const filePath = toolCall.args.path as string;
    const oldStr = toolCall.args.old_str as string;
    const newStr = toolCall.args.new_str as string;

    // Read current content
    const content = await client.fs.readTextFile(filePath);

    // Perform replacement
    const newContent = content.replace(oldStr, newStr);

    if (content === newContent) {
      return {
        callId: toolCall.callId,
        responseParts: [
          { text: `No changes made - string not found in ${filePath}` },
        ],
        resultDisplay: undefined,
        error: new Error('String not found'),
        errorType: undefined,
      };
    }

    // Write back
    await client.fs.writeTextFile(filePath, newContent);

    return {
      callId: toolCall.callId,
      responseParts: [{ text: `Replaced in ${filePath}` }],
      resultDisplay: `Replaced in ${filePath}:\n${oldStr}\n→\n${newStr}`,
      error: undefined,
      errorType: undefined,
    };
  }

  /**
   * Multi edit operation
   */
  private async multiEdit(
    toolCall: ToolCallRequestInfo,
    client: SandboxClient,
  ): Promise<ToolCallResponseInfo> {
    const filePath = toolCall.args.path as string;
    const edits = toolCall.args.edits as Array<{
      old_str: string;
      new_str: string;
    }>;

    // Read current content
    let content = await client.fs.readTextFile(filePath);
    let changesMade = 0;

    // Apply edits
    for (const edit of edits) {
      const newContent = content.replace(edit.old_str, edit.new_str);
      if (newContent !== content) {
        content = newContent;
        changesMade++;
      }
    }

    if (changesMade === 0) {
      return {
        callId: toolCall.callId,
        responseParts: [{ text: `No changes made to ${filePath}` }],
        resultDisplay: undefined,
        error: new Error('No strings found to replace'),
        errorType: undefined,
      };
    }

    // Write back
    await client.fs.writeTextFile(filePath, content);

    return {
      callId: toolCall.callId,
      responseParts: [{ text: `Made ${changesMade} edits to ${filePath}` }],
      resultDisplay: `Made ${changesMade} of ${edits.length} edits to ${filePath}`,
      error: undefined,
      errorType: undefined,
    };
  }

  /**
   * List files in directory
   */
  private async listFiles(
    toolCall: ToolCallRequestInfo,
    client: SandboxClient,
  ): Promise<ToolCallResponseInfo> {
    const dirPath = (toolCall.args.path as string) || './';

    const entries = await client.fs.readdir(dirPath);
    const files = entries.map((e) => e.name).join('\n');

    return {
      callId: toolCall.callId,
      responseParts: [{ text: files || 'Empty directory' }],
      resultDisplay: files || 'Empty directory',
      error: undefined,
      errorType: undefined,
    };
  }

  /**
   * Create directory
   */
  private async makeDirectory(
    toolCall: ToolCallRequestInfo,
    client: SandboxClient,
  ): Promise<ToolCallResponseInfo> {
    const dirPath = toolCall.args.path as string;

    await client.fs.mkdir(dirPath, true); // recursive

    return {
      callId: toolCall.callId,
      responseParts: [{ text: `Directory created: ${dirPath}` }],
      resultDisplay: `Directory created: ${dirPath}`,
      error: undefined,
      errorType: undefined,
    };
  }

  /**
   * Remove file or directory
   */
  private async removeFile(
    toolCall: ToolCallRequestInfo,
    client: SandboxClient,
  ): Promise<ToolCallResponseInfo> {
    const path = toolCall.args.path as string;

    await client.fs.remove(path);

    return {
      callId: toolCall.callId,
      responseParts: [{ text: `Removed: ${path}` }],
      resultDisplay: `Removed: ${path}`,
      error: undefined,
      errorType: undefined,
    };
  }

  /**
   * Search files for pattern
   */
  private async searchFiles(
    toolCall: ToolCallRequestInfo,
    client: SandboxClient,
  ): Promise<ToolCallResponseInfo> {
    const pattern = toolCall.args.pattern as string;
    const path = (toolCall.args.path as string) || './';
    const include = toolCall.args.include as string;
    const exclude = (toolCall.args.exclude as string[]) || [];
    const caseSensitive = toolCall.args.case_sensitive !== false;

    if (!pattern) {
      throw new Error('Pattern is required');
    }

    try {
      // Use grep command in sandbox
      const grepFlags = caseSensitive ? '' : '-i';
      const includeFlag = include ? `--include="${include}"` : '';
      const excludeFlags = exclude.map(e => `--exclude="${e}"`).join(' ');
      
      const command = `grep -r ${grepFlags} ${includeFlag} ${excludeFlags} "${pattern}" ${path}`;
      const output = await client.commands.run(command);

      return {
        callId: toolCall.callId,
        responseParts: [{ text: output || 'No matches found' }],
        resultDisplay: output || 'No matches found',
        error: undefined,
        errorType: undefined,
      };
    } catch (error) {
      return {
        callId: toolCall.callId,
        responseParts: [{ text: `Search failed: ${error instanceof Error ? error.message : 'Unknown error'}` }],
        resultDisplay: undefined,
        error: error instanceof Error ? error : new Error('Search failed'),
        errorType: undefined,
      };
    }
  }

  /**
   * Find files matching glob pattern
   */
  private async globFiles(
    toolCall: ToolCallRequestInfo,
    client: SandboxClient,
  ): Promise<ToolCallResponseInfo> {
    const pattern = toolCall.args.pattern as string;
    const path = (toolCall.args.path as string) || './';
    const exclude = (toolCall.args.exclude as string[]) || [];

    if (!pattern) {
      throw new Error('Pattern is required');
    }

    try {
      // Use find command in sandbox
      const excludeFlags = exclude.map(e => `-not -path "${e}"`).join(' ');
      const command = `find ${path} -name "${pattern}" ${excludeFlags}`;
      const output = await client.commands.run(command);

      return {
        callId: toolCall.callId,
        responseParts: [{ text: output || 'No files found' }],
        resultDisplay: output || 'No files found',
        error: undefined,
        errorType: undefined,
      };
    } catch (error) {
      return {
        callId: toolCall.callId,
        responseParts: [{ text: `Glob failed: ${error instanceof Error ? error.message : 'Unknown error'}` }],
        resultDisplay: undefined,
        error: error instanceof Error ? error : new Error('Glob failed'),
        errorType: undefined,
      };
    }
  }

  /**
   * Commit and push changes
   */
  async commitChanges(): Promise<void> {
    const client = await this.clientPromise;

    try {
      // Run git add, commit and push
      await client.commands.run('git add -A');
      await client.commands.run(
        'git commit -m "Auto-commit changes from AI assistant"',
      );
      await client.commands.run('git push');
    } catch (error) {
      console.error('Failed to commit changes:', error);
      throw error;
    }
  }
}
