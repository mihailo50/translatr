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

const ImageViewerModal = ({ src, onClose }: { src: string, onClose: () => void }) => {
    const [imageError, setImageError] = useState(false);
    const isBlobUrl = src?.startsWith('blob:');
    
    if (typeof document === 'undefined') return null;
    
    return createPortal(
        <div 
            className="fixed inset-0 z-[10000] bg-black/95 flex items-center justify-center animate-in fade-in duration-200 backdrop-blur-sm" 
            onClick={onClose}
        >
            <div className="absolute top-4 right-4 z-10">
                <button 
                    onClick={onClose}
                    className="p-2.5 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors shadow-lg"
                >
                    <X size={24} />
                </button>
            </div>

            <div className="relative max-w-[95vw] max-h-[95vh] p-4 flex items-center justify-center">
                {imageError || isBlobUrl ? (
                    <div className="min-w-[300px] min-h-[300px] flex flex-col items-center justify-center bg-black/40 text-white/40 p-8 rounded-lg border border-white/10">
                        <X size={48} className="mb-4 opacity-50" />
                        <p className="text-lg text-center">Image unavailable</p>
                        <p className="text-sm text-center mt-2 text-white/30">The image link has expired</p>
                    </div>
                ) : (
                    <img 
                        src={src} 
                        alt="Full size preview"
                        className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl" 
                        onClick={e => e.stopPropagation()}
                        onError={() => setImageError(true)}
                    />
                )}
            </div>
        </div>,
        document.body
    );
};

const ViewOnceModal = ({ src, onClose }: { src: string, onClose: () => void }) => {
    const [imageError, setImageError] = useState(false);
    const isBlobUrl = src?.startsWith('blob:');
    
    // Render using Portal to ensure it sits on top of everything including parent overflow containers
    if (typeof document === 'undefined') return null;
    
    return createPortal(
        <div 
            className="fixed inset-0 z-[10000] bg-black/95 flex items-center justify-center animate-in fade-in duration-300 backdrop-blur-sm" 
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
                {imageError || isBlobUrl ? (
                    <div className="w-full min-h-[400px] flex flex-col items-center justify-center bg-black/20 text-white/40 p-8 rounded-lg">
                        <X size={48} className="mb-4 opacity-50" />
                        <p className="text-lg text-center">Image unavailable</p>
                        <p className="text-sm text-center mt-2 text-white/30">The image link has expired</p>
                    </div>
                ) : (
                    <>
                        <img 
                            src={src} 
                            className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl" 
                            onClick={e => e.stopPropagation()}
                            onError={() => setImageError(true)}
                        />
                        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 border border-white/10 backdrop-blur-md">
                            <Timer size={16} className="text-aurora-pink" />
                            <span className="text-white/70 text-sm font-medium">This photo will disappear after closing</span>
                        </div>
                    </>
                )}
            </div>
        </div>,
        document.body
    );
};

