import {
  ToolCallRequestInfo,
  ToolCallResponseInfo,
  Config,
  ToolErrorType,
  FileDiff,
  ToolResultDisplay,
  TodoResultDisplay,
} from '@catalyst/core';
import {
  getCodeSandboxService,
  CodeSandboxService,
} from '@/lib/sandbox/codesandbox-service';
import { generateDiff } from '../utils';
import { SANDBOX_REPO_PATH } from '@/lib/constants/sandbox-paths';

export class SandboxToolExecutor {
  private sandboxService: CodeSandboxService;
  private workspaceDir = SANDBOX_REPO_PATH;
  private modifiedFiles: Set<string> = new Set();
  private gitConfigured: boolean = false;
  private outputStreamCallbacks: Map<string, (output: string) => void> =
    new Map();

  constructor(
    private projectId: string,
    private config: Config,
  ) {
    this.sandboxService = getCodeSandboxService();
  }

  // Set callback for streaming output
  setOutputStreamCallback(callId: string, callback: (output: string) => void) {
    this.outputStreamCallbacks.set(callId, callback);
  }

  // Remove callback when done
  removeOutputStreamCallback(callId: string) {
    this.outputStreamCallbacks.delete(callId);
  }

  private resolvePath(path: string): string {
    // If path is already absolute and starts with workspace dir, return as-is
    if (path.startsWith(this.workspaceDir)) {
      return path;
    }

    // If path is absolute but not in workspace, prepend workspace
    if (path.startsWith('/')) {
      return `${this.workspaceDir}${path}`;
    }

    // For relative paths, join with workspace
    return `${this.workspaceDir}/${path}`;
  }

  private sanitizeArgsForLogging(args: unknown): unknown {
    if (!args || typeof args !== 'object') {
      return args;
    }

    const sanitized = { ...(args as Record<string, unknown>) };

    // For write/edit operations, limit content length in logs
    if (sanitized.content && typeof sanitized.content === 'string') {
      sanitized.content =
        sanitized.content.length > 100
          ? `${sanitized.content.substring(0, 100)}... (${sanitized.content.length} chars total)`
          : sanitized.content;
    }

    if (sanitized.new_string && typeof sanitized.new_string === 'string') {
      sanitized.new_string =
        sanitized.new_string.length > 50
          ? `${sanitized.new_string.substring(0, 50)}... (${sanitized.new_string.length} chars total)`
          : sanitized.new_string;
    }

    if (sanitized.old_string && typeof sanitized.old_string === 'string') {
      sanitized.old_string =
        sanitized.old_string.length > 50
          ? `${sanitized.old_string.substring(0, 50)}... (${sanitized.old_string.length} chars total)`
          : sanitized.old_string;
    }

    return sanitized;
  }

  private async ensureGitConfig(): Promise<void> {
    if (this.gitConfigured) return;

    try {
      // Check if Git is already configured
      const checkEmail = await this.sandboxService.executeCommand(
        this.projectId,
        `git config user.email || echo "not-set"`,
      );

      if (checkEmail.trim() === 'not-set' || !checkEmail.trim()) {
        // Configure Git with environment variables
        const email = process.env.GITHUB_EMAIL || 'ai@catalyst.dev';
        const name = process.env.GITHUB_USERNAME || 'Catalyst AI';

        await this.sandboxService.executeCommand(
          this.projectId,
          `git config user.email "${email}" && git config user.name "${name}"`,
        );

        console.log(`✅ Configured Git: ${name} <${email}>`);
      }

      this.gitConfigured = true;
    } catch (error) {
      console.error('Failed to configure Git:', error);
    }
  }

