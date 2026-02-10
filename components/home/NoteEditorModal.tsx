"use client";

import React, { useState, useEffect } from 'react';
import { X, Save, FileText } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface NoteEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const NoteEditorModal: React.FC<NoteEditorModalProps> = ({ isOpen, onClose }) => {
  const [noteContent, setNoteContent] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);

  // Load note from localStorage on mount
  useEffect(() => {
    if (isOpen) {
      const savedNote = localStorage.getItem('user_note');
      if (savedNote) {
        setNoteContent(savedNote);
      }
    }
  }, [isOpen]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Save to localStorage (can be extended to save to database)
      localStorage.setItem('user_note', noteContent);
      // Simulate save delay
      await new Promise(resolve => setTimeout(resolve, 300));
      setIsSaving(false);
      onClose();
    } catch (error) {
      console.error('Failed to save note:', error);
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          />
          
          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="aurora-glass-deep rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-white/5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center">
                    <FileText className="w-5 h-5 text-indigo-400" />
                  </div>
                  <h2 className="text-xl font-display font-bold text-white">Notes</h2>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 rounded-lg hover:bg-white/10 transition-colors text-white/60 hover:text-white"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-hidden flex flex-col">
                <textarea
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  placeholder="Write your notes here..."
                  className="flex-1 w-full p-6 bg-transparent text-slate-200 placeholder-slate-500 resize-none focus:outline-none font-mono text-sm"
                  autoFocus
                />
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 p-6 border-t border-white/5">
                <button
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-semibold hover:from-indigo-600 hover:to-purple-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isSaving ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save size={16} />
                      Save
                    </>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default NoteEditorModal;
