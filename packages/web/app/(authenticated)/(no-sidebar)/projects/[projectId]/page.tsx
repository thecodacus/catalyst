import { ProjectClient } from './project-client';

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <ProjectClient projectId={projectId} />;
}