  private async autoCommitAndPush(): Promise<void> {
    if (this.modifiedFiles.size === 0) return;

    try {
      // Ensure Git is configured
      await this.ensureGitConfig();

      // Get current status
      const status = await this.sandboxService.executeCommand(
        this.projectId,
        `git status --porcelain`,
      );

      console.log('Git status before auto-commit:\n', status);

      if (!status.trim()) {
        console.log('No changes to commit');
        this.modifiedFiles.clear();
        return;
      }

      // Add modified files to Git
      for (const file of this.modifiedFiles) {
        const relativePath = file.startsWith(this.workspaceDir + '/')
          ? file.substring(this.workspaceDir.length + 1)
          : file;
        await this.sandboxService.executeCommand(
          this.projectId,
          `git add "${relativePath}"`,
        );
      }

      // Create commit message
      const fileCount = this.modifiedFiles.size;
      const fileList = Array.from(this.modifiedFiles)
        .map((f) => f.substring(this.workspaceDir.length + 1))
        .slice(0, 5)
        .join(', ');

      const commitMessage =
        fileCount === 1
          ? `Update ${fileList}`
          : `Update ${fileCount} files: ${fileList}${fileCount > 5 ? '...' : ''}`;

      // Commit changes
      await this.sandboxService.executeCommand(
        this.projectId,
        `git commit -m "${commitMessage} [auto-commit]"`,
      );

      console.log(`✅ Auto-committed ${fileCount} file(s):`, commitMessage);

      // Push changes to remote
      try {
        // Check if upstream is set
        const upstreamCheck = await this.sandboxService.executeCommand(
          this.projectId,
          `git rev-parse --abbrev-ref --symbolic-full-name @{u} 2>&1 || echo "NO_UPSTREAM"`,
        );

        let pushCommand: string;
        let needsUpstream = false;

        if (
          upstreamCheck.includes('NO_UPSTREAM') ||
          upstreamCheck.includes('no upstream')
        ) {
          needsUpstream = true;
        }

        // Check what we're about to push
        const remoteCheck = await this.sandboxService.executeCommand(
          this.projectId,
          `git remote -v`,
        );
        console.log('Git remotes:', remoteCheck);

        const branchCheck = await this.sandboxService.executeCommand(
          this.projectId,
          `git branch -a`,
        );
        console.log('Git branches:', branchCheck);

        // Force push to avoid merge conflicts
        pushCommand = needsUpstream
          ? `git push -u --force origin main 2>&1`
          : `git push --force 2>&1`;

        console.log(
          needsUpstream
            ? '🔄 Setting upstream and force pushing...'
            : '🔄 Force pushing to remote...',
        );

        const pushResult = await this.sandboxService.executeCommand(
          this.projectId,
          pushCommand,
        );

        if (
          pushResult.includes('Everything up-to-date') ||
          pushResult.includes('branch') ||
          pushResult.includes('->') ||
          pushResult.includes('forced update')
        ) {
          console.log('✅ Changes force pushed to remote successfully');
        } else {
          console.log('Push result:', pushResult);
        }
      } catch (error) {
        console.error('Failed to push changes:', error);
        // Don't fail the whole operation if push fails
        // User can manually push later via UI
      }

      this.modifiedFiles.clear();
    } catch (error) {
      console.error('Auto-commit failed:', error);
    }
  }

  public async commitChanges(): Promise<void> {
    await this.autoCommitAndPush();
  }

