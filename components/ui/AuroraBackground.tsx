import React from 'react';
import { useTheme } from '../contexts/ThemeContext';

interface AuroraBackgroundProps {
  children?: React.ReactNode;
  className?: string;
  showOrbs?: boolean;
}

const AuroraBackground: React.FC<AuroraBackgroundProps> = ({ 
  children, 
  className = "",
  showOrbs = true
}) => {
  const { theme } = useTheme();

  return (
    <div className={`relative w-full h-full overflow-hidden transition-colors duration-500 ${theme === 'midnight' ? 'bg-black' : 'bg-aurora-dark'} ${className}`}>
      {/* Background Gradient Base */}
      <div className={`absolute inset-0 z-0 transition-opacity duration-500 ${theme === 'midnight' ? 'opacity-0' : 'opacity-100 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950'}`} />

      {/* Animated Orbs - Aurora Theme */}
      {showOrbs && theme === 'aurora' && (
        <div className="absolute inset-0 z-0 opacity-40 pointer-events-none overflow-hidden transition-opacity duration-700">
          {/* Indigo Orb - Top Left */}
          <div className="absolute top-0 -left-4 w-96 h-96 bg-aurora-indigo rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob" />
          
          {/* Purple Orb - Top Right */}
          <div className="absolute top-0 -right-4 w-96 h-96 bg-aurora-purple rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-2000" />
          
          {/* Pink Orb - Bottom Center */}
          <div className="absolute -bottom-8 left-20 w-96 h-96 bg-aurora-pink rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-4000" />
          
          {/* Extra ambient glow for depth */}
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-aurora-slate/20 rounded-full blur-[100px]" />
        </div>
      )}

      {/* Midnight Theme Ambient Effects */}
      {theme === 'midnight' && (
        <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
            {/* Top gradient falloff */}
            <div className="absolute top-0 left-0 w-full h-96 bg-gradient-to-b from-slate-900/30 to-transparent opacity-50" />
            
            {/* Subtle Deep Glows */}
            <div className="absolute -bottom-32 -right-32 w-[600px] h-[600px] bg-indigo-950/20 rounded-full blur-[120px] animate-pulse" style={{ animationDuration: '8s' }} />
            <div className="absolute -bottom-10 -left-10 w-[400px] h-[400px] bg-slate-800/20 rounded-full blur-[100px] animate-pulse" style={{ animationDuration: '10s', animationDelay: '1s' }} />
        </div>
      )}

      {/* Mesh/Grid Texture Overlay */}
      <div className={`absolute inset-0 z-[1] bg-[url('https://grainy-gradients.vercel.app/noise.svg')] transition-opacity duration-500 ${theme === 'midnight' ? 'opacity-[0.02]' : 'opacity-[0.03]'}`}></div>

      {/* Content */}
      <div className="relative z-10 w-full h-full">
        {children}
      </div>
    </div>
  );
};

export default AuroraBackground;