import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { connectMongoose } from '@/lib/db/mongodb';
import { Project } from '@/lib/db/schemas/project';
import { getGitServiceFromEnv } from '@/lib/git/git-service';

// GET /api/projects - List user's projects
export async function GET(request: NextRequest) {
  return withAuth(request, async (_req, user) => {
    try {
      await connectMongoose();

      const projects = await Project.find({
        $or: [{ userId: user.userId }, { 'collaborators.userId': user.userId }],
      })
        .sort({ lastAccessed: -1 })
        .limit(50);

      return NextResponse.json(projects);
    } catch (error) {
      console.error('Error fetching projects:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 },
      );
    }
  });
}

// POST /api/projects - Create new project
export async function POST(request: NextRequest) {
  return withAuth(request, async (req, user) => {
    try {
      const { name, description, createGitRepo = true, git } = await req.json();

      if (!name) {
        return NextResponse.json(
          { error: 'Project name is required' },
          { status: 400 },
        );
      }

      await connectMongoose();

      let gitInfo = undefined;

      // Use provided git info if importing existing repo
      if (git) {
        gitInfo = {
          ...git,
          createdAt: new Date(),
        };
      }
      // Create GitHub repository if requested and credentials are available
      else if (createGitRepo) {
        const gitService = getGitServiceFromEnv();
        if (gitService) {
          try {
            // Generate a unique repo name from project name
            const repoName = name
              .toLowerCase()
              .replace(/[^a-z0-9-]/g, '-')
              .replace(/-+/g, '-')
              .replace(/^-|-$/g, '');
            
            const repoInfo = await gitService.createRepository({
              name: repoName,
              description: description || `AI-powered project created with Catalyst`,
              private: true,
              autoInit: true,
            });

            gitInfo = {
              provider: 'github',
              repoUrl: repoInfo.cloneUrl,
              repoName: repoInfo.name,
              repoOwner: repoInfo.owner,
              branch: 'main',
              isPrivate: repoInfo.private,
              createdAt: new Date(),
            };

            console.log(`✅ Created GitHub repository: ${repoInfo.owner}/${repoInfo.name}`);
          } catch (gitError) {
            console.error('Failed to create GitHub repository:', gitError);
            // If repo already exists, try to get its info
            if ((gitError as Error).message?.includes('already exists')) {
              const gitService = getGitServiceFromEnv();
              const username = process.env.GITHUB_USERNAME!;
              const repoName = name
                .toLowerCase()
                .replace(/[^a-z0-9-]/g, '-')
                .replace(/-+/g, '-')
                .replace(/^-|-$/g, '');
              
              try {
                const repoInfo = await gitService!.getRepository(username, repoName);
                gitInfo = {
                  provider: 'github',
                  repoUrl: repoInfo.cloneUrl,
                  repoName: repoInfo.name,
                  repoOwner: repoInfo.owner,
                  branch: 'main',
                  isPrivate: repoInfo.private,
                  createdAt: new Date(),
                };
                console.log(`✅ Using existing GitHub repository: ${repoInfo.owner}/${repoInfo.name}`);
              } catch {
                // Continue without Git integration
              }
            }
          }
        }
      }

      const project = new Project({
        userId: user.userId,
        name,
        description,
        git: gitInfo,
        collaborators: [
          {
            userId: user.userId,
            role: 'owner',
            addedAt: new Date(),
          },
        ],
        settings: {
          aiModel: 'gpt-4',
          temperature: 0.7,
          maxTokens: 2000,
        },
      });

      await project.save();

      return NextResponse.json(project);
    } catch (error) {
      console.error('Error creating project:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 },
      );
    }
  });
}
