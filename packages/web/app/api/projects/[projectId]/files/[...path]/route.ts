import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { connectMongoose } from '@/lib/db/mongodb';
import { Project } from '@/lib/db/schemas/project';

interface RouteParams {
  params: Promise<{
    projectId: string;
    path: string[];
  }>;
}

// Mock file system (shared with files/route.ts - in production use a proper storage)
interface FileNode {
  type: 'file' | 'directory';
  content?: string;
  children?: Record<string, FileNode>;
}

const projectFiles = new Map<string, Record<string, FileNode>>();

function getFileAtPath(projectId: string, pathArray: string[]) {
  const files = projectFiles.get(projectId);
  if (!files) return null;

  let current = files['/'];

  for (const part of pathArray) {
    if (!current.children || !current.children[part]) {
      return null;
    }
    current = current.children[part];
  }

  return current;
}

function setFileAtPath(
  projectId: string,
  pathArray: string[],
  content: string,
) {
  const files = projectFiles.get(projectId);
  if (!files) return false;

  let current = files['/'];

  // Navigate to parent directory
  for (let i = 0; i < pathArray.length - 1; i++) {
    const part = pathArray[i];
    if (!current.children || !current.children[part]) {
      return false;
    }
    current = current.children[part];
  }

  // Set or create file
  const fileName = pathArray[pathArray.length - 1];
  if (!current.children) {
    current.children = {};
  }

  current.children[fileName] = {
    type: 'file',
    content,
  };

  return true;
}

// GET /api/projects/[projectId]/files/[...path] - Read file
export async function GET(request: NextRequest, { params }: RouteParams) {
  return withAuth(request, async (req, user) => {
    try {
      const { projectId, path } = await params;
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

      const file = getFileAtPath(projectId, path);

      if (!file) {
        return NextResponse.json({ error: 'File not found' }, { status: 404 });
      }

      if (file.type !== 'file') {
        return NextResponse.json(
          { error: 'Path is not a file' },
          { status: 400 },
        );
      }

      return NextResponse.json({
        content: file.content,
        path: '/' + path.join('/'),
      });
    } catch (error) {
      console.error('Error reading file:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 },
      );
    }
  });
}

// PUT /api/projects/[projectId]/files/[...path] - Write file
export async function PUT(request: NextRequest, { params }: RouteParams) {
  return withAuth(request, async (req, user) => {
    try {
      const { projectId, path } = await params;
      const { content } = await req.json();

      if (content === undefined) {
        return NextResponse.json(
          { error: 'Content is required' },
          { status: 400 },
        );
      }

      await connectMongoose();

      // Verify user has write access to project
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

      // Initialize files if needed
      if (!projectFiles.has(projectId)) {
        projectFiles.set(projectId, {
          '/': { type: 'directory', children: {} },
        });
      }

      const success = setFileAtPath(projectId, path, content);

      if (!success) {
        return NextResponse.json(
          { error: 'Failed to write file' },
          { status: 500 },
        );
      }

      return NextResponse.json({
        success: true,
        path: '/' + path.join('/'),
      });
    } catch (error) {
      console.error('Error writing file:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 },
      );
    }
  });
}

// DELETE /api/projects/[projectId]/files/[...path] - Delete file
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  return withAuth(request, async (_req, user) => {
    try {
      const { projectId, path: _path } = await params;
      await connectMongoose();

      // Verify user has write access to project
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

      // TODO: Implement file deletion in mock storage

      return NextResponse.json({ success: true });
    } catch (error) {
      console.error('Error deleting file:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 },
      );
    }
  });
}
