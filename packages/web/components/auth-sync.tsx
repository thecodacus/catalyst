'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/stores/auth-store';

interface AuthSyncProps {
  serverUser?: {
    id: string;
    email: string;
    name: string;
    plan: 'free' | 'pro' | 'enterprise';
  };
  serverToken?: string;
}

export function AuthSync({ serverUser, serverToken }: AuthSyncProps) {
  useEffect(() => {
    const authStore = useAuthStore.getState();
    
    if (!serverUser || !serverToken) {
      // No server auth, clear client auth
      if (authStore.isAuthenticated) {
        console.log('[AUTH SYNC] Clearing client auth - no server auth');
        authStore.logout();
      }
      return;
    }
    
    // Check if client auth matches server auth
    if (authStore.user?.id !== serverUser.id) {
      console.log('[AUTH SYNC] Syncing client auth with server auth', {
        clientUserId: authStore.user?.id,
        serverUserId: serverUser.id,
        serverEmail: serverUser.email,
      });
      
      // Update client auth to match server
      authStore.login(serverUser, serverToken);
    }
  }, [serverUser, serverToken]);
  
  return null;
}