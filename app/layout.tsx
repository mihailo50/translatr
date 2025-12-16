import React from 'react';
import AppShell from '../components/layout/AppShell';
import { ThemeProvider } from '../components/contexts/ThemeContext';

export const metadata = {
  title: 'Translatr',
  description: 'Real-time translation chat application.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
         <link rel="preconnect" href="https://fonts.googleapis.com" />
         <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
         <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
         <script src="https://cdn.tailwindcss.com"></script>
         <script dangerouslySetInnerHTML={{__html: `
            tailwind.config = {
                darkMode: 'class',
                theme: {
                    extend: {
                        colors: {
                            aurora: {
                                dark: '#020617',
                                slate: '#0f172a',
                                indigo: '#6366f1',
                                purple: '#8b5cf6',
                                pink: '#ec4899',
                            }
                        },
                        fontFamily: {
                            sans: ['"Plus Jakarta Sans"', 'sans-serif'],
                        },
                        animation: {
                            'blob': 'blob 7s infinite',
                            'float': 'float 6s ease-in-out infinite',
                        },
                        keyframes: {
                            blob: {
                                '0%': { transform: 'translate(0px, 0px) scale(1)' },
                                '33%': { transform: 'translate(30px, -50px) scale(1.1)' },
                                '66%': { transform: 'translate(-20px, 20px) scale(0.9)' },
                                '100%': { transform: 'translate(0px, 0px) scale(1)' },
                            },
                            float: {
                                '0%, 100%': { transform: 'translateY(0)' },
                                '50%': { transform: 'translateY(-20px)' },
                            }
                        }
                    }
                }
            }
         `}} />
         <style dangerouslySetInnerHTML={{__html: `
            @layer base {
                body {
                    @apply bg-aurora-dark text-slate-100 antialiased overflow-hidden selection:bg-aurora-purple/30 selection:text-white font-sans;
                }
            }
            @layer utilities {
                .glass-strong {
                    @apply backdrop-blur-xl bg-white/5 border border-white/10 shadow-2xl;
                }
                .glass {
                    @apply backdrop-blur-md bg-white/5 border border-white/5;
                }
                .scrollbar-thin::-webkit-scrollbar {
                    width: 5px;
                    height: 5px;
                }
                .scrollbar-thin::-webkit-scrollbar-track {
                    @apply bg-transparent;
                }
                .scrollbar-thin::-webkit-scrollbar-thumb {
                    @apply bg-white/10 rounded-full hover:bg-white/20 transition-colors;
                }
            }
         `}} />
         <script dangerouslySetInnerHTML={{__html: `
            // Suppress MutationObserver errors from third-party libraries
            if (typeof window !== 'undefined') {
              const originalError = console.error;
              console.error = function(...args) {
                const errorMsg = args.join(' ');
                // Suppress specific MutationObserver error from third-party libraries
                if (errorMsg.includes("Failed to execute 'observe' on 'MutationObserver'") && 
                    errorMsg.includes("parameter 1 is not of type 'Node'")) {
                  return; // Silently ignore this specific error
                }
                originalError.apply(console, args);
              };
            }
         `}} />
      </head>
      <body>
        <ThemeProvider>
          <AppShell>{children}</AppShell>
        </ThemeProvider>
      </body>
    </html>
  );
}