"use client";

import React, { useState, useEffect, useCallback, useTransition, useMemo, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import AuroraBackground from "../ui/AuroraBackground";
import NotificationBell from "../ui/NotificationBell";
import GlobalSearch from "./GlobalSearch";
import SpaceRail from "../navigation/SpaceRail";
import ChannelSidebar, { SpaceChannel } from "../navigation/ChannelSidebar";
import SpaceSettingsModal from '../spaces/SpaceSettingsModal';
import CreateSpaceModal from '../spaces/CreateSpaceModal';
import { Menu, Home, X } from "lucide-react";
import Image from "next/image";
import { AetherLogo } from "../ui/AetherLogo";
import { Toaster } from "sonner";
import { getUserSpaces, getSpaceChannels, Space } from "../../actions/spaces";
import { toast } from "sonner";
import { useVoiceChannel } from "../contexts/VoiceChannelContext";
import { useAuth } from "../contexts/AuthContext";

import ProtectedRoute from "../auth/ProtectedRoute";

// Lazy-load global handlers - these are only needed on authenticated pages
// They handle call notifications and contact requests, which are not critical for initial render
const GlobalCallHandler = dynamic(() => import("../chat/GlobalCallHandler"), {
  ssr: false,
  loading: () => null, // Handlers don't render anything visible
});

const GlobalContactRequestHandler = dynamic(() => import("../ui/GlobalContactRequestHandler"), {
  ssr: false,
  loading: () => null, // Handlers don't render anything visible
});

// Lazy-load CallOverlay for voice channels
const CallOverlay = dynamic(() => import("../chat/CallOverlay"), {
  ssr: false,
  loading: () => null,
});

interface AppShellProps {
  children: React.ReactNode;
}

const AppShell: React.FC<AppShellProps> = ({ children }) => {
  const [isChannelSidebarOpen, setIsChannelSidebarOpen] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [currentSpaceId, setCurrentSpaceId] = useState<string | null>(null);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [channels, setChannels] = useState<SpaceChannel[]>([]);
  const [currentSpace, setCurrentSpace] = useState<Space | null>(null);
  const [isLoadingSpaces, setIsLoadingSpaces] = useState(false);
  const [isLoadingChannels, setIsLoadingChannels] = useState(false);
  const [chatRoomSpaceId, setChatRoomSpaceId] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isSpaceSettingsModalOpen, setSpaceSettingsModalOpen] = useState(false);
  const [isCreateSpaceOpen, setIsCreateSpaceOpen] = useState(false);
  const isSelectingSpaceRef = useRef(false); // Prevent clearing logic during space selection
  const pathname = usePathname();
  const router = useRouter();
  
  // Log pathname changes
  useEffect(() => {
    console.log("🟠 [PATHNAME CHANGE] Pathname changed to:", pathname, {
      timestamp: new Date().toISOString(),
      currentSpaceId,
      isSelectingSpace: isSelectingSpaceRef.current,
    });
  }, [pathname, currentSpaceId]);
  
  // Log currentSpaceId changes
  useEffect(() => {
    console.log("🔷 [STATE CHANGE] currentSpaceId changed:", {
      currentSpaceId,
      timestamp: new Date().toISOString(),
      isSelectingSpace: isSelectingSpaceRef.current,
    });
  }, [currentSpaceId]);

  const publicPages = [
    "/auth/login",
    "/auth/register",
    "/auth/forgot-password",
    "/auth/reset-password",
    "/auth/verify-email",
    "/auth/auth-code-error",
    "/download",
    "/auth/callback",
  ];

  // Hide shell structure for auth pages
  const isPublicPage = publicPages.some((page) => pathname?.startsWith(page));

  // Check if current page is homepage
  const isHomePage = pathname === "/";

  // Check if current page is a chat page (needs fixed layout)
  const isChatPage = pathname?.startsWith("/chat/");
  const chatRoomId = isChatPage ? pathname.split("/chat/")[1] : null;
  
  // Check if current page is a space page
  const isSpacePage = pathname?.startsWith("/space/");
  const spacePageId = isSpacePage ? pathname.split("/space/")[1]?.split("/")[0] : null;
  const isSpaceChannelPage = pathname?.startsWith("/space/") && pathname.includes("/channel/");

  // Detect mobile device
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Fetch user spaces on mount (non-blocking)
  useEffect(() => {
    // Use startTransition to make this non-blocking
    startTransition(async () => {
      try {
        const result = await getUserSpaces();
        if (result.spaces) {
          setSpaces(result.spaces);
        }
      } catch (error) {
        // Silently handle errors - spaces are optional
      }
    });
  }, []);

  // Auto-detect space from URL (space page or space channel page)
  useEffect(() => {
    if (isSpacePage && spacePageId) {
      // If we're on a space page, set the current space
      setCurrentSpaceId(spacePageId);
      setChatRoomSpaceId(spacePageId);
      console.log("🔷 [SPACE DETECT] Detected space from URL:", spacePageId);
    } else if (isChatPage && chatRoomId) {
      // Legacy: Auto-detect space from chat room (if chat room belongs to a space)
      startTransition(async () => {
        try {
          const { createClient } = await import("../../utils/supabase/client");
          const supabase = createClient();
          const { data: room } = await supabase
            .from("rooms")
            .select("space_id")
            .eq("id", chatRoomId)
            .maybeSingle();
          
          if (room?.space_id) {
            setChatRoomSpaceId(room.space_id);
            // Auto-select the space if we're in a chat that belongs to it
            setCurrentSpaceId(room.space_id);
            console.log("🔷 [SPACE DETECT] Detected space from chat room:", room.space_id);
          } else {
            setChatRoomSpaceId(null);
          }
        } catch (error) {
          // Silently handle errors
          setChatRoomSpaceId(null);
        }
      });
    } else if (isHomePage) {
      // On homepage, clear space detection
      setChatRoomSpaceId(null);
      // Don't clear currentSpaceId here - let the clearing logic handle it
    }
  }, [isSpacePage, spacePageId, isChatPage, chatRoomId, isHomePage]);

  // Fetch channels when a space is selected (non-blocking)
  useEffect(() => {
    console.log("🟪 [CHANNELS FETCH] useEffect triggered", {
      currentSpaceId,
      hasSpaces: spaces.length > 0,
      timestamp: new Date().toISOString(),
    });
    
    if (!currentSpaceId) {
      console.log("🟪 [CHANNELS FETCH] No currentSpaceId, clearing channels");
      setChannels([]);
      setCurrentSpace(null);
      return;
    }

    // Use startTransition to make this non-blocking
    startTransition(async () => {
      console.log("🟪 [CHANNELS FETCH] Starting channel fetch for space:", currentSpaceId);
      setIsLoadingChannels(true);
      try {
        const result = await getSpaceChannels(currentSpaceId);
        console.log("🟪 [CHANNELS FETCH] Channels fetch result:", {
          channelCount: result.channels?.length || 0,
          error: result.error,
        });
        
        if (result.channels) {
          setChannels(result.channels);
          // Find the current space to get admin status
          const space = spaces.find(s => s.id === currentSpaceId);
          setCurrentSpace(space || null);
          console.log("🟪 [CHANNELS FETCH] Channels and space set");
        } else if (result.error) {
          console.log("🟪 [CHANNELS FETCH] Error in result:", result.error);
          toast.error(result.error);
        }
      } catch (error) {
        console.error("🟪 [CHANNELS FETCH] Exception caught:", error);
        toast.error("Failed to load channels");
      } finally {
        setIsLoadingChannels(false);
        console.log("🟪 [CHANNELS FETCH] Channel fetch completed");
      }
    });
  }, [currentSpaceId, spaces]);

  // Handle space selection
  const handleSpaceSelect = useCallback(async (spaceId: string) => {
    console.log("🔵 [SPACE SELECT] handleSpaceSelect called", {
      spaceId,
      currentPathname: pathname,
      isHomePage,
      isSelectingSpace: isSelectingSpaceRef.current,
      currentSpaceId,
      timestamp: new Date().toISOString(),
    });
    
    // Mark that we're actively selecting a space to prevent clearing logic
    isSelectingSpaceRef.current = true;
    console.log("🔵 [SPACE SELECT] Set isSelectingSpaceRef.current = true");
    
    setCurrentSpaceId(spaceId);
    console.log("🔵 [SPACE SELECT] Set currentSpaceId to:", spaceId);
    
    // On desktop, always show channel sidebar when space is selected
    // On mobile, the SpaceRail drawer will close and ChannelSidebar will open separately
    if (window.innerWidth >= 768) {
      setIsChannelSidebarOpen(true); // Desktop: always visible
      console.log("🔵 [SPACE SELECT] Desktop: Opening channel sidebar");
    } else {
      // Mobile: ChannelSidebar will be opened by the SpaceRail onSpaceSelect handler
      // This ensures the SpaceRail drawer closes first, then ChannelSidebar opens
      setIsChannelSidebarOpen(true);
      console.log("🔵 [SPACE SELECT] Mobile: Opening channel sidebar");
    }
    
    // Navigate to the space page (not to a channel)
    // Only navigate if we're not already on this space's page
    const isOnSpacePage = pathname === `/space/${spaceId}` || pathname.startsWith(`/space/${spaceId}/`);
    const shouldNavigate = (isHomePage || pathname === "/") && !isOnSpacePage;
    console.log("🔵 [SPACE SELECT] Navigation check:", {
      shouldNavigate,
      isHomePage,
      pathname,
      isOnSpacePage,
    });
    
    if (shouldNavigate) {
      const targetPath = `/space/${spaceId}`;
      console.log("🔵 [SPACE SELECT] Navigating to space page:", targetPath);
      router.push(targetPath);
      console.log("🔵 [SPACE SELECT] router.push called, navigation initiated");
    } else {
      console.log("🔵 [SPACE SELECT] Skipping navigation (already on space page or not on homepage)");
    }
    
    // Reset the flag after a short delay to allow state to settle
    setTimeout(() => {
      isSelectingSpaceRef.current = false;
      console.log("🔵 [SPACE SELECT] Reset isSelectingSpaceRef.current = false (after 100ms)");
    }, 100);
  }, [isHomePage, pathname, router, currentSpaceId]);

  // Handle home click (deselect space)
  const handleHomeClick = useCallback(() => {
    console.log("🟢 [HOME CLICK] handleHomeClick called, navigating to homepage");
    setCurrentSpaceId(null);
    setChatRoomSpaceId(null); // Clear chat room space ID
    setIsChannelSidebarOpen(false);
    router.push('/');
  }, [router]);

  // Handle channel click - navigate to channel page
  const handleChannelClick = useCallback((channelId: string) => {
    console.log("🟣 [CHANNEL CLICK] handleChannelClick called", {
      channelId,
      currentPathname: pathname,
      currentSpaceId,
      timestamp: new Date().toISOString(),
    });
    
    // Use currentSpaceId if available, otherwise try to extract from pathname
    const spaceId = currentSpaceId || (pathname.startsWith("/space/") ? pathname.split("/")[2] : null);
    
    if (!spaceId) {
      console.error("🟣 [CHANNEL CLICK] No spaceId available, cannot navigate");
      toast.error("Unable to determine space");
      return;
    }
    
    const targetPath = `/space/${spaceId}/channel/${channelId}`;
    console.log("🟣 [CHANNEL CLICK] Navigating to:", targetPath);
    router.push(targetPath);
    console.log("🟣 [CHANNEL CLICK] router.push called");
    // Close channel sidebar on mobile after selection
    if (window.innerWidth < 768) {
      setIsChannelSidebarOpen(false);
      console.log("🟣 [CHANNEL CLICK] Mobile: Closing channel sidebar");
    }
  }, [router, pathname, currentSpaceId]);

  // Handle add space
  const handleAddSpace = useCallback(() => {
    setIsCreateSpaceOpen(true);
  }, []);

  // Handle create channel
  const handleCreateChannel = useCallback((type: 'text' | 'audio' | 'video') => {
    if (!currentSpaceId) return;
    // TODO: Open create channel modal
    toast.info(`Create ${type} channel feature coming soon`);
  }, [currentSpaceId]);

  // Get current user to check ownership
  const { user } = useAuth();
  const [isSpaceOwner, setIsSpaceOwner] = useState(false);
  
  // Get voice channel state - MUST be called before any conditional returns
  const { voiceChannel, leaveVoiceChannel } = useVoiceChannel();
  
  // Check if user is owner of the space (separate from role in space_members)
  useEffect(() => {
    if (currentSpaceId && user?.id) {
      startTransition(async () => {
        try {
          const { createClient } = await import("../../utils/supabase/client");
          const supabase = createClient();
          const { data: space } = await supabase
            .from('spaces')
            .select('owner_id')
            .eq('id', currentSpaceId)
            .maybeSingle();
          
          setIsSpaceOwner(space?.owner_id === user.id);
        } catch (error) {
          console.error('Error checking space ownership:', error);
          setIsSpaceOwner(false);
        }
      });
    } else {
      setIsSpaceOwner(false);
    }
  }, [currentSpaceId, user?.id]);
  
  // Determine if user is admin for current space (owner or admin role)
  const isAdmin = isSpaceOwner || currentSpace?.role === 'admin';
  
  // Log user role when space is loaded
  useEffect(() => {
    if (currentSpace) {
      console.log('🔴 [USER ROLE] Space loaded:', {
        spaceId: currentSpace.id,
        spaceName: currentSpace.name,
        userRole: currentSpace.role,
        isSpaceOwner: isSpaceOwner,
        isAdmin: isAdmin,
        userId: user?.id,
        timestamp: new Date().toISOString(),
      });
    }
  }, [currentSpace, isAdmin, isSpaceOwner, user?.id]);

  // Determine which space to show (spacePageId takes priority, then chatRoomSpaceId, then currentSpaceId)
  const activeSpaceId = useMemo(() => {
    if (isSpacePage && spacePageId) return spacePageId;
    if (isChatPage && chatRoomSpaceId) return chatRoomSpaceId;
    return currentSpaceId;
  }, [isSpacePage, spacePageId, isChatPage, chatRoomSpaceId, currentSpaceId]);

  const showChannelSidebar = useMemo(() => {
    // Don't show sidebar on space pages - they have their own built-in sidebar
    if (isSpacePage) return false;
    // Only show on desktop, never on mobile, and only when we have an active space
    return activeSpaceId && !isHomePage && !isMobile;
  }, [isSpacePage, activeSpaceId, isHomePage, isMobile]);

  // Clear space selection when on homepage - FORCE CLEAR IMMEDIATELY
  // BUT: Only clear if no space is actively selected (to prevent race conditions)
  // IMPORTANT: Don't clear if we're in the middle of selecting a space or navigating
  useEffect(() => {
    console.log("🟡 [CLEAR LOGIC 1] useEffect triggered (isHomePage clear)", {
      isHomePage,
      currentSpaceId,
      isSelectingSpace: isSelectingSpaceRef.current,
      timestamp: new Date().toISOString(),
    });
    
    // Add a small delay to prevent clearing during navigation
    const timeoutId = setTimeout(() => {
      const shouldClear = isHomePage && currentSpaceId === null && !isSelectingSpaceRef.current;
      console.log("🟡 [CLEAR LOGIC 1] Timeout executed, checking clear conditions:", {
        shouldClear,
        isHomePage,
        currentSpaceId,
        isSelectingSpace: isSelectingSpaceRef.current,
      });
      
      if (shouldClear) {
        console.log("🟡 [CLEAR LOGIC 1] CLEARING space selection (isHomePage)");
        // Only clear if space is already null and we're not actively selecting
        setChatRoomSpaceId(null);
        setIsChannelSidebarOpen(false);
      } else {
        console.log("🟡 [CLEAR LOGIC 1] NOT clearing (conditions not met)");
      }
    }, 200); // Small delay to allow navigation to complete
    
    return () => {
      console.log("🟡 [CLEAR LOGIC 1] Cleanup: clearing timeout");
      clearTimeout(timeoutId);
    };
  }, [isHomePage, currentSpaceId]);

  // Additional safeguard: Clear on pathname change to homepage
  // BUT: Only clear if no space is actively selected
  // IMPORTANT: Don't clear if we're in the middle of selecting a space or navigating
  useEffect(() => {
    console.log("🟡 [CLEAR LOGIC 2] useEffect triggered (pathname clear)", {
      pathname,
      currentSpaceId,
      isSelectingSpace: isSelectingSpaceRef.current,
      timestamp: new Date().toISOString(),
    });
    
    // Add a small delay to prevent clearing during navigation
    const timeoutId = setTimeout(() => {
      const shouldClear = pathname === "/" && currentSpaceId === null && !isSelectingSpaceRef.current;
      console.log("🟡 [CLEAR LOGIC 2] Timeout executed, checking clear conditions:", {
        shouldClear,
        pathname,
        currentSpaceId,
        isSelectingSpace: isSelectingSpaceRef.current,
      });
      
      if (shouldClear) {
        console.log("🟡 [CLEAR LOGIC 2] CLEARING space selection (pathname)");
        // Only clear if space is already null and we're not actively selecting
        setChatRoomSpaceId(null);
        setIsChannelSidebarOpen(false);
      } else {
        console.log("🟡 [CLEAR LOGIC 2] NOT clearing (conditions not met)");
      }
    }, 200); // Small delay to allow navigation to complete
    
    return () => {
      console.log("🟡 [CLEAR LOGIC 2] Cleanup: clearing timeout");
      clearTimeout(timeoutId);
    };
  }, [pathname, currentSpaceId]);

  // Auto-open channel sidebar when entering a chat that belongs to a space
  useEffect(() => {
    if (isChatPage && chatRoomSpaceId && !isMobile) {
      setIsChannelSidebarOpen(true);
    }
  }, [isChatPage, chatRoomSpaceId, isMobile]);

  if (isPublicPage) {
    return (
      <>
        {children}
        <Toaster position="top-right" theme="dark" />
      </>
    );
  }

  const handleVoiceChannelDisconnect = useCallback((shouldSignalTerminate: boolean) => {
    leaveVoiceChannel();
  }, [leaveVoiceChannel]);

  return (
    <ProtectedRoute>
      <AuroraBackground showOrbs={!isMobile}>
        {/* Voice Channel CallOverlay - Renders when user is in a voice channel */}
        {voiceChannel.isConnected && voiceChannel.token && voiceChannel.serverUrl && (
          <CallOverlay
            token={voiceChannel.token}
            serverUrl={voiceChannel.serverUrl}
            roomName={voiceChannel.channelName || "Voice Channel"}
            roomType="channel"
            callType="audio"
            onDisconnect={handleVoiceChannelDisconnect}
            userId={user?.id}
            isVoiceChannel={true}
            channelName={voiceChannel.channelName}
            spaceName={voiceChannel.spaceName}
            hidden={false} // Always visible for voice channels (no ringing)
          />
        )}
        
        <div className="flex h-[100dvh] w-full bg-[#0B0D12]/50 overflow-hidden">
          {/* Desktop: Permanent Rail & Sidebar */}
          <aside className="hidden md:flex">
            <SpaceRail
              spaces={spaces}
              activeSpaceId={activeSpaceId}
              onSpaceSelect={handleSpaceSelect}
              onHomeClick={handleHomeClick}
              onAddSpace={handleAddSpace}
            />
            {showChannelSidebar && (
              <ChannelSidebar
                spaceName={currentSpace?.name || 'Space'}
                spaceAvatarUrl={currentSpace?.avatar_url || null}
                spaceId={activeSpaceId || undefined}
                isAdmin={isAdmin}
                channels={channels}
                activeChannelId={chatRoomId || null}
                onChannelClick={handleChannelClick}
                onCreateChannel={handleCreateChannel}
                onSettingsClick={() => setSpaceSettingsModalOpen(true)}
                onSpaceClick={handleHomeClick}
                isOpen={isChannelSidebarOpen}
                onClose={() => setIsChannelSidebarOpen(false)}
              />
            )}
          </aside>

          {/* Mobile: Full-Screen Deep Aurora Glass Backdrop with Atmospheric Depth */}
          {isMobileNavOpen && (
            <div
              className="md:hidden fixed inset-0 aurora-glass-deep bg-gradient-to-r from-slate-950/90 via-slate-950/60 to-transparent z-[60]"
              onClick={() => {
                setIsMobileNavOpen(false);
                setIsChannelSidebarOpen(false);
              }}
            >
              {/* Mobile Drawer - SpaceRail Only - Transparent, sits inside blurred atmosphere */}
              <div
                className="fixed inset-y-0 left-0 w-20 bg-transparent z-[61] transform transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] flex flex-col shadow-[4px_0_24px_rgba(99,102,241,0.2)]"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Drawer Content - SpaceRail Only */}
                <div className="flex-1 overflow-y-auto overflow-x-visible" style={{ overflowX: 'visible' }}>
                  <SpaceRail
                    spaces={spaces}
                    activeSpaceId={activeSpaceId}
                    onSpaceSelect={(spaceId) => {
                      handleSpaceSelect(spaceId);
                      // Close SpaceRail drawer and open ChannelSidebar
                      setIsMobileNavOpen(false);
                      setIsChannelSidebarOpen(true);
                    }}
                    onHomeClick={() => {
                      handleHomeClick();
                      setIsMobileNavOpen(false);
                      setIsChannelSidebarOpen(false);
                    }}
                    onAddSpace={handleAddSpace}
                    onBackClick={() => setIsMobileNavOpen(false)}
                    showBackButton={true}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Mobile: ChannelSidebar - Rendered separately so it can slide in independently */}
          {/* ABSOLUTELY DO NOT RENDER when hamburger menu is open - ONLY show when menu is closed AND sidebar is explicitly opened */}
          {isMobile && !isMobileNavOpen && currentSpaceId && isChannelSidebarOpen && (
            <ChannelSidebar
              spaceName={currentSpace?.name || 'Space'}
              spaceAvatarUrl={currentSpace?.avatar_url || null}
              spaceId={activeSpaceId || undefined}
              isAdmin={isAdmin}
              channels={channels}
              activeChannelId={chatRoomId || null}
              onChannelClick={(channelId) => {
                handleChannelClick(channelId);
                setIsMobileNavOpen(false);
                setIsChannelSidebarOpen(false);
              }}
              onSpaceClick={() => {
                setIsChannelSidebarOpen(false);
                // Return to SpaceRail view by reopening the hamburger menu
                setIsMobileNavOpen(true);
              }}
              onCreateChannel={handleCreateChannel}
              onSettingsClick={() => {
                setSpaceSettingsModalOpen(true);
                setIsMobileNavOpen(false);
                setIsChannelSidebarOpen(false);
              }}
              isOpen={isChannelSidebarOpen}
              onClose={() => {
                setIsChannelSidebarOpen(false);
                // Return to SpaceRail view by reopening the hamburger menu
                setIsMobileNavOpen(true);
              }}
            />
          )}

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 relative">
        {/* Only show AppShell Header if NOT in a Chat Room or Space Page */}
        {!isChatPage && !isSpacePage && (
          <header className="sticky top-0 z-30 h-16 bg-[#0B0D12]/80 backdrop-blur-xl border-b border-white/10 flex items-center justify-between px-4 md:px-6 shrink-0">
            <div className="flex items-center gap-4 flex-shrink-0">
              {/* Mobile: Hamburger Menu */}
              <button
                onClick={() => {
                  // FORCE close ChannelSidebar first
                  setIsChannelSidebarOpen(false);
                  // Then open hamburger menu with SpaceRail only
                  setIsMobileNavOpen(true);
                }}
                className="md:hidden p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                aria-label="Open navigation"
              >
                <Menu size={24} />
              </button>
              {isHomePage && (
                <AetherLogo className="h-8 w-auto" />
              )}
            </div>
            {/* Centered GlobalSearch */}
            <div className="flex-1 flex justify-center px-4">
              {!isHomePage && <GlobalSearch />}
            </div>
            <div className="flex items-center gap-4 flex-shrink-0">
              <NotificationBell />
            </div>
          </header>
        )}

        {/* Content */}
        <div className="flex-1 relative overflow-y-auto">
          {children}
        </div>
      </main>

      {/* Modals */}
      <CreateSpaceModal 
        isOpen={isCreateSpaceOpen} 
        onClose={() => setIsCreateSpaceOpen(false)} 
      />
      {currentSpaceId && (
        <SpaceSettingsModal
          spaceId={currentSpaceId}
          spaceName={currentSpace?.name || 'Space'}
          isAdmin={isAdmin}
          isOpen={isSpaceSettingsModalOpen}
          onClose={() => setSpaceSettingsModalOpen(false)}
        />
      )}
        </div>
      </AuroraBackground>
    </ProtectedRoute>
  );
}

export default AppShell;