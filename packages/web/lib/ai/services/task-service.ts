import { Task } from '@/lib/db/schemas/task';
import { connectMongoose } from '@/lib/db/mongodb';
import { ToolCallRequestInfo } from '@catalyst/core';

export class TaskService {
  /**
   * Create a new task
   */
  async createTask(
    projectId: string,
    userId: string,
    prompt: string
  ): Promise<any> {
    await connectMongoose();
    
    const task = new Task({
      projectId: projectId,
      userId: userId,
      type: 'code_generation',
      prompt: prompt,
      priority: 5,
      status: 'processing',
      progress: {
        percentage: 10,
        currentStep: 'Processing with AI',
        totalSteps: 3,
        completedSteps: 0,
      },
      logs: [
        {
          timestamp: new Date(),
          level: 'info',
          message: 'Starting AI processing',
        },
      ],
    });

    await task.save();
    return task;
  }

  /**
   * Update task with tool call
   */
  async addToolCallToTask(
    taskId: string,
    toolCall: ToolCallRequestInfo
  ): Promise<void> {
    const task = await Task.findById(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    task.toolCalls.push({
      id: toolCall.callId,
      tool: toolCall.name,
      params: toolCall.args,
      status: 'pending',
      startedAt: new Date(),
    });
    
    task.progress.currentStep = `Executing ${toolCall.name}`;
    task.progress.percentage = 50;
    
    await task.save();
  }

  /**
   * Update tool call result
   */
  async updateToolCallResult(
    taskId: string,
    callId: string,
    status: 'completed' | 'failed',
    result?: any
  ): Promise<void> {
    const task = await Task.findById(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    const toolCall = task.toolCalls.find((tc: any) => tc.id === callId);
    if (toolCall) {
      toolCall.status = status;
      toolCall.result = result;
      toolCall.completedAt = new Date();
      await task.save();
    }
  }

  /**
   * Complete task successfully
   */
  async completeTask(
    taskId: string,
    response: string,
    metadata: {
      model?: string;
      toolCalls: number;
      toolResponses: number;
    }
  ): Promise<any> {
    const task = await Task.findById(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    task.status = 'completed';
    task.progress.percentage = 100;
    task.progress.currentStep = 'Completed';
    task.progress.completedSteps = task.progress.totalSteps;
    
    task.results.push({
      type: 'ai_response',
      content: response,
      metadata: metadata,
    });
    
    await task.save();
    return task;
  }

  /**
   * Mark task as failed
   */
  async failTask(
    taskId: string,
    error: string
  ): Promise<void> {
    const task = await Task.findById(taskId);
    if (!task) {
      // Task might not exist yet if error occurred early
      return;
    }

    task.status = 'failed';
    task.error = error;
    task.progress.currentStep = 'Failed';
    
    await task.save();
  }

  /**
   * Get latest task for a project and user
   */
  async getLatestTask(
    projectId: string,
    userId: string
  ): Promise<any> {
    return await Task.findOne({
      projectId,
      userId,
    }).sort({ createdAt: -1 });
  }
}