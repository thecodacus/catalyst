'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { apiClient } from '@/lib/api/client';
import { toast } from 'sonner';
import { Search, Star, Lock, Globe, GitBranch } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  private: boolean;
  html_url: string;
  clone_url: string;
  language: string | null;
  stargazers_count: number;
  updated_at: string;
  default_branch: string;
  owner: {
    login: string;
    avatar_url: string;
  };
}

export default function GitHubRepoSelectionPage() {
  const router = useRouter();
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null);
  const [isCreatingProject, setIsCreatingProject] = useState(false);

  useEffect(() => {
    fetchRepos();
  }, []);

  const fetchRepos = async () => {
    try {
      const response = await fetch('/api/github/repos');
      const data = await response.json();

      if (!response.ok) {
        if (data.requiresAuth) {
          // Redirect to GitHub OAuth
          window.location.href = '/api/auth/github?redirectTo=/projects/github';
          return;
        }
        throw new Error(data.error || 'Failed to fetch repositories');
      }

      setRepos(data.repos);
    } catch (error) {
      console.error('Error fetching repos:', error);
      toast.error('Failed to fetch repositories');
    } finally {
      setIsLoading(false);
    }
  };

  const createProjectFromRepo = async () => {
    if (!selectedRepo) return;

    setIsCreatingProject(true);
    try {
      const project = await apiClient.createProject({
        name: selectedRepo.name,
        description: selectedRepo.description || `Imported from ${selectedRepo.full_name}`,
        githubRepo: {
          id: selectedRepo.id,
          fullName: selectedRepo.full_name,
          cloneUrl: selectedRepo.clone_url,
          defaultBranch: selectedRepo.default_branch,
        },
      });

      toast.success('Project created successfully!');
      router.push(`/projects/${project._id}`);
    } catch (error) {
      console.error('Error creating project:', error);
      toast.error('Failed to create project');
      setIsCreatingProject(false);
    }
  };

  const filteredRepos = repos.filter(repo =>
    repo.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (repo.description?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false)
  );

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Import from GitHub</h1>
        <p className="text-muted-foreground">
          Select a repository to import and start coding with AI assistance
        </p>
      </div>

      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search repositories..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-full mt-2" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-6">
            {filteredRepos.map((repo) => (
              <Card
                key={repo.id}
                className={`cursor-pointer transition-all hover:shadow-md ${
                  selectedRepo?.id === repo.id
                    ? 'ring-2 ring-primary'
                    : ''
                }`}
                onClick={() => setSelectedRepo(repo)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="flex items-center gap-2 text-lg">
                        {repo.private ? (
                          <Lock className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Globe className="h-4 w-4 text-muted-foreground" />
                        )}
                        {repo.name}
                      </CardTitle>
                      <CardDescription className="mt-1 line-clamp-2">
                        {repo.description || 'No description'}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    {repo.language && (
                      <div className="flex items-center gap-1">
                        <div
                          className="h-3 w-3 rounded-full"
                          style={{
                            backgroundColor: getLanguageColor(repo.language),
                          }}
                        />
                        {repo.language}
                      </div>
                    )}
                    <div className="flex items-center gap-1">
                      <Star className="h-3 w-3" />
                      {repo.stargazers_count}
                    </div>
                    <div className="flex items-center gap-1">
                      <GitBranch className="h-3 w-3" />
                      {repo.default_branch}
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    Updated {formatDistanceToNow(new Date(repo.updated_at), { addSuffix: true })}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {selectedRepo && (
            <div className="fixed bottom-0 left-0 right-0 border-t bg-background p-4">
              <div className="container flex items-center justify-between">
                <div>
                  <p className="font-medium">
                    Selected: {selectedRepo.full_name}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {selectedRepo.description || 'No description'}
                  </p>
                </div>
                <Button
                  onClick={createProjectFromRepo}
                  disabled={isCreatingProject}
                >
                  {isCreatingProject ? 'Creating Project...' : 'Create Project'}
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function getLanguageColor(language: string): string {
  const colors: Record<string, string> = {
    JavaScript: '#f1e05a',
    TypeScript: '#3178c6',
    Python: '#3572A5',
    Java: '#b07219',
    Go: '#00ADD8',
    Ruby: '#701516',
    PHP: '#4F5D95',
    'C++': '#f34b7d',
    C: '#555555',
    'C#': '#178600',
    Swift: '#FA7343',
    Kotlin: '#A97BFF',
    Rust: '#dea584',
    Shell: '#89e051',
    Vue: '#41b883',
    HTML: '#e34c26',
    CSS: '#563d7c',
  };
  return colors[language] || '#6e7681';
}