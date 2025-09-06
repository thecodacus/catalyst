import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { connectMongoose } from '@/lib/db/mongodb';
import { Project } from '@/lib/db/schemas/project';
import { getCodeSandboxService } from '@/lib/sandbox/codesandbox-service';
import { SANDBOX_WORKSPACE_PATH } from '@/lib/constants/sandbox-paths';

interface RouteParams {
  params: Promise<{
    projectId: string;
  }>;
}

// GET /api/projects/[projectId]/sandbox/session - Get sandbox session for browser client
export async function GET(request: NextRequest, { params }: RouteParams) {
  return withAuth(request, async (req, user) => {
    try {
      const { projectId } = await params;

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

      try {
        // Prepare git configuration if project has git info
        let gitConfig = undefined;
        if (project.git && process.env.GITHUB_TOKEN) {
          gitConfig = {
            email: process.env.GITHUB_EMAIL!,
            name: process.env.GITHUB_USERNAME!,
            accessToken: process.env.GITHUB_TOKEN,
            provider: 'github.com',
            repoUrl: project.git.repoUrl,
          };
        }

        // Ensure sandbox exists with git config
        await sandboxService.getSandboxForProject(projectId, gitConfig);

        // Create a browser session for direct VM connection
        const session = await sandboxService.createBrowserSession(projectId);

        return NextResponse.json({
          session,
          projectId,
          sandboxPath: SANDBOX_WORKSPACE_PATH,
        });
      } catch (sandboxError: unknown) {
        console.error('CodeSandbox session error:', sandboxError);

        if (sandboxError instanceof Error) {
          return NextResponse.json(
            {
              error: `Failed to create sandbox session: ${sandboxError.message}`,
            },
            { status: 500 },
          );
        }

        throw sandboxError;
      }
    } catch (error) {
      console.error('Error creating sandbox session:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 },
      );
    }
  });
}