  async executeToolCall(
    request: ToolCallRequestInfo,
  ): Promise<ToolCallResponseInfo> {
    const startTime = Date.now();

    // Log tool execution start (filter sensitive data)
    const sanitizedArgs = this.sanitizeArgsForLogging(request.args);
    console.log('🔧 Sandbox tool execution started:', {
      tool: request.name,
      callId: request.callId,
      projectId: this.projectId,
      parameters: JSON.stringify(sanitizedArgs, null, 2),
      timestamp: new Date().toISOString(),
    });

    try {
      // Get the tool from registry
      const toolRegistry = await this.config.getToolRegistry();
      const tool = toolRegistry.getTool(request.name);

      if (!tool) {
        return {
          callId: request.callId,
          responseParts: [
            {
              text: `Error: Unknown tool ${request.name}`,
            },
          ],
          resultDisplay: undefined,
          error: new Error(`Tool ${request.name} not found in registry`),
          errorType: undefined,
        };
      }

      // Execute the tool based on its type
      let result;
      switch (request.name) {
        case 'read':
        case 'read_file':
          result = await this.executeReadTool(request.args);
          break;
        case 'write':
        case 'write_file':
          result = await this.executeWriteTool(request.args);
          break;
        case 'str_replace':
        case 'str_replace_editor':
          result = await this.executeStrReplaceTool(request.args);
          break;
        case 'ls':
        case 'list_directory':
          result = await this.executeLsTool(request.args);
          break;
        case 'bash':
        case 'run_bash_command':
        case 'run_shell_command':
          result = await this.executeBashTool({
            ...request.args,
            callId: request.callId,
          });
          break;
        case 'grep':
          result = await this.executeGrepTool(request.args);
          break;
        case 'glob':
          result = await this.executeGlobTool(request.args);
          break;
        case 'todo_write':
          result = await this.executeTodoWriteTool(request.args);
          break;
        default:
          throw new Error(
            `Tool ${request.name} not supported in sandbox environment`,
          );
      }

      const duration = Date.now() - startTime;
      console.log('✅ Sandbox tool execution completed:', {
        tool: request.name,
        callId: request.callId,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString(),
      });

      return {
        callId: request.callId,
        responseParts: result.content || [{ text: 'Operation completed' }],
        resultDisplay: result.display || undefined,
        error: result.error || undefined,
        errorType: result.errorType || undefined,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`❌ Sandbox tool execution error for ${request.name}:`, {
        tool: request.name,
        callId: request.callId,
        duration: `${duration}ms`,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        parameters: JSON.stringify(sanitizedArgs, null, 2),
        timestamp: new Date().toISOString(),
      });

      return {
        callId: request.callId,
        responseParts: [
          {
            text: `Error executing ${request.name}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        resultDisplay: undefined,
        error: error instanceof Error ? error : new Error('Unknown error'),
        errorType: ToolErrorType.UNHANDLED_EXCEPTION,
      };
    }
  }

  private async executeReadTool(args: Record<string, unknown>): Promise<{
    content: { text: string }[];
    display?: ToolCallResponseInfo['resultDisplay'];
    error?: ToolCallResponseInfo['error'];
    errorType?: ToolCallResponseInfo['errorType'];
  }> {
    const inputPath = (args.file_path ||
      args.path ||
      args.absolute_path) as string;

    if (!inputPath) {
      throw new Error('File path is required');
    }

    const filePath = this.resolvePath(inputPath);
    console.log('📖 Sandbox read tool - reading:', filePath);

    try {
      const content = await this.sandboxService.readFile(
        this.projectId,
        filePath,
      );
      const lines = content.split('\n');

      // Handle offset and limit
      const offset = (args.offset as number) || 0;
      const limit = (args.limit as number) || lines.length;
      const selectedLines = lines.slice(offset, offset + limit);

      // Format with line numbers
      const formattedContent = selectedLines
        .map((line, idx) => `${offset + idx + 1}→${line}`)
        .join('\n');

      return {
        content: [{ text: formattedContent }],
        display: formattedContent,
      };
    } catch (error: unknown) {
      if ((error as Error).message.includes('File not found')) {
        return {
          content: [{ text: `File not found: ${filePath}` }],
          error: new Error(`File not found: ${filePath}`),
          errorType: ToolErrorType.FILE_NOT_FOUND,
        };
      }
      throw error;
    }
  }

  private async executeWriteTool(args: Record<string, unknown>): Promise<{
    content: { text: string }[];
    display?: ToolCallResponseInfo['resultDisplay'];
    error?: ToolCallResponseInfo['error'];
    errorType?: ToolCallResponseInfo['errorType'];
  }> {
    const inputPath = (args.file_path || args.path) as string;
    const content = args.content as string;

    if (!inputPath) {
      throw new Error('File path is required');
    }

    const filePath = this.resolvePath(inputPath);
    console.log('📝 Sandbox write tool - parameters:', {
      path: filePath,
      contentLength: content?.length || 0,
    });

    // Check if file exists
    let fileExists = false;
    let originalContent: string | null = null;
    try {
      originalContent = await this.sandboxService.readFile(
        this.projectId,
        filePath,
      );
      fileExists = true;
    } catch (error) {
      // File doesn't exist, which is fine
      fileExists = false;
    }

    // Write the file
    await this.sandboxService.writeFile(this.projectId, filePath, content);
    // Track the modified file
    this.modifiedFiles.add(filePath);
    const diffs: FileDiff = {
      fileDiff: '', // Will be populated with diff between old and new content
      fileName: filePath.split('/').pop() || '', // Extract filename from path
      originalContent: fileExists
        ? await this.sandboxService.readFile(this.projectId, filePath)
        : null,
      newContent: content,
      diffStat: {
        ai_removed_lines: fileExists
          ? content.split('\n').length -
            (
              await this.sandboxService.readFile(this.projectId, filePath)
            ).split('\n').length
          : 0,
        ai_added_lines: !fileExists ? content.split('\n').length : 0,
        user_added_lines: 0, // Since this is AI-driven change
        user_removed_lines: 0, // Since this is AI-driven change
      },
    };

    // Generate fileDiff using diff comparison
    if (fileExists) {
      const oldContent = originalContent || '';
      diffs.fileDiff = generateDiff(oldContent, content); // You'll need to implement or use a diff library
    } else {
      diffs.fileDiff = `+++ ${filePath}\n${content
        .split('\n')
        .map((line) => `+ ${line}`)
        .join('\n')}`;
    }

    return {
      content: [
        {
          text: fileExists
            ? `Updated file: ${filePath}`
            : `Created file: ${filePath}`,
        },
      ],
      display: diffs,
    };
  }

  private async executeStrReplaceTool(args: Record<string, unknown>): Promise<{
    content: { text: string }[];
    display?: ToolCallResponseInfo['resultDisplay'];
    error?: ToolCallResponseInfo['error'];
    errorType?: ToolCallResponseInfo['errorType'];
  }> {
    const inputPath = args.file_path as string;
    const oldString = args.old_string as string;
    const newString = args.new_string as string;
    const replaceAll = args.replace_all as boolean;

    if (!inputPath || !oldString || newString === undefined) {
      throw new Error('file_path, old_string, and new_string are required');
    }

    const filePath = this.resolvePath(inputPath);
    console.log('🔄 Sandbox string replace tool - parameters:', {
      path: filePath,
      oldStringLength: oldString.length,
      newStringLength: newString.length,
      replaceAll: replaceAll || false,
    });

    try {
      const content = await this.sandboxService.readFile(
        this.projectId,
        filePath,
      );

      // Find and replace
      if (!content.includes(oldString)) {
        return {
          content: [{ text: `String not found in file: "${oldString}"` }],
          error: new Error(
            `The string "${oldString}" was not found in ${filePath}`,
          ),
          errorType: ToolErrorType.EDIT_NO_OCCURRENCE_FOUND,
        };
      }

      const newContent = replaceAll
        ? content.replaceAll(oldString, newString)
        : content.replace(oldString, newString);

      await this.sandboxService.writeFile(this.projectId, filePath, newContent);

      // Track the modified file
      this.modifiedFiles.add(filePath);
      const replacementCount = replaceAll
        ? content.split(oldString).length - 1
        : 1;

      const diffs: FileDiff = {
        fileDiff: '', // Will be populated with diff between old and new content
        fileName: filePath.split('/').pop() || '', // Extract filename from path
        originalContent: content,
        newContent: newContent,
        diffStat: {
          ai_removed_lines: oldString.split('\n').length,
          ai_added_lines: newString.split('\n').length,
          user_added_lines: 0, // Since this is AI-driven change
          user_removed_lines: 0, // Since this is AI-driven change
        },
      };

      // Generate fileDiff using diff comparison

      diffs.fileDiff = generateDiff(content, newContent); // You'll need to implement or use a diff library

      return {
        content: [
          {
            text: `Replaced ${replacementCount} occurrence(s) in ${filePath}`,
          },
        ],
        display: diffs,
      };
    } catch (error: unknown) {
      if ((error as Error).message.includes('File not found')) {
        return {
          content: [{ text: `File not found: ${filePath}` }],
          error: new Error(`File not found: ${filePath}`),
          errorType: ToolErrorType.FILE_NOT_FOUND,
        };
      }
      throw error;
    }
  }

  private async executeLsTool(args: Record<string, unknown>): Promise<{
    content: { text: string }[];
    display?: ToolCallResponseInfo['resultDisplay'];
    error?: ToolCallResponseInfo['error'];
    errorType?: ToolCallResponseInfo['errorType'];
  }> {
    const inputPath = (args.path || args.directory || '.') as string;
    const path = this.resolvePath(inputPath);

    console.log('📁 Sandbox ls tool - listing:', path);

    try {
      const entries = await this.sandboxService.listDirectory(
        this.projectId,
        path,
      );

      // Apply ignore patterns if provided
      const ignorePatterns = (args.ignore || []) as string[];
      const filteredEntries = entries.filter((entry) => {
        const name = entry.substring(2); // Remove 'd ' or 'f ' prefix
        return !ignorePatterns.some((pattern) => {
          // Simple pattern matching (could be enhanced)
          return name.includes(pattern);
        });
      });

      const output = filteredEntries.join('\n') || '(empty directory)';

      return {
        content: [{ text: output }],
        display: output,
      };
    } catch (error: unknown) {
      if ((error as Error).message.includes('No such file or directory')) {
        return {
          content: [{ text: `Directory not found: ${path}` }],
          error: new Error(`Directory not found: ${path}`),
          errorType: ToolErrorType.INVALID_TOOL_PARAMS,
        };
      }
      throw error;
    }
  }

  private async executeBashTool(args: Record<string, unknown>): Promise<{
    content: { text: string }[];
    display?: ToolCallResponseInfo['resultDisplay'];
    error?: ToolCallResponseInfo['error'];
    errorType?: ToolCallResponseInfo['errorType'];
  }> {
    const command = args.command as string;
    const is_background = (args.is_background as boolean) || false;
    const timeout = (args.timeout as number) || 120000; // Default 2 minutes
    const outputIdleTimeout = 10000; // 10 seconds of no output change

    if (!command) {
      throw new Error('Command is required');
    }

    console.log('🖥️ Sandbox bash tool - executing:', command);

    // For background processes, wait 5 seconds then push to background
    if (is_background) {
      console.log('⏳ Starting background process with 5 second initial wait...');
      
      // Start the command but collect output for first 5 seconds
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
      const outputCollector = (chunk: string) => {
        if (!initialOutputComplete) {
          outputBuffer += chunk;
          // If we have streaming callback, send initial output
          if (this.outputStreamCallbacks.has(args.callId as string)) {
            const callback = this.outputStreamCallbacks.get(args.callId as string);
            if (callback) {
              callback(chunk);
            }
          }
        }
      };
      
      // Execute command in background mode
      const commandPromise = this.sandboxService.executeCommand(
        this.projectId,
        command,
        true,
        outputCollector,
      );
      
      // Wait for 5 seconds to collect initial output
      await waitPromise;
      
      console.log('✅ Background process started, initial output collected');
      
      return {
        content: [{ 
          text: outputBuffer || 'Background process started successfully\n\nProcess is now running in background.' 
        }],
        display: outputBuffer || 'Background process started',
      };
    }

    // For non-background processes, stream output with timeout
    let outputBuffer = '';
    let lastOutputTime = Date.now();
    let lastOutputLength = 0;
    let timeoutHandle: NodeJS.Timeout | null = null;
    let idleTimeoutHandle: NodeJS.Timeout | null = null;
    let isCompleted = false;

    // Get the callback for streaming if one is set
    const callId = (args.callId as string) || 'unknown';
    const streamCallback = this.outputStreamCallbacks.get(callId);

    const output = await new Promise<string>((resolve, reject) => {
      // Overall timeout
      timeoutHandle = setTimeout(() => {
        isCompleted = true;
        console.log(`⏱️ Command timed out after ${timeout}ms`);
        resolve(outputBuffer + '\n\n[Command timed out]');
      }, timeout);

      // Idle timeout - fires when output stops changing
      const resetIdleTimeout = () => {
        if (idleTimeoutHandle) {
          clearTimeout(idleTimeoutHandle);
        }
        idleTimeoutHandle = setTimeout(() => {
          if (!isCompleted && outputBuffer.length === lastOutputLength) {
            isCompleted = true;
            console.log(`⏱️ Command output idle for ${outputIdleTimeout}ms`);
            resolve(
              outputBuffer + '\n\n[Command terminated - no output for 10s]',
            );
          }
        }, outputIdleTimeout);
      };

      // Start the idle timeout
      resetIdleTimeout();

      // Execute command with output streaming
      this.sandboxService
        .executeCommand(this.projectId, command, false, (chunk: string) => {
          if (isCompleted) return;

          outputBuffer += chunk;
          lastOutputTime = Date.now();

          // Stream to callback if available
          if (streamCallback) {
            streamCallback(chunk);
          }

          // Check if output has changed
          if (outputBuffer.length !== lastOutputLength) {
            lastOutputLength = outputBuffer.length;
            resetIdleTimeout();
          }
        })
        .then((result) => {
          if (!isCompleted) {
            isCompleted = true;
            if (timeoutHandle) clearTimeout(timeoutHandle);
            if (idleTimeoutHandle) clearTimeout(idleTimeoutHandle);
            resolve(result || outputBuffer);
          }
        })
        .catch((error) => {
          if (!isCompleted) {
            isCompleted = true;
            if (timeoutHandle) clearTimeout(timeoutHandle);
            if (idleTimeoutHandle) clearTimeout(idleTimeoutHandle);
            reject(error);
          }
        });
    });

    // Clean up the stream callback
    this.removeOutputStreamCallback(callId);

    return {
      content: [{ text: output || '(no output)' }],
      display: output,
    };
  }

  private async executeGrepTool(args: Record<string, unknown>): Promise<{
    content: { text: string }[];
    display?: ToolCallResponseInfo['resultDisplay'];
    error?: ToolCallResponseInfo['error'];
    errorType?: ToolCallResponseInfo['errorType'];
  }> {
    const pattern = args.pattern as string;
    const inputPath = (args.path || '.') as string;
    const path = this.resolvePath(inputPath);
    const caseInsensitive = args['-i'] as boolean;

    if (!pattern) {
      throw new Error('Pattern is required');
    }

    console.log('🔍 Sandbox grep tool - searching:', {
      pattern,
      path,
      caseInsensitive,
    });

    // Use ripgrep if available, otherwise fall back to grep
    const grepCmd = caseInsensitive
      ? `cd ${this.workspaceDir} && rg -i "${pattern}" "${path}" 2>/dev/null || grep -r -i "${pattern}" "${path}" 2>/dev/null || echo "No matches found"`
      : `cd ${this.workspaceDir} && rg "${pattern}" "${path}" 2>/dev/null || grep -r "${pattern}" "${path}" 2>/dev/null || echo "No matches found"`;

    const output = await this.sandboxService.executeCommand(
      this.projectId,
      grepCmd,
    );

    if (output.includes('No matches found') || !output.trim()) {
      return {
        content: [{ text: `No matches found for pattern: ${pattern}` }],
        display: `No matches found for pattern: ${pattern}`,
      };
    }

    const lines = output.trim().split('\n');

    return {
      content: [{ text: output }],
      display: output,
    };
  }

  private async executeGlobTool(args: Record<string, unknown>): Promise<{
    content: { text: string }[];
    display?: ToolCallResponseInfo['resultDisplay'];
    error?: ToolCallResponseInfo['error'];
    errorType?: ToolCallResponseInfo['errorType'];
  }> {
    const pattern = args.pattern as string;
    const inputPath = (args.path || args.directory || '.') as string;
    const path = this.resolvePath(inputPath);

    if (!pattern) {
      throw new Error('Pattern is required');
    }

    console.log('🔎 Sandbox glob tool - matching:', { pattern, path });

    // Use find command to match patterns
    const findCmd = `cd ${this.workspaceDir} && find "${path}" -name "${pattern}" -type f 2>/dev/null || echo ""`;
    const output = await this.sandboxService.executeCommand(
      this.projectId,
      findCmd,
    );

    const matches = output
      .trim()
      .split('\n')
      .filter((line) => line.length > 0);

    if (matches.length === 0 || (matches.length === 1 && !matches[0])) {
      return {
        content: [{ text: `No files matching pattern: ${pattern}` }],
        display: `No files matching pattern: ${pattern}`,
      };
    }

    return {
      content: [{ text: matches.join('\n') }],
      display: matches.join('\n'),
    };
  }

  private async executeTodoWriteTool(args: Record<string, unknown>): Promise<{
    content: { text: string }[];
    display?: ToolCallResponseInfo['resultDisplay'];
    error?: ToolCallResponseInfo['error'];
    errorType?: ToolCallResponseInfo['errorType'];
  }> {
    interface TodoItem {
      id: string;
      content: string;
      status: 'pending' | 'in_progress' | 'completed';
      priority?: 'high' | 'medium' | 'low';
    }

    const todos = args.todos as TodoItem[];
    const modifiedByUser = args.modified_by_user as boolean;
    const modifiedContent = args.modified_content as string;

    if (!Array.isArray(todos)) {
      throw new Error('todos parameter must be an array');
    }

    console.log('✅ Sandbox todo_write tool - updating todos:', {
      todoCount: todos.length,
      modifiedByUser,
    });

    try {
      let finalTodos: TodoItem[];

      if (modifiedByUser && modifiedContent !== undefined) {
        // User modified the content in external editor, parse it directly
        const data = JSON.parse(modifiedContent);
        finalTodos = Array.isArray(data.todos) ? data.todos : [];
      } else {
        // Use the normal todo logic - simply replace with new todos
        finalTodos = todos;
      }

      // Store todos in a file within the sandbox
      const todoFilePath = `${this.workspaceDir}/.catalyst/todos.json`;
      const todoData = {
        todos: finalTodos,
        lastUpdated: new Date().toISOString(),
        projectId: this.projectId,
      };

      // Ensure .catalyst directory exists
      await this.sandboxService.executeCommand(
        this.projectId,
        `mkdir -p ${this.workspaceDir}/.catalyst`,
      );

      // Write the todo file
      await this.sandboxService.writeFile(
        this.projectId,
        todoFilePath,
        JSON.stringify(todoData, null, 2),
      );

      // Create structured display object for rich UI rendering
      const todoResultDisplay: TodoResultDisplay = {
        type: 'todo_list' as const,
        todos: finalTodos,
      };

      return {
        content: [
          {
            text: JSON.stringify({
              success: true,
              todos: finalTodos,
            }),
          },
        ],
        display: todoResultDisplay,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(
        `[TodoWriteTool] Error executing todo_write: ${errorMessage}`,
      );
      return {
        content: [
          {
            text: JSON.stringify({
              success: false,
              error: `Failed to write todos. Detail: ${errorMessage}`,
            }),
          },
        ],
        display: `Error writing todos: ${errorMessage}`,
        error: error instanceof Error ? error : new Error(errorMessage),
        errorType: ToolErrorType.UNHANDLED_EXCEPTION,
      };
    }
  }
}
