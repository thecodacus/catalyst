import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { connectMongoose } from '@/lib/db/mongodb';
import { Project } from '@/lib/db/schemas/project';
import { getCodeSandboxService } from '@/lib/sandbox/codesandbox-service';
import { getSandboxFullPath } from '@/lib/constants/sandbox-paths';

interface RouteParams {
  params: Promise<{
    projectId: string;
  }>;
}

// GET /api/projects/[projectId]/files/content - Read file content
export async function GET(request: NextRequest, { params }: RouteParams) {
  return withAuth(request, async (req, user) => {
    try {
      const { projectId } = await params;
      const { searchParams } = new URL(req.url);
      const rawPath = searchParams.get('path');

      if (!rawPath) {
        return NextResponse.json(
          { error: 'File path is required' },
          { status: 400 },
        );
      }

      // Clean the file path - trim whitespace and decode
      const filePath = decodeURIComponent(rawPath).trim();

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

      // Get CodeSandbox service instance
      const sandboxService = getCodeSandboxService();
      
      // Convert path to CodeSandbox VM path
      const vmPath = getSandboxFullPath(filePath, true);
      
      try {
        // Read file content from CodeSandbox
        const content = await sandboxService.readFile(projectId, vmPath);
        
        return NextResponse.json({ 
          content,
          path: filePath 
        });
      } catch (sandboxError: unknown) {
        console.error('CodeSandbox error:', sandboxError);
        
        if (sandboxError instanceof Error) {
          if (sandboxError.message.includes('not found')) {
            return NextResponse.json(
              { error: 'File not found' },
              { status: 404 },
            );
          }
          
          if (sandboxError.message.includes('is a directory')) {
            return NextResponse.json(
              { error: 'Path is a directory' },
              { status: 400 },
            );
          }
        }
        
        throw sandboxError;
      }
    } catch (error) {
      console.error('Error reading file:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 },
      );
    }
  });
}

// PUT /api/projects/[projectId]/files/content - Write file content
export async function PUT(request: NextRequest, { params }: RouteParams) {
  return withAuth(request, async (req, user) => {
    try {
      const { projectId } = await params;
      const { path: filePath, content } = await req.json();

      if (!filePath) {
        return NextResponse.json(
          { error: 'File path is required' },
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

      // Get CodeSandbox service instance
      const sandboxService = getCodeSandboxService();
      
      // Convert path to CodeSandbox VM path
      const vmPath = getSandboxFullPath(filePath, true);
      
      try {
        // Write file content to CodeSandbox
        await sandboxService.writeFile(projectId, vmPath, content);
        
        return NextResponse.json({ 
          success: true,
          path: filePath 
        });
      } catch (sandboxError: unknown) {
        console.error('CodeSandbox error:', sandboxError);
        
        if (sandboxError instanceof Error) {
          if (sandboxError.message.includes('Permission denied')) {
            return NextResponse.json(
              { error: 'Permission denied' },
              { status: 403 },
            );
          }
        }
        
        throw sandboxError;
      }
    } catch (error) {
      console.error('Error writing file:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 },
      );
    }
  });
}