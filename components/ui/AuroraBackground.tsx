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

  // Configuration for twinkling stars in Midnight theme
  const stars = [
    { top: '15%', left: '20%', size: '2px', duration: '4s', delay: '0s' },
    { top: '45%', left: '75%', size: '1.5px', duration: '5s', delay: '1s' },
    { top: '70%', left: '15%', size: '2px', duration: '6s', delay: '2s' },
    { top: '25%', left: '85%', size: '1px', duration: '3.5s', delay: '0.5s' },
    { top: '85%', left: '60%', size: '1.5px', duration: '4.5s', delay: '1.5s' },
    { top: '10%', left: '50%', size: '1px', duration: '7s', delay: '3s' },
    { top: '60%', left: '90%', size: '2px', duration: '5.5s', delay: '2.5s' },
    { top: '35%', left: '10%', size: '1.5px', duration: '4s', delay: '1.2s' },
    { top: '5%', left: '90%', size: '2px', duration: '6.5s', delay: '0.2s' },
  ];

  return (
    <div className={`relative w-full h-full overflow-hidden transition-colors duration-500 ${theme === 'midnight' ? 'bg-midnight-bg' : 'bg-aurora-dark'} ${className}`}>
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

            {/* Twinkling Stars */}
            {stars.map((star, i) => (
                <div
                    key={i}
                    className="absolute bg-white rounded-full opacity-20 animate-pulse"
                    style={{
                        top: star.top,
                        left: star.left,
                        width: star.size,
                        height: star.size,
                        animationDuration: star.duration,
                        animationDelay: star.delay
                    }}
                />
            ))}
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