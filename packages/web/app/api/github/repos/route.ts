import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { connectMongoose } from '@/lib/db/mongodb';
import { User } from '@/lib/db/schemas/user';

export async function GET(request: NextRequest) {
  return withAuth(request, async (req, authUser) => {
    try {
      await connectMongoose();
      
      // Get user with GitHub access token
      const fullUser = await User.findById(authUser.userId).select('+githubAccessToken');
    
      if (!fullUser?.githubAccessToken) {
        return NextResponse.json(
          { error: 'GitHub not connected', requiresAuth: true },
          { status: 403 }
        );
      }

    const searchParams = req.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1');
    const perPage = parseInt(searchParams.get('per_page') || '30');
    const sort = searchParams.get('sort') || 'updated';

    // Fetch user's repositories from GitHub
    const reposResponse = await fetch(
      `https://api.github.com/user/repos?page=${page}&per_page=${perPage}&sort=${sort}`,
      {
        headers: {
          Authorization: `Bearer ${fullUser.githubAccessToken}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    );

    if (!reposResponse.ok) {
      if (reposResponse.status === 401) {
        // Token is invalid, clear it
        fullUser.githubAccessToken = undefined;
        fullUser.githubUsername = undefined;
        await fullUser.save();
        
        return NextResponse.json(
          { error: 'GitHub token expired', requiresAuth: true },
          { status: 403 }
        );
      }
      
      throw new Error('Failed to fetch repositories');
    }

    const repos = await reposResponse.json();
    
    // Transform repos to include only necessary fields
    const transformedRepos = repos.map((repo: any) => ({
      id: repo.id,
      name: repo.name,
      full_name: repo.full_name,
      description: repo.description,
      private: repo.private,
      html_url: repo.html_url,
      clone_url: repo.clone_url,
      language: repo.language,
      stargazers_count: repo.stargazers_count,
      updated_at: repo.updated_at,
      default_branch: repo.default_branch,
      owner: {
        login: repo.owner.login,
        avatar_url: repo.owner.avatar_url,
      },
    }));

    // Get link header for pagination
    const linkHeader = reposResponse.headers.get('Link');
    const pagination = parseLinkHeader(linkHeader);

    return NextResponse.json({
      repos: transformedRepos,
      pagination: {
        page,
        perPage,
        ...pagination,
      },
    });
    } catch (error) {
      console.error('GitHub repos error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch repositories' },
        { status: 500 }
      );
    }
  });
}

function parseLinkHeader(header: string | null) {
  if (!header) return {};
  
  const links: any = {};
  const parts = header.split(',');
  
  parts.forEach(p => {
    const section = p.split(';');
    if (section.length !== 2) return;
    
    const url = section[0].replace(/<(.*)>/, '$1').trim();
    const name = section[1].replace(/rel="(.*)"/, '$1').trim();
    
    // Extract page number from URL
    const match = url.match(/[?&]page=(\d+)/);
    if (match) {
      links[name] = parseInt(match[1]);
    }
  });
  
  return links;
}