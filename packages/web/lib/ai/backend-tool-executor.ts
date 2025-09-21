import {
  ToolCallRequestInfo,
  ToolCallResponseInfo,
  Config,
  ToolResult,
} from '@catalyst/core';
import * as path from 'path';
import * as fs from 'fs/promises';
import { minimatch } from 'minimatch';

export class BackendToolExecutor {
  constructor(
    private projectDir: string,
    private config: Config,
  ) {}

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

    // For multi-edit operations
    if (sanitized.edits && Array.isArray(sanitized.edits)) {
      sanitized.edits = sanitized.edits.map((edit: unknown) =>
        this.sanitizeArgsForLogging(edit),
      );
    }

    // Remove any potential API keys or tokens
    const sensitiveKeys = [
      'api_key',
      'apikey',
      'token',
      'password',
      'secret',
      'bearer',
    ];
    for (const key of Object.keys(sanitized)) {
      if (
        sensitiveKeys.some((sensitive) => key.toLowerCase().includes(sensitive))
      ) {
        sanitized[key] = '***REDACTED***';
      }
    }

    return sanitized;
  }

  async executeToolCall(
    request: ToolCallRequestInfo,
    abortSignal?: AbortSignal,
  ): Promise<ToolCallResponseInfo> {
    const startTime = Date.now();

    // Log tool execution start (filter sensitive data)
    const sanitizedArgs = this.sanitizeArgsForLogging(request.args);
    console.log('🔧 Tool execution started:', {
      tool: request.name,
      callId: request.callId,
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
      let result: {
        content?: { text: string }[];
        display?: any;
        error?: { type: string; message: string };
      };
      switch (request.name) {
        case 'read':
        case 'read_file': // Support both names
          result = await this.executeReadTool(request.args);
          break;
        case 'write':
        case 'write_file': // Support both names
          result = await this.executeWriteTool(request.args);
          break;
        case 'str_replace':
        case 'str_replace_editor': // Support both names
          result = await this.executeStrReplaceTool(request.args);
          break;
        case 'multi_edit':
          result = await this.executeMultiEditTool(request.args);
          break;
        case 'ls':
        case 'list_directory': // Support both names
          result = await this.executeLsTool(request.args);
          break;
        case 'glob':
          result = await this.executeGlobTool(request.args);
          break;
        case 'grep':
          result = await this.executeGrepTool(request.args);
          break;
        case 'bash':
        case 'run_bash_command': // Support both names
          result = await this.executeBashTool(request.args);
          break;
        default:
          // For other tools, try to execute them directly if available
          if (tool && tool.buildAndExecute) {
            const toolResult = await tool.buildAndExecute(
              request.args,
              abortSignal || new AbortController().signal,
            );
            result = {
              content: [{ text: toolResult.llmContent.toString() }],
              display: toolResult.returnDisplay,
            };
          } else {
            throw new Error(
              `Tool ${request.name} not supported in web environment`,
            );
          }
      }

      const duration = Date.now() - startTime;
      console.log('✅ Tool execution completed:', {
        tool: request.name,
        callId: request.callId,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString(),
      });

      return {
        callId: request.callId,
        responseParts: result.content || [{ text: 'Operation completed' }],
        resultDisplay: result.display || undefined,
        error: undefined,
        errorType: undefined,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`❌ Tool execution error for ${request.name}:`, {
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
        errorType: undefined,
      };
    }
  }

  private resolveFilePath(filePath: string | undefined): string {
    // Handle undefined or empty paths
    if (!filePath) {
      throw new Error(
        'File path is required. To list files in a directory, use the "ls" tool instead of "read_file".',
      );
    }

    let cleanPath = filePath;

    // If it's an absolute path, extract just the filename
    if (filePath.startsWith('/')) {
      // Get just the filename from the path
      cleanPath = path.basename(filePath);
    }

    // Remove any parent directory navigation attempts
    cleanPath = cleanPath.replace(/\.\.\//g, '');

    // Ensure the path is within the project directory
    const resolved = path.resolve(this.projectDir, cleanPath);
    if (!resolved.startsWith(this.projectDir)) {
      console.error(
        `Path ${resolved} is outside project directory ${this.projectDir}`,
      );
      throw new Error('File path is outside project directory');
    }
    return resolved;
  }

  private async executeReadTool(args: Record<string, unknown>) {
    console.log('📖 Read tool - resolving path:', args.file_path || args.path);
    const filePath = this.resolveFilePath(
      (args.file_path || args.path) as string,
    );
    console.log('📖 Read tool - resolved path:', filePath);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
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
        display: {
          type: 'file_content',
          filePath: args.file_path,
          content: formattedContent,
        },
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return {
          content: [{ text: `File not found: ${args.file_path}` }],
          error: {
            type: 'FileNotFound',
            message: `File not found: ${args.file_path}`,
          },
        };
      }
      throw error;
    }
  }

  private async executeWriteTool(args: Record<string, unknown>) {
    console.log('📝 Write tool - parameters:', {
      path: args.file_path || args.path,
      contentLength: (args.content as string)?.length || 0,
    });
    const filePath = this.resolveFilePath(
      (args.file_path || args.path) as string,
    );
    const dirPath = path.dirname(filePath);

    // Ensure directory exists
    await fs.mkdir(dirPath, { recursive: true });

    // Check if file exists
    let fileExists = false;
    let oldContent = '';
    try {
      oldContent = await fs.readFile(filePath, 'utf-8');
      fileExists = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }

    // Write the file
    await fs.writeFile(filePath, args.content as string);

    return {
      content: [
        {
          text: fileExists
            ? `Updated file: ${args.file_path}`
            : `Created file: ${args.file_path}`,
        },
      ],
      display: {
        type: 'file_write',
        filePath: args.file_path,
        created: !fileExists,
        diff: fileExists
          ? {
              old: oldContent,
              new: args.content,
            }
          : undefined,
      },
    };
  }

  private async executeStrReplaceTool(args: Record<string, unknown>) {
    console.log('🔄 String replace tool - parameters:', {
      path: args.file_path,
      oldStringLength: (args.old_string as string)?.length || 0,
      newStringLength: (args.new_string as string)?.length || 0,
      replaceAll: args.replace_all || false,
    });
    const filePath = this.resolveFilePath(args.file_path as string);

    try {
      const content = await fs.readFile(filePath, 'utf-8');

      // Find and replace
      if (!content.includes(args.old_string as string)) {
        return {
          content: [{ text: `String not found in file: "${args.old_string}"` }],
          error: {
            type: 'StringNotFound',
            message: `The string "${args.old_string}" was not found in ${args.file_path}`,
          },
        };
      }

      const newContent = args.replace_all
        ? content.replaceAll(
            args.old_string as string,
            args.new_string as string,
          )
        : content.replace(args.old_string as string, args.new_string as string);

      await fs.writeFile(filePath, newContent);

      const replacementCount = args.replace_all
        ? content.split(args.old_string as string).length - 1
        : 1;

      return {
        content: [
          {
            text: `Replaced ${replacementCount} occurrence(s) in ${args.file_path}`,
          },
        ],
        display: {
          type: 'str_replace',
          filePath: args.file_path,
          replacements: replacementCount,
          diff: {
            old: content,
            new: newContent,
          },
        },
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return {
          content: [{ text: `File not found: ${args.file_path}` }],
          error: {
            type: 'FileNotFound',
            message: `File not found: ${args.file_path}`,
          },
        };
      }
      throw error;
    }
  }

  private async executeMultiEditTool(args: Record<string, unknown>) {
    const filePath = this.resolveFilePath(args.file_path as string);

    try {
      let content = await fs.readFile(filePath, 'utf-8');
      const originalContent = content;
      let totalReplacements = 0;

      // Apply each edit in sequence
      for (const edit of args.edits as Array<{
        old_string: string;
        new_string: string;
        replace_all?: boolean;
      }>) {
        if (!content.includes(edit.old_string)) {
          return {
            content: [
              {
                text: `String not found in file: "${edit.old_string}" (edit ${(args.edits as Array<{ old_string: string; new_string: string; replace_all?: boolean }>).indexOf(edit) + 1})`,
              },
            ],
            error: {
              type: 'StringNotFound',
              message: `The string "${edit.old_string}" was not found in ${args.file_path}`,
            },
          };
        }

        const replacements = edit.replace_all
          ? content.split(edit.old_string).length - 1
          : 1;

        content = edit.replace_all
          ? content.replaceAll(edit.old_string, edit.new_string)
          : content.replace(edit.old_string, edit.new_string);

        totalReplacements += replacements;
      }

      await fs.writeFile(filePath, content);

      return {
        content: [
          {
            text: `Applied ${(args.edits as Array<unknown>).length} edits with ${totalReplacements} total replacements in ${args.file_path}`,
          },
        ],
        display: {
          type: 'multi_edit',
          filePath: args.file_path,
          edits: (args.edits as Array<unknown>).length,
          totalReplacements,
          diff: {
            old: originalContent,
            new: content,
          },
        },
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // If file doesn't exist and first edit has empty old_string, create it
        const editsArray = args.edits as Array<{
          old_string: string;
          new_string: string;
          replace_all?: boolean;
        }>;
        if (editsArray.length > 0 && editsArray[0].old_string === '') {
          const dirPath = path.dirname(filePath);
          await fs.mkdir(dirPath, { recursive: true });

          let content = editsArray[0].new_string;

          // Apply remaining edits
          for (let i = 1; i < editsArray.length; i++) {
            const edit = editsArray[i];
            content = edit.replace_all
              ? content.replaceAll(edit.old_string, edit.new_string)
              : content.replace(edit.old_string, edit.new_string);
          }

          await fs.writeFile(filePath, content);

          return {
            content: [{ text: `Created file: ${args.file_path}` }],
            display: {
              type: 'multi_edit',
              filePath: args.file_path,
              created: true,
              content,
            },
          };
        }

        return {
          content: [{ text: `File not found: ${args.file_path}` }],
          error: {
            type: 'FileNotFound',
            message: `File not found: ${args.file_path}`,
          },
        };
      }
      throw error;
    }
  }

  private async executeLsTool(args: Record<string, unknown>) {
    // Default to current directory if no path is provided
    const pathArg = args.path || args.directory || '.';
    const targetPath =
      pathArg === '.'
        ? this.projectDir
        : this.resolveFilePath(pathArg as string);

    try {
      const stats = await fs.stat(targetPath);

      if (!stats.isDirectory()) {
        return {
          content: [{ text: `Not a directory: ${args.path}` }],
          error: {
            type: 'NotADirectory',
            message: `${args.path} is not a directory`,
          },
        };
      }

      const entries = await fs.readdir(targetPath, { withFileTypes: true });

      // Apply ignore patterns if provided
      const ignorePatterns = (args.ignore || []) as string[];
      const filteredEntries = entries.filter((entry) => {
        return !ignorePatterns.some((pattern) =>
          minimatch(entry.name, pattern),
        );
      });

      // Format output
      const output = filteredEntries
        .map((entry) => {
          const prefix = entry.isDirectory() ? 'd' : 'f';
          return `${prefix} ${entry.name}`;
        })
        .join('\n');

      return {
        content: [{ text: output || '(empty directory)' }],
        display: {
          type: 'directory_listing',
          path: args.path || '.',
          entries: filteredEntries.map((e) => ({
            name: e.name,
            type: e.isDirectory() ? 'directory' : 'file',
          })),
        },
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return {
          content: [{ text: `Directory not found: ${args.path}` }],
          error: {
            type: 'DirectoryNotFound',
            message: `Directory not found: ${args.path}`,
          },
        };
      }
      throw error;
    }
  }

  private async executeGlobTool(args: Record<string, unknown>) {
    const searchPath = this.resolveFilePath(
      (args.path || args.directory || '.') as string,
    );
    const pattern = args.pattern as string;

    async function findFiles(
      dir: string,
      projectDir: string,
      pattern: string,
    ): Promise<string[]> {
      const results: string[] = [];

      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          const relativePath = path.relative(projectDir, fullPath);

          if (entry.isDirectory()) {
            // Recursively search subdirectories
            if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
              results.push(...(await findFiles(fullPath, projectDir, pattern)));
            }
          } else if (minimatch(relativePath, pattern)) {
            results.push(relativePath);
          }
        }
      } catch (error) {
        // Ignore permission errors
      }

      return results;
    }

    const matches = await findFiles(searchPath, this.projectDir, pattern);

    return {
      content: [
        {
          text:
            matches.length > 0
              ? matches.join('\n')
              : `No files matching pattern: ${pattern}`,
        },
      ],
      display: {
        type: 'glob_results',
        pattern,
        matches,
        count: matches.length,
      },
    };
  }

  private async executeGrepTool(args: Record<string, unknown>) {
    const searchPath = this.resolveFilePath((args.path || '.') as string);
    const pattern = new RegExp(args.pattern as string, args['-i'] ? 'gi' : 'g');
    const results: Array<{ file: string; line: number; content: string }> = [];

    const searchInFile = async (filePath: string) => {
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.split('\n');

        lines.forEach((line, index) => {
          if (pattern.test(line)) {
            results.push({
              file: path.relative(this.projectDir, filePath),
              line: index + 1,
              content: line.trim(),
            });
          }
        });
      } catch (error) {
        // Ignore binary files or permission errors
      }
    };

    const searchDirectory = async (dir: string) => {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);

          if (entry.isDirectory()) {
            if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
              await searchDirectory(fullPath);
            }
          } else if (entry.isFile()) {
            // Apply file type filter if specified
            if (!args.type || fullPath.endsWith(`.${args.type as string}`)) {
              await searchInFile(fullPath);
            }
          }
        }
      } catch (error) {
        // Ignore permission errors
      }
    };

    const stats = await fs.stat(searchPath);
    if (stats.isDirectory()) {
      await searchDirectory(searchPath);
    } else {
      await searchInFile(searchPath);
    }

    // Format output based on output_mode
    let output = '';
    if (args.output_mode === 'files_with_matches') {
      const uniqueFiles = [...new Set(results.map((r) => r.file))];
      output = uniqueFiles.join('\n');
    } else if (args.output_mode === 'count') {
      const fileCounts = results.reduce(
        (acc, r) => {
          acc[r.file] = (acc[r.file] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      );
      output = Object.entries(fileCounts)
        .map(([file, count]) => `${file}:${count}`)
        .join('\n');
    } else {
      // Default: show matching lines
      output = results
        .slice(0, (args.head_limit as number) || results.length)
        .map((r) =>
          args['-n']
            ? `${r.file}:${r.line}:${r.content}`
            : `${r.file}:${r.content}`,
        )
        .join('\n');
    }

    return {
      content: [
        {
          text: output || `No matches found for pattern: ${args.pattern}`,
        },
      ],
      display: {
        type: 'grep_results',
        pattern: args.pattern,
        matches: results.length,
        files: [...new Set(results.map((r) => r.file))].length,
      },
    };
  }

  private async executeBashTool(args: Record<string, unknown>) {
    // For security, we'll limit bash commands in the web environment
    return {
      content: [
        {
          text: `Shell commands are not supported in the web environment for security reasons. Command: ${args.command}`,
        },
      ],
      error: {
        type: 'NotSupported',
        message: 'Shell commands are not supported in the web environment',
      },
    };
  }
}
