import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Check authentication
  const cookieStore = await cookies();
  const token = cookieStore.get('auth-token');

  if (!token) {
    redirect('/login');
  }

  // Just return children - layout structure is handled by sub-layouts
  return <>{children}</>;
}
