import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { connectMongoose } from '@/lib/db/mongodb';
import { Project } from '@/lib/db/schemas/project';
import { getCodeSandboxService } from '@/lib/sandbox/codesandbox-service';
import { SANDBOX_REPO_PATH, getSandboxFullPath } from '@/lib/constants/sandbox-paths';

interface RouteParams {
  params: Promise<{
    projectId: string;
  }>;
}

interface FileItem {
  name: string;
  path: string;
  type: 'file' | 'directory';
}

// GET /api/projects/[projectId]/files - List files in directory
export async function GET(request: NextRequest, { params }: RouteParams) {
  return withAuth(request, async (req, user) => {
    try {
      const { projectId } = await params;
      const { searchParams } = new URL(req.url);
      const rawPath = searchParams.get('path') || '/';
      
      // Clean the path - trim whitespace and decode
      const requestPath = decodeURIComponent(rawPath).trim();

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
      const vmPath = getSandboxFullPath(requestPath, true);
      
      try {
        // List directory contents using CodeSandbox
        const entries = await sandboxService.listDirectory(projectId, vmPath);
        
        // Convert to the expected format
        const items: FileItem[] = entries.map(entry => {
          const isDirectory = entry.startsWith('d ');
          const name = entry.substring(2);
          
          // Build the relative path (remove sandbox path prefix)
          const fullPath = vmPath === SANDBOX_REPO_PATH || vmPath === `${SANDBOX_REPO_PATH}/`
            ? `/${name}`
            : `${requestPath}/${name}`.replace('//', '/');
          
          return {
            name,
            path: fullPath,
            type: isDirectory ? 'directory' : 'file'
          };
        });
        
        // Sort directories first, then files
        items.sort((a, b) => {
          if (a.type === b.type) {
            return a.name.localeCompare(b.name);
          }
          return a.type === 'directory' ? -1 : 1;
        });

        return NextResponse.json(items);
      } catch (sandboxError: unknown) {
        console.error('CodeSandbox error:', sandboxError);
        
        // If sandbox doesn't exist, return empty directory
        if (sandboxError instanceof Error && sandboxError.message.includes('not found')) {
          return NextResponse.json([]);
        }
        
        throw sandboxError;
      }
    } catch (error) {
      console.error('Error listing files:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 },
      );
    }
  });
}
