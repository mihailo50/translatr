import React, { useState, useEffect } from 'react';
import { Phone, Video, Mic, MicOff, VideoOff, PhoneOff, MessageSquare } from 'lucide-react';
import { Room, LocalTrack, Track } from 'livekit-client';

interface LiveKitCallModalProps {
  isOpen: boolean;
  callerName: string;
  callType: 'audio' | 'video';
  onAnswer: () => void;
  onDecline: () => void;
  onDeclineWithMessage?: () => void;
  activeRoom?: Room | null; // Pass the LiveKit room if we are using the same room
  isCallActive: boolean;
  isSender?: boolean; // True when user is the one calling (sender view)
}

const LiveKitCallModal: React.FC<LiveKitCallModalProps> = ({
  isOpen,
  callerName,
  callType,
  onAnswer,
  onDecline,
  onDeclineWithMessage,
  activeRoom,
  isCallActive,
  isSender = false
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
    <>
      {/* Custom Animations */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes caller-pulse {
          0% {
            transform: scale(1);
            box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.6);
          }
          70% {
            transform: scale(1.02);
            box-shadow: 0 0 0 18px rgba(99, 102, 241, 0);
          }
          100% {
            transform: scale(1);
            box-shadow: 0 0 0 0 rgba(99, 102, 241, 0);
          }
        }
        @keyframes glow {
          0%, 100% { opacity: 0.35; filter: blur(80px); }
          50% { opacity: 0.6; filter: blur(90px); }
        }
        .caller-pulse {
          animation: caller-pulse 1.8s ease-out infinite;
        }
        .caller-glow {
          animation: glow 3s ease-in-out infinite;
        }
        @keyframes radar-ripple {
          0% {
            transform: scale(1);
            opacity: 1;
          }
          100% {
            transform: scale(2.5);
            opacity: 0;
          }
        }
        @keyframes radar {
          0% {
            transform: scale(1);
            opacity: 0.5;
          }
          100% {
            transform: scale(1.8);
            opacity: 0;
          }
        }
        .radar-ripple-1 {
          animation: radar-ripple 2s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }
        .radar-ripple-2 {
          animation: radar-ripple 2s cubic-bezier(0.4, 0, 0.2, 1) infinite 0.5s;
        }
        .radar-ring-1 {
          animation: radar 2s ease-out infinite;
        }
        .radar-ring-2 {
          animation: radar 2s ease-out infinite 0.4s;
        }
        .radar-ring-3 {
          animation: radar 2s ease-out infinite 0.8s;
        }
      `}} />

      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#020205]/90 backdrop-blur-md animate-in fade-in duration-300">
        {/* Content Container - No Border */}
        <div className="w-full max-w-sm flex flex-col items-center relative">
          
          {/* Ambient Background Glow */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-indigo-500/20 rounded-full blur-[80px] pointer-events-none caller-glow" />

          {/* User Info */}
          <div className="text-center z-10 relative">
            {/* Avatar with Radar Ripple Effect */}
            <div className="relative w-24 h-24 mx-auto mb-4">
              {isSender ? (
                <>
                  {/* Three Concentric Radar Rings for Sender View */}
                  <div className="absolute inset-0 border border-indigo-500/30 rounded-full radar-ring-1" />
                  <div className="absolute inset-0 border border-indigo-500/30 rounded-full radar-ring-2" />
                  <div className="absolute inset-0 border border-indigo-500/30 rounded-full radar-ring-3" />
                </>
              ) : (
                <>
                  {/* Two Radar Ripples for Receiver View */}
                  <div className="absolute inset-0 border border-indigo-500/30 rounded-full radar-ripple-1" />
                  <div className="absolute inset-0 border border-indigo-500/30 rounded-full radar-ripple-2" />
                </>
              )}
              {/* Avatar Circle */}
              <div className={`relative w-24 h-24 rounded-full bg-gradient-to-br from-indigo-600/40 to-purple-600/40 p-1 shadow-lg shadow-indigo-500/30 ${isSender ? 'caller-pulse' : ''}`}>
                <div className="w-full h-full rounded-full bg-[#020205] flex items-center justify-center text-3xl font-bold text-white uppercase">
                  {callerName.charAt(0)}
                </div>
              </div>
            </div>

            {/* Name */}
            <h2 className="text-xl font-bold text-white mt-4">{callerName}</h2>
            
            {/* Status */}
            {isSender ? (
              <div className="mt-1">
                <p className="text-xs uppercase tracking-[0.3em] text-indigo-300/90 font-bold">
                  CALLING<span className="inline-block animate-pulse">...</span>
                </p>
              </div>
            ) : (
              <p className="text-xs uppercase tracking-[0.2em] text-indigo-400 mt-1 font-medium">
                {isCallActive ? 'CONNECTED' : `INCOMING ${callType.toUpperCase()} CALL`}
              </p>
            )}
          </div>

          {/* Controls */}
          {isSender ? (
            /* Sender View - Only End Button at Bottom */
            <div className="w-full mt-8 flex justify-center">
              <button 
                onClick={onDecline}
                className="w-12 h-12 rounded-full bg-red-500/80 hover:bg-red-500 text-white transition-all flex items-center justify-center hover:scale-110"
              >
                <PhoneOff size={20} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-4 z-10 w-full justify-center flex-wrap mt-8">
              {!isCallActive ? (
                <>
                  {/* Decline */}
                  <button 
                    onClick={onDecline}
                    className="w-16 h-16 rounded-full bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500 hover:text-white transition-all flex items-center justify-center hover:scale-110"
                  >
                    <PhoneOff size={24} />
                  </button>

                  {/* Decline with Message */}
                  {onDeclineWithMessage && (
                    <button 
                      onClick={onDeclineWithMessage}
                      className="w-16 h-16 rounded-full bg-white/5 text-white/70 border border-white/10 hover:bg-white/10 hover:text-white transition-all flex items-center justify-center hover:scale-110"
                    >
                      <MessageSquare size={24} />
                    </button>
                  )}

                  {/* Answer */}
                  <button 
                    onClick={onAnswer}
                    className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500 hover:text-white transition-all flex items-center justify-center hover:scale-110"
                  >
                    {callType === 'video' ? <Video size={24} /> : <Phone size={24} />}
                  </button>
                </>
              ) : (
                <>
                  {/* Active Call Controls */}
                  <button 
                    onClick={toggleMute}
                    className={`w-12 h-12 rounded-full transition-all flex items-center justify-center hover:scale-110 ${isMuted ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-white/5 text-white/90 border border-white/10 hover:bg-white/10'}`}
                  >
                    {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
                  </button>

                  <button 
                    onClick={handleHangup}
                    className="w-12 h-12 rounded-full bg-red-500/80 hover:bg-red-500 text-white shadow-[0_0_20px_rgba(239,68,68,0.4)] transition-all flex items-center justify-center hover:scale-110"
                  >
                    <PhoneOff size={20} />
                  </button>

                  <button 
                    onClick={toggleVideo}
                    className={`w-12 h-12 rounded-full transition-all flex items-center justify-center hover:scale-110 ${!isVideoEnabled ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-white/5 text-white/90 border border-white/10 hover:bg-white/10'}`}
                  >
                    {isVideoEnabled ? <Video size={20} /> : <VideoOff size={20} />}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default LiveKitCallModal;
