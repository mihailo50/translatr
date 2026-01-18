import React from 'react';
import { Inter, Space_Grotesk } from 'next/font/google';
import './globals.css';
import AppShell from '../components/layout/AppShell';
import { ThemeProvider } from '../components/contexts/ThemeContext';
import { NotificationProvider } from '../components/contexts/NotificationContext';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
  display: 'swap',
});

export const metadata = {
  title: 'Aether | The Borderless Workspace',
  description: 'Real-time translation chat application.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${spaceGrotesk.variable}`}>
      <head>
         <link rel="icon" href="/logo/aether-favicon/logo.ico" />
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
      <body className={`${inter.variable} ${spaceGrotesk.variable} antialiased selection:bg-indigo-500/30`}>
        <ThemeProvider>
          <NotificationProvider>
            <AppShell>{children}</AppShell>
          </NotificationProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}