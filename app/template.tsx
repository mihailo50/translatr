'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

export default function Template({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  
  useEffect(() => {
    // If we're on a protected route and middleware didn't catch it,
    // this is a client-side navigation - let the page handle the redirect
    const protectedRoutes = ['/', '/chat', '/contacts', '/settings', '/translate'];
    const isProtected = protectedRoutes.some(route => {
      if (route === '/') return pathname === '/';
      return pathname === route || pathname.startsWith(route + '/');
    });
    
    // This should rarely trigger since middleware handles server-side redirects
    // But it's a safety net for client-side navigation
    if (isProtected && pathname === '/') {
      // The page component will handle the redirect
    }
  }, [pathname]);

  return <>{children}</>;
}

