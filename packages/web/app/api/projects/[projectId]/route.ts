import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { connectMongoose } from '@/lib/db/mongodb';
import { Project } from '@/lib/db/schemas/project';

interface RouteParams {
  params: Promise<{
    projectId: string;
  }>;
}

// GET /api/projects/[projectId] - Get project details
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { projectId } = await params;
  return withAuth(request, async (req, user) => {
    try {
      await connectMongoose();

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

      // Update last accessed
      project.lastAccessed = new Date();
      await project.save();

      return NextResponse.json(project);
    } catch (error) {
      console.error('Error fetching project:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 },
      );
    }
  });
}

// PUT /api/projects/[projectId] - Update project
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const { projectId } = await params;
  return withAuth(request, async (req, user) => {
    try {
      const updates = await req.json();
      await connectMongoose();

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

      // Update allowed fields
      if (updates.name) project.name = updates.name;
      if (updates.description !== undefined)
        project.description = updates.description;
      if (updates.settings) {
        project.settings = { ...project.settings, ...updates.settings };
      }
      if (updates.tags) project.tags = updates.tags;

      await project.save();

      return NextResponse.json(project);
    } catch (error) {
      console.error('Error updating project:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 },
      );
    }
  });
}

// DELETE /api/projects/[projectId] - Delete project
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { projectId } = await params;
  return withAuth(request, async (req, user) => {
    try {
      await connectMongoose();

      const project = await Project.findOne({
        _id: projectId,
        userId: user.userId, // Only owner can delete
      });

      if (!project) {
        return NextResponse.json(
          { error: 'Project not found or insufficient permissions' },
          { status: 404 },
        );
      }

      await project.deleteOne();

      return NextResponse.json({ success: true });
    } catch (error) {
      console.error('Error deleting project:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 },
      );
    }
  });
}
