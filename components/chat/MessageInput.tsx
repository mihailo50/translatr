import React, { useState, useRef } from 'react';
import { Send, Paperclip, Loader2, X, Ban, Lock, Timer } from 'lucide-react';
import { sendMessageAction } from '../../actions/chat';
import { createClient } from '../../utils/supabase/client';
import { toast } from 'sonner';
import { deriveKey, encryptData } from '../../utils/encryption';
import { ChatMessage } from '../../hooks/useLiveKitChat';

interface MessageInputProps {
  roomId: string;
  userId: string;
  userName: string;
  isConnected: boolean;
  onOptimisticMessage?: (text: string) => void;
  disabled?: boolean;
  sendRealtimeMessage?: (text: string, lang: string, attachment?: ChatMessage['attachment']) => Promise<any>;
}

const MessageInput: React.FC<MessageInputProps> = ({ 
    roomId, 
    userId, 
    userName, 
    isConnected, 
    onOptimisticMessage, 
    disabled = false,
    sendRealtimeMessage 
}) => {
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [attachment, setAttachment] = useState<{url: string, type: 'image' | 'file', name: string} | null>(null);
  const [isViewOnce, setIsViewOnce] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSend = async (e: React.FormEvent | React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (disabled || (!inputText.trim() && !attachment) || isSending) return;

    setIsSending(true);
    const textToSend = inputText;
    
    // Construct attachment object with viewOnce flag if applicable
    const attachmentToSend = attachment ? {
        ...attachment,
        viewOnce: attachment.type === 'image' ? isViewOnce : false
    } : undefined;

    setInputText(''); 
    setAttachment(null);
    setIsViewOnce(false);

    // 1. FAST PATH: Client-side Encrypted Broadcast
    let clientSentResult = null;
    if (sendRealtimeMessage) {
        try {
            // This sends P2P immediately
            clientSentResult = await sendRealtimeMessage(textToSend, 'en', attachmentToSend);
        } catch (e) {
            console.error("Fast send failed, falling back to server", e);
        }
    }

    // 2. PERSISTENCE PATH: Server Action
    let encryptedPayload = null;
    if (clientSentResult) {
        encryptedPayload = {
            cipher: clientSentResult.encryptedText,
            iv: clientSentResult.iv
        };
    } else {
        // Fallback encryption
        try {
            const key = await deriveKey(roomId);
            encryptedPayload = await encryptData(textToSend, key);
        } catch(e) {
            console.error("Encryption failed", e);
        }
    }

    if (encryptedPayload) {
        const result = await sendMessageAction(
            encryptedPayload.cipher, // Send ciphertext
            roomId, 
            userId, 
            userName, 
            attachmentToSend || undefined,
            {
                isEncrypted: true,
                iv: encryptedPayload.iv,
                skipBroadcast: !!clientSentResult, // Skip server broadcast if client did it
                messageId: clientSentResult?.id
            }
        );
        if (!result.success) toast.error("Failed to save message");
    } else {
        toast.error("Encryption failed, message not sent");
    }
    
    setIsSending(false);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
        const file = e.target.files[0];
        if (file.size > 5 * 1024 * 1024) { 
            toast.error("File size too large (Max 5MB)");
            return;
        }
        setIsUploading(true);
        setIsViewOnce(false); // Reset default

        try {
            const supabase = createClient();
            const fileExt = file.name.split('.').pop();
            const fileName = `${roomId}/${Date.now()}.${fileExt}`;
            const { error: uploadError } = await supabase.storage.from('attachments').upload(fileName, file);
            if (uploadError) throw uploadError;
            const { data: { publicUrl } } = supabase.storage.from('attachments').getPublicUrl(fileName);
            const type = file.type.startsWith('image/') ? 'image' : 'file';
            setAttachment({ url: publicUrl, type, name: file.name });
        } catch (error) {
            // Fallback for demo
            const localUrl = URL.createObjectURL(file);
            const type = file.type.startsWith('image/') ? 'image' : 'file';
            setAttachment({ url: localUrl, type, name: file.name });
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    }
  };

  if (disabled) {
      return (
          <div className="absolute bottom-4 left-4 right-4 z-[50] pointer-events-none">
              <div className="glass-strong p-3 rounded-full flex items-center justify-center gap-2 text-white/40 pointer-events-auto max-w-lg mx-auto">
                  <Ban size={18} />
                  <span className="text-sm font-medium">You cannot reply to this conversation.</span>
              </div>
          </div>
      );
  }

  const hasContent = inputText.trim().length > 0 || attachment !== null;
  const isActive = hasContent && !isSending;

  return (
    <div className="absolute bottom-4 left-4 right-4 z-[50] pointer-events-none flex flex-col items-center">
        {attachment && (
            <div className="pointer-events-auto self-start mb-2 ml-2 glass p-2 rounded-2xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2 border border-white/10 shadow-lg relative z-[60]">
                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center overflow-hidden">
                    {attachment.type === 'image' ? <img src={attachment.url} className="w-full h-full object-cover" /> : <Paperclip size={20} className="text-white/70" />}
                </div>
                <div className="flex flex-col mr-2">
                    <span className="text-xs font-medium text-white max-w-[150px] truncate">{attachment.name}</span>
                    {attachment.type === 'image' && (
                        <button 
                            type="button"
                            onClick={() => setIsViewOnce(!isViewOnce)}
                            className={`mt-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider transition-colors px-2 py-0.5 rounded-full border ${isViewOnce ? 'bg-aurora-indigo text-white border-aurora-indigo' : 'bg-white/5 text-white/50 border-white/10 hover:bg-white/10 hover:text-white'}`}
                        >
                            <Timer size={10} />
                            {isViewOnce ? 'View Once' : 'Standard'}
                        </button>
                    )}
                </div>
                <button onClick={() => setAttachment(null)} className="p-1 hover:bg-white/10 rounded-full text-white/50 hover:text-white"><X size={14} /></button>
            </div>
        )}

        <form 
          onSubmit={handleSend} 
          className="w-full pointer-events-auto p-2 rounded-full flex items-center gap-2 max-w-4xl mx-auto border-t border-white/5 border-x border-b border-white/10 shadow-2xl relative z-[50]"
          style={{
            background: 'rgba(10, 10, 20, 0.8)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
          }}
        >
            <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileSelect} />
            
            <div className="flex items-center gap-1 shrink-0">
                <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isUploading} className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/10 text-white/50 hover:text-aurora-indigo transition-colors">
                    {isUploading ? <Loader2 size={18} className="animate-spin" /> : <Paperclip size={18} />}
                </button>
            </div>
            
            <div className="relative flex-1">
                 <input 
                    type="text" 
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder={isSending ? "Encrypting & Sending..." : "Type a secure message..."}
                    disabled={isSending}
                    className="w-full bg-white/[0.03] border border-white/5 focus:bg-white/[0.08] focus:border-indigo-500/40 focus:shadow-[0_0_20px_rgba(99,102,241,0.2)] focus:ring-0 text-white placeholder-white/30 px-3 py-2 text-base h-10 pr-8 rounded-lg transition-all duration-300 ease-out"
                    autoComplete="off"
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2" title="End-to-End Encrypted">
                    <Lock size={12} className="text-white/20" />
                </div>
            </div>
            
            <button type="submit" onClick={handleSend} disabled={!isActive} className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 shrink-0 relative ${isActive ? 'bg-white text-aurora-indigo hover:scale-105 shadow-[0_0_20px_rgba(255,255,255,0.4)] cursor-pointer' : 'bg-white/5 text-white/20 cursor-not-allowed'}`}>
                {isSending ? <Loader2 size={18} className="animate-spin text-aurora-indigo" /> : <Send size={18} fill="currentColor" className={isActive ? "ml-0.5" : ""} />}
            </button>
        </form>
    </div>
  );
};

export default MessageInput;