'use client';

import { useEffect } from 'react';
import { CheckCircle } from 'lucide-react';

export default function GitHubAuthSuccess() {
  useEffect(() => {
    // Close the window after a short delay
    setTimeout(() => {
      window.close();
    }, 1500);
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center">
        <CheckCircle className="mx-auto h-16 w-16 text-green-500 mb-4" />
        <h1 className="text-2xl font-semibold mb-2">GitHub Connected!</h1>
        <p className="text-muted-foreground">This window will close automatically...</p>
      </div>
    </div>
  );
}