import React, { useState } from 'react';
import { Globe, RefreshCw, Paperclip, FileText, Download, Timer, X, Eye } from 'lucide-react';
import { createPortal } from 'react-dom';

interface MessageBubbleProps {
  message: {
    id: string;
    text: string; // The original text
    translations?: Record<string, string>;
    original_language?: string;
    senderId: string;
    senderName: string;
    timestamp: number;
    isMe: boolean;
    attachment?: {
        url: string;
        type: 'image' | 'file';
        name?: string;
        viewOnce?: boolean;
    };
  };
  userPreferredLanguage: string; // e.g., 'es', 'fr', 'en'
  isTranslationEnabled?: boolean;
}

const ViewOnceModal = ({ src, onClose }: { src: string, onClose: () => void }) => {
    // Render using Portal to ensure it sits on top of everything including parent overflow containers
    if (typeof document === 'undefined') return null;
    
    return createPortal(
        <div 
            className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center animate-in fade-in duration-300 backdrop-blur-sm" 
            onClick={onClose}
        >
            <div className="absolute top-6 right-6">
                <button 
                    onClick={onClose}
                    className="p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
                >
                    <X size={24} />
                </button>
            </div>

            <div className="relative max-w-4xl max-h-screen p-4 flex flex-col items-center gap-4">
                 <img src={src} className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl" onClick={e => e.stopPropagation()} />
                 <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 border border-white/10 backdrop-blur-md">
                     <Timer size={16} className="text-aurora-pink" />
                     <span className="text-white/70 text-sm font-medium">This photo will disappear after closing</span>
                 </div>
            </div>
        </div>,
        document.body
    );
};

