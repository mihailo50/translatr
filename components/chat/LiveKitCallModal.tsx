import React, { useState, useEffect } from 'react';
import { Phone, Video, Mic, MicOff, VideoOff, PhoneOff } from 'lucide-react';
import { Room, LocalTrack, Track } from 'livekit-client';

interface LiveKitCallModalProps {
  isOpen: boolean;
  callerName: string;
  callType: 'audio' | 'video';
  onAnswer: () => void;
  onDecline: () => void;
  activeRoom?: Room | null; // Pass the LiveKit room if we are using the same room
  isCallActive: boolean;
}

const LiveKitCallModal: React.FC<LiveKitCallModalProps> = ({
  isOpen,
  callerName,
  callType,
  onAnswer,
  onDecline,
  activeRoom,
  isCallActive
}) => {
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(callType === 'video');

  // Handle track toggling when call is active
  const toggleMute = async () => {
    if (!activeRoom?.localParticipant) return;
    const newState = !isMuted;
    await activeRoom.localParticipant.setMicrophoneEnabled(!newState);
    setIsMuted(newState);
  };

  const toggleVideo = async () => {
    if (!activeRoom?.localParticipant) return;
    const newState = !isVideoEnabled;
    await activeRoom.localParticipant.setCameraEnabled(newState);
    setIsVideoEnabled(newState);
  };

  const handleHangup = () => {
      // Logic to stop tracks
      if (activeRoom?.localParticipant) {
          activeRoom.localParticipant.setMicrophoneEnabled(false);
          activeRoom.localParticipant.setCameraEnabled(false);
      }
      onDecline();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="glass-strong w-full max-w-md p-8 rounded-3xl border border-white/10 shadow-2xl relative overflow-hidden flex flex-col items-center gap-8">
        
        {/* Ambient Background Glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-aurora-indigo/20 rounded-full blur-[80px] pointer-events-none" />

        {/* User Info */}
        <div className="text-center z-10">
           <div className="w-24 h-24 mx-auto mb-4 rounded-full bg-gradient-to-br from-aurora-indigo to-aurora-pink p-1 shadow-lg shadow-aurora-indigo/30 animate-pulse">
               <div className="w-full h-full rounded-full bg-slate-900 flex items-center justify-center text-3xl font-bold text-white uppercase">
                   {callerName.charAt(0)}
               </div>
           </div>
           <h2 className="text-2xl font-bold text-white mb-1">{callerName}</h2>
           <p className="text-white/50">
               {isCallActive ? 'Connected' : `Incoming ${callType} call...`}
           </p>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-6 z-10 w-full justify-center">
            {!isCallActive ? (
                <>
                    {/* Decline */}
                    <button 
                        onClick={onDecline}
                        className="flex flex-col items-center gap-2 group"
                    >
                        <div className="w-16 h-16 rounded-full bg-white/5 border border-red-500/30 text-red-400 group-hover:bg-red-500 group-hover:text-white transition-all flex items-center justify-center shadow-lg">
                            <PhoneOff size={28} />
                        </div>
                        <span className="text-xs text-white/40 group-hover:text-white/80 transition-colors">Decline</span>
                    </button>

                    {/* Answer */}
                    <button 
                        onClick={onAnswer}
                        className="flex flex-col items-center gap-2 group"
                    >
                        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-green-400 to-emerald-600 text-white shadow-[0_0_20px_rgba(34,197,94,0.4)] hover:shadow-[0_0_30px_rgba(34,197,94,0.6)] hover:scale-105 transition-all flex items-center justify-center">
                            {callType === 'video' ? <Video size={28} /> : <Phone size={28} />}
                        </div>
                        <span className="text-xs text-white/40 group-hover:text-white/80 transition-colors">Answer</span>
                    </button>
                </>
            ) : (
                <>
                    {/* Active Call Controls */}
                    <button 
                        onClick={toggleMute}
                        className={`p-4 rounded-full transition-all ${isMuted ? 'bg-white text-slate-900' : 'bg-white/10 text-white hover:bg-white/20'}`}
                    >
                        {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
                    </button>

                    <button 
                        onClick={handleHangup}
                        className="p-5 rounded-full bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/30 hover:scale-105 transition-all"
                    >
                        <PhoneOff size={32} />
                    </button>

                    <button 
                        onClick={toggleVideo}
                        className={`p-4 rounded-full transition-all ${!isVideoEnabled ? 'bg-white text-slate-900' : 'bg-white/10 text-white hover:bg-white/20'}`}
                    >
                        {isVideoEnabled ? <Video size={24} /> : <VideoOff size={24} />}
                    </button>
                </>
            )}
        </div>
      </div>
    </div>
  );
};

export default LiveKitCallModal;