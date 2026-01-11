'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';

interface NotificationContextType {
  isNotificationsOpen: boolean;
  setIsNotificationsOpen: (open: boolean) => void;
  currentRoomId: string | null;
  setCurrentRoomId: (roomId: string | null) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [currentRoomId, setCurrentRoomId] = useState<string | null>(null);

  return (
    <NotificationContext.Provider value={{ 
      isNotificationsOpen, 
      setIsNotificationsOpen,
      currentRoomId,
      setCurrentRoomId
    }}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    // During SSR or if not within provider, return default values instead of throwing
    // This prevents hydration errors and allows graceful degradation
    if (typeof window === 'undefined') {
      // Server-side: return default values
      return {
        isNotificationsOpen: false,
        setIsNotificationsOpen: () => {},
        currentRoomId: null,
        setCurrentRoomId: () => {},
      };
    }
    // Client-side but not in provider: this is a real error
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
};

