import React from 'react';
import { Phone, Video, PhoneOff, MessageSquare, X } from 'lucide-react';
import { createPortal } from 'react-dom';

interface CallNotificationBannerProps {
  callerName: string;
  callType: 'audio' | 'video';
  onAccept: () => void;
  onDecline: () => void;
  onDeclineWithMessage: () => void;
  onDismiss?: () => void;
}

const CallNotificationBanner: React.FC<CallNotificationBannerProps> = ({
  callerName,
  callType,
  onAccept,
  onDecline,
  onDeclineWithMessage,
  onDismiss
}) => {

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] w-full max-w-md px-4 animate-in slide-in-from-top-4 fade-in duration-300">
      <div 
        className="relative rounded-2xl border border-indigo-500/30 overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.8)]"
        style={{
          background: 'rgba(5, 5, 15, 0.98)',
          backdropFilter: 'blur(25px)',
          WebkitBackdropFilter: 'blur(25px)',
        }}
      >
        {/* Subtle Internal Top-Light Gradient */}
        <div 
          className="absolute inset-0 pointer-events-none z-0"
          style={{
            background: 'linear-gradient(180deg, rgba(255,255,255,0.05) 0%, transparent 100%)',
          }}
        />
        
        {/* Ambient Glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-aurora-indigo/20 rounded-full blur-[80px] pointer-events-none z-0" />
        
        {/* Close button */}
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="absolute top-3 right-3 p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors z-10"
          >
            <X size={16} />
          </button>
        )}

        <div className="relative p-5 z-10">
          {/* Header */}
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-aurora-indigo to-aurora-pink p-0.5 shadow-lg shadow-aurora-indigo/30">
              <div className="w-full h-full rounded-full bg-slate-900 flex items-center justify-center text-lg font-bold text-white uppercase">
                {callerName.charAt(0)}
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-white font-bold text-base truncate">{callerName}</h3>
              <p className="text-white/60 text-sm flex items-center gap-1.5">
                {callType === 'video' ? <Video size={14} /> : <Phone size={14} />}
                <span>Incoming {callType} call</span>
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-3 gap-3">
            {/* Decline */}
            <button
              onClick={onDecline}
              className="h-12 px-4 bg-red-500/5 hover:bg-red-500/10 border border-red-500/20 text-red-400 hover:text-red-300 rounded-xl transition-all text-sm font-medium flex items-center justify-center gap-2"
            >
              <PhoneOff size={18} />
              <span className="whitespace-nowrap">Decline</span>
            </button>

            {/* Decline with Message */}
            <button
              onClick={onDeclineWithMessage}
              className="h-12 px-4 bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 hover:text-white rounded-xl transition-all text-sm font-medium flex items-center justify-center gap-2"
            >
              <MessageSquare size={18} />
              <span className="whitespace-nowrap">Message</span>
            </button>

            {/* Accept */}
            <button
              onClick={onAccept}
              className="h-12 px-4 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white rounded-xl transition-all text-sm font-medium shadow-[0_0_20px_rgba(16,185,129,0.3)] flex items-center justify-center gap-2"
            >
              {callType === 'video' ? <Video size={18} /> : <Phone size={18} />}
              <span className="whitespace-nowrap">Accept</span>
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default CallNotificationBanner;

