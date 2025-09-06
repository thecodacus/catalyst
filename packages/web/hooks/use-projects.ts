import { useEffect } from 'react';
import { apiClient } from '@/lib/api/client';
import { useProjectStore } from '@/stores/project-store';
import { toast } from 'sonner';

export function useProjects() {
  const {
    projects,
    isLoading,
    error,
    setProjects,
    setLoading,
    setError,
    addProject,
    updateProject,
    deleteProject,
  } = useProjectStore();

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      setLoading(true);
      const data = await apiClient.getProjects();
      setProjects(data);
    } catch (error) {
      setError('Failed to fetch projects');
      toast.error('Failed to fetch projects');
    } finally {
      setLoading(false);
    }
  };

  const createProject = async (name: string, description?: string) => {
    try {
      setLoading(true);
      const project = await apiClient.createProject({ name, description });
      addProject(project);
      toast.success('Project created successfully');
      return project;
    } catch (error) {
      toast.error('Failed to create project');
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const updateProjectData = async (id: string, updates: any) => {
    try {
      const updated = await apiClient.updateProject(id, updates);
      updateProject(id, updated);
      toast.success('Project updated successfully');
      return updated;
    } catch (error) {
      toast.error('Failed to update project');
      throw error;
    }
  };

  const deleteProjectData = async (id: string) => {
    try {
      await apiClient.deleteProject(id);
      deleteProject(id);
      toast.success('Project deleted successfully');
    } catch (error) {
      toast.error('Failed to delete project');
      throw error;
    }
  };

  return {
    projects,
    isLoading,
    error,
    createProject,
    updateProject: updateProjectData,
    deleteProject: deleteProjectData,
    refetch: fetchProjects,
  };
}
