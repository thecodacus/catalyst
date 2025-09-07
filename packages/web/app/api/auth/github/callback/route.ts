import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { connectMongoose } from '@/lib/db/mongodb';
import { User } from '@/lib/db/schemas/user';
import { generateToken } from '@/lib/auth/jwt';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const state = searchParams.get('state');

    // Verify state for CSRF protection
    const cookieStore = await cookies();
    const storedState = cookieStore.get('github_oauth_state')?.value;
    const redirectTo = cookieStore.get('github_oauth_redirect')?.value || '/projects';

    if (!code || !state || state !== storedState) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_API_URL?.replace('/api', '')}/login?error=invalid_state`
      );
    }

    // Clear OAuth cookies
    cookieStore.delete('github_oauth_state');
    cookieStore.delete('github_oauth_redirect');

    // Exchange code for access token
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: `${process.env.NEXT_PUBLIC_API_URL}/auth/github/callback`,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.error || !tokenData.access_token) {
      console.error('GitHub token error:', tokenData);
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_API_URL?.replace('/api', '')}/login?error=token_exchange_failed`
      );
    }

    // Get user info from GitHub
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        Accept: 'application/json',
      },
    });

    const githubUser = await userResponse.json();

    // Get user email if not public
    let email = githubUser.email;
    if (!email) {
      const emailResponse = await fetch('https://api.github.com/user/emails', {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          Accept: 'application/json',
        },
      });
      const emails = await emailResponse.json();
      email = emails.find((e: any) => e.primary)?.email;
    }

    // Connect to database
    await connectMongoose();

    // Find or create user
    let user = await User.findOne({ githubId: githubUser.id });

    if (!user) {
      // Check if user exists with same email
      user = await User.findOne({ email });

      if (user) {
        // Update existing user with GitHub info
        user.githubId = githubUser.id;
        user.githubUsername = githubUser.login;
        user.githubAccessToken = tokenData.access_token;
        user.avatar = githubUser.avatar_url;
      } else {
        // Create new user
        user = new User({
          name: githubUser.name || githubUser.login,
          email,
          githubId: githubUser.id,
          githubUsername: githubUser.login,
          githubAccessToken: tokenData.access_token,
          avatar: githubUser.avatar_url,
        });
      }
    } else {
      // Update access token
      user.githubAccessToken = tokenData.access_token;
      user.githubUsername = githubUser.login;
      user.avatar = githubUser.avatar_url;
    }

    await user.save();

    // Generate JWT token
    const token = generateToken({ userId: user._id.toString() });

    // Set auth cookie
    cookieStore.set('auth-token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    // Redirect to the original destination
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_API_URL?.replace('/api', '')}${redirectTo}`
    );
  } catch (error) {
    console.error('GitHub OAuth callback error:', error);
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_API_URL?.replace('/api', '')}/login?error=callback_failed`
    );
  }
}