# Qwen Code Web Version Architecture

## Overview

This document outlines the architecture for transforming the Qwen Code CLI tool into a web-based application with persistent cloud VMs, background processing, and real-time updates.

## Table of Contents

1. [System Architecture](#system-architecture)
2. [Technology Stack](#technology-stack)
3. [Core Components](#core-components)
4. [Database Schema (MongoDB)](#database-schema-mongodb)
5. [Real-time Updates](#real-time-updates)
6. [Background Processing](#background-processing)
7. [CodeSandbox Integration](#codesandbox-integration)
8. [API Design](#api-design)
9. [Security](#security)
10. [Implementation Phases](#implementation-phases)

## System Architecture

```
┌────────────────────────────────────────────────────────────┐
│                     Browser Client                          │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐   │
│  │ Chat UI     │  │ File Explorer │  │ Live Code       │   │
│  │ (React)     │  │ (from VM)     │  │ Editor          │   │
│  └─────────────┘  └──────────────┘  └─────────────────┘   │
└────────────────────────┬───────────────────────────────────┘
                         │ WebSocket/SSE
┌────────────────────────┴───────────────────────────────────┐
│                   Backend Services                          │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              API Gateway (Node.js)                   │   │
│  │  • Session Management  • Auth  • Rate Limiting       │   │
│  └─────────────────────┬───────────────────────────────┘   │
│           ┌─────────────┴──────────────┐                    │
│     ┌─────┴──────┐           ┌────────┴────────┐           │
│     │ Job Queue  │           │ State Store     │           │
│     │ (Bull/BullMQ)          │ (MongoDB)       │           │
│     └─────┬──────┘           └─────────────────┘           │
│     ┌─────┴──────────────────────────────┐                 │
│     │     Background Workers             │                 │
│     │  • Task Execution                  │                 │
│     │  • AI Agent Processing             │                 │
│     │  • VM Orchestration                │                 │
│     └─────────────┬──────────────────────┘                 │
└───────────────────┼────────────────────────────────────────┘
                    │
┌───────────────────┴────────────────────────────────────────┐
│              CodeSandbox Cloud VMs                          │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐           │
│  │   VM 1     │  │   VM 2     │  │   VM 3     │           │
│  │ Project A  │  │ Project B  │  │ Project C  │           │
│  └────────────┘  └────────────┘  └────────────┘           │
└────────────────────────────────────────────────────────────┘
```

## Technology Stack

### Frontend

- **Framework**: React 18+ with TypeScript
- **UI Library**: Tailwind CSS + shadcn/ui
- **Code Editor**: Monaco Editor
- **State Management**: Zustand
- **Real-time**: Socket.IO Client
- **HTTP Client**: Axios
- **Build Tool**: Vite

### Backend

- **Runtime**: Node.js 20+
- **Framework**: Express/Fastify
- **Real-time**: Socket.IO
- **Database**: MongoDB with Mongoose
- **Queue**: Bull/BullMQ with Redis
- **Authentication**: JWT + OAuth2
- **VM Management**: CodeSandbox SDK

### Infrastructure

- **Cloud VMs**: CodeSandbox
- **Caching**: Redis
- **File Storage**: S3/CloudFlare R2
- **Monitoring**: OpenTelemetry
- **Container Registry**: Docker Hub

## Core Components

### 1. Reusable Components from CLI

The following components from `packages/core` can be adapted:

```typescript
// Tool System
- DeclarativeTool base classes
- Tool validation and execution pipeline
- Security checks and sandboxing logic

// API Clients
- Qwen OAuth client
- OpenAI-compatible client
- Token management

// Session Management
- Turn handling
- Token counting
- Context compression

// Prompt Construction
- System prompts
- Tool documentation
- Environment context
```

### 2. New Web-Specific Components

```typescript
// VM Management
interface VMManager {
  createVM(projectId: string): Promise<VM>;
  reconnectVM(vmId: string): Promise<VM>;
  hibernateVM(vmId: string): Promise<void>;
  destroyVM(vmId: string): Promise<void>;
}

// Real-time Communication
interface RealtimeManager {
  broadcastTaskUpdate(taskId: string, update: TaskUpdate): void;
  subscribeToProject(projectId: string, clientId: string): void;
  unsubscribeFromProject(projectId: string, clientId: string): void;
}

// Background Job Processing
interface JobProcessor {
  enqueueTask(task: AITask): Promise<string>;
  getTaskStatus(taskId: string): Promise<TaskStatus>;
  cancelTask(taskId: string): Promise<void>;
}
```

## Database Schema (MongoDB)

### Projects Collection

```typescript
interface Project {
  _id: ObjectId;
  userId: string;
  vmId: string;
  name: string;
  description?: string;
  createdAt: Date;
  lastAccessed: Date;
  settings: {
    aiModel: string;
    temperature: number;
    maxTokens: number;
  };
  collaborators: {
    userId: string;
    role: 'owner' | 'editor' | 'viewer';
    addedAt: Date;
  }[];
  tags: string[];
}
```

### Tasks Collection

```typescript
interface Task {
  _id: ObjectId;
  projectId: ObjectId;
  userId: string;
  type: 'code_generation' | 'refactoring' | 'analysis' | 'multi_file_edit';
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
  priority: number;

  // Progress tracking
  progress: {
    percentage: number;
    currentStep: string;
    totalSteps: number;
    completedSteps: number;
  };

  // Task details
  prompt: string;
  context: {
    files: string[];
    previousTurns: number;
  };

  // Tool execution tracking
  toolCalls: {
    id: string;
    tool: string;
    params: any;
    status: 'pending' | 'running' | 'completed' | 'failed';
    result?: any;
    error?: string;
    startedAt?: Date;
    completedAt?: Date;
    duration?: number;
  }[];

  // Results and logs
  results: any[];
  logs: {
    timestamp: Date;
    level: 'info' | 'warn' | 'error' | 'debug';
    message: string;
    data?: any;
  }[];

  // Timestamps
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  updatedAt: Date;

  // Metadata
  retryCount: number;
  error?: string;
  cancelledBy?: string;
}
```

### Conversation History

```typescript
interface ConversationTurn {
  _id: ObjectId;
  projectId: ObjectId;
  userId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolCalls?: {
    id: string;
    tool: string;
    params: any;
    result?: any;
  }[];
  timestamp: Date;
  taskId?: ObjectId; // Link to background task if applicable
  tokenCount: {
    prompt: number;
    completion: number;
  };
}
```

### VM State Snapshots

```typescript
interface VMState {
  _id: ObjectId;
  projectId: ObjectId;
  vmId: string;
  snapshot: {
    files: {
      path: string;
      content: string;
      lastModified: Date;
    }[];
    openFiles: string[];
    terminals: {
      id: string;
      cwd: string;
      history: string[];
      output: string;
    }[];
    processes: {
      pid: number;
      command: string;
      status: 'running' | 'stopped';
      startedAt: Date;
    }[];
  };
  timestamp: Date;
  eventType: 'manual' | 'auto' | 'checkpoint';
}
```

### MongoDB Indexes

```javascript
// Projects
db.projects.createIndex({ userId: 1, lastAccessed: -1 });
db.projects.createIndex({ 'collaborators.userId': 1 });
db.projects.createIndex({ tags: 1 });

// Tasks
db.tasks.createIndex({ projectId: 1, status: 1, createdAt: -1 });
db.tasks.createIndex({ userId: 1, status: 1 });
db.tasks.createIndex({ status: 1, priority: -1, createdAt: 1 }); // For job queue
db.tasks.createIndex({ updatedAt: 1 }); // For change streams

// Conversation
db.conversation_turns.createIndex({ projectId: 1, timestamp: 1 });
db.conversation_turns.createIndex({ taskId: 1 });

// VM States
db.vm_states.createIndex({ projectId: 1, timestamp: -1 });
db.vm_states.createIndex({ vmId: 1, timestamp: -1 });
```

## Real-time Updates

### MongoDB Change Streams

```typescript
class RealtimeJobManager {
  private io: Server;
  private changeStreams: Map<string, ChangeStream> = new Map();

  async initializeGlobalChangeStream() {
    // Global task updates
    const pipeline = [
      {
        $match: {
          operationType: { $in: ['insert', 'update', 'replace'] },
          'fullDocument.status': { $exists: true },
        },
      },
    ];

    const tasksChangeStream = db.collection('tasks').watch(pipeline, {
      fullDocument: 'updateLookup',
    });

    tasksChangeStream.on('change', async (change) => {
      const task = change.fullDocument as Task;

      // Emit to project room
      this.io.to(`project:${task.projectId}`).emit('task:update', {
        taskId: task._id,
        status: task.status,
        progress: task.progress,
        logs: task.logs.slice(-10), // Last 10 logs
        updatedAt: task.updatedAt,
      });

      // Emit notification to user
      if (task.status === 'completed' || task.status === 'failed') {
        this.io.to(`user:${task.userId}`).emit('task:notification', {
          taskId: task._id,
          projectId: task.projectId,
          status: task.status,
          message: this.getNotificationMessage(task),
        });
      }
    });
  }

  // Project-specific subscriptions
  async subscribeToProject(projectId: string, socketId: string) {
    const socket = this.io.sockets.sockets.get(socketId);

    // Join project room
    socket.join(`project:${projectId}`);

    // Create project-specific change stream for fine-grained updates
    const pipeline = [
      {
        $match: {
          'fullDocument.projectId': new ObjectId(projectId),
          operationType: { $in: ['insert', 'update'] },
        },
      },
    ];

    const stream = db.collection('tasks').watch(pipeline, {
      fullDocument: 'updateLookup',
      fullDocumentBeforeChange: 'whenAvailable',
    });

    this.changeStreams.set(`${socketId}:${projectId}`, stream);

    stream.on('change', (change) => {
      // Detailed updates for subscribed clients
      socket.emit('project:task:detailed', {
        changeType: change.operationType,
        task: change.fullDocument,
        previousState: change.fullDocumentBeforeChange,
      });
    });
  }
}
```

### Client-Side Real-time Hooks

```typescript
// React Hook for Task Updates
export function useRealtimeTask(taskId: string) {
  const [task, setTask] = useState<Task | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const socket = io(BACKEND_URL, {
      auth: { token: getAuthToken() },
    });

    socket.on('connect', () => {
      setIsConnected(true);
      socket.emit('task:subscribe', { taskId });
    });

    socket.on('disconnect', () => setIsConnected(false));

    socket.on('task:update', (update: TaskUpdate) => {
      if (update.taskId === taskId) {
        setTask((prev) => ({ ...prev!, ...update }));

        if (update.logs) {
          setLogs((prev) => {
            const newLogs = update.logs.filter(
              (log) => !prev.some((l) => l.timestamp === log.timestamp),
            );
            return [...prev, ...newLogs];
          });
        }
      }
    });

    socket.on('task:tool:start', ({ toolIndex, tool }) => {
      setTask((prev) => {
        const updated = { ...prev! };
        updated.toolCalls[toolIndex].status = 'running';
        updated.toolCalls[toolIndex].startedAt = new Date();
        return updated;
      });
    });

    socket.on('task:tool:complete', ({ toolIndex, result }) => {
      setTask((prev) => {
        const updated = { ...prev! };
        updated.toolCalls[toolIndex].status = 'completed';
        updated.toolCalls[toolIndex].result = result;
        updated.toolCalls[toolIndex].completedAt = new Date();
        return updated;
      });
    });

    // Initial fetch
    fetchTask(taskId).then((data) => {
      setTask(data.task);
      setLogs(data.logs);
    });

    return () => {
      socket.emit('task:unsubscribe', { taskId });
      socket.disconnect();
    };
  }, [taskId]);

  return { task, logs, isConnected };
}

// Hook for Project-wide Updates
export function useProjectTasks(projectId: string) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activeTasks, setActiveTasks] = useState<Set<string>>(new Set());

  useEffect(() => {
    const socket = io(BACKEND_URL, {
      auth: { token: getAuthToken() },
    });

    socket.emit('project:join', { projectId });

    socket.on('task:created', (task: Task) => {
      setTasks((prev) => [task, ...prev]);
      if (task.status === 'processing') {
        setActiveTasks((prev) => new Set(prev).add(task._id.toString()));
      }
    });

    socket.on('task:update', (update: TaskUpdate) => {
      setTasks((prev) =>
        prev.map((t) =>
          t._id.toString() === update.taskId ? { ...t, ...update } : t,
        ),
      );

      if (update.status === 'completed' || update.status === 'failed') {
        setActiveTasks((prev) => {
          const next = new Set(prev);
          next.delete(update.taskId);
          return next;
        });
      }
    });

    // Fetch initial tasks
    fetchProjectTasks(projectId).then(setTasks);

    return () => {
      socket.emit('project:leave', { projectId });
      socket.disconnect();
    };
  }, [projectId]);

  return { tasks, activeTasks };
}
```

## Background Processing

### Task Queue Worker

```typescript
import Bull from 'bull';
import { ObjectId } from 'mongodb';

class TaskProcessor {
  private queue: Bull.Queue;
  private db: Db;
  private vmManager: VMManager;
  private ai: AIClient;

  constructor() {
    this.queue = new Bull('tasks', {
      redis: REDIS_CONFIG,
      defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: false,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    });

    this.setupWorkers();
  }

  private setupWorkers() {
    // Process AI tasks
    this.queue.process('ai-task', 5, async (job) => {
      const { taskId } = job.data;
      await this.processAITask(taskId);
    });

    // Process file operations
    this.queue.process('file-operation', 10, async (job) => {
      const { taskId, operation } = job.data;
      await this.processFileOperation(taskId, operation);
    });
  }

  async processAITask(taskId: string) {
    const task = await this.db.collection('tasks').findOne({
      _id: new ObjectId(taskId),
    });

    if (!task) throw new Error('Task not found');

    // Get or create VM
    const vm = await this.vmManager.getOrCreateVM(task.projectId);

    // Update task status
    await this.updateTask(taskId, {
      status: 'processing',
      startedAt: new Date(),
      'progress.percentage': 0,
      'progress.currentStep': 'Initializing AI agent',
    });

    try {
      // Get conversation context
      const context = await this.getConversationContext(task.projectId);

      // Initialize progress tracking
      const totalSteps = this.estimateSteps(task);
      let completedSteps = 0;

      // Main processing loop
      while (!this.isTaskComplete(task)) {
        // Get next action from AI
        const action = await this.ai.getNextAction({
          prompt: task.prompt,
          context,
          previousResults: task.results,
        });

        // Execute action
        if (action.type === 'tool_call') {
          const toolCall = {
            id: new ObjectId().toString(),
            tool: action.tool,
            params: action.params,
            status: 'running' as const,
            startedAt: new Date(),
          };

          // Add tool call to task
          await this.updateTask(taskId, {
            $push: { toolCalls: toolCall },
            'progress.currentStep': `Executing ${action.tool}`,
          });

          // Execute in VM
          const result = await this.executeToolInVM(vm, action);

          // Update with result
          completedSteps++;
          await this.updateTask(taskId, {
            [`toolCalls.${task.toolCalls.length}.status`]: 'completed',
            [`toolCalls.${task.toolCalls.length}.result`]: result,
            [`toolCalls.${task.toolCalls.length}.completedAt`]: new Date(),
            'progress.completedSteps': completedSteps,
            'progress.percentage': Math.round(
              (completedSteps / totalSteps) * 100,
            ),
            $push: {
              results: result,
              logs: {
                timestamp: new Date(),
                level: 'info',
                message: `Completed ${action.tool}`,
                data: { duration: Date.now() - toolCall.startedAt.getTime() },
              },
            },
          });

          // Update task object for next iteration
          task.results.push(result);
          task.toolCalls.push({ ...toolCall, status: 'completed', result });
        }

        // Check if task is complete
        if (action.type === 'complete') {
          break;
        }
      }

      // Mark task as completed
      await this.updateTask(taskId, {
        status: 'completed',
        completedAt: new Date(),
        'progress.percentage': 100,
        'progress.currentStep': 'Task completed successfully',
      });
    } catch (error) {
      // Handle errors
      await this.updateTask(taskId, {
        status: 'failed',
        error: error.message,
        completedAt: new Date(),
        $push: {
          logs: {
            timestamp: new Date(),
            level: 'error',
            message: `Task failed: ${error.message}`,
            data: { stack: error.stack },
          },
        },
      });

      throw error; // Let Bull handle retries
    }
  }

  private async executeToolInVM(vm: VM, action: any) {
    // Map tool to VM execution
    switch (action.tool) {
      case 'file_read':
        return await vm.readFile(action.params.path);

      case 'file_write':
        return await vm.writeFile(action.params.path, action.params.content);

      case 'shell_execute':
        return await vm.exec(action.params.command, {
          cwd: action.params.cwd,
          timeout: action.params.timeout || 30000,
        });

      case 'search':
        return await vm.search(action.params.pattern, action.params.path);

      default:
        throw new Error(`Unknown tool: ${action.tool}`);
    }
  }

  private async updateTask(taskId: string, update: any) {
    // Always update the updatedAt timestamp
    update.updatedAt = new Date();

    // Perform atomic update
    const result = await this.db
      .collection('tasks')
      .findOneAndUpdate(
        { _id: new ObjectId(taskId) },
        { $set: update },
        { returnDocument: 'after' },
      );

    return result.value;
  }
}
```

### Task Scheduling and Priority

```typescript
class TaskScheduler {
  async enqueueTask(task: Omit<Task, '_id' | 'createdAt' | 'updatedAt'>) {
    // Create task in database
    const taskDoc = {
      ...task,
      _id: new ObjectId(),
      status: 'queued' as const,
      createdAt: new Date(),
      updatedAt: new Date(),
      logs: [
        {
          timestamp: new Date(),
          level: 'info' as const,
          message: 'Task created and queued',
        },
      ],
    };

    await this.db.collection('tasks').insertOne(taskDoc);

    // Add to queue with priority
    const jobOptions = {
      priority: task.priority,
      delay: 0,
      attempts: 3,
    };

    await this.queue.add(
      'ai-task',
      {
        taskId: taskDoc._id.toString(),
      },
      jobOptions,
    );

    return taskDoc._id.toString();
  }

  async cancelTask(taskId: string) {
    // Update task status
    await this.db.collection('tasks').updateOne(
      { _id: new ObjectId(taskId) },
      {
        $set: {
          status: 'cancelled',
          cancelledAt: new Date(),
          updatedAt: new Date(),
        },
      },
    );

    // Find and remove from queue
    const jobs = await this.queue.getJobs(['waiting', 'delayed']);
    const job = jobs.find((j) => j.data.taskId === taskId);

    if (job) {
      await job.remove();
    }
  }
}
```

## CodeSandbox Integration

### VM Manager

```typescript
import { CodeSandbox } from '@codesandbox/sdk';

class CodeSandboxVMManager implements VMManager {
  private client: CodeSandbox;
  private vmCache: Map<string, VM> = new Map();

  constructor() {
    this.client = new CodeSandbox({
      apiKey: process.env.CODESANDBOX_API_KEY,
    });
  }

  async createVM(projectId: string): Promise<VM> {
    // Create new VM with persistent storage
    const vm = await this.client.createVM({
      name: `qwen-project-${projectId}`,
      template: 'node',
      specs: {
        cpu: 2,
        memory: 4096,
        storage: 10240, // 10GB
      },
      persistent: true,
      autoSleep: {
        enabled: true,
        idleMinutes: 30,
      },
    });

    // Install required tools
    await this.setupVM(vm);

    // Cache VM reference
    this.vmCache.set(projectId, vm);

    // Store VM ID in database
    await this.db
      .collection('projects')
      .updateOne({ _id: new ObjectId(projectId) }, { $set: { vmId: vm.id } });

    return vm;
  }

  async reconnectVM(vmId: string): Promise<VM> {
    // Check cache first
    const cached = Array.from(this.vmCache.entries()).find(
      ([_, vm]) => vm.id === vmId,
    );

    if (cached) {
      return cached[1];
    }

    // Reconnect to existing VM
    const vm = await this.client.getVM(vmId);

    // Wake up if hibernated
    if (vm.status === 'sleeping') {
      await vm.wake();
    }

    return vm;
  }

  private async setupVM(vm: VM) {
    // Install base dependencies
    await vm.exec('npm install -g npm@latest');

    // Install our tool execution environment
    const setupScript = `
      # Create tool execution environment
      mkdir -p /home/qwen/tools
      cd /home/qwen/tools
      
      # Create package.json
      cat > package.json << 'EOF'
      {
        "name": "qwen-tools",
        "type": "module",
        "dependencies": {
          "@qwen-code/core": "latest",
          "glob": "latest",
          "ripgrep": "latest"
        }
      }
      EOF
      
      # Install dependencies
      npm install
    `;

    await vm.exec(setupScript);
  }

  async executeInVM(vm: VM, tool: string, params: any): Promise<any> {
    // Create execution script
    const script = `
      import { ${tool} } from '@qwen-code/core/tools';
      
      const tool = new ${tool}();
      const result = await tool.execute(${JSON.stringify(params)});
      
      console.log(JSON.stringify({ success: true, result }));
    `;

    // Write script to VM
    const scriptPath = `/tmp/execute-${Date.now()}.mjs`;
    await vm.writeFile(scriptPath, script);

    // Execute and capture output
    const { stdout, stderr, exitCode } = await vm.exec(`node ${scriptPath}`, {
      timeout: 60000, // 1 minute timeout
    });

    // Clean up
    await vm.exec(`rm ${scriptPath}`);

    if (exitCode !== 0) {
      throw new Error(`Tool execution failed: ${stderr}`);
    }

    return JSON.parse(stdout).result;
  }

  // File system operations
  async readFile(vm: VM, path: string): Promise<string> {
    return await vm.readFile(path);
  }

  async writeFile(vm: VM, path: string, content: string): Promise<void> {
    await vm.writeFile(path, content);
  }

  async listDirectory(vm: VM, path: string): Promise<FileInfo[]> {
    const result = await vm.exec(`ls -la ${path} --format=json`);
    return JSON.parse(result.stdout);
  }

  // Terminal operations
  async createTerminal(vm: VM, id: string): Promise<Terminal> {
    return await vm.createTerminal({
      id,
      cols: 80,
      rows: 24,
    });
  }

  // Process management
  async listProcesses(vm: VM): Promise<Process[]> {
    const result = await vm.exec('ps aux --format=json');
    return JSON.parse(result.stdout);
  }
}
```

### VM State Synchronization

```typescript
class VMStateSync {
  private syncInterval: NodeJS.Timer;

  async startSync(projectId: string, vm: VM) {
    // Initial sync
    await this.syncVMState(projectId, vm);

    // Set up periodic sync
    this.syncInterval = setInterval(async () => {
      await this.syncVMState(projectId, vm);
    }, 30000); // Every 30 seconds
  }

  async syncVMState(projectId: string, vm: VM) {
    try {
      // Get current VM state
      const files = await this.getFileTree(vm, '/home/project');
      const terminals = await vm.getTerminals();
      const processes = await this.listProcesses(vm);

      // Create state snapshot
      const snapshot: VMState = {
        _id: new ObjectId(),
        projectId: new ObjectId(projectId),
        vmId: vm.id,
        snapshot: {
          files,
          openFiles: await this.getOpenFiles(vm),
          terminals: terminals.map((t) => ({
            id: t.id,
            cwd: t.cwd,
            history: t.history,
            output: t.getOutput(),
          })),
          processes,
        },
        timestamp: new Date(),
        eventType: 'auto',
      };

      // Store snapshot
      await this.db.collection('vm_states').insertOne(snapshot);

      // Emit update to connected clients
      this.io.to(`project:${projectId}`).emit('vm:state:update', {
        files: snapshot.snapshot.files,
        terminals: snapshot.snapshot.terminals,
      });
    } catch (error) {
      console.error('VM state sync failed:', error);
    }
  }

  private async getFileTree(vm: VM, basePath: string): Promise<FileInfo[]> {
    const findCmd = `find ${basePath} -type f -name "*" ! -path "*/node_modules/*" ! -path "*/.git/*" -exec stat -c '{"path":"%n","size":%s,"modified":%Y}' {} \\; | jq -s '.'`;

    const result = await vm.exec(findCmd);
    return JSON.parse(result.stdout);
  }
}
```

## API Design

### REST Endpoints

```typescript
// Authentication
POST   /api/auth/login
POST   /api/auth/logout
POST   /api/auth/refresh
GET    /api/auth/session

// Projects
GET    /api/projects                 // List user's projects
POST   /api/projects                 // Create new project
GET    /api/projects/:id             // Get project details
PUT    /api/projects/:id             // Update project
DELETE /api/projects/:id             // Delete project
POST   /api/projects/:id/fork        // Fork project

// Tasks
GET    /api/projects/:id/tasks       // List project tasks
POST   /api/projects/:id/tasks       // Create new task
GET    /api/tasks/:id                // Get task details
POST   /api/tasks/:id/cancel         // Cancel task
GET    /api/tasks/:id/logs           // Get task logs

// Conversation
GET    /api/projects/:id/conversation // Get conversation history
POST   /api/projects/:id/conversation // Add message

// VM Operations
GET    /api/projects/:id/files       // List files
GET    /api/projects/:id/files/*     // Read file
PUT    /api/projects/:id/files/*     // Write file
DELETE /api/projects/:id/files/*     // Delete file
POST   /api/projects/:id/exec        // Execute command

// Collaboration
POST   /api/projects/:id/share       // Share project
GET    /api/projects/:id/collaborators // List collaborators
DELETE /api/projects/:id/collaborators/:userId // Remove collaborator
```

### WebSocket Events

```typescript
// Client → Server Events
interface ClientEvents {
  // Connection
  auth: { token: string };
  'project:join': { projectId: string };
  'project:leave': { projectId: string };

  // Tasks
  'task:create': {
    projectId: string;
    prompt: string;
    priority?: number;
  };
  'task:subscribe': { taskId: string };
  'task:unsubscribe': { taskId: string };
  'task:cancel': { taskId: string };

  // VM Interaction
  'vm:terminal:create': { terminalId: string };
  'vm:terminal:input': { terminalId: string; data: string };
  'vm:terminal:resize': { terminalId: string; cols: number; rows: number };
  'vm:file:watch': { path: string };
  'vm:file:unwatch': { path: string };

  // Collaboration
  'cursor:move': { file: string; position: Position };
  'selection:change': { file: string; selection: Selection };
}

// Server → Client Events
interface ServerEvents {
  // Connection
  'auth:success': { userId: string; projects: string[] };
  'auth:error': { message: string };

  // Tasks
  'task:created': { task: Task };
  'task:update': {
    taskId: string;
    status: TaskStatus;
    progress?: Progress;
    logs?: LogEntry[];
  };
  'task:log': { taskId: string; log: LogEntry };
  'task:tool:start': {
    taskId: string;
    toolIndex: number;
    tool: string;
  };
  'task:tool:complete': {
    taskId: string;
    toolIndex: number;
    result: any;
  };
  'task:notification': {
    taskId: string;
    projectId: string;
    status: TaskStatus;
    message: string;
  };

  // VM Updates
  'vm:terminal:output': { terminalId: string; data: string };
  'vm:file:change': { path: string; content: string };
  'vm:file:delete': { path: string };
  'vm:process:start': { process: Process };
  'vm:process:exit': { pid: number; exitCode: number };

  // Collaboration
  'collaborator:cursor': {
    userId: string;
    file: string;
    position: Position;
  };
  'collaborator:selection': {
    userId: string;
    file: string;
    selection: Selection;
  };
  'collaborator:joined': { user: User };
  'collaborator:left': { userId: string };
}
```

## Security

### Authentication & Authorization

```typescript
// JWT Token Payload
interface TokenPayload {
  userId: string;
  email: string;
  plan: 'free' | 'pro' | 'enterprise';
  exp: number;
  iat: number;
}

// Middleware
export const authenticate = async (req: Request, res: Response, next: Next) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as TokenPayload;
    req.user = await getUserById(payload.userId);
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

export const authorizeProject = async (
  req: Request,
  res: Response,
  next: Next,
) => {
  const { projectId } = req.params;
  const userId = req.user.id;

  const project = await db.collection('projects').findOne({
    _id: new ObjectId(projectId),
    $or: [{ userId }, { 'collaborators.userId': userId }],
  });

  if (!project) {
    return res.status(403).json({ error: 'Access denied' });
  }

  req.project = project;
  next();
};
```

### Rate Limiting

```typescript
// Rate limiter configuration
const rateLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'rl:',
  points: 100, // Number of points
  duration: 60, // Per 60 seconds
  blockDuration: 60 * 10, // Block for 10 minutes
});

// Task creation rate limit
const taskRateLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'rl:task:',
  points: 20, // 20 tasks
  duration: 60 * 60, // Per hour
});

export const rateLimit = async (req: Request, res: Response, next: Next) => {
  try {
    await rateLimiter.consume(req.user.id);
    next();
  } catch (rejRes) {
    res.status(429).json({
      error: 'Too many requests',
      retryAfter: Math.round(rejRes.msBeforeNext / 1000) || 60,
    });
  }
};
```

### Input Validation

```typescript
import { z } from 'zod';

// Task creation schema
const createTaskSchema = z.object({
  prompt: z.string().min(1).max(10000),
  priority: z.number().min(0).max(10).optional(),
  context: z
    .object({
      files: z.array(z.string()).max(50).optional(),
      includeHistory: z.boolean().optional(),
    })
    .optional(),
});

// File path validation
const filePathSchema = z
  .string()
  .regex(/^\/[a-zA-Z0-9._\-\/]+$/)
  .refine((path) => !path.includes('..'), {
    message: 'Path traversal not allowed',
  });

export const validateInput = (schema: z.ZodSchema) => {
  return (req: Request, res: Response, next: Next) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      res.status(400).json({
        error: 'Invalid input',
        details: error.errors,
      });
    }
  };
};
```

### VM Security

```typescript
class VMSecurity {
  // Resource limits per VM
  private readonly limits = {
    cpu: 2,
    memory: 4096, // MB
    storage: 10240, // MB
    processes: 50,
    openFiles: 1000,
    networkBandwidth: 100, // Mbps
  };

  // Forbidden paths
  private readonly forbiddenPaths = [
    '/etc',
    '/root',
    '/var',
    '/usr',
    '/bin',
    '/sbin',
    '/proc',
    '/sys',
  ];

  validatePath(path: string): boolean {
    // Must be absolute path
    if (!path.startsWith('/')) return false;

    // Check forbidden paths
    for (const forbidden of this.forbiddenPaths) {
      if (path.startsWith(forbidden)) return false;
    }

    // No path traversal
    if (path.includes('..')) return false;

    return true;
  }

  validateCommand(command: string): boolean {
    // Forbidden commands
    const forbidden = [
      'sudo',
      'su',
      'chmod',
      'chown',
      'mount',
      'umount',
      'systemctl',
      'apt',
      'yum',
      'pacman',
    ];

    const cmd = command.trim().split(' ')[0];
    return !forbidden.includes(cmd);
  }

  async enforceResourceLimits(vm: VM) {
    // Set cgroup limits
    await vm.exec(`
      # CPU limit
      echo "${this.limits.cpu * 100000}" > /sys/fs/cgroup/cpu/cpu.cfs_quota_us
      
      # Memory limit
      echo "${this.limits.memory}M" > /sys/fs/cgroup/memory/memory.limit_in_bytes
      
      # Process limit
      ulimit -u ${this.limits.processes}
      
      # File limit
      ulimit -n ${this.limits.openFiles}
    `);
  }
}
```

## Implementation Phases

### Phase 1: MVP (4-6 weeks)

**Week 1-2: Core Infrastructure**

- [ ] Set up monorepo structure
- [ ] Configure MongoDB with schemas
- [ ] Implement authentication system
- [ ] Create basic API gateway
- [ ] Set up WebSocket server

**Week 3-4: CodeSandbox Integration**

- [ ] Integrate CodeSandbox SDK
- [ ] Implement VM lifecycle management
- [ ] Create file operations API
- [ ] Build terminal proxy

**Week 5-6: Basic UI**

- [ ] Create React app with Vite
- [ ] Implement chat interface
- [ ] Add Monaco editor
- [ ] Build file explorer
- [ ] Connect to WebSocket

### Phase 2: Background Processing (4-6 weeks)

**Week 1-2: Task Queue**

- [ ] Set up Bull/BullMQ
- [ ] Implement task processor
- [ ] Create job scheduling system
- [ ] Add progress tracking

**Week 3-4: Real-time Updates**

- [ ] Configure MongoDB Change Streams
- [ ] Implement WebSocket event system
- [ ] Create real-time hooks
- [ ] Build notification system

**Week 5-6: AI Integration**

- [ ] Port AI clients from CLI
- [ ] Adapt tool system for VM execution
- [ ] Implement conversation management
- [ ] Add token counting/compression

### Phase 3: Advanced Features (4-6 weeks)

**Week 1-2: Collaboration**

- [ ] Multi-user session support
- [ ] Real-time cursor sharing
- [ ] Implement permissions system
- [ ] Add project sharing

**Week 3-4: Enhanced UI/UX**

- [ ] Git integration UI
- [ ] Diff viewer
- [ ] Task timeline visualization
- [ ] Settings management

**Week 5-6: Production Ready**

- [ ] Performance optimization
- [ ] Error handling & recovery
- [ ] Monitoring & logging
- [ ] Documentation
- [ ] Deployment automation

## Performance Considerations

### Caching Strategy

```typescript
// Redis caching layer
class CacheManager {
  private redis: Redis;

  // Cache frequently accessed data
  async getProject(projectId: string): Promise<Project> {
    const cacheKey = `project:${projectId}`;

    // Try cache first
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // Fetch from DB
    const project = await db.collection('projects').findOne({
      _id: new ObjectId(projectId),
    });

    // Cache for 5 minutes
    await this.redis.setex(cacheKey, 300, JSON.stringify(project));

    return project;
  }

  // Invalidate cache on updates
  async invalidateProject(projectId: string) {
    await this.redis.del(`project:${projectId}`);
  }
}
```

### Database Optimization

```javascript
// Aggregation pipeline for efficient queries
async function getProjectDashboard(projectId) {
  return await db
    .collection('projects')
    .aggregate([
      { $match: { _id: new ObjectId(projectId) } },
      {
        $lookup: {
          from: 'tasks',
          let: { projectId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$projectId', '$$projectId'] },
              },
            },
            { $sort: { createdAt: -1 } },
            { $limit: 10 },
          ],
          as: 'recentTasks',
        },
      },
      {
        $lookup: {
          from: 'conversation_turns',
          let: { projectId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$projectId', '$$projectId'] },
              },
            },
            { $sort: { timestamp: -1 } },
            { $limit: 50 },
          ],
          as: 'recentConversation',
        },
      },
    ])
    .toArray();
}
```

### VM Resource Management

```typescript
class VMResourceManager {
  private activeVMs: Map<string, VMInstance> = new Map();
  private vmPool: VMInstance[] = [];

  async getVM(projectId: string): Promise<VM> {
    // Check if VM is already active
    const active = this.activeVMs.get(projectId);
    if (active) {
      active.lastAccessed = Date.now();
      return active.vm;
    }

    // Try to get from pool
    const pooled = this.vmPool.pop();
    if (pooled) {
      await this.assignVMToProject(pooled, projectId);
      return pooled.vm;
    }

    // Create new VM
    return await this.createVM(projectId);
  }

  // Hibernate inactive VMs
  async hibernateInactiveVMs() {
    const now = Date.now();
    const inactiveThreshold = 30 * 60 * 1000; // 30 minutes

    for (const [projectId, instance] of this.activeVMs) {
      if (now - instance.lastAccessed > inactiveThreshold) {
        await instance.vm.hibernate();
        this.activeVMs.delete(projectId);

        // Return to pool if generic
        if (instance.isPoolable) {
          this.vmPool.push(instance);
        }
      }
    }
  }

  // Pre-warm VMs for better performance
  async prewarmVMs(count: number) {
    const promises = [];

    for (let i = 0; i < count; i++) {
      promises.push(this.createGenericVM());
    }

    const vms = await Promise.all(promises);
    this.vmPool.push(...vms);
  }
}
```

## Monitoring & Observability

### OpenTelemetry Setup

```typescript
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
  }),
  instrumentations: [
    getNodeAutoInstrumentations(),
    new MongoDBInstrumentation(),
    new RedisInstrumentation(),
    new HttpInstrumentation(),
  ],
});

// Custom spans for business logic
export function traceTaskExecution(taskId: string) {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const span = tracer.startSpan(`task.${propertyKey}`, {
        attributes: {
          'task.id': taskId,
          'task.method': propertyKey,
        },
      });

      try {
        const result = await originalMethod.apply(this, args);
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error.message,
        });
        throw error;
      } finally {
        span.end();
      }
    };
  };
}
```

### Metrics Collection

```typescript
// Prometheus metrics
const promClient = require('prom-client');

const metrics = {
  taskCounter: new promClient.Counter({
    name: 'tasks_total',
    help: 'Total number of tasks created',
    labelNames: ['type', 'status'],
  }),

  taskDuration: new promClient.Histogram({
    name: 'task_duration_seconds',
    help: 'Task execution duration',
    labelNames: ['type'],
    buckets: [0.1, 0.5, 1, 5, 10, 30, 60, 120, 300],
  }),

  vmGauge: new promClient.Gauge({
    name: 'active_vms',
    help: 'Number of active VMs',
    labelNames: ['status'],
  }),

  wsConnections: new promClient.Gauge({
    name: 'websocket_connections',
    help: 'Number of active WebSocket connections',
  }),
};

// Expose metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', promClient.register.contentType);
  res.end(await promClient.register.metrics());
});
```

## Deployment Architecture

### Docker Compose (Development)

```yaml
version: '3.8'

services:
  mongodb:
    image: mongo:7.0
    environment:
      MONGO_INITDB_ROOT_USERNAME: admin
      MONGO_INITDB_ROOT_PASSWORD: password
    volumes:
      - mongodb_data:/data/db
    ports:
      - '27017:27017'

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
    ports:
      - '6379:6379'

  api:
    build:
      context: .
      dockerfile: Dockerfile.api
    environment:
      NODE_ENV: development
      MONGODB_URI: mongodb://admin:password@mongodb:27017/qwencode
      REDIS_URL: redis://redis:6379
      CODESANDBOX_API_KEY: ${CODESANDBOX_API_KEY}
      JWT_SECRET: ${JWT_SECRET}
    ports:
      - '3000:3000'
    depends_on:
      - mongodb
      - redis

  worker:
    build:
      context: .
      dockerfile: Dockerfile.worker
    environment:
      NODE_ENV: development
      MONGODB_URI: mongodb://admin:password@mongodb:27017/qwencode
      REDIS_URL: redis://redis:6379
      CODESANDBOX_API_KEY: ${CODESANDBOX_API_KEY}
    depends_on:
      - mongodb
      - redis

  frontend:
    build:
      context: .
      dockerfile: Dockerfile.frontend
    environment:
      VITE_API_URL: http://localhost:3000
      VITE_WS_URL: ws://localhost:3000
    ports:
      - '5173:5173'
    depends_on:
      - api

volumes:
  mongodb_data:
  redis_data:
```

### Kubernetes (Production)

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: qwencode-api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: qwencode-api
  template:
    metadata:
      labels:
        app: qwencode-api
    spec:
      containers:
        - name: api
          image: qwencode/api:latest
          ports:
            - containerPort: 3000
          env:
            - name: MONGODB_URI
              valueFrom:
                secretKeyRef:
                  name: qwencode-secrets
                  key: mongodb-uri
            - name: REDIS_URL
              valueFrom:
                secretKeyRef:
                  name: qwencode-secrets
                  key: redis-url
          resources:
            requests:
              memory: '512Mi'
              cpu: '500m'
            limits:
              memory: '1Gi'
              cpu: '1000m'
---
apiVersion: v1
kind: Service
metadata:
  name: qwencode-api
spec:
  selector:
    app: qwencode-api
  ports:
    - port: 80
      targetPort: 3000
  type: LoadBalancer
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: qwencode-api-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: qwencode-api
  minReplicas: 3
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
```

## Cost Optimization

### VM Pooling Strategy

```typescript
class VMPoolManager {
  private pools: Map<string, VMPool> = new Map();

  constructor() {
    // Create pools for different VM sizes
    this.pools.set(
      'small',
      new VMPool({
        size: 10,
        specs: { cpu: 1, memory: 2048 },
      }),
    );

    this.pools.set(
      'medium',
      new VMPool({
        size: 5,
        specs: { cpu: 2, memory: 4096 },
      }),
    );

    this.pools.set(
      'large',
      new VMPool({
        size: 2,
        specs: { cpu: 4, memory: 8192 },
      }),
    );
  }

  async allocateVM(requirements: VMRequirements): Promise<VM> {
    const poolType = this.determinePoolType(requirements);
    const pool = this.pools.get(poolType);

    // Try to get from pool
    const vm = await pool.acquire();
    if (vm) return vm;

    // Create on-demand if pool is empty
    return await this.createOnDemandVM(requirements);
  }

  // Predict VM needs based on usage patterns
  async optimizePools() {
    const usageStats = await this.getUsageStatistics();

    for (const [type, pool] of this.pools) {
      const stats = usageStats[type];

      // Adjust pool size based on usage
      if (stats.avgWaitTime > 5000) {
        // Increase pool size if wait time is high
        pool.resize(pool.size + 1);
      } else if (stats.utilizationRate < 0.5) {
        // Decrease pool size if underutilized
        pool.resize(Math.max(1, pool.size - 1));
      }
    }
  }
}
```

### Intelligent Caching

```typescript
class SmartCache {
  private cache: LRUCache<string, any>;
  private hitRates: Map<string, number> = new Map();

  constructor() {
    this.cache = new LRUCache({
      max: 1000,
      ttl: 1000 * 60 * 5, // 5 minutes
      updateAgeOnGet: true,
      updateAgeOnHas: true,
    });
  }

  async get(key: string, fetcher: () => Promise<any>): Promise<any> {
    // Track hit rate
    const hits = this.hitRates.get(key) || 0;

    const cached = this.cache.get(key);
    if (cached) {
      this.hitRates.set(key, hits + 1);
      return cached;
    }

    // Fetch and cache
    const value = await fetcher();

    // Only cache if it's worth it (based on hit rate)
    if (hits > 2 || this.isPredictedHotKey(key)) {
      this.cache.set(key, value);
    }

    return value;
  }

  private isPredictedHotKey(key: string): boolean {
    // Predict if this key will be accessed frequently
    // based on patterns (e.g., recent projects, active tasks)
    return key.includes('recent') || key.includes('active');
  }
}
```

## Conclusion

This architecture provides a robust foundation for transforming the Qwen Code CLI into a web application with:

1. **Persistent Cloud VMs** via CodeSandbox for isolated execution environments
2. **Background Processing** with job queues for long-running AI tasks
3. **Real-time Updates** using MongoDB Change Streams and WebSocket
4. **Scalable Architecture** supporting multiple concurrent users and projects
5. **Security** with proper authentication, authorization, and VM isolation
6. **Performance** optimizations including caching, pooling, and efficient queries

The modular design allows for incremental development while maintaining the ability to scale as usage grows.
