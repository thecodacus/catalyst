'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { Search, Lock, Globe, Star, GitBranch, Github } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

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

interface Branch {
  name: string;
  commit: {
    sha: string;
    url: string;
  };
}

interface GitHubRepoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectRepo: (repo: GitHubRepo, branch: string) => void;
}

export function GitHubRepoModal({ isOpen, onClose, onSelectRepo }: GitHubRepoModalProps) {
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [isLoadingRepos, setIsLoadingRepos] = useState(true);
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [requiresAuth, setRequiresAuth] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchRepos();
    }
  }, [isOpen]);

  useEffect(() => {
    if (selectedRepo) {
      fetchBranches(selectedRepo);
    }
  }, [selectedRepo]);

  const fetchRepos = async () => {
    try {
      setIsLoadingRepos(true);
      const response = await fetch('/api/github/repos?per_page=100');
      
      // Always handle 401/403 as auth required
      if (response.status === 401 || response.status === 403) {
        setRequiresAuth(true);
        setIsLoadingRepos(false);
        return;
      }
      
      const data = await response.json();
      
      if (!response.ok) {
        if (data.requiresAuth) {
          setRequiresAuth(true);
          return;
        }
        throw new Error(data.error || 'Failed to fetch repositories');
      }

      setRepos(data.repos);
      setRequiresAuth(false);
    } catch (error) {
      console.error('Error fetching repos:', error);
      toast.error('Failed to fetch repositories');
    } finally {
      setIsLoadingRepos(false);
    }
  };

  const fetchBranches = async (repo: GitHubRepo) => {
    try {
      setIsLoadingBranches(true);
      setBranches([]);
      setSelectedBranch(repo.default_branch);

      const response = await fetch(`/api/github/repos/${repo.owner.login}/${repo.name}/branches`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch branches');
      }

      setBranches(data);
    } catch (error) {
      console.error('Error fetching branches:', error);
      toast.error('Failed to fetch branches');
    } finally {
      setIsLoadingBranches(false);
    }
  };

  const handleAuthorize = () => {
    // Open GitHub OAuth in a new window
    const width = 600;
    const height = 700;
    const left = window.screen.width / 2 - width / 2;
    const top = window.screen.height / 2 - height / 2;
    
    const authWindow = window.open(
      '/api/auth/github?redirectTo=/auth/github/success',
      'github-oauth',
      `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no`
    );
    
    // Poll for authentication completion
    const checkInterval = setInterval(async () => {
      if (authWindow?.closed) {
        clearInterval(checkInterval);
        // Re-fetch repos to see if user is now authenticated
        await fetchRepos();
      }
    }, 500);
  };

  const handleSelectRepo = () => {
    if (selectedRepo && selectedBranch) {
      onSelectRepo(selectedRepo, selectedBranch);
      onClose();
    }
  };

  const filteredRepos = repos.filter(repo =>
    repo.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (repo.description?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false)
  );

  if (requiresAuth) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connect GitHub Account</DialogTitle>
            <DialogDescription>
              Authorize Catalyst to access your GitHub repositories
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center space-y-4 py-6">
            <Github className="h-12 w-12 text-gray-600 dark:text-gray-400" />
            <p className="text-center text-sm text-muted-foreground">
              Connect your GitHub account to import repositories and start coding with AI assistance.
            </p>
            <Button onClick={handleAuthorize} className="w-full">
              <Github className="mr-2 h-4 w-4" />
              Authorize GitHub
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Import GitHub Repository</DialogTitle>
          <DialogDescription>
            Select a repository and branch to import
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col">
          <div className="mb-4">
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

          <div className="flex gap-4 flex-1 overflow-hidden">
            {/* Repository List */}
            <div className="flex-1 flex flex-col">
              <Label className="mb-2">Repository</Label>
              <ScrollArea className="flex-1 border rounded-lg">
                {isLoadingRepos ? (
                  <div className="p-4 space-y-3">
                    {[...Array(5)].map((_, i) => (
                      <div key={i} className="space-y-2">
                        <Skeleton className="h-5 w-3/4" />
                        <Skeleton className="h-4 w-full" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-2">
                    {filteredRepos.map((repo) => (
                      <button
                        key={repo.id}
                        onClick={() => setSelectedRepo(repo)}
                        className={cn(
                          "w-full text-left p-3 rounded-lg transition-colors mb-2",
                          "hover:bg-gray-100 dark:hover:bg-gray-800",
                          selectedRepo?.id === repo.id && "bg-gray-100 dark:bg-gray-800"
                        )}
                      >
                        <div className="flex items-start gap-2">
                          <div className="mt-0.5">
                            {repo.private ? (
                              <Lock className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <Globe className="h-4 w-4 text-muted-foreground" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">{repo.name}</div>
                            <div className="text-sm text-muted-foreground line-clamp-2">
                              {repo.description || 'No description'}
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                              {repo.language && (
                                <div className="flex items-center gap-1">
                                  <div
                                    className="h-2 w-2 rounded-full"
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
                              <div className="text-xs">
                                {formatDistanceToNow(new Date(repo.updated_at), { addSuffix: true })}
                              </div>
                            </div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>

            {/* Branch Selection */}
            <div className="w-64 flex flex-col">
              <Label className="mb-2">Branch</Label>
              <Select
                value={selectedBranch}
                onValueChange={setSelectedBranch}
                disabled={!selectedRepo || isLoadingBranches}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a branch">
                    {selectedBranch && (
                      <span className="flex items-center gap-2">
                        <GitBranch className="h-4 w-4" />
                        {selectedBranch}
                      </span>
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {branches.map((branch) => (
                    <SelectItem key={branch.name} value={branch.name}>
                      <span className="flex items-center gap-2">
                        <GitBranch className="h-4 w-4" />
                        {branch.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {selectedRepo && (
                <div className="mt-4 p-3 border rounded-lg bg-muted/50">
                  <h4 className="font-medium text-sm mb-2">Selected Repository</h4>
                  <div className="space-y-1 text-sm">
                    <p className="font-medium">{selectedRepo.full_name}</p>
                    <p className="text-muted-foreground text-xs">
                      {selectedRepo.description || 'No description'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSelectRepo}
            disabled={!selectedRepo || !selectedBranch}
          >
            Import Repository
          </Button>
        </div>
      </DialogContent>
    </Dialog>
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