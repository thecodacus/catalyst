import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { connectMongoose } from '@/lib/db/mongodb';
import { Project } from '@/lib/db/schemas/project';
import { Task } from '@/lib/db/schemas/task';
import { Types } from 'mongoose';

interface RouteParams {
  params: Promise<{
    projectId: string;
  }>;
}

// GET /api/projects/[projectId]/tasks - List project tasks
export async function GET(request: NextRequest, { params }: RouteParams) {
  return withAuth(request, async (req, user) => {
    try {
      const { projectId } = await params;

      // Validate projectId is a valid ObjectId
      if (!Types.ObjectId.isValid(projectId)) {
        return NextResponse.json(
          { error: 'Invalid project ID' },
          { status: 400 },
        );
      }

      await connectMongoose();

      // Verify user has access to project
      const project = await Project.findOne({
        _id: projectId,
        $or: [{ userId: user.userId }, { 'collaborators.userId': user.userId }],
      });

      if (!project) {
        return NextResponse.json(
          { error: 'Project not found' },
          { status: 404 },
        );
      }

      // Get tasks
      const tasks = await Task.find({ projectId: projectId })
        .sort({ createdAt: -1 })
        .limit(100);

      return NextResponse.json(tasks);
    } catch (error) {
      console.error('Error fetching tasks:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 },
      );
    }
  });
}

// POST /api/projects/[projectId]/tasks - Create new task
export async function POST(request: NextRequest, { params }: RouteParams) {
  return withAuth(request, async (req, user) => {
    try {
      const { projectId } = await params;
      const { prompt, priority = 5 } = await req.json();

      // Validate projectId is a valid ObjectId
      if (!Types.ObjectId.isValid(projectId)) {
        return NextResponse.json(
          { error: 'Invalid project ID' },
          { status: 400 },
        );
      }

      if (!prompt) {
        return NextResponse.json(
          { error: 'Task prompt is required' },
          { status: 400 },
        );
      }

      await connectMongoose();

      // Verify user has access to project
      const project = await Project.findOne({
        _id: projectId,
        $or: [
          { userId: user.userId },
          {
            collaborators: {
              $elemMatch: {
                userId: user.userId,
                role: { $in: ['owner', 'editor'] },
              },
            },
          },
        ],
      });

      if (!project) {
        return NextResponse.json(
          { error: 'Project not found or insufficient permissions' },
          { status: 404 },
        );
      }

      // Create task
      const task = new Task({
        projectId: projectId,
        userId: user.userId,
        type: 'code_generation', // Default type
        prompt,
        priority,
        status: 'queued',
        progress: {
          percentage: 0,
          currentStep: 'Queued',
          totalSteps: 0,
          completedSteps: 0,
        },
        logs: [
          {
            timestamp: new Date(),
            level: 'info',
            message: 'Task created and queued',
          },
        ],
      });

      await task.save();

      // TODO: Add task to queue for processing

      return NextResponse.json(task);
    } catch (error) {
      console.error('Error creating task:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 },
      );
    }
  });
}
