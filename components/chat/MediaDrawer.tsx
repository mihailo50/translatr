import React, { useMemo, useState } from 'react';
import { X, Image, FileText, Download } from 'lucide-react';
import { ChatMessage } from '../../hooks/useLiveKitChat';

interface MediaDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  roomName: string;
}

const MediaDrawer: React.FC<MediaDrawerProps> = ({ isOpen, onClose, messages, roomName }) => {
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());

  const mediaItems = useMemo(() => {
    return messages
      .filter((m) => m.attachment && !m.attachment.viewOnce) // Exclude view once images
      .sort((a, b) => b.timestamp - a.timestamp); // Newest first
  }, [messages]);

  const handleImageError = (itemId: string) => {
    setFailedImages(prev => new Set(prev).add(itemId));
  };

  return (
    <>
      {/* Backdrop */}
      <div 
        className={`absolute inset-0 bg-black/50 backdrop-blur-sm z-40 transition-opacity duration-300 ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Drawer */}
      <div 
        className={`absolute inset-y-0 right-0 z-50 w-80 glass-strong border-l border-white/10 transform transition-transform duration-300 ease-out flex flex-col ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="p-6 border-b border-white/10 flex items-center justify-between">
            <div>
                <h2 className="text-lg font-bold text-white">Media</h2>
                <p className="text-xs text-white/50">{roomName}</p>
            </div>
            <button 
                onClick={onClose}
                className="p-2 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors"
            >
                <X size={20} />
            </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-4">
            {mediaItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-white/30 text-center">
                    <Image size={48} className="mb-4 opacity-50" />
                    <p className="text-sm">No media shared yet</p>
                </div>
            ) : (
                <div className="space-y-6">
                    {/* Images Grid */}
                    {mediaItems.filter(m => m.attachment?.type === 'image').length > 0 && (
                        <div>
                            <h3 className="text-xs font-bold text-white/40 uppercase tracking-wider mb-3">Images</h3>
                            <div className="grid grid-cols-2 gap-2">
                                {mediaItems.filter(m => m.attachment?.type === 'image').map(item => {
                                    const hasFailed = failedImages.has(item.id);
                                    const isBlobUrl = item.attachment?.url?.startsWith('blob:');
                                    
                                    return (
                                        <a 
                                            key={item.id} 
                                            href={!hasFailed ? item.attachment?.url : undefined}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className={`relative aspect-square rounded-lg overflow-hidden border border-white/10 group cursor-zoom-in bg-black/20 ${hasFailed ? 'pointer-events-none' : ''}`}
                                        >
                                            {hasFailed || (isBlobUrl && !item.attachment?.url) ? (
                                                <div className="w-full h-full flex flex-col items-center justify-center bg-black/40 text-white/40">
                                                    <Image size={24} className="mb-2 opacity-50" />
                                                    <p className="text-[10px] text-center px-2">Image unavailable</p>
                                                </div>
                                            ) : (
                                                <>
                                                    <img 
                                                        src={item.attachment?.url} 
                                                        alt="Shared image" 
                                                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                                                        onError={() => handleImageError(item.id)}
                                                        loading="lazy"
                                                    />
                                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                                                </>
                                            )}
                                        </a>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Files List */}
                    {mediaItems.filter(m => m.attachment?.type === 'file').length > 0 && (
                        <div>
                            <h3 className="text-xs font-bold text-white/40 uppercase tracking-wider mb-3">Documents</h3>
                            <div className="space-y-2">
                                {mediaItems.filter(m => m.attachment?.type === 'file').map(item => (
                                    <a 
                                        key={item.id}
                                        href={item.attachment?.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-3 p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 transition-colors group"
                                    >
                                        <div className="p-2 rounded-lg bg-aurora-indigo/20 text-aurora-indigo">
                                            <FileText size={18} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-white truncate">{item.attachment?.name || 'Document'}</p>
                                            <p className="text-[10px] text-white/40">{new Date(item.timestamp).toLocaleDateString()}</p>
                                        </div>
                                        <Download size={16} className="text-white/30 group-hover:text-white transition-colors" />
                                    </a>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
      </div>
    </>
  );
};

export default MediaDrawer;