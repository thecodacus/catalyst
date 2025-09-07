import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getCurrentUser } from '@/lib/auth/jwt';
import { AuthSync } from '@/components/auth-sync';
import { connectMongoose } from '@/lib/db/mongodb';
import { User } from '@/lib/db/schemas/user';

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

  // Verify the token directly
  const { verifyToken } = await import('@/lib/auth/jwt');
  
  let tokenPayload;
  try {
    tokenPayload = verifyToken(token.value);
  } catch (error) {
    console.error('[AUTH] Token verification failed in layout:', error);
    redirect('/login');
  }

  // Fetch full user data
  await connectMongoose();
  const user = await User.findById(tokenPayload.userId).select('-password');
  
  if (!user) {
    redirect('/login');
  }

  const serverUser = {
    id: user._id.toString(),
    email: user.email,
    name: user.name,
    plan: user.plan,
  };

  // Return children with auth sync
  return (
    <>
      <AuthSync serverUser={serverUser} serverToken={token.value} />
      {children}
    </>
  );
}
