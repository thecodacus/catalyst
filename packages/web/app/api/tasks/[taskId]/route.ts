import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { connectMongoose } from '@/lib/db/mongodb';
import { Task } from '@/lib/db/schemas/task';

interface RouteParams {
  params: Promise<{
    taskId: string;
  }>;
}

// GET /api/tasks/[taskId] - Get task details
export async function GET(request: NextRequest, { params }: RouteParams) {
  return withAuth(request, async (req, user) => {
    try {
      const { taskId } = await params;
      await connectMongoose();

      const task = await Task.findOne({
        _id: taskId,
        userId: user.userId,
      });

      if (!task) {
        return NextResponse.json({ error: 'Task not found' }, { status: 404 });
      }

      return NextResponse.json({
        task,
        logs: task.logs.slice(-100), // Last 100 logs
      });
    } catch (error) {
      console.error('Error fetching task:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 },
      );
    }
  });
}
