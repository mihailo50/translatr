import React from "react";
import Image from "next/image";
import { UserPlus, X, Check, UserX } from "lucide-react";
import { createPortal } from "react-dom";

interface ContactRequestBannerProps {
  senderName: string;
  senderAvatar?: string;
  onAccept: () => void;
  onDecline: () => void;
  onDismiss?: () => void;
}

const ContactRequestBanner: React.FC<ContactRequestBannerProps> = ({
  senderName,
  senderAvatar,
  onAccept,
  onDecline,
  onDismiss,
}) => {
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] w-full max-w-md px-4 animate-in slide-in-from-top-4 fade-in duration-300">
      <div
        className="relative rounded-2xl border border-aurora-pink/30 overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.8)]"
        style={{
          background: "rgba(5, 5, 15, 0.98)",
          backdropFilter: "blur(25px)",
          WebkitBackdropFilter: "blur(25px)",
        }}
      >
        {/* Subtle Internal Top-Light Gradient */}
        <div
          className="absolute inset-0 pointer-events-none z-0"
          style={{
            background: "linear-gradient(180deg, rgba(255,255,255,0.05) 0%, transparent 100%)",
          }}
        />

        {/* Ambient Glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-aurora-pink/20 rounded-full blur-[80px] pointer-events-none z-0" />

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
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-aurora-pink to-aurora-indigo p-0.5 shadow-lg shadow-aurora-pink/30">
              {senderAvatar ? (
                <Image
                  src={senderAvatar}
                  alt={senderName}
                  width={48}
                  height={48}
                  className="w-full h-full rounded-full object-cover"
                />
              ) : (
                <div className="w-full h-full rounded-full bg-slate-900 flex items-center justify-center text-lg font-bold text-white uppercase">
                  {senderName.charAt(0)}
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-white font-bold text-base truncate">{senderName}</h3>
              <p className="text-white/60 text-sm flex items-center gap-1.5">
                <UserPlus size={14} />
                <span>Wants to connect</span>
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-3">
            {/* Decline */}
            <button
              onClick={onDecline}
              className="h-12 px-4 bg-red-500/5 hover:bg-red-500/10 border border-red-500/20 text-red-400 hover:text-red-300 rounded-xl transition-all text-sm font-medium flex items-center justify-center gap-2"
            >
              <UserX size={18} />
              <span className="whitespace-nowrap">Decline</span>
            </button>

            {/* Accept */}
            <button
              onClick={onAccept}
              className="h-12 px-4 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white rounded-xl transition-all text-sm font-medium shadow-[0_0_20px_rgba(16,185,129,0.3)] flex items-center justify-center gap-2"
            >
              <Check size={18} />
              <span className="whitespace-nowrap">Accept</span>
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ContactRequestBanner;
