"use client";

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { useAuth } from './AuthContext';

interface VoiceChannelState {
  channelId: string | null;
  channelName: string | null;
  spaceId: string | null;
  spaceName: string | null;
  token: string | null;
  serverUrl: string | null;
  isConnected: boolean;
}

interface VoiceChannelContextType {
  voiceChannel: VoiceChannelState;
  joinVoiceChannel: (channelId: string, channelName: string, spaceId: string, spaceName?: string) => Promise<void>;
  leaveVoiceChannel: () => void;
}

const VoiceChannelContext = createContext<VoiceChannelContextType | undefined>(undefined);

export const useVoiceChannel = () => {
  const context = useContext(VoiceChannelContext);
  if (!context) {
    throw new Error('useVoiceChannel must be used within VoiceChannelProvider');
  }
  return context;
};

interface VoiceChannelProviderProps {
  children: ReactNode;
}

export const VoiceChannelProvider: React.FC<VoiceChannelProviderProps> = ({ children }) => {
  // Always call hooks in the same order - hooks must be called unconditionally
  const [voiceChannel, setVoiceChannel] = useState<VoiceChannelState>({
    channelId: null,
    channelName: null,
    spaceId: null,
    spaceName: null,
    token: null,
    serverUrl: null,
    isConnected: false,
  });
  
  // useAuth must be called unconditionally - it will throw if not in AuthProvider
  // but since VoiceChannelProvider is inside AuthProvider in layout.tsx, this is safe
  const { user } = useAuth();

  const joinVoiceChannel = useCallback(async (
    channelId: string,
    channelName: string,
    spaceId: string,
    spaceName?: string
  ) => {
    if (!user) {
      console.error('Cannot join voice channel: User not authenticated');
      return;
    }

    try {
      // Generate LiveKit token for the voice channel
      // Room name format: channel_${channelId}
      const roomName = `channel_${channelId}`;
      
      const response = await fetch('/api/livekit/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          room_id: roomName,
          user_id: user.id,
          username: user.email?.split('@')[0] || 'User',
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to get LiveKit token');
      }

      const data = await response.json();
      // Get LiveKit URL from environment variable (NEXT_PUBLIC_ vars are available client-side)
      const wsUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL || '';

      if (!wsUrl) {
        throw new Error('LiveKit server URL not configured. Please set NEXT_PUBLIC_LIVEKIT_URL.');
      }

      setVoiceChannel({
        channelId,
        channelName,
        spaceId,
        spaceName: spaceName || null,
        token: data.token,
        serverUrl: wsUrl,
        isConnected: true,
      });
    } catch (error) {
      console.error('Error joining voice channel:', error);
      throw error;
    }
  }, [user]);

  const leaveVoiceChannel = useCallback(() => {
    setVoiceChannel({
      channelId: null,
      channelName: null,
      spaceId: null,
      spaceName: null,
      token: null,
      serverUrl: null,
      isConnected: false,
    });
  }, []);

  return (
    <VoiceChannelContext.Provider
      value={{
        voiceChannel,
        joinVoiceChannel,
        leaveVoiceChannel,
      }}
    >
      {children}
    </VoiceChannelContext.Provider>
  );
};
