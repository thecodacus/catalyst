/**
 * Constants for CodeSandbox VM paths
 */

// Base workspace path in CodeSandbox VM
export const SANDBOX_WORKSPACE_PATH = '/project/workspace';

// Repository path within workspace
export const SANDBOX_REPO_PATH = `${SANDBOX_WORKSPACE_PATH}/repo`;

// Relative paths for sandbox filesystem operations
export const SANDBOX_WORKSPACE_RELATIVE = './';
export const SANDBOX_REPO_RELATIVE = './repo';

/**
 * Convert an absolute path to a sandbox-relative path
 * @param path The path to convert
 * @param useRepoPath Whether to use the repo subdirectory (default: true)
 */
export function toSandboxPath(path: string, useRepoPath: boolean = true): string {
  const basePath = useRepoPath ? SANDBOX_REPO_PATH : SANDBOX_WORKSPACE_PATH;
  const baseRelative = useRepoPath ? SANDBOX_REPO_RELATIVE : SANDBOX_WORKSPACE_RELATIVE;
  
  // Already a sandbox relative path
  if (path.startsWith('./')) {
    return path;
  }
  
  // Full sandbox path
  if (path.startsWith(basePath)) {
    return path.replace(basePath, baseRelative);
  }
  
  // Workspace path (legacy)
  if (path.startsWith(SANDBOX_WORKSPACE_PATH)) {
    const subPath = path.replace(SANDBOX_WORKSPACE_PATH, '');
    return useRepoPath && subPath ? `${baseRelative}${subPath}` : baseRelative;
  }
  
  // Absolute path
  if (path.startsWith('/')) {
    return useRepoPath ? `${baseRelative}${path}` : `.${path}`;
  }
  
  // Root directory
  if (path === '' || path === '.') {
    return baseRelative;
  }
  
  // Relative path
  return useRepoPath ? `${baseRelative}/${path}` : path;
}

/**
 * Get the full sandbox path for a given relative path
 * @param relativePath The relative path
 * @param useRepoPath Whether to use the repo subdirectory (default: true)
 */
export function getSandboxFullPath(relativePath: string, useRepoPath: boolean = true): string {
  const basePath = useRepoPath ? SANDBOX_REPO_PATH : SANDBOX_WORKSPACE_PATH;
  
  if (relativePath.startsWith('./')) {
    return basePath + relativePath.substring(1);
  }
  
  if (relativePath.startsWith('/')) {
    return relativePath;
  }
  
  return `${basePath}/${relativePath}`;
}