import { ServerTool, ToolResult } from '@catalyst/core';

/**
 * Sandbox tool definitions that match the core tool schemas exactly
 * These are placeholder tools - actual execution is handled by AsyncSandboxToolExecutor
 */

export const sandboxTools: ServerTool[] = [
  {
    // Shell/Bash tool
    name: 'run_shell_command',
    schema: {
      name: 'run_shell_command',
      description: `This tool executes a given shell command as \`bash -c <command>\`. 

      **Background vs Foreground Execution:**
      You should decide whether commands should run in background or foreground based on their nature:
      
      **Use background execution (is_background: true) for:**
      - Long-running development servers: \`npm run start\`, \`npm run dev\`, \`yarn dev\`, \`bun run start\`
      - Build watchers: \`npm run watch\`, \`webpack --watch\`
      - Database servers: \`mongod\`, \`mysql\`, \`redis-server\`
      - Web servers: \`python -m http.server\`, \`php -S localhost:8000\`
      - Any command expected to run indefinitely until manually stopped
      
      **Use foreground execution (is_background: false) for:**
      - One-time commands: \`ls\`, \`cat\`, \`grep\`
      - Build commands: \`npm run build\`, \`make\`
      - Installation commands: \`npm install\`, \`pip install\`
      - Git operations: \`git commit\`, \`git push\`
      - Test runs: \`npm test\`, \`pytest\`
      
      Command is executed as a subprocess that leads its own process group. Command process group can be terminated as \`kill -- -PGID\` or signaled as \`kill -s SIGNAL -- -PGID\`.

      The following information is returned:

      Command: Executed command.
      Directory: Directory (relative to project root) where command was executed, or \`(root)\`.
      Stdout: Output on stdout stream. Can be \`(empty)\` or partial on error and for any unwaited background processes.
      Stderr: Output on stderr stream. Can be \`(empty)\` or partial on error and for any unwaited background processes.
      Error: Error or \`(none)\` if no error was reported for the subprocess.
      Exit Code: Exit code or \`(none)\` if terminated by signal.
      Signal: Signal number or \`(none)\` if no signal was received.
      Background PIDs: List of background processes started or \`(none)\`.
      Process Group PGID: Process group started or \`(none)\``,
      parametersJsonSchema: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'Exact bash command to execute as `bash -c <command>`',
          },
          is_background: {
            type: 'boolean',
            description: 'If true, the tool runs the command as background process and returns immediately. It can be managed later with `kill -- -PGID`. If false (default), the tool waits for command completion and returns the full output.',
            default: false,
          },
          cwd: {
            type: 'string',
            description: 'The working directory (relative to project root) where the command will be executed. Defaults to the project root directory.',
          },
          timeout: {
            type: 'number',
            description: 'Timeout in milliseconds for foreground commands. Default is 120000 (2 minutes). For background commands, this parameter is ignored.',
            default: 120000,
          },
        },
        required: ['command'],
      },
    },
    execute: async () => ({ llmContent: 'Handled by executor', returnDisplay: '' }),
    shouldConfirmExecute: async () => false,
  },
  {
    // Read file tool
    name: 'read_file',
    schema: {
      name: 'read_file',
      description: 'Read content of a text file and return it with line numbers.',
      parametersJsonSchema: {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: 'Path of the file to read',
          },
          offset: {
            type: 'number',
            description: 'Line number to start reading from (1-based)',
            default: 1,
          },
          limit: {
            type: 'number',
            description: 'Maximum number of lines to read',
          },
        },
        required: ['file_path'],
      },
    },
    execute: async () => ({ llmContent: 'Handled by executor', returnDisplay: '' }),
    shouldConfirmExecute: async () => false,
  },
  {
    // Write file tool
    name: 'write_file',
    schema: {
      name: 'write_file',
      description: 'Write content to a file. If the file exists, it will be overwritten. If the file does not exist, it will be created. Necessary directories will be created automatically.',
      parametersJsonSchema: {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: 'Path of the file to write',
          },
          content: {
            type: 'string',
            description: 'Content to write to the file',
          },
        },
        required: ['file_path', 'content'],
      },
    },
    execute: async () => ({ llmContent: 'Handled by executor', returnDisplay: '' }),
    shouldConfirmExecute: async () => false,
  },
  {
    // String replace tool
    name: 'str_replace_editor',
    schema: {
      name: 'str_replace_editor',
      description: `This tool performs a precise string replacement in a text file. It searches for an exact match of \`old_str\` and replaces it with \`new_str\`.

**Key Requirements:**
1. The \`old_str\` MUST exist EXACTLY in the file.
2. The \`old_str\` MUST be unique to ensure unambiguous replacement.
3. Leading/trailing spaces, tabs, or line endings are significant.
4. Respect existing formatting and coding style.

**Important:** If the search string is not unique, the tool will return an error. Include unique surrounding context in \`old_str\` to make it unique.

Common issues:
- Lines exceeding the view: First, use \`read_file\` to check content with large \`head_limit\`.
- String not found: Ensure the \`old_str\` is an exact match, including whitespace and formatting.
- Multiple matches: Add surrounding lines or make the string more specific.`,
      parametersJsonSchema: {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: 'Path of the file to edit',
          },
          old_str: {
            type: 'string',
            description: 'Exact string to find and replace',
          },
          new_str: {
            type: 'string',
            description: 'String to replace with',
          },
          view_range: {
            type: 'array',
            items: { type: 'number' },
            description: 'Optional: [start_line, end_line] to display a specific range of the file after replacement. All is -1.',
            default: [-1, -1],
          },
        },
        required: ['file_path', 'old_str', 'new_str'],
      },
    },
    execute: async () => ({ llmContent: 'Handled by executor', returnDisplay: '' }),
    shouldConfirmExecute: async () => false,
  },
  {
    // List directory tool
    name: 'list_directory',
    schema: {
      name: 'list_directory',
      description: 'Lists the names of files and subdirectories directly within a specified directory path. Can optionally ignore entries matching provided glob patterns.',
      parametersJsonSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to the directory (relative to project root)',
            default: '.',
          },
          ignore: {
            type: 'array',
            items: { type: 'string' },
            description: 'Glob patterns of files and folders to ignore (e.g., ["*.log", "node_modules/", ".*"])',
            default: [],
          },
        },
        required: ['path'],
      },
    },
    execute: async () => ({ llmContent: 'Handled by executor', returnDisplay: '' }),
    shouldConfirmExecute: async () => false,
  },
  {
    // Grep/Search tool
    name: 'search_file_content',
    schema: {
      name: 'search_file_content',
      description: 'Searches for a regular expression pattern within the content of files in a specified directory (or current working directory). Can filter files by a glob pattern. Returns the lines containing matches, along with their file paths and line numbers.',
      parametersJsonSchema: {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            description: 'The regular expression to search for (uses ripgrep regex syntax)',
          },
          path: {
            type: 'string',
            description: 'The directory path to search in (defaults to current working directory)',
          },
          include: {
            type: 'string',
            description: 'Glob pattern for files to include in search (e.g., "*.ts", "*.js")',
          },
          exclude: {
            type: 'array',
            items: { type: 'string' },
            description: 'Glob patterns for files/directories to exclude from search',
            default: [],
          },
          case_sensitive: {
            type: 'boolean',
            description: 'Whether the search should be case sensitive',
            default: true,
          },
        },
        required: ['pattern'],
      },
    },
    execute: async () => ({ llmContent: 'Handled by executor', returnDisplay: '' }),
    shouldConfirmExecute: async () => false,
  },
  {
    // Glob tool
    name: 'glob',
    schema: {
      name: 'glob',
      description: `Efficiently finds files matching specific glob patterns (e.g., \`src/**/*.ts\`, \`**/*.md\`), returning absolute paths sorted by modification time (newest first). Ideal for quickly locating files based on their name or path structure, especially in large codebases.`,
      parametersJsonSchema: {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            description: 'The glob pattern to search for (e.g., "**/*.ts" to find all TypeScript files)',
          },
          path: {
            type: 'string',
            description: 'The base directory path to search from (defaults to current working directory)',
          },
          exclude: {
            type: 'array',
            items: { type: 'string' },
            description: 'Glob patterns for files/directories to exclude from search',
            default: [],
          },
        },
        required: ['pattern'],
      },
    },
    execute: async () => ({ llmContent: 'Handled by executor', returnDisplay: '' }),
    shouldConfirmExecute: async () => false,
  },
  {
    // Multi-edit tool
    name: 'multi_edit',
    schema: {
      name: 'multi_edit',
      description: `This tool performs multiple string replacements in a file in a single operation. All replacements must succeed for the operation to complete.

Each edit follows the same rules as str_replace_editor:
- old_str must match EXACTLY and UNIQUELY in the file
- Respect existing formatting and indentation
- Each edit is applied sequentially in the order provided

Use this tool when you need to make multiple changes to the same file efficiently.`,
      parametersJsonSchema: {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: 'Path of the file to edit',
          },
          edits: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                old_str: {
                  type: 'string',
                  description: 'Exact string to find and replace',
                },
                new_str: {
                  type: 'string',
                  description: 'String to replace with',
                },
              },
              required: ['old_str', 'new_str'],
            },
            description: 'Array of edit operations to perform',
          },
          view_range: {
            type: 'array',
            items: { type: 'number' },
            description: 'Optional: [start_line, end_line] to display a specific range of the file after replacement. All is -1.',
            default: [-1, -1],
          },
        },
        required: ['file_path', 'edits'],
      },
    },
    execute: async () => ({ llmContent: 'Handled by executor', returnDisplay: '' }),
    shouldConfirmExecute: async () => false,
  },
];

// Additional tool aliases that map to the main tools
export const toolAliases: Record<string, string> = {
  'bash': 'run_shell_command',
  'run_bash_command': 'run_shell_command',
  'read': 'read_file',
  'write': 'write_file',
  'str_replace': 'str_replace_editor',
  'ls': 'list_directory',
  'grep': 'search_file_content',
};