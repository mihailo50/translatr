import React from 'react';

export const AetherLogo = ({ className = '', iconOnly = false }: { className?: string, iconOnly?: boolean }) => (
  <div className={`flex items-center ${className}`}>
    {/* The Wordmark */}
    {!iconOnly && (
      <span className="font-display font-bold text-xl tracking-[0.3em] text-transparent bg-clip-text bg-gradient-to-r from-white via-white to-white/60">
        AETHER
      </span>
    )}
  </div>
);
