import { Octokit } from '@octokit/rest';

export interface GitConfig {
  provider: 'github' | 'gitlab';
  token: string;
  username: string;
  email: string;
}

export interface CreateRepoOptions {
  name: string;
  description?: string;
  private?: boolean;
  autoInit?: boolean;
}

export interface GitRepoInfo {
  url: string;
  cloneUrl: string;
  sshUrl: string;
  name: string;
  owner: string;
  private: boolean;
}

export class GitService {
  private octokit?: Octokit;
  
  constructor(private config: GitConfig) {
    if (config.provider === 'github' && config.token) {
      this.octokit = new Octokit({
        auth: config.token,
      });
    }
  }

  /**
   * Create a new repository on GitHub/GitLab
   */
  async createRepository(options: CreateRepoOptions): Promise<GitRepoInfo> {
    if (!this.octokit) {
      throw new Error('GitHub client not initialized');
    }

    try {
      const response = await this.octokit.repos.createForAuthenticatedUser({
        name: options.name,
        description: options.description,
        private: options.private ?? true,
        auto_init: options.autoInit ?? true,
      });

      return {
        url: response.data.html_url,
        cloneUrl: response.data.clone_url,
        sshUrl: response.data.ssh_url,
        name: response.data.name,
        owner: response.data.owner.login,
        private: response.data.private,
      };
    } catch (error) {
      if ((error as { status?: number; message?: string }).status === 422 && (error as { message?: string }).message?.includes('name already exists')) {
        throw new Error(`Repository "${options.name}" already exists`);
      }
      throw error;
    }
  }

  /**
   * Check if a repository exists
   */
  async repositoryExists(owner: string, repo: string): Promise<boolean> {
    if (!this.octokit) {
      throw new Error('GitHub client not initialized');
    }

    try {
      await this.octokit.repos.get({ owner, repo });
      return true;
    } catch (error) {
      if ((error as { status?: number }).status === 404) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Get repository information
   */
  async getRepository(owner: string, repo: string): Promise<GitRepoInfo> {
    if (!this.octokit) {
      throw new Error('GitHub client not initialized');
    }

    const response = await this.octokit.repos.get({ owner, repo });

    return {
      url: response.data.html_url,
      cloneUrl: response.data.clone_url,
      sshUrl: response.data.ssh_url,
      name: response.data.name,
      owner: response.data.owner.login,
      private: response.data.private,
    };
  }

  /**
   * Get authenticated user information
   */
  async getUser() {
    if (!this.octokit) {
      throw new Error('GitHub client not initialized');
    }

    const response = await this.octokit.users.getAuthenticated();
    return {
      username: response.data.login,
      name: response.data.name,
      email: response.data.email,
    };
  }
}

/**
 * Get Git service from environment variables
 */
export function getGitServiceFromEnv(): GitService | null {
  const githubToken = process.env.GITHUB_TOKEN;
  const githubUsername = process.env.GITHUB_USERNAME;
  const githubEmail = process.env.GITHUB_EMAIL;

  if (githubToken && githubUsername && githubEmail) {
    return new GitService({
      provider: 'github',
      token: githubToken,
      username: githubUsername,
      email: githubEmail,
    });
  }

  // TODO: Add GitLab support
  const gitlabToken = process.env.GITLAB_TOKEN;
  const gitlabUsername = process.env.GITLAB_USERNAME;
  const gitlabEmail = process.env.GITLAB_EMAIL;

  if (gitlabToken && gitlabUsername && gitlabEmail) {
    // GitLab implementation would go here
    console.warn('GitLab integration not yet implemented');
  }

  return null;
}