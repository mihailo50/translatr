'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { LiveKitRoom, useTracks, VideoTrack, useLocalParticipant, useRemoteParticipants, useRoomContext } from '@livekit/components-react';
import { Track, ExternalE2EEKeyProvider, RoomOptions, RoomEvent } from 'livekit-client';
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
}

const FloatingLocalVideo = () => {
    const { localParticipant } = useLocalParticipant();
    const tracks = useTracks([Track.Source.Camera]);
    const localTrack = tracks.find(t => t.participant.identity === localParticipant.identity);
    
    if (!localTrack) return null;

    return (
        <div className="absolute top-6 right-6 w-32 md:w-48 aspect-video rounded-2xl border border-white/20 shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden z-20 bg-black/40">
            <VideoTrack trackRef={localTrack} className="w-full h-full object-cover mirror-mode" />
            <div className="absolute bottom-1 left-2 text-[10px] font-light tracking-wide text-white/90 z-20">You</div>
        </div>
    );
};

const CallContent = ({ roomName, roomType, callType, onDisconnect, userId }: { roomName: string, roomType: 'direct' | 'group', callType: 'audio' | 'video', onDisconnect: (s: boolean) => void, userId?: string }) => {
    const { localParticipant } = useLocalParticipant();
    const remoteParticipants = useRemoteParticipants();
    const tracks = useTracks(callType === 'video' ? [Track.Source.Camera] : []);
    
    // Filter remote tracks
    const remoteTracks = tracks.filter(t => t.participant.identity !== localParticipant.identity);

    const [isMuted, setIsMuted] = useState(false);
    const [isVideoOff, setIsVideoOff] = useState(callType === 'audio'); // Video off by default for audio calls
    const room = useRoomContext();

    // Listen for room disconnection events and data channel messages
    useEffect(() => {
        if (!room) return;
        
        const handleDisconnected = (reason?: any) => {
            console.log('CallOverlay: Room disconnected', reason);
            onDisconnect(false);
        };
        
        const handleData = (payload: Uint8Array) => {
            const decoder = new TextDecoder();
            try {
                const data = JSON.parse(decoder.decode(payload));
                if (data.type === 'call_ended') {
                    console.log('CallOverlay: Received call_ended signal');
                    onDisconnect(false);
                }
            } catch (e) {
                console.error('CallOverlay: Error parsing data:', e);
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
                console.log('CallOverlay: Call end signal sent via call room');
            } catch (error) {
                console.warn('CallOverlay: Failed to send call end signal:', error);
            }
        }
        // Disconnect (this will clear state in ChatRoom)
        onDisconnect(roomType === 'direct');
    };

    return (
        <div className="relative h-full w-full flex flex-col bg-[#020205]">
            {/* Spatial Nebula Background with Slow Pulse Animation */}
            <div className="absolute inset-0 z-0 overflow-hidden">
                {/* Custom slow pulse animation */}
                <style dangerouslySetInnerHTML={{ __html: `
                    @keyframes slow-pulse {
                        0%, 100% {
                            opacity: 0.6;
                            transform: scale(1);
                        }
                        50% {
                            opacity: 1;
                            transform: scale(1.1);
                        }
                    }
                    .slow-pulse {
                        animation: slow-pulse 10s ease-in-out infinite;
                    }
                `}} />
                {/* Top-Left Nebula Blob */}
                <div className="absolute top-0 left-0 bg-indigo-600/15 blur-[100px] rounded-full w-[600px] h-[600px] slow-pulse" 
                     style={{ background: 'radial-gradient(circle, rgba(79, 70, 229, 0.15) 0%, transparent 70%)' }} />
                {/* Bottom-Right Nebula Blob */}
                <div className="absolute bottom-0 right-0 bg-purple-600/15 blur-[100px] rounded-full w-[600px] h-[600px] slow-pulse" 
                     style={{ 
                         background: 'radial-gradient(circle, rgba(147, 51, 234, 0.15) 0%, transparent 70%)',
                         animationDelay: '2s'
                     }} />
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
                {callType === 'audio' ? (
                    // Audio call UI - show participant avatars/names
                    <div className="flex flex-col items-center justify-center text-white/90 font-light tracking-wide">
                        {remoteParticipants.length === 0 ? (
                            <>
                                <div className="w-24 h-24 rounded-full bg-white/5 flex items-center justify-center mb-4">
                                    <span className="text-4xl">...</span>
                                </div>
                                <p className="text-white/60">Waiting for others to join...</p>
                            </>
                        ) : (
                            <div className="flex flex-col items-center gap-4">
                                {remoteParticipants.map(participant => (
                                    <div key={participant.identity} className="flex flex-col items-center gap-2">
                                        <div className="w-32 h-32 rounded-full bg-gradient-to-br from-indigo-600/40 to-purple-600/40 p-1 shadow-lg shadow-indigo-500/20">
                                            <div className="w-full h-full rounded-full bg-[#020205] flex items-center justify-center text-4xl font-light tracking-wide text-white uppercase">
                                                {(participant.name || participant.identity).charAt(0)}
                                            </div>
                                        </div>
                                        <p className="text-white/90 font-light tracking-wide">{participant.name || participant.identity}</p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    // Video call UI
                    remoteTracks.length === 0 ? (
                        <div className="flex flex-col items-center justify-center text-white/60 font-light tracking-wide animate-pulse">
                            <div className="w-24 h-24 rounded-full bg-white/5 flex items-center justify-center mb-4">
                                <span className="text-4xl">...</span>
                            </div>
                            <p>Waiting for others to join...</p>
                        </div>
                    ) : (
                        <div className={`grid gap-4 w-full h-full ${remoteTracks.length === 1 ? 'grid-cols-1' : 'grid-cols-2 md:grid-cols-3'}`}>
                            {remoteTracks.map(track => (
                                <div key={track.participant.identity} className="relative rounded-[2rem] border border-white/10 shadow-2xl overflow-hidden bg-black/40">
                                    <VideoTrack trackRef={track} className="w-full h-full object-cover" />
                                    <div className="absolute bottom-3 left-3 bg-black/60 px-2 py-1 rounded text-xs text-white/90 font-light tracking-wide">
                                        {track.participant.name || track.participant.identity}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )
                )}
            </div>

            {/* Floating Local Video - Only for video calls */}
            {callType === 'video' && !isVideoOff && <FloatingLocalVideo />}

            {/* Floating Control Capsule */}
            <div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-[#050510]/80 backdrop-blur-3xl border border-white/10 rounded-full px-8 py-4 shadow-[0_0_40px_rgba(0,0,0,0.6)] flex items-center gap-6 z-50">
                {/* Mute Button */}
                <button 
                    onClick={toggleMute} 
                    className={`w-12 h-12 rounded-full flex items-center justify-center bg-white/5 border border-white/10 transition-all hover:scale-110 ${isMuted ? 'bg-red-500/20 border-red-500/30' : ''}`}
                >
                    {isMuted ? (
                        <MicOff size={20} className="text-red-400" />
                    ) : (
                        <Mic size={20} className="text-white/90" />
                    )}
                </button>

                {/* Video Toggle Button - Only for video calls */}
                {callType === 'video' && (
                    <button 
                        onClick={toggleVideo} 
                        className={`w-12 h-12 rounded-full flex items-center justify-center bg-white/5 border border-white/10 transition-all hover:scale-110 ${isVideoOff ? 'bg-red-500/20 border-red-500/30' : ''}`}
                    >
                        {isVideoOff ? (
                            <VideoOff size={20} className="text-red-400" />
                        ) : (
                            <Video size={20} className="text-white/90" />
                        )}
                    </button>
                )}

                {/* End Call Button */}
                <button 
                    onClick={handleHangup}
                    className="w-12 h-12 rounded-full flex items-center justify-center bg-red-500/80 hover:bg-red-500 text-white transition-all hover:scale-110"
                >
                    <PhoneOff size={20} />
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
    userId
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
    <div className="fixed inset-0 z-[100] bg-[#020205] text-white animate-in fade-in duration-300">
        <LiveKitRoom
            token={token}
            serverUrl={serverUrl}
            connect={true}
            video={callType === 'video'} // Only enable video for video calls
            audio={true}
            onDisconnected={() => onDisconnect(false)} // Default disconnect fallback
            options={roomOptions}
            data-lk-theme="default"
            className="h-full w-full"
        >
            <CallContent roomName={roomName} roomType={roomType} callType={callType} onDisconnect={onDisconnect} userId={userId} />
        </LiveKitRoom>
    </div>
  );
};

export default CallOverlay;
