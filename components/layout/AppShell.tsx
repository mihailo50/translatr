'use client';

import React, { useState } from 'react';
import { usePathname } from 'next/navigation';
import Sidebar from './Sidebar';
import AuroraBackground from '../ui/AuroraBackground';
import NotificationBell from '../ui/NotificationBell';
import GlobalSearch from './GlobalSearch';
import GlobalCallHandler from '../chat/GlobalCallHandler';
import GlobalContactRequestHandler from '../ui/GlobalContactRequestHandler';
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
  
  // Check if current page is homepage
  const isHomePage = pathname === '/';
  
  // Check if current page is a chat page (needs fixed layout)
  const isChatPage = pathname?.startsWith('/chat/');
  
  if (isAuthPage) {
    return (
      <>
        {children}
        <Toaster position="top-right" theme="dark" />
      </>
    );
  }

  return (
    <AuroraBackground showOrbs={true}>
      <div className={`flex w-full ${
        isChatPage 
          ? 'h-[100dvh] overflow-hidden' 
          : 'min-h-[100dvh] overflow-y-auto overflow-x-hidden'
      }`}>
        {/* Sidebar */}
        <Sidebar 
          isOpen={isSidebarOpen} 
          onClose={() => setIsSidebarOpen(false)} 
        />

        {/* Main Content Area */}
        <main className={`flex-1 flex flex-col min-w-0 bg-transparent relative z-10 ${
          isChatPage 
            ? 'h-full overflow-hidden' 
            : 'min-h-full'
        }`}>
          
          {/* Top Header (Mobile & Desktop) */}
          <header className={`h-16 flex items-center justify-between px-4 md:px-8 border-b border-white/5 glass z-20 ${
            isChatPage 
              ? 'sticky top-0' 
              : 'sticky top-0'
          }`}>
            <div className="flex items-center gap-4 flex-1">
              <button 
                onClick={() => setIsSidebarOpen(true)}
                className="md:hidden p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              >
                <Menu size={24} />
              </button>
              
              {/* Global Search Component - Hidden on Homepage */}
              {isHomePage ? (
                <div className="hidden md:flex items-center gap-2 opacity-50">
                  <span className="font-display font-bold tracking-widest text-sm">COMMAND DECK</span>
                </div>
              ) : (
                <GlobalSearch />
              )}
            </div>

            <div className="flex items-center gap-3 pl-4">
              <NotificationBell />
            </div>
          </header>

          {/* Scrollable Content */}
          <div className={`flex-1 scrollbar-none md:scrollbar-thin ${
            isChatPage 
              ? 'overflow-hidden h-full' 
              : 'overflow-y-auto overflow-x-hidden p-4 md:p-8'
          }`}>
            <div className={`${isChatPage ? 'h-full w-full' : 'max-w-7xl mx-auto h-full'}`}>
                {children}
            </div>
          </div>
        </main>
      </div>
      <GlobalCallHandler />
      <GlobalContactRequestHandler />
      <Toaster position="top-right" theme="dark" />
    </AuroraBackground>
  );
};

export default AppShell;