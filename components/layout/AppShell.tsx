'use client';

import React, { useState } from 'react';
import { usePathname } from 'next/navigation';
import Sidebar from './Sidebar';
import AuroraBackground from '../ui/AuroraBackground';
import NotificationBell from '../ui/NotificationBell';
import GlobalSearch from './GlobalSearch';
import { Menu } from 'lucide-react';
import { Toaster } from 'sonner';

interface AppShellProps {
  children: React.ReactNode;
}

const AppShell: React.FC<AppShellProps> = ({ children }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const pathname = usePathname();

  // Hide shell structure for auth pages
  const isAuthPage = pathname?.startsWith('/auth');
  
  if (isAuthPage) {
    return (
      <>
        {children}
        <Toaster position="top-right" theme="dark" />
      </>
    );
  }

  // Toggle orbs for specific pages to avoid visual clutter
  const hideOrbs = pathname === '/contacts' || pathname === '/translate';

  return (
    <AuroraBackground showOrbs={!hideOrbs}>
      <div className="flex h-screen w-full overflow-hidden">
        {/* Sidebar */}
        <Sidebar 
          isOpen={isSidebarOpen} 
          onClose={() => setIsSidebarOpen(false)} 
        />

        {/* Main Content Area */}
        <main className="flex-1 flex flex-col h-full min-w-0 bg-transparent relative z-10">
          
          {/* Top Header (Mobile & Desktop) */}
          <header className="h-16 flex items-center justify-between px-4 md:px-8 border-b border-white/5 glass sticky top-0 z-20">
            <div className="flex items-center gap-4 flex-1">
              <button 
                onClick={() => setIsSidebarOpen(true)}
                className="md:hidden p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              >
                <Menu size={24} />
              </button>
              
              {/* Global Search Component */}
              <GlobalSearch />
            </div>

            <div className="flex items-center gap-3 pl-4">
              <NotificationBell />
            </div>
          </header>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto scrollbar-thin p-4 md:p-8">
            <div className="max-w-7xl mx-auto h-full">
                {children}
            </div>
          </div>
        </main>
      </div>
      <Toaster position="top-right" theme="dark" />
    </AuroraBackground>
  );
};

export default AppShell;