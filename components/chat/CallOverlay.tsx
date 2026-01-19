'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { LiveKitRoom, useTracks, VideoTrack, useLocalParticipant, useRemoteParticipants, useRoomContext, useIsSpeaking } from '@livekit/components-react';
import type { TrackReferenceOrPlaceholder, TrackReference } from '@livekit/components-react';
import { Track, ExternalE2EEKeyProvider, RoomOptions, RoomEvent, RemoteParticipant } from 'livekit-client';
import { ShieldCheck, Mic, MicOff, Video, VideoOff, PhoneOff, MonitorUp, MonitorOff, XSquare } from 'lucide-react';
import { toast } from 'sonner';

interface CallOverlayProps {
  token: string;
  serverUrl: string;
  roomName: string;
  roomType: 'direct' | 'group';
  callType: 'audio' | 'video';
  onDisconnect: (shouldSignalTerminate: boolean) => void;
  userPreferredLanguage?: string;
  userId?: string;
  onParticipantJoined?: () => void;
  onCallAccepted?: (callId?: string) => void;
  hidden?: boolean; // When true, overlay is mounted but invisible (used for caller waiting state)
}

// Speaking indicator wrapper for video tiles
const SpeakingVideoTile = ({ trackRef, isScreenShare = false }: { trackRef: TrackReferenceOrPlaceholder, isScreenShare?: boolean }) => {
    const isSpeaking = useIsSpeaking(trackRef.participant);
    
    // Filter out placeholders - VideoTrack doesn't accept placeholders
    if (!trackRef.publication) {
        return null; // Don't render placeholder tracks
    }
    
    // Type guard: if publication exists, it's a TrackReference, not a placeholder
    const validTrackRef = trackRef as TrackReference;
    
    return (
        <div 
            className={`relative rounded-2xl overflow-hidden shadow-xl transition-all duration-300 ${
                isSpeaking 
                    ? 'border-2 border-indigo-500/80 shadow-[0_0_30px_rgba(99,102,241,0.3)]' 
                    : 'border border-white/10 bg-white/5'
            }`}
        >
            <VideoTrack trackRef={validTrackRef} className={`w-full h-full ${isScreenShare ? 'object-contain' : 'object-cover'}`} />
            <div className="absolute bottom-3 left-3 bg-black/60 px-2 py-1 rounded text-xs text-white/90 font-light tracking-wide flex items-center gap-2">
                {isScreenShare && <MonitorUp size={12} className="text-emerald-400" />}
                {trackRef.participant.name || trackRef.participant.identity}
                {isScreenShare && <span className="text-emerald-400 text-[10px]">(Screen)</span>}
                {isSpeaking && !isScreenShare && (
                    <span className="flex gap-0.5">
                        <span className="w-1 h-3 bg-indigo-400 rounded-full animate-pulse" style={{ animationDelay: '0ms' }} />
                        <span className="w-1 h-4 bg-indigo-400 rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
                        <span className="w-1 h-2 bg-indigo-400 rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
                    </span>
                )}
            </div>
        </div>
    );
};

