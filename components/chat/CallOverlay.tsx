'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { LiveKitRoom, useTracks, VideoTrack, useLocalParticipant, useRemoteParticipants, useRoomContext } from '@livekit/components-react';
import { Track, ExternalE2EEKeyProvider, RoomOptions, RoomEvent } from 'livekit-client';
import { X, Languages, Captions, ShieldCheck, Mic, MicOff, Video, VideoOff, GripHorizontal } from 'lucide-react';
import { toast } from 'sonner';

interface CallOverlayProps {
  token: string;
  serverUrl: string;
  roomName: string;
  roomType: 'direct' | 'group';
  onDisconnect: (shouldSignalTerminate: boolean) => void;
  userPreferredLanguage?: string;
}

const DraggableLocalVideo = () => {
    const { localParticipant } = useLocalParticipant();
    const tracks = useTracks([Track.Source.Camera]);
    const localTrack = tracks.find(t => t.participant.identity === localParticipant.identity);
    
    const [position, setPosition] = useState({ x: 20, y: 80 }); // Initial position (top-rightish relative to container)
    const [isDragging, setIsDragging] = useState(false);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const ref = useRef<HTMLDivElement>(null);

    const handleMouseDown = (e: React.MouseEvent) => {
        if (ref.current) {
            setIsDragging(true);
            const rect = ref.current.getBoundingClientRect();
            setDragOffset({
                x: e.clientX - rect.left,
                y: e.clientY - rect.top
            });
        }
    };

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (isDragging) {
                // Calculate new position relative to window, or a container. 
                // Using fixed positioning for simplicity
                const newX = window.innerWidth - e.clientX - (ref.current?.offsetWidth || 0) + dragOffset.x; // Right aligned logic or Left aligned?
                // Let's stick to left/top fixed positioning
                const x = e.clientX - dragOffset.x;
                const y = e.clientY - dragOffset.y;
                setPosition({ x, y });
            }
        };

        const handleMouseUp = () => {
            setIsDragging(false);
        };

        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, dragOffset]);

    if (!localTrack) return null;

    return (
        <div 
            ref={ref}
            style={{ 
                position: 'fixed', 
                left: position.x, 
                top: position.y,
                zIndex: 60 
            }}
            className="w-48 aspect-video rounded-xl overflow-hidden shadow-2xl border border-white/20 bg-black group"
        >
            <div 
                onMouseDown={handleMouseDown}
                className="absolute inset-0 z-10 opacity-0 group-hover:opacity-100 bg-black/40 flex items-center justify-center cursor-move transition-opacity"
            >
                <GripHorizontal className="text-white" />
            </div>
            <VideoTrack trackRef={localTrack} className="w-full h-full object-cover mirror-mode" />
            <div className="absolute bottom-1 left-2 text-[10px] font-bold text-white/70 z-20">You</div>
        </div>
    );
};

const CallContent = ({ roomName, roomType, onDisconnect }: { roomName: string, roomType: 'direct' | 'group', onDisconnect: (s: boolean) => void }) => {
    const { localParticipant } = useLocalParticipant();
    const remoteParticipants = useRemoteParticipants();
    const tracks = useTracks([Track.Source.Camera]);
    
    // Filter remote tracks
    const remoteTracks = tracks.filter(t => t.participant.identity !== localParticipant.identity);

    const [showCaptions, setShowCaptions] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [isVideoOff, setIsVideoOff] = useState(false);
    const room = useRoomContext();

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

    const handleHangup = () => {
        // If direct, we signal termination. If group, we just leave (false).
        onDisconnect(roomType === 'direct');
    };

    return (
        <div className="relative h-full flex flex-col">
            {/* Header */}
            <div className="h-16 flex items-center justify-between px-6 border-b border-white/10 bg-black/40 z-50">
                <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-white font-semibold tracking-wide">{roomName}</span>
                    <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-green-500/10 border border-green-500/20">
                        <ShieldCheck size={10} className="text-green-400" />
                        <span className="text-[10px] text-green-400 font-bold uppercase tracking-wider">E2EE</span>
                    </div>
                </div>
                
                <div className="flex items-center gap-4">
                    <button 
                        onClick={() => setShowCaptions(!showCaptions)}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${showCaptions ? 'bg-aurora-indigo text-white' : 'bg-white/10 text-white/70 hover:bg-white/20'}`}
                    >
                        <Captions size={16} />
                        <span className="hidden sm:inline">{showCaptions ? 'Captions On' : 'Captions Off'}</span>
                    </button>
                    <button 
                        onClick={handleHangup}
                        className="px-4 py-2 rounded-full bg-red-500 hover:bg-red-600 text-white font-bold transition-all shadow-lg shadow-red-500/20"
                    >
                        End Call
                    </button>
                </div>
            </div>

            {/* Main Stage (Remote Participants) */}
            <div className="flex-1 bg-black relative p-4 flex items-center justify-center">
                {remoteTracks.length === 0 ? (
                    <div className="flex flex-col items-center justify-center text-white/30 animate-pulse">
                        <div className="w-24 h-24 rounded-full bg-white/5 flex items-center justify-center mb-4">
                            <span className="text-4xl">...</span>
                        </div>
                        <p>Waiting for others to join...</p>
                    </div>
                ) : (
                    <div className={`grid gap-4 w-full h-full ${remoteTracks.length === 1 ? 'grid-cols-1' : 'grid-cols-2 md:grid-cols-3'}`}>
                        {remoteTracks.map(track => (
                            <div key={track.participant.identity} className="relative rounded-2xl overflow-hidden bg-slate-900 border border-white/10">
                                <VideoTrack trackRef={track} className="w-full h-full object-cover" />
                                <div className="absolute bottom-3 left-3 bg-black/60 px-2 py-1 rounded text-xs text-white font-medium">
                                    {track.participant.name || track.participant.identity}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Draggable Local View */}
            {!isVideoOff && <DraggableLocalVideo />}

            {/* Bottom Controls */}
            <div className="h-20 bg-black/60 backdrop-blur-md flex items-center justify-center gap-6 border-t border-white/10 z-50">
                 <button onClick={toggleMute} className={`p-4 rounded-full transition-all ${isMuted ? 'bg-red-500/20 text-red-400' : 'bg-white/10 text-white hover:bg-white/20'}`}>
                     {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
                 </button>
                 <button onClick={toggleVideo} className={`p-4 rounded-full transition-all ${isVideoOff ? 'bg-red-500/20 text-red-400' : 'bg-white/10 text-white hover:bg-white/20'}`}>
                     {isVideoOff ? <VideoOff size={24} /> : <Video size={24} />}
                 </button>
            </div>
        </div>
    );
}

const CallOverlay: React.FC<CallOverlayProps> = ({ 
    token, 
    serverUrl, 
    roomName, 
    roomType,
    onDisconnect,
    userPreferredLanguage = 'en'
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
    <div className="fixed inset-0 z-[100] bg-black text-white animate-in fade-in duration-300">
        <LiveKitRoom
            token={token}
            serverUrl={serverUrl}
            connect={true}
            video={true}
            audio={true}
            onDisconnected={() => onDisconnect(false)} // Default disconnect fallback
            options={roomOptions}
            data-lk-theme="default"
            className="h-full w-full"
        >
            <CallContent roomName={roomName} roomType={roomType} onDisconnect={onDisconnect} />
        </LiveKitRoom>
    </div>
  );
};

export default CallOverlay;