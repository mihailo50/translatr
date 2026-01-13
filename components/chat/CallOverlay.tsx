'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { LiveKitRoom, useTracks, VideoTrack, useLocalParticipant, useRemoteParticipants, useRoomContext } from '@livekit/components-react';
import { Track, ExternalE2EEKeyProvider, RoomOptions, RoomEvent, RemoteParticipant } from 'livekit-client';
import { ShieldCheck, Mic, MicOff, Video, VideoOff, PhoneOff } from 'lucide-react';

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
}

const FloatingLocalVideo = () => {
    const { localParticipant } = useLocalParticipant();
    const tracks = useTracks([Track.Source.Camera]);
    const localTrack = tracks.find(t => t.participant.identity === localParticipant.identity);
    
    if (!localTrack) return null;

    return (
        <div className="fixed top-12 right-4 md:top-16 md:right-6 w-32 md:w-48 aspect-video rounded-2xl border border-white/20 shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden z-50 bg-black/40 transition-all" style={{ top: 'max(3rem, env(safe-area-inset-top, 1rem))' }}>
            <VideoTrack trackRef={localTrack} className="w-full h-full object-cover mirror-mode" />
            <div className="absolute bottom-1 left-2 text-[10px] font-light tracking-wide text-white/90 z-20">You</div>
        </div>
    );
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
    
    // Filter remote tracks
    const remoteVideoTracks = videoTracks.filter(t => t.participant.identity !== localParticipant.identity);
    const remoteAudioTracks = audioTracks.filter(t => t.participant.identity !== localParticipant.identity);

    const [isMuted, setIsMuted] = useState(false);
    const [isVideoOff, setIsVideoOff] = useState(callType === 'audio'); // Video off by default for audio calls
    const [callDuration, setCallDuration] = useState(0); // Call duration in seconds
    const callStartTimeRef = useRef<number | null>(null);

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
            {/* Inline styles for radar/pulse animations to match modal visuals */}
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
            `}} />
            {/* Floating Status Bar */}
            <div className="fixed top-8 left-1/2 -translate-x-1/2 flex items-center gap-3 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 backdrop-blur-md z-40">
                <ShieldCheck size={12} className="text-emerald-400" />
                <span className="text-[10px] tracking-[0.2em] font-bold text-emerald-400/80 uppercase">SECURE E2EE</span>
                <span className="text-white/50 text-xs">{formatCallDuration(callDuration)}</span>
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
            <div className="relative flex-1 p-4 h-full flex items-center justify-center z-10">
                {(() => {
                    const hasRemoteVideo = remoteVideoTracks.length > 0;
                    if (hasRemoteVideo) {
                        // Video call UI (even if started as audio, show when remote video is present)
                        return (
                            <div className={`grid gap-4 w-full h-full ${remoteVideoTracks.length === 1 ? 'grid-cols-1' : 'grid-cols-2 md:grid-cols-3'}`}>
                                {remoteVideoTracks.map(track => (
                                    <div key={track.participant.identity} className="relative rounded-[2rem] border border-white/10 shadow-2xl overflow-hidden bg-black/40">
                                        <VideoTrack trackRef={track} className="w-full h-full object-cover" />
                                        <div className="absolute bottom-3 left-3 bg-black/60 px-2 py-1 rounded text-xs text-white/90 font-light tracking-wide">
                                            {track.participant.name || track.participant.identity}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        );
                    }
                    // Audio-first UI
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
                            <div className="flex flex-col items-center gap-4">
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

            {/* Floating Local Video - show whenever camera is enabled */}
            {!isVideoOff && <FloatingLocalVideo />}

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
    onCallAccepted
}) => {
  // Setup E2EE for Video
  const roomOptions = useMemo<RoomOptions>(() => {
     const keyProvider = new ExternalE2EEKeyProvider();
     keyProvider.setKey("translatr-secure-salt-v1");
     
     return {
         e2ee: {
             keyProvider,
             worker: new Worker(new URL('livekit-client/e2ee-worker', import.meta.url))
         }
     };
  }, []);

  return (
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
    </div>
  );
};

export default CallOverlay;
