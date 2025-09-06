import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { connectMongoose } from '@/lib/db/mongodb';
import { Project } from '@/lib/db/schemas/project';
import { getCodeSandboxService } from '@/lib/sandbox/codesandbox-service';
import { SANDBOX_REPO_PATH } from '@/lib/constants/sandbox-paths';

interface RouteParams {
  params: Promise<{
    projectId: string;
  }>;
}

// POST /api/projects/[projectId]/git - Execute git commands
export async function POST(request: NextRequest, { params }: RouteParams) {
  return withAuth(request, async (req, user) => {
    try {
      const { projectId } = await params;
      const { command } = await req.json();

      if (!command || !['push', 'pull', 'status', 'log'].includes(command)) {
        return NextResponse.json(
          { error: 'Invalid git command. Allowed: push, pull, status, log' },
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

      // Get sandbox service
      const sandboxService = getCodeSandboxService();

      try {
        let gitCommand = '';
        let successMessage = '';

        switch (command) {
          case 'push':
            // First check if upstream is set
            const upstreamCheck = await sandboxService.executeCommand(
              projectId,
              `cd ${SANDBOX_REPO_PATH} && git rev-parse --abbrev-ref --symbolic-full-name @{u} 2>&1 || echo "NO_UPSTREAM"`
            );
            
            if (upstreamCheck.includes('NO_UPSTREAM') || upstreamCheck.includes('no upstream')) {
              // Set upstream on first push
              gitCommand = `cd ${SANDBOX_REPO_PATH} && git push -u origin main`;
              successMessage = 'Successfully pushed changes and set upstream branch';
            } else {
              gitCommand = `cd ${SANDBOX_REPO_PATH} && git push origin main`;
              successMessage = 'Successfully pushed changes to remote repository';
            }
            break;

          case 'pull':
            gitCommand = `cd ${SANDBOX_REPO_PATH} && git pull origin main`;
            successMessage = 'Successfully pulled latest changes from remote repository';
            break;

          case 'status':
            gitCommand = `cd ${SANDBOX_REPO_PATH} && git status --porcelain`;
            successMessage = 'Git status retrieved';
            break;

          case 'log':
            gitCommand = `cd ${SANDBOX_REPO_PATH} && git log --oneline -10`;
            successMessage = 'Git log retrieved';
            break;
        }

        // Execute the git command
        const output = await sandboxService.executeCommand(projectId, gitCommand);

        // For push/pull, also get the current status
        let status = '';
        if (command === 'push' || command === 'pull') {
          status = await sandboxService.executeCommand(
            projectId,
            `cd ${SANDBOX_REPO_PATH} && git status --short`
          );
        }

        return NextResponse.json({
          success: true,
          message: successMessage,
          output: output.trim(),
          status: status.trim(),
          command,
        });
      } catch (error) {
        console.error(`Git ${command} error:`, error);

        // Check for specific git errors
        if ((error as Error).message?.includes('no upstream branch')) {
          return NextResponse.json(
            {
              error: 'No upstream branch set. Push with --set-upstream first.',
              details: (error as Error).message,
            },
            { status: 400 },
          );
        }

        if ((error as Error).message?.includes('Authentication failed')) {
          return NextResponse.json(
            {
              error: 'Git authentication failed. Check your access token.',
              details: (error as Error).message,
            },
            { status: 401 },
          );
        }

        return NextResponse.json(
          {
            error: `Git ${command} failed`,
            details: (error as Error).message || 'Unknown error',
          },
          { status: 500 },
        );
      }
    } catch (error) {
      console.error('Error in git operation:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 },
      );
    }
  });
}

// GET /api/projects/[projectId]/git - Get git status and info
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

      // Get sandbox service
      const sandboxService = getCodeSandboxService();

      try {
        // Get various git information
        const [status, branch, remoteUrl, lastCommit] = await Promise.all([
          sandboxService.executeCommand(
            projectId,
            `cd ${SANDBOX_REPO_PATH} && git status --porcelain`
          ),
          sandboxService.executeCommand(
            projectId,
            `cd ${SANDBOX_REPO_PATH} && git branch --show-current`
          ),
          sandboxService.executeCommand(
            projectId,
            `cd ${SANDBOX_REPO_PATH} && git remote get-url origin 2>/dev/null || echo ""`
          ),
          sandboxService.executeCommand(
            projectId,
            `cd ${SANDBOX_REPO_PATH} && git log -1 --oneline 2>/dev/null || echo "No commits yet"`
          ),
        ]);

        // Parse status to get file counts
        const statusLines = status.trim().split('\n').filter(Boolean);
        const modifiedFiles = statusLines.filter(line => line.startsWith(' M')).length;
        const addedFiles = statusLines.filter(line => line.startsWith('??')).length;
        const deletedFiles = statusLines.filter(line => line.startsWith(' D')).length;

        return NextResponse.json({
          branch: branch.trim() || 'main',
          remoteUrl: remoteUrl.trim(),
          hasRemote: !!remoteUrl.trim(),
          lastCommit: lastCommit.trim(),
          status: {
            clean: statusLines.length === 0,
            modified: modifiedFiles,
            added: addedFiles,
            deleted: deletedFiles,
            total: statusLines.length,
            files: statusLines,
          },
          gitInfo: project.git || null,
        });
      } catch (error) {
        console.error('Git status error:', error);
        return NextResponse.json(
          {
            error: 'Failed to get git status',
            details: (error as Error).message || 'Unknown error',
          },
          { status: 500 },
        );
      }
    } catch (error) {
      console.error('Error getting git info:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 },
      );
    }
  });
}