const FloatingLocalVideo = () => {
    const { localParticipant } = useLocalParticipant();
    const tracks = useTracks([Track.Source.Camera]);
    const localTrack = tracks.find(t => t.participant.identity === localParticipant.identity);
    
    // Draggable state
    const [position, setPosition] = useState({ x: -1, y: -1 }); // -1 means not initialized
    const [isDragging, setIsDragging] = useState(false);
    const dragRef = useRef<HTMLDivElement>(null);
    const offsetRef = useRef({ x: 0, y: 0 });
    
    // Video dimensions (responsive)
    const videoWidth = typeof window !== 'undefined' && window.innerWidth >= 768 ? 192 : 128; // md:w-48 = 192px, w-32 = 128px
    const videoHeight = videoWidth * (9 / 16); // aspect-video = 16:9
    
    // Initialize position to bottom-right on mount (with mobile-safe top offset)
    useEffect(() => {
        if (typeof window !== 'undefined' && position.x === -1) {
            const isMobile = window.innerWidth < 768;
            const topOffset = isMobile ? 128 : 96; // top-32 (128px) on mobile, top-24 (96px) on desktop
            setPosition({
                x: window.innerWidth - videoWidth - 16, // 16px margin from right
                y: isMobile 
                    ? topOffset // Position from top on mobile (below header + status bar)
                    : window.innerHeight - videoHeight - 120 // 120px from bottom (above controls) on desktop
            });
        }
    }, [position.x, videoWidth, videoHeight]);
    
    // Handle window resize
    useEffect(() => {
        const handleResize = () => {
            setPosition(prev => ({
                x: Math.min(prev.x, window.innerWidth - videoWidth - 8),
                y: Math.min(prev.y, window.innerHeight - videoHeight - 8)
            }));
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [videoWidth, videoHeight]);
    
    // Clamp position to screen boundaries
    const clampPosition = (x: number, y: number) => {
        const maxX = window.innerWidth - videoWidth - 8;
        const maxY = window.innerHeight - videoHeight - 8;
        return {
            x: Math.max(8, Math.min(x, maxX)),
            y: Math.max(8, Math.min(y, maxY))
        };
    };
    
    // Mouse/Touch event handlers
    const handleStart = (clientX: number, clientY: number) => {
        if (!dragRef.current) return;
        setIsDragging(true);
        offsetRef.current = {
            x: clientX - position.x,
            y: clientY - position.y
        };
    };
    
    const handleMove = (clientX: number, clientY: number) => {
        if (!isDragging) return;
        const newPos = clampPosition(
            clientX - offsetRef.current.x,
            clientY - offsetRef.current.y
        );
        setPosition(newPos);
    };
    
    const handleEnd = () => {
        setIsDragging(false);
    };
    
    // Mouse events
    const handleMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        handleStart(e.clientX, e.clientY);
    };
    
    useEffect(() => {
        if (!isDragging) return;
        
        const handleMouseMove = (e: MouseEvent) => {
            handleMove(e.clientX, e.clientY);
        };
        
        const handleMouseUp = () => {
            handleEnd();
        };
        
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging]);
    
    // Touch events
    const handleTouchStart = (e: React.TouchEvent) => {
        if (e.touches.length === 1) {
            handleStart(e.touches[0].clientX, e.touches[0].clientY);
        }
    };
    
    const handleTouchMove = (e: React.TouchEvent) => {
        if (e.touches.length === 1) {
            handleMove(e.touches[0].clientX, e.touches[0].clientY);
        }
    };
    
    const handleTouchEnd = () => {
        handleEnd();
    };
    
    if (!localTrack) return null;
    
    // Don't render until position is initialized
    if (position.x === -1) return null;

    return (
        <div 
            ref={dragRef}
            className={`fixed w-32 md:w-48 aspect-video rounded-2xl border border-white/20 overflow-hidden z-[90] bg-black/40 cursor-move select-none ${
                isDragging 
                    ? 'shadow-[0_20px_60px_rgba(99,102,241,0.6)] scale-105 cursor-grabbing' 
                    : 'shadow-[0_20px_50px_rgba(0,0,0,0.5)] transition-shadow transition-transform duration-200'
            }`}
            style={{ 
                left: position.x, 
                top: position.y,
                touchAction: 'none' // Prevent scroll on touch
            }}
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
        >
            <VideoTrack trackRef={localTrack} className="w-full h-full object-cover mirror-mode pointer-events-none" />
            <div className="absolute bottom-1 left-2 text-[10px] font-light tracking-wide text-white/90 z-20 pointer-events-none">You</div>
        </div>
    );
};

// Minimal listener component for hidden mode - only listens for participant events
// Does NOT try to publish any tracks (avoiding the "engine not connected" error)
// IMPORTANT: Only triggers when someone publishes AUDIO or VIDEO tracks (indicating they joined the CALL)
// This prevents false triggers when users are just connected for chat (no media tracks)
const HiddenCallListener = ({ userId, onParticipantJoined, onCallAccepted }: { 
    userId?: string, 
    onParticipantJoined?: () => void, 
    onCallAccepted?: (callId?: string) => void 
}) => {
    const remoteParticipants = useRemoteParticipants();
    const room = useRoomContext();
    const notifiedRef = useRef(false);
    
    // Check if a participant has published audio or video tracks (indicating they're in the call, not just chat)
    const hasMediaTracks = (participant: RemoteParticipant): boolean => {
        const tracks = participant.trackPublications;
        if (!tracks || tracks.size === 0) return false;
        
        // Check for audio or video tracks
        let hasMedia = false;
        tracks.forEach((publication) => {
            if (publication.kind === 'audio' || publication.kind === 'video') {
                hasMedia = true;
            }
        });
        return hasMedia;
    };
    
    useEffect(() => {
        if (!room || room.state !== 'connected') return;
        
        const notifyParticipantJoined = () => {
            if (!notifiedRef.current) {
                notifiedRef.current = true;
                console.log('📞 [HiddenCallListener] Participant with media tracks joined, notifying parent');
                if (onParticipantJoined) onParticipantJoined();
                if (onCallAccepted) onCallAccepted();
            }
        };
        
        // Check if any remote participant has media tracks (call participants)
        const checkForCallParticipants = () => {
            const callParticipant = remoteParticipants.find(p => 
                p.identity !== userId && hasMediaTracks(p)
            );
            if (callParticipant) {
                console.log('📞 [HiddenCallListener] Found participant with media:', callParticipant.identity);
                notifyParticipantJoined();
            }
        };
        
        // Listen for track subscription events (when someone publishes audio/video)
        const handleTrackSubscribed = (track: any, publication: any, participant: RemoteParticipant) => {
            if (participant.identity !== userId && (publication.kind === 'audio' || publication.kind === 'video')) {
                console.log('📞 [HiddenCallListener] Track subscribed from:', participant.identity, publication.kind);
                notifyParticipantJoined();
            }
        };
        
        room.on(RoomEvent.TrackSubscribed, handleTrackSubscribed);
        
        // Initial check for existing call participants
        checkForCallParticipants();
        
        // Also poll periodically in case events are missed
        const pollInterval = setInterval(checkForCallParticipants, 1000);
        
        return () => {
            room.off(RoomEvent.TrackSubscribed, handleTrackSubscribed);
            clearInterval(pollInterval);
        };
    }, [room, userId, onParticipantJoined, onCallAccepted, remoteParticipants]);
    
    // Render nothing - this is just a listener
    return null;
};

const CallContent = ({ roomName, roomType, callType, onDisconnect, userId, onParticipantJoined, onCallAccepted }: { roomName: string, roomType: 'direct' | 'group', callType: 'audio' | 'video', onDisconnect: (s: boolean) => void, userId?: string, onParticipantJoined?: () => void, onCallAccepted?: (callId?: string) => void }) => {
    const { localParticipant } = useLocalParticipant();
    const remoteParticipants = useRemoteParticipants();
    const room = useRoomContext();
    const participantJoinedRef = useRef(false);
    
    // Track if we've already notified about call acceptance
    const callAcceptedNotifiedRef = useRef(false);
    
    // Listen for DataChannel messages AND participant joins for instant call acceptance detection
    useEffect(() => {
        if (!room || room.state !== 'connected') return;
        
        const notifyCallAccepted = () => {
            if (!callAcceptedNotifiedRef.current && onCallAccepted) {
                callAcceptedNotifiedRef.current = true;
                onCallAccepted();
            }
        };
        
        // Method 1: Listen for DataChannel messages (signal from acceptor)
        const handleDataReceived = (payload: Uint8Array, participant?: any) => {
            const decoder = new TextDecoder();
            try {
                const data = JSON.parse(decoder.decode(payload));
                
                // Handle call_accepted signal from call room
                if (data.type === 'call_accepted' && participant && participant.identity !== userId) {
                    notifyCallAccepted();
                }
            } catch (error) {
                // Silently handle parse errors
            }
        };
        
        // Method 2: Listen for participant joins (instant detection - more reliable)
        const handleParticipantConnected = (participant: RemoteParticipant) => {
            if (participant.identity !== userId) {
                notifyCallAccepted();
            }
        };
        
        room.on(RoomEvent.DataReceived, handleDataReceived);
        room.on(RoomEvent.ParticipantConnected, handleParticipantConnected);
        
        // Check if participant is already in the room
        if (remoteParticipants.length > 0) {
            notifyCallAccepted();
        }
        
        return () => {
            room.off(RoomEvent.DataReceived, handleDataReceived);
            room.off(RoomEvent.ParticipantConnected, handleParticipantConnected);
        };
    }, [room, userId, onCallAccepted, remoteParticipants]);
    
    // Notify parent when participant joins (for call acceptance detection)
    useEffect(() => {
        if (!room || room.state !== 'connected' || !localParticipant) return;
        
        const handleParticipantConnected = () => {
            // When a remote participant joins, send call_accepted signal via call room DataChannel
            // This is a fallback for when the chat room DataChannel signal fails
            if (remoteParticipants.length > 0 && localParticipant && !participantJoinedRef.current) {
                participantJoinedRef.current = true;
                
                // Notify parent component (ChatRoom) that participant joined
                if (onParticipantJoined) {
                    onParticipantJoined();
                }
                
                // Send call_accepted signal via call room DataChannel immediately
                try {
                    const payload = JSON.stringify({
                        type: 'call_accepted',
                        senderId: userId || localParticipant.identity,
                        timestamp: Date.now()
                    });
                    const encoder = new TextEncoder();
                    const encodedPayload = encoder.encode(payload);
                    
                    // Send immediately
                    localParticipant.publishData(encodedPayload, { reliable: true })
                        .catch(() => {
                            // Try lossy as fallback
                            localParticipant.publishData(encodedPayload, { reliable: false })
                                .catch(() => {});
                        });
                    
                    // Also send backup signals to ensure delivery
                    setTimeout(() => {
                        localParticipant.publishData(encodedPayload, { reliable: true }).catch(() => {});
                    }, 100);
                    
                    setTimeout(() => {
                        localParticipant.publishData(encodedPayload, { reliable: true }).catch(() => {});
                    }, 300);
                } catch (error) {
                    // Silently handle send errors
                }
            }
        };
        
        // Check if participants already exist
        if (remoteParticipants.length > 0 && !participantJoinedRef.current) {
            handleParticipantConnected();
        }
        
        // Listen for new participants
        room.on(RoomEvent.ParticipantConnected, handleParticipantConnected);
        
        return () => {
            room.off(RoomEvent.ParticipantConnected, handleParticipantConnected);
        };
    }, [room, localParticipant, remoteParticipants.length, userId, onParticipantJoined]);
    
    // Always listen for camera tracks so users can enable video mid-call
    const videoTracks = useTracks([Track.Source.Camera]);
    // ALWAYS listen for audio tracks (both audio and video calls need audio)
    const audioTracks = useTracks([Track.Source.Microphone]);
    // Listen for screen share tracks
    const screenShareTracks = useTracks([Track.Source.ScreenShare]);
    
    // Filter remote tracks
    const remoteVideoTracks = videoTracks.filter(t => t.participant.identity !== localParticipant.identity);
    const remoteAudioTracks = audioTracks.filter(t => t.participant.identity !== localParticipant.identity);
    const remoteScreenShareTracks = screenShareTracks.filter(t => t.participant.identity !== localParticipant.identity);

    const [isMuted, setIsMuted] = useState(false);
    const [isVideoOff, setIsVideoOff] = useState(callType === 'audio'); // Video off by default for audio calls
    const [callDuration, setCallDuration] = useState(0); // Call duration in seconds
    const callStartTimeRef = useRef<number | null>(null);
    const [focusedTrackSid, setFocusedTrackSid] = useState<string | null>(null); // Track SID of the focused screen share
    
    // Screen share toggle with error handling
    // Check if screen share is enabled by looking at local screen share tracks
    const isScreenShareEnabled = screenShareTracks.some(
        track => track.participant.identity === localParticipant.identity
    );
    
    const toggleScreenShare = async () => {
        try {
            if (isScreenShareEnabled) {
                await localParticipant.setScreenShareEnabled(false);
            } else {
                await localParticipant.setScreenShareEnabled(true);
            }
        } catch (error) {
            console.error('Screen share error:', error);
            toast.error('Failed to share screen', {
                description: 'Please check your permissions and try again.'
            });
        }
    };

    // Call timer effect
    useEffect(() => {
        if (!room || room.state !== 'connected') {
            setCallDuration(0);
            callStartTimeRef.current = null;
            return;
        }

        // Set start time when room connects (only once)
        if (callStartTimeRef.current === null) {
            callStartTimeRef.current = Date.now();
        }

        const interval = setInterval(() => {
            if (callStartTimeRef.current) {
                const elapsed = Math.floor((Date.now() - callStartTimeRef.current) / 1000);
                setCallDuration(elapsed);
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [room]);

    // Manage focused screen share track - default to first available, reset if focused track disappears
    useEffect(() => {
        if (screenShareTracks.length === 0) {
            setFocusedTrackSid(null);
            return;
        }
        
        // If no focused track, default to first one
        if (!focusedTrackSid) {
            setFocusedTrackSid(screenShareTracks[0]?.publication.trackSid || null);
            return;
        }
        
        // Check if focused track still exists
        const focusedTrackExists = screenShareTracks.some(
            t => t.publication.trackSid === focusedTrackSid
        );
        
        // If focused track is gone, switch to first available
        if (!focusedTrackExists && screenShareTracks.length > 0) {
            setFocusedTrackSid(screenShareTracks[0].publication.trackSid);
        }
    }, [screenShareTracks, focusedTrackSid]);

    // Format call duration as MM:SS
    const formatCallDuration = (seconds: number): string => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    // Ensure microphone is enabled when room connects
    useEffect(() => {
        if (!room || !localParticipant) return;
        
        const ensureMicrophoneEnabled = async () => {
            try {
                // Check if microphone is already enabled (for local tracks, check if published)
                const micPublication = localParticipant.getTrackPublication(Track.Source.Microphone);
                
                if (!micPublication || micPublication.isMuted) {
                    await localParticipant.setMicrophoneEnabled(true);
                }
            } catch (error) {
                console.error('❌ CallOverlay: Failed to enable microphone:', error);
            }
        };

        // Wait for room to be connected
        if (room.state === 'connected') {
            ensureMicrophoneEnabled();
        } else {
            const handleConnected = () => {
                ensureMicrophoneEnabled();
            };
            room.on(RoomEvent.Connected, handleConnected);
            return () => {
                room.off(RoomEvent.Connected, handleConnected);
            };
        }
    }, [room, localParticipant]);

    // Attach audio tracks to audio elements for playback
    const audioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());
    
    useEffect(() => {
        // Audio is needed for BOTH audio and video calls
        if (!room) return;
        
        // Ensure we subscribe to remote audio tracks
        remoteParticipants.forEach(participant => {
            const audioPublication = participant.getTrackPublication(Track.Source.Microphone);
            if (audioPublication && !audioPublication.isSubscribed) {
                audioPublication.setSubscribed(true);
            }
        });
        
        // Attach each remote audio track to an audio element
        remoteAudioTracks.forEach(trackRef => {
            const participantId = trackRef.participant.identity;
            const publication = trackRef.publication;
            const livekitTrack = publication?.track;
            
            if (!livekitTrack || !publication?.isSubscribed) {
                return;
            }
            
            // Get the underlying MediaStreamTrack from LiveKit Track
            const mediaStreamTrack = livekitTrack.mediaStreamTrack;
            if (!mediaStreamTrack) {
                return;
            }
            
            // Get or create audio element for this participant
            let audioElement = audioRefs.current.get(participantId);
            if (!audioElement) {
                audioElement = document.createElement('audio');
                audioElement.autoplay = true;
                audioElement.playsInline = true;
                audioElement.volume = 1.0;
                audioElement.muted = false;
                audioElement.style.display = 'none';
                document.body.appendChild(audioElement);
                audioRefs.current.set(participantId, audioElement);
            }
            
            // Attach track to audio element
            const stream = new MediaStream([mediaStreamTrack]);
            
            // Only update if the stream has changed
            if (audioElement.srcObject !== stream) {
                audioElement.srcObject = stream;
                audioElement.volume = 1.0;
                audioElement.muted = false;
                
                audioElement.play().catch(() => {
                    // Silently handle autoplay failures
                });
            }
        });
        
        // Clean up audio elements for participants who left
        const activeParticipantIds = new Set(remoteAudioTracks.map(t => t.participant.identity));
        audioRefs.current.forEach((audioElement, participantId) => {
            if (!activeParticipantIds.has(participantId)) {
                audioElement.pause();
                audioElement.srcObject = null;
                audioElement.remove();
                audioRefs.current.delete(participantId);
            }
        });
        
        return () => {
            // Cleanup on unmount
            audioRefs.current.forEach((audioElement) => {
                audioElement.pause();
                audioElement.srcObject = null;
                audioElement.remove();
            });
            audioRefs.current.clear();
        };
    }, [remoteAudioTracks, remoteParticipants, room]);

    // Listen for room disconnection events and data channel messages
    useEffect(() => {
        if (!room) return;
        
        const handleDisconnected = () => {
            onDisconnect(false);
        };
        
        const handleData = (payload: Uint8Array) => {
            const decoder = new TextDecoder();
            try {
                const data = JSON.parse(decoder.decode(payload));
                if (data.type === 'call_ended') {
                    onDisconnect(false);
                }
            } catch (e) {
                // Ignore parse errors
            }
        };
        
        room.on(RoomEvent.Disconnected, handleDisconnected);
        room.on(RoomEvent.DataReceived, handleData);
        
        return () => {
            room.off(RoomEvent.Disconnected, handleDisconnected);
            room.off(RoomEvent.DataReceived, handleData);
        };
    }, [room, onDisconnect]);

    const toggleMute = () => {
        const state = !isMuted;
        localParticipant.setMicrophoneEnabled(!state);
        setIsMuted(state);
    };

    const toggleVideo = () => {
        const state = !isVideoOff;
        localParticipant.setCameraEnabled(!state);
        setIsVideoOff(state);
    };

    const handleHangup = async () => {
        // If direct call, send call_ended signal via call room's data channel
        if (roomType === 'direct' && room && room.localParticipant && userId) {
            try {
                const payload = JSON.stringify({
                    type: 'call_ended',
                    senderId: userId,
                    timestamp: Date.now()
                });
                const encoder = new TextEncoder();
                await room.localParticipant.publishData(encoder.encode(payload), { reliable: true });
            } catch (error) {
                // Silently handle send errors
            }
        }
        // Disconnect (this will clear state in ChatRoom)
        onDisconnect(roomType === 'direct');
    };

    return (
        <div className="relative h-dvh w-full flex flex-col bg-[#020205]">
            {/* Inline styles for radar/pulse animations and scrollbar */}
            <style dangerouslySetInnerHTML={{ __html: `
              @keyframes radar-ripple {
                0% { transform: scale(1); opacity: 1; }
                100% { transform: scale(2.5); opacity: 0; }
              }
              @keyframes radar {
                0% { transform: scale(1); opacity: 0.5; }
                100% { transform: scale(1.8); opacity: 0; }
              }
              .radar-ripple-1 { animation: radar-ripple 2s cubic-bezier(0.4, 0, 0.2, 1) infinite; }
              .radar-ripple-2 { animation: radar-ripple 2s cubic-bezier(0.4, 0, 0.2, 1) infinite 0.5s; }
              .radar-ring-1 { animation: radar 2s ease-out infinite; }
              .radar-ring-2 { animation: radar 2s ease-out infinite 0.4s; }
              .radar-ring-3 { animation: radar 2s ease-out infinite 0.8s; }
              
              /* Custom scrollbar for participant strip */
              .scrollbar-thin::-webkit-scrollbar {
                height: 6px;
              }
              .scrollbar-thin::-webkit-scrollbar-track {
                background: transparent;
              }
              .scrollbar-thin::-webkit-scrollbar-thumb {
                background: rgba(255, 255, 255, 0.1);
                border-radius: 3px;
              }
              .scrollbar-thin::-webkit-scrollbar-thumb:hover {
                background: rgba(255, 255, 255, 0.2);
              }
            `}} />
            {/* Floating Status Bar */}
            <div className="fixed top-20 md:top-6 left-1/2 -translate-x-1/2 flex items-center gap-3 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 backdrop-blur-md z-[100] w-auto max-w-[90vw]">
                <ShieldCheck size={12} className="text-emerald-400" />
                <span className="text-[10px] tracking-[0.2em] font-bold text-emerald-400/80 uppercase">SECURE E2EE</span>
                <span className="text-white/50 text-xs">{formatCallDuration(callDuration)}</span>
                {screenShareTracks.length > 0 && (
                    <>
                        <span className="text-white/30">•</span>
                        <MonitorUp size={12} className="text-emerald-400 animate-pulse" />
                        <span className="text-[10px] tracking-[0.2em] font-bold text-emerald-400/80 uppercase">SHARING</span>
                    </>
                )}
            </div>

            {/* Header */}
            <div className="relative z-50 h-16 flex items-center justify-between px-6 border-b border-white/10 bg-[#050510]/60 backdrop-blur-xl">
                <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-white/90 font-light tracking-wide text-base">{roomName}</span>
                    <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-green-500/10 border border-green-500/20">
                        <ShieldCheck size={10} className="text-green-400" />
                        <span className="text-[10px] text-green-400 font-bold uppercase tracking-wider">E2EE</span>
                    </div>
                </div>
            </div>

            {/* Main Stage (Remote Participants) */}
            <div className="flex-1 w-full max-w-[1800px] mx-auto pt-32 md:pt-24 pb-28 px-4 md:px-8 flex items-center justify-center z-10">
                {(() => {
                    const hasScreenShare = screenShareTracks.length > 0;
                    const hasRemoteVideo = remoteVideoTracks.length > 0;
                    
                    if (hasScreenShare) {
                        // Cinema Mode: Multi-Screen Share with Switcher
                        // Find the active focused track, or default to first
                        const activeScreenTrack = screenShareTracks.find(
                            t => t.publication.trackSid === focusedTrackSid
                        ) || screenShareTracks[0];
                        
                        // Collect all camera tracks (both remote and local if enabled)
                        const allCameraTracks = [
                            ...remoteVideoTracks,
                            ...((!isVideoOff && videoTracks.find(t => t.participant.identity === localParticipant.identity)) 
                                ? [videoTracks.find(t => t.participant.identity === localParticipant.identity)!] 
                                : [])
                        ];
                        
                        return (
                            <div className="w-full h-full flex flex-col bg-black relative pt-20">
                                {/* Multiple Screens Switcher - Top Bar */}
                                {screenShareTracks.length > 1 && (
                                    <div className="absolute top-24 left-1/2 -translate-x-1/2 z-50 flex gap-2 bg-black/50 backdrop-blur-md p-1.5 rounded-full border border-white/10">
                                        {screenShareTracks.map(t => {
                                            const isActive = activeScreenTrack.publication.trackSid === t.publication.trackSid;
                                            const participantName = t.participant.name || t.participant.identity;
                                            return (
                                                <button 
                                                    key={t.publication.trackSid}
                                                    onClick={() => setFocusedTrackSid(t.publication.trackSid)}
                                                    className={`px-3 py-1 text-xs rounded-full transition-all ${
                                                        isActive 
                                                            ? 'bg-indigo-500 text-white shadow-[0_0_15px_rgba(99,102,241,0.4)]' 
                                                            : 'hover:bg-white/10 text-white/70'
                                                    }`}
                                                >
                                                    {participantName}'s Screen
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}

                                {/* Main Screen Share Stage */}
                                <div className="flex-1 relative overflow-hidden flex items-center justify-center p-4">
                                    <div className="relative w-full h-full max-w-[90vw]">
                                        <VideoTrack 
                                            trackRef={activeScreenTrack} 
                                            className="w-full h-full"
                                            style={{ objectFit: 'contain' }}
                                        />
                                        {/* Identity Badge - Top Left */}
                                        <div className="absolute top-4 left-4 bg-black/60 backdrop-blur px-3 py-1.5 rounded-lg border border-white/10 flex items-center gap-2">
                                            <MonitorUp size={14} className="text-indigo-400" />
                                            <span className="text-sm font-medium text-white">
                                                {activeScreenTrack.participant.name || activeScreenTrack.participant.identity}'s Screen
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Camera Strip (Bottom) */}
                                {allCameraTracks.length > 0 && (
                                    <div className="h-32 w-full bg-[#0B0D12] border-t border-white/10 p-4 flex gap-3 overflow-x-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent snap-x">
                                        {allCameraTracks.map(track => (
                                            <div key={`camera-${track.participant.identity}`} className="h-full aspect-video flex-shrink-0 snap-center">
                                                <SpeakingVideoTile trackRef={track} />
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    }
                    
                    if (hasRemoteVideo) {
                        // Video call UI (even if started as audio, show when remote video is present)
                        return (
                            <div className={`grid gap-4 w-full h-full ${remoteVideoTracks.length === 1 ? 'grid-cols-1' : 'grid-cols-2 md:grid-cols-3'}`}>
                                {remoteVideoTracks.map(track => (
                                    <SpeakingVideoTile key={track.participant.identity} trackRef={track} />
                                ))}
                            </div>
                        );
                    }
                    // Audio-first UI (no video, no screen share)
                    return (
                    // Audio call UI - show participant avatars/names and render audio tracks
                    <div className="flex flex-col items-center justify-center text-white/90 font-light tracking-wide">
                        {remoteParticipants.length === 0 ? (
                            <>
                                <div className="relative w-24 h-24 mx-auto mb-3 translate-y-1">
                                    <div className="absolute inset-0 border border-indigo-500/30 rounded-full radar-ring-1" />
                                    <div className="absolute inset-0 border border-indigo-500/30 rounded-full radar-ring-2" />
                                    <div className="absolute inset-0 border border-indigo-500/30 rounded-full radar-ring-3" />
                                    <div className="relative w-24 h-24 rounded-full bg-gradient-to-br from-indigo-600/40 to-purple-600/40 p-1 shadow-lg shadow-indigo-500/20">
                                        <div className="w-full h-full rounded-full bg-[#020205] flex items-center justify-center">
                                            <span className="text-4xl">...</span>
                                        </div>
                                    </div>
                                </div>
                                <p className="text-white/60">
                                    {roomType === 'direct' ? 'Connecting...' : 'Waiting for others to join...'}
                                </p>
                            </>
                        ) : (
                            <div className="flex flex-col md:flex-row items-center justify-center gap-6 md:gap-8 flex-wrap">
                                {remoteParticipants.map(participant => {
                                    // Find audio track for this participant
                                    const participantAudioTrack = remoteAudioTracks.find(
                                        t => t.participant.identity === participant.identity
                                    );
                                    
                                    return (
                                        <div key={participant.identity} className="flex flex-col items-center gap-2">
                                            <div className="relative w-28 h-28 mx-auto translate-y-1">
                                                {/* Concentric radar rings (match other call screens) */}
                                                <div className="absolute inset-0 border border-indigo-500/30 rounded-full radar-ring-1" />
                                                <div className="absolute inset-0 border border-indigo-500/30 rounded-full radar-ring-2" />
                                                <div className="absolute inset-0 border border-indigo-500/30 rounded-full radar-ring-3" />
                                                <div className="relative w-28 h-28 rounded-full bg-gradient-to-br from-indigo-600/40 to-purple-600/40 p-1 shadow-lg shadow-indigo-500/20">
                                                    <div className="w-full h-full rounded-full bg-[#020205] flex items-center justify-center text-4xl font-light tracking-wide text-white uppercase">
                                                        {(participant.name || participant.identity).charAt(0)}
                                                    </div>
                                                </div>
                                            </div>
                                            <p className="text-white/90 font-light tracking-wide">{participant.name || participant.identity}</p>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )} )()}
            </div>

            {/* Floating Local Video - show whenever camera is enabled and no screen share is active */}
            {!isVideoOff && screenShareTracks.length === 0 && <FloatingLocalVideo />}

            {/* Floating Control Capsule */}
            <div className="fixed bottom-8 md:bottom-12 left-1/2 -translate-x-1/2 w-fit px-6 py-3 rounded-full bg-white/[0.03] border border-white/10 backdrop-blur-3xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex items-center gap-4 md:gap-8 z-[100]" style={{ bottom: 'max(2rem, calc(env(safe-area-inset-bottom, 0px) + 1.5rem))' }}>
                {/* Mute Button */}
                <button 
                    onClick={toggleMute} 
                    className={`w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center bg-white/5 border border-white/10 transition-all hover:scale-110 hover:shadow-[0_0_20px_rgba(255,255,255,0.1)] ${isMuted ? 'bg-red-500/20 border-red-500/30' : ''}`}
                >
                    {isMuted ? (
                        <MicOff size={18} className="text-red-400" />
                    ) : (
                        <Mic size={18} className="text-white/90" />
                    )}
                </button>

                {/* Video Toggle Button - Always available so users can enable video mid-call */}
                <button 
                    onClick={toggleVideo} 
                    className={`w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center bg-white/5 border border-white/10 transition-all hover:scale-110 hover:shadow-[0_0_20px_rgba(255,255,255,0.1)] ${isVideoOff ? 'bg-red-500/20 border-red-500/30' : ''}`}
                >
                    {isVideoOff ? (
                        <VideoOff size={18} className="text-red-400" />
                    ) : (
                        <Video size={18} className="text-white/90" />
                    )}
                </button>

                {/* Screen Share Button */}
                <button 
                    onClick={toggleScreenShare} 
                    className={`w-12 h-12 rounded-full flex items-center justify-center transition-all hover:scale-110 ${
                        isScreenShareEnabled 
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-[0_0_20px_rgba(16,185,129,0.3)] animate-pulse' 
                            : 'bg-white/5 text-white/90 border border-white/10 hover:bg-white/10'
                    }`}
                >
                    {isScreenShareEnabled ? (
                        <XSquare size={18} />
                    ) : (
                        <MonitorUp size={18} />
                    )}
                </button>

                {/* End Call Button */}
                <button 
                    onClick={handleHangup}
                    className="w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center bg-red-500 shadow-[0_0_30px_rgba(239,68,68,0.3)] text-white transition-all hover:scale-110"
                >
                    <PhoneOff size={18} />
                </button>
            </div>
        </div>
    );
};

const CallOverlay: React.FC<CallOverlayProps> = ({ 
    token, 
    serverUrl, 
    roomName, 
    roomType,
    callType,
    onDisconnect,
    userPreferredLanguage = 'en',
    userId,
    onParticipantJoined,
    onCallAccepted,
    hidden = false
}) => {
  // Setup E2EE for Video with Quality Settings
  const roomOptions = useMemo<RoomOptions>(() => {
     const keyProvider = new ExternalE2EEKeyProvider();
     keyProvider.setKey("translatr-secure-salt-v1");
     
     return {
         e2ee: {
             keyProvider,
             worker: new Worker(new URL('livekit-client/e2ee-worker', import.meta.url))
         },
         // Adaptive streaming for better quality
         adaptiveStream: true,
         dynacast: true,
         
         // Video capture defaults - 720p
         videoCaptureDefaults: {
             resolution: {
                 width: 1280,
                 height: 720,
                 frameRate: 30,
             },
             facingMode: 'user',
         },
         
         // Publishing defaults - let LiveKit handle simulcast automatically
         publishDefaults: {
             // Enable simulcast (LiveKit will create layers automatically)
             simulcast: true,
             // Audio quality settings
             audioBitrate: 64_000, // 64 Kbps for clear audio
             dtx: true, // Discontinuous Transmission - saves bandwidth when silent
             red: true, // Redundant encoding for audio packet loss protection
             videoCodec: 'vp8', // VP8 is well-supported and efficient
         },
     };
  }, []);

  // When hidden, the overlay is still mounted and connected to LiveKit
  // but is invisible. This is used for callers waiting for answer -
  // they need to be in the room to detect when someone joins.
  // We use a minimal listener component that only watches for participants
  // without trying to publish any tracks.
  if (typeof document === 'undefined') return null;
  
  if (hidden) {
    return createPortal(
      <div className="sr-only" aria-hidden="true">
        <LiveKitRoom
            token={token}
            serverUrl={serverUrl}
            connect={true}
            video={false}
            audio={false}
            onDisconnected={() => onDisconnect(false)}
            options={{
              // Minimal options for hidden listener - no track publishing
              adaptiveStream: false,
              dynacast: false,
            }}
            data-lk-theme="default"
        >
            <HiddenCallListener 
              userId={userId} 
              onParticipantJoined={onParticipantJoined} 
              onCallAccepted={onCallAccepted} 
            />
        </LiveKitRoom>
      </div>,
      document.body
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-[#020205] text-white animate-in fade-in duration-300 h-dvh">
        {/* Aurora Cosmos Background Layer */}
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
            {/* Top-Left Nebula Blob */}
            <div className="absolute top-[-10%] left-[-10%] w-[70%] h-[70%] bg-indigo-600/10 blur-[120px] rounded-full animate-nebula" />
            {/* Bottom-Right Nebula Blob */}
            <div className="absolute bottom-[-10%] right-[-10%] w-[70%] h-[70%] bg-purple-600/10 blur-[120px] rounded-full animate-nebula" style={{ animationDelay: '1s' }} />
        </div>
        
        <LiveKitRoom
            token={token}
            serverUrl={serverUrl}
            connect={true}
            video={callType === 'video'} // Only enable video for video calls
            audio={true}
            onDisconnected={() => onDisconnect(false)} // Default disconnect fallback
            options={roomOptions}
            data-lk-theme="default"
            className="h-full w-full relative z-10"
        >
            <CallContent roomName={roomName} roomType={roomType} callType={callType} onDisconnect={onDisconnect} userId={userId} onParticipantJoined={onParticipantJoined} onCallAccepted={onCallAccepted} />
        </LiveKitRoom>
    </div>,
    document.body
  );
};

export default CallOverlay;
