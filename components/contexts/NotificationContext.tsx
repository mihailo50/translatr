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
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
};