const MessageBubble: React.FC<MessageBubbleProps> = ({ message, userPreferredLanguage, isTranslationEnabled = true }) => {
  const [showOriginal, setShowOriginal] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [isViewed, setIsViewed] = useState(false);
  const [showViewOnceModal, setShowViewOnceModal] = useState(false);
  const [showImageViewer, setShowImageViewer] = useState(false);
  const [showFooter, setShowFooter] = useState(false);

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
    <div className={`flex items-end gap-3 ${message.isMe ? 'flex-row-reverse' : 'flex-row'} animate-in zoom-in-95 slide-in-from-bottom-2 duration-300`}>
      
      {/* Avatar (for others) */}
      {!message.isMe && (
        <div className="w-8 h-8 rounded-full bg-slate-700/50 flex-shrink-0 flex items-center justify-center text-xs font-bold border border-white/10 uppercase">
          {message.senderName.charAt(0)}
        </div>
      )}

      <div className={`group relative max-w-[75%] sm:max-w-[65%] flex flex-col ${message.isMe ? 'items-end' : 'items-start'}`}>
        
        {/* Bubble Container */}
        <div 
          className={`
           relative rounded-2xl shadow-lg transition-all duration-300 overflow-hidden cursor-pointer
           ${message.text ? 'px-5 py-3' : 'p-1.5'}
           ${message.isMe 
             ? 'text-white rounded-tr-sm' 
             : 'text-white/90 rounded-tl-sm hover:bg-[#1a1a20]/90'}
          `}
          style={message.isMe ? {
            background: 'linear-gradient(to bottom right, rgba(79, 70, 229, 0.9), rgba(147, 51, 234, 0.9), rgba(79, 70, 229, 0.9))',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.3)',
          } : {
            background: 'rgba(26, 26, 32, 0.8)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            border: '1px solid rgba(255, 255, 255, 0.05)',
          }}
          onClick={(e) => {
            // Don't toggle if clicking on interactive elements
            const target = e.target as HTMLElement;
            if (target.closest('button') || target.closest('a') || target.closest('img')) {
              return;
            }
            setShowFooter(!showFooter);
          }}
        >
          
          {/* Attachment Rendering */}
          {message.attachment && (
            <div className={message.text ? "mb-2" : "m-1"}>
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
                        <div className="rounded-lg overflow-hidden border border-white/10 bg-black/10 w-[180px] max-w-full">
                            {imageError || message.attachment.url?.startsWith('blob:') ? (
                                <div className="w-full min-h-[140px] flex flex-col items-center justify-center bg-black/20 text-white/40 p-3">
                                    <X size={20} className="mb-2 opacity-50" />
                                    <p className="text-xs text-center">Image unavailable</p>
                                    <p className="text-[10px] text-center mt-1 text-white/30">Link expired</p>
                                </div>
                            ) : (
                                <img 
                                    src={message.attachment.url} 
                                    alt="Shared image" 
                                    className="w-full h-auto max-h-[220px] object-cover cursor-pointer hover:opacity-90 transition-opacity" 
                                    loading="lazy"
                                    onError={() => setImageError(true)}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setShowImageViewer(true);
                                    }}
                                />
                            )}
                        </div>
                    )
                ) : (
                    /* File Attachment */
                    <a 
                        href={message.attachment.url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 p-2.5 rounded-lg bg-black/20 hover:bg-black/30 transition-colors border border-white/5 group w-[180px] max-w-full"
                    >
                        <div className="p-2 bg-aurora-indigo/20 text-aurora-indigo rounded-lg group-hover:bg-aurora-indigo/30 transition-colors flex-shrink-0">
                            <FileText size={18} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-white truncate">{message.attachment.name || 'Attachment'}</p>
                            <p className="text-[10px] text-white/50">File</p>
                        </div>
                        <Download size={16} className="text-white/40 group-hover:text-white/60 transition-colors flex-shrink-0" />
                    </a>
                )}
            </div>
          )}

          {message.text && (
             <p className="text-sm leading-relaxed whitespace-pre-wrap">{displayText}</p>
          )}
          
          {/* Metadata Footer - Only shown when message is clicked */}
          {showFooter && (
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
             </div>

             {/* Toggle Button (Only if translation exists, it's not my own message, AND global translation is enabled) */}
             {!message.isMe && hasTranslation && !isOriginalLang && message.text && isTranslationEnabled && (
               <button
                 onClick={(e) => {
                   e.stopPropagation();
                   setShowOriginal(!showOriginal);
                 }}
                 className="flex items-center gap-1 text-[10px] text-white/60 hover:text-white transition-colors opacity-60 hover:opacity-100"
               >
                 <RefreshCw size={10} className={showOriginal ? "rotate-180" : ""} />
                 {showOriginal ? 'Show Translation' : 'Show Original'}
               </button>
             )}
            </div>
          )}
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

      {/* Image Viewer Modal */}
      {showImageViewer && message.attachment?.url && message.attachment?.type === 'image' && (
          <ImageViewerModal src={message.attachment.url} onClose={() => setShowImageViewer(false)} />
      )}
    </div>
  );
};

export default MessageBubble;