const MessageBubble: React.FC<MessageBubbleProps> = ({ message, userPreferredLanguage, isTranslationEnabled = true }) => {
  const [showOriginal, setShowOriginal] = useState(false);
  const [isViewed, setIsViewed] = useState(false);
  const [showViewOnceModal, setShowViewOnceModal] = useState(false);

  // Logic to determine what to display
  const isOriginalLang = message.original_language === userPreferredLanguage;
  const hasTranslation = message.translations && message.translations[userPreferredLanguage];
  
  const shouldShowTranslation = isTranslationEnabled && !isOriginalLang && hasTranslation && !showOriginal;
  
  const displayText = shouldShowTranslation
    ? message.translations![userPreferredLanguage]
    : message.text;

  const isTranslatedView = shouldShowTranslation;
  const isViewOnce = message.attachment?.viewOnce;

  const handleOpenViewOnce = () => {
      if (!isViewed) {
          setShowViewOnceModal(true);
      }
  };

  const handleCloseViewOnce = () => {
      setShowViewOnceModal(false);
      setIsViewed(true);
  };

  return (
    <div className={`flex items-end gap-3 ${message.isMe ? 'flex-row-reverse' : 'flex-row'}`}>
      
      {/* Avatar (for others) */}
      {!message.isMe && (
        <div className="w-8 h-8 rounded-full bg-slate-700/50 flex-shrink-0 flex items-center justify-center text-xs font-bold border border-white/10 uppercase">
          {message.senderName.charAt(0)}
        </div>
      )}

      <div className={`group relative max-w-[75%] sm:max-w-[65%] flex flex-col ${message.isMe ? 'items-end' : 'items-start'}`}>
        
        {/* Bubble Container */}
        <div className={`
           relative px-5 py-3 rounded-2xl shadow-lg transition-all duration-300 overflow-hidden
           ${message.isMe 
             ? 'bg-gradient-to-br from-aurora-indigo to-aurora-purple text-white rounded-tr-sm' 
             : 'bg-white/10 border border-white/10 text-slate-100 rounded-tl-sm backdrop-blur-md hover:bg-white/15'}
        `}>
          
          {/* Attachment Rendering */}
          {message.attachment && (
            <div className="mb-3">
                {message.attachment.type === 'image' ? (
                    isViewOnce ? (
                         /* View Once UI */
                         <div className="w-64 max-w-full">
                            {message.isMe ? (
                                // Sender View
                                <div className="relative rounded-lg overflow-hidden border border-white/20 bg-black/20 flex flex-col items-center justify-center gap-2 py-6 cursor-default">
                                     <div className="w-12 h-12 rounded-full border-2 border-white/30 border-dashed flex items-center justify-center">
                                         <Timer size={24} className="text-white/50" />
                                     </div>
                                     <span className="text-sm font-medium text-white/70">View Once Photo</span>
                                     <span className="text-[10px] text-white/30">(Sent)</span>
                                </div>
                            ) : (
                                // Receiver View
                                <button 
                                    onClick={handleOpenViewOnce}
                                    disabled={isViewed}
                                    className={`w-full relative rounded-lg overflow-hidden border transition-all flex flex-col items-center justify-center gap-3 py-6
                                        ${isViewed 
                                            ? 'bg-white/5 border-white/5 cursor-default opacity-60' 
                                            : 'bg-white/10 border-white/20 hover:bg-white/15 cursor-pointer hover:border-aurora-pink/50'}
                                    `}
                                >
                                     {isViewed ? (
                                         <div className="flex flex-col items-center gap-2">
                                             <div className="w-12 h-12 rounded-full border border-white/10 bg-white/5 flex items-center justify-center">
                                                <div className="w-12 h-12 rounded-full flex items-center justify-center text-white/30">
                                                    Opened
                                                </div>
                                             </div>
                                             <span className="text-sm font-medium text-white/30">Opened</span>
                                         </div>
                                     ) : (
                                         <div className="flex flex-col items-center gap-2">
                                             <div className="w-12 h-12 rounded-full border-2 border-aurora-pink flex items-center justify-center animate-pulse">
                                                <Timer size={24} className="text-aurora-pink" />
                                             </div>
                                             <span className="text-sm font-bold text-white">View Photo</span>
                                             <span className="text-[10px] text-aurora-pink uppercase tracking-wider font-bold">1 View Only</span>
                                         </div>
                                     )}
                                </button>
                            )}
                         </div>
                    ) : (
                        /* Standard Image */
                        <div className="rounded-lg overflow-hidden border border-white/10">
                            <img 
                                src={message.attachment.url} 
                                alt="Attachment" 
                                className="w-full h-auto max-h-[300px] object-cover" 
                                loading="lazy"
                            />
                        </div>
                    )
                ) : (
                    /* File Attachment */
                    <a 
                        href={message.attachment.url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 p-3 rounded-lg bg-black/20 hover:bg-black/30 transition-colors border border-white/10"
                    >
                        <div className="p-2 bg-white/10 rounded-lg">
                            <FileText size={20} className="text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white truncate">{message.attachment.name || 'Attachment'}</p>
                            <p className="text-[10px] text-white/50 uppercase">File</p>
                        </div>
                        <Download size={16} className="text-white/50" />
                    </a>
                )}
            </div>
          )}

          {message.text && (
             <p className="text-sm leading-relaxed whitespace-pre-wrap">{displayText}</p>
          )}
          
          {/* Metadata Footer */}
          <div className="mt-2 pt-2 border-t border-white/10 flex items-center justify-between gap-4">
             
             {/* Language Indicator */}
             <div className="flex items-center gap-1.5">
                {message.text && (
                    <>
                        {isTranslatedView ? (
                            <>
                                <Globe size={10} className="text-aurora-indigo" />
                                <span className="text-[10px] uppercase tracking-wider font-semibold text-aurora-indigo">
                                    Translated
                                </span>
                            </>
                        ) : (
                            <span className="text-[10px] uppercase tracking-wider font-semibold text-white/40">
                                {message.original_language || 'Original'}
                            </span>
                        )}
                    </>
                )}
                {!message.text && message.attachment && (
                     <span className="text-[10px] uppercase tracking-wider font-semibold text-white/40">Media</span>
                )}
             </div>

             {/* Toggle Button (Only if translation exists, it's not my own message, AND global translation is enabled) */}
             {!message.isMe && hasTranslation && !isOriginalLang && message.text && isTranslationEnabled && (
               <button
                 onClick={() => setShowOriginal(!showOriginal)}
                 className="flex items-center gap-1 text-[10px] text-white/60 hover:text-white transition-colors opacity-60 hover:opacity-100"
               >
                 <RefreshCw size={10} className={showOriginal ? "rotate-180" : ""} />
                 {showOriginal ? 'Show Translation' : 'Show Original'}
               </button>
             )}
          </div>
        </div>

        {/* Timestamp */}
        <span className="text-[10px] text-white/30 mt-1 px-1">
           {new Date(message.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
        </span>
      </div>

      {/* View Once Modal */}
      {showViewOnceModal && message.attachment?.url && (
          <ViewOnceModal src={message.attachment.url} onClose={handleCloseViewOnce} />
      )}
    </div>
  );
};

export default MessageBubble;