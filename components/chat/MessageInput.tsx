import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Send, Paperclip, Loader2, X, Ban, Lock, Timer, Mic, Square } from 'lucide-react';
import { sendMessageAction } from '../../actions/chat';
import { createClient } from '../../utils/supabase/client';
import { toast } from 'sonner';
import { deriveKey, encryptData } from '../../utils/encryption';
import { ChatMessage } from '../../hooks/useLiveKitChat';
import { processFileForUpload } from '../../utils/fileSecurity';

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
  const [attachment, setAttachment] = useState<{url: string, type: 'image' | 'file' | 'voice', name: string} | null>(null);
  const [isViewOnce, setIsViewOnce] = useState(false);
  
  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const stopResolveRef = useRef<(() => void) | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Memoize waveform bars data to prevent re-renders from changing styles
  const waveformBars = useMemo(() => {
    return Array.from({ length: 20 }, () => ({
      height: Math.random() * 60 + 20,
      duration: 0.5 + Math.random() * 0.5
    }));
  }, [isRecording]); // Only regenerate when recording starts

  // Format recording time as MM:SS
  const formatRecordingTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Start voice recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      
      mediaRecorderRef.current = mediaRecorder;
      streamRef.current = stream;
      audioChunksRef.current = [];
      stopResolveRef.current = null;
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm;codecs=opus' });
        setAudioBlob(blob);
        setIsRecording(false);
        if (recordingTimerRef.current) {
          clearInterval(recordingTimerRef.current);
          recordingTimerRef.current = null;
        }
        // Stop all tracks to release microphone
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }
        if (stopResolveRef.current) {
          stopResolveRef.current();
          stopResolveRef.current = null;
        }
      };
      
      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      
      // Start timer
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
      
    } catch (error) {
      console.error('Error starting recording:', error);
      toast.error('Failed to access microphone. Please check permissions.');
    }
  };

  // Stop voice recording
  const stopRecording = async () => {
    if (mediaRecorderRef.current && isRecording) {
      return new Promise<void>((resolve) => {
        if (mediaRecorderRef.current) {
          // Store resolve function so onstop can call it
          stopResolveRef.current = resolve;
          mediaRecorderRef.current.stop();
        } else {
          resolve();
        }
      });
    }
  };

  // Cancel voice recording
  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setRecordingTime(0);
      setAudioBlob(null);
      audioChunksRef.current = [];
      stopResolveRef.current = null;
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
      // Stop all tracks
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
    };
  }, []);

  const handleSend = async (e: React.FormEvent | React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (disabled || (!inputText.trim() && !attachment && !audioBlob) || isSending) return;
    
    // If recording, stop it first
    if (isRecording) {
      stopRecording();
      // Wait a bit for the blob to be created
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    setIsSending(true);
    const textToSend = inputText;
    
    // Handle voice message upload
    let voiceAttachment = null;
    if (audioBlob) {
      try {
        setIsUploading(true);
        const supabase = createClient();
        
        // Generate secure filename
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 9);
        const fileName = `${roomId}/${timestamp}-${random}-voice.webm`;
        
        // Upload audio blob to Supabase storage (use 'attachments' bucket to match existing file uploads)
        const { error: uploadError } = await supabase.storage.from('attachments').upload(fileName, audioBlob, {
          cacheControl: '3600',
          upsert: false,
          contentType: 'audio/webm;codecs=opus'
        });
        
        if (uploadError) {
          console.error('Voice upload error:', uploadError);
          throw new Error(uploadError.message || 'Failed to upload voice message');
        }
        
        // Get public URL
        const { data: { publicUrl } } = supabase.storage.from('attachments').getPublicUrl(fileName);
        
        voiceAttachment = {
          url: publicUrl,
          type: 'voice' as const,
          name: 'Voice message'
        };
        
        setAudioBlob(null);
        setRecordingTime(0);
      } catch (error) {
        console.error('Voice message upload failed:', error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to upload voice message';
        toast.error(`Upload failed: ${errorMessage}`);
        setIsSending(false);
        setIsUploading(false);
        return;
      } finally {
        setIsUploading(false);
      }
    }
    
    // Construct attachment object with viewOnce flag if applicable
    const attachmentToSend = voiceAttachment || (attachment ? {
        ...attachment,
        viewOnce: attachment.type === 'image' ? isViewOnce : false
    } : undefined);

    setInputText(''); 
    setAttachment(null);
    setIsViewOnce(false);

    // Immediately refocus the input after clearing (before async operations)
    // This ensures the input is ready for the next message
    if (!disabled && inputRef.current) {
      // Use requestAnimationFrame to ensure DOM has updated
      requestAnimationFrame(() => {
        if (inputRef.current && !disabled) {
          inputRef.current.focus();
        }
      });
    }

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
        if (!result.success) {
            console.error("Failed to save message:", result.error);
            toast.error(result.error || "Failed to save message");
        }
    } else {
        toast.error("Encryption failed, message not sent");
    }
    
    setIsSending(false);
    
    // Refocus the input field after sending completes
    // This ensures focus is maintained even if it was lost during async operations
    if (!disabled) {
      // Use requestAnimationFrame + setTimeout to ensure:
      // 1. React has updated the DOM (isSending state change)
      // 2. Input is no longer disabled
      requestAnimationFrame(() => {
        setTimeout(() => {
          if (inputRef.current && !disabled && !inputRef.current.disabled) {
            inputRef.current.focus();
          }
        }, 0);
      });
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
        const originalFile = e.target.files[0];
        
        // Check original file size (before processing)
        if (originalFile.size > 10 * 1024 * 1024) { 
            toast.error("File size too large (Max 10MB before compression)");
            return;
        }
        
        setIsUploading(true);
        setIsViewOnce(false); // Reset default

        try {
            // Process file: strip metadata, compress, and optimize
            toast.loading("Processing file for security...", { id: 'file-processing' });
            const { file: processedFile, originalSize, processedSize, compressionRatio } = await processFileForUpload(originalFile);
            
            // Check processed file size
            if (processedFile.size > 5 * 1024 * 1024) {
                toast.error("File size too large after processing (Max 5MB)", { id: 'file-processing' });
                return;
            }
            
            // Show compression info if significant
            if (compressionRatio > 10) {
                toast.success(`File optimized: ${(compressionRatio).toFixed(0)}% smaller`, { id: 'file-processing' });
            } else {
                toast.dismiss('file-processing');
            }
            
            const supabase = createClient();
            
            // Generate secure filename (timestamp + random + sanitized name)
            const timestamp = Date.now();
            const random = Math.random().toString(36).substring(2, 9);
            const sanitizedName = processedFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
            const fileName = `${roomId}/${timestamp}-${random}-${sanitizedName}`;
            
            // Upload processed file to Supabase storage
            const { error: uploadError } = await supabase.storage.from('attachments').upload(fileName, processedFile, {
                cacheControl: '3600',
                upsert: false,
                contentType: processedFile.type
            });
            
            if (uploadError) {
                console.error('Upload error:', uploadError);
                throw new Error(uploadError.message || 'Failed to upload file');
            }
            
            // Get public URL
            const { data: { publicUrl } } = supabase.storage.from('attachments').getPublicUrl(fileName);
            
            // Verify the file is actually accessible
            try {
                const response = await fetch(publicUrl, { method: 'HEAD' });
                if (!response.ok) {
                    throw new Error('File uploaded but not accessible. Please ensure the "attachments" bucket is public in Supabase Storage settings.');
                }
            } catch (fetchError: any) {
                // Handle network errors gracefully
                if (fetchError instanceof TypeError && fetchError.message === 'Failed to fetch') {
                    // Network error - skip file check but don't delete the file
                    console.log('Network error during file accessibility check, skipping verification');
                } else {
                    // Other errors (file not accessible, etc.) - log and handle
                    console.error('File accessibility check failed:', fetchError);
                    // Delete the uploaded file since it's not accessible
                    await supabase.storage.from('attachments').remove([fileName]);
                    throw new Error('File uploaded but not accessible. The storage bucket may not be public.');
                }
            }
            
            const type = processedFile.type.startsWith('image/') ? 'image' : 'file';
            
            setAttachment({ 
                url: publicUrl, 
                type, 
                name: originalFile.name // Use original name for display
            });
            
            toast.success("File uploaded securely");
        } catch (error) {
            console.error('File upload failed:', error);
            const errorMessage = error instanceof Error ? error.message : 'Failed to upload file';
            toast.error(`Upload failed: ${errorMessage}`, { id: 'file-processing' });
            setAttachment(null);
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

  const hasContent = inputText.trim().length > 0 || attachment !== null || audioBlob !== null;
  const isActive = (hasContent || isRecording) && !isSending;

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
        
        {audioBlob && !isRecording && (
            <div className="pointer-events-auto self-start mb-2 ml-2 glass p-2 rounded-2xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2 border border-white/10 shadow-lg relative z-[60]">
                <div className="w-10 h-10 rounded-xl bg-aurora-indigo/20 flex items-center justify-center">
                    <Mic size={20} className="text-aurora-indigo" />
                </div>
                <div className="flex flex-col mr-2">
                    <span className="text-xs font-medium text-white">Voice Message</span>
                    <span className="text-[10px] text-white/50 font-mono">{formatRecordingTime(recordingTime)}</span>
                </div>
                <button 
                    onClick={() => {
                        setAudioBlob(null);
                        setRecordingTime(0);
                        audioChunksRef.current = [];
                    }} 
                    className="p-1 hover:bg-white/10 rounded-full text-white/50 hover:text-white"
                >
                    <X size={14} />
                </button>
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
            
            {isRecording ? (
              // Recording Mode UI
              <>
                <div className="relative flex-1 flex items-center gap-3 px-4">
                  {/* Pulsing Red Dot */}
                  <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                  
                  {/* Waveform Animation */}
                  <div className="flex-1 flex items-center gap-1 h-8">
                    {waveformBars.map((bar, i) => (
                      <div
                        key={i}
                        className="flex-1 bg-indigo-500/60 rounded-full"
                        style={{
                          height: `${bar.height}%`,
                          animationName: 'waveform',
                          animationDuration: `${bar.duration}s`,
                          animationTimingFunction: 'ease-in-out',
                          animationIterationCount: 'infinite',
                          animationDelay: `${i * 0.05}s`
                        }}
                      />
                    ))}
                  </div>
                  
                  {/* Timer */}
                  <span className="text-sm font-mono text-red-400 animate-pulse min-w-[3rem] text-right">
                    {formatRecordingTime(recordingTime)}
                  </span>
                  
                  {/* Cancel Button */}
                  <button
                    type="button"
                    onClick={cancelRecording}
                    className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/10 text-white/70 hover:text-white transition-colors"
                  >
                    <X size={16} />
                  </button>
                </div>
                
                {/* Stop/Send Button */}
                <button
                  type="button"
                  onClick={async (e) => {
                    await stopRecording();
                    // Wait a bit for state to update
                    await new Promise(resolve => setTimeout(resolve, 100));
                    // Trigger send - audioBlob will be available in handleSend
                    handleSend(e);
                  }}
                  className="w-10 h-10 rounded-full flex items-center justify-center bg-red-500 text-white hover:bg-red-600 hover:scale-105 shadow-[0_0_20px_rgba(239,68,68,0.4)] transition-all duration-300 shrink-0"
                >
                  <Square size={16} fill="currentColor" />
                </button>
              </>
            ) : (
              // Normal Input Mode
              <>
                <div className="relative flex-1">
                  <input 
                    ref={inputRef}
                    type="text" 
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={(e) => {
                      // Handle Enter key submission
                      if (e.key === 'Enter' && !e.shiftKey && isActive) {
                        e.preventDefault();
                        handleSend(e);
                      }
                    }}
                    placeholder={isSending ? "Encrypting & Sending..." : "Message..."}
                    disabled={isSending || disabled || isRecording}
                    className="w-full bg-white/[0.03] border border-white/5 rounded-2xl focus:ring-1 focus:ring-indigo-500/30 focus:shadow-[0_0_30px_rgba(99,102,241,0.15)] focus:bg-white/[0.06] focus:border-indigo-500/40 text-white placeholder-white/30 px-3 py-2 text-base h-10 pr-8 transition-all duration-500 ease-out outline-none"
                    autoComplete="off"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2" title="End-to-End Encrypted">
                    <Lock size={12} className="text-white/20" />
                  </div>
                </div>
                
                {/* Mic Button */}
                <button
                  type="button"
                  onClick={startRecording}
                  disabled={isSending || disabled || isRecording}
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 shrink-0 ${
                    isRecording
                      ? 'bg-red-500 text-white animate-pulse'
                      : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <Mic size={18} />
                </button>
                
                {/* Send Button */}
                <button 
                  type="submit" 
                  onClick={handleSend} 
                  disabled={!isActive} 
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 shrink-0 relative ${
                    isActive 
                      ? 'bg-white text-aurora-indigo hover:scale-105 shadow-[0_0_20px_rgba(99,102,241,0.4)] cursor-pointer send-button-glow' 
                      : 'bg-white/5 text-white/20 cursor-not-allowed'
                  }`}
                >
                  {isSending ? <Loader2 size={18} className="animate-spin text-aurora-indigo" /> : <Send size={18} fill="currentColor" className={isActive ? "ml-0.5" : ""} />}
                </button>
              </>
            )}
            
            {/* Glow Pulse Animation CSS */}
            <style dangerouslySetInnerHTML={{ __html: `
              @keyframes send-button-pulse {
                0%, 100% {
                  box-shadow: 0 0 20px rgba(99, 102, 241, 0.4);
                }
                50% {
                  box-shadow: 0 0 30px rgba(99, 102, 241, 0.6);
                }
              }
              .send-button-glow {
                animation: send-button-pulse 2s ease-in-out infinite;
              }
              @keyframes waveform {
                0%, 100% {
                  transform: scaleY(0.3);
                  opacity: 0.7;
                }
                50% {
                  transform: scaleY(1);
                  opacity: 1;
                }
              }
            `}} />
        </form>
    </div>
  );
};

export default MessageInput;