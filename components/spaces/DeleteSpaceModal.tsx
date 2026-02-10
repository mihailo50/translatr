"use client";

import React, { useState, useEffect } from "react";
import { X, Shield } from "lucide-react";
import { toast } from "sonner";

interface DeleteSpaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  spaceName: string;
}

export default function DeleteSpaceModal({
  isOpen,
  onClose,
  onConfirm,
  spaceName,
}: DeleteSpaceModalProps) {
  const [confirmationText, setConfirmationText] = useState("");
  const [isConfirmed, setIsConfirmed] = useState(false);

  useEffect(() => {
    setIsConfirmed(confirmationText === spaceName);
  }, [confirmationText, spaceName]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (isConfirmed) {
      onConfirm();
      onClose();
    } else {
      toast.error("The confirmation text does not match the space name.");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="aurora-glass-deep rounded-3xl w-full max-w-md flex flex-col shadow-[0_0_50px_-10px_rgba(220,38,38,0.2)]">
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-500/10 rounded-lg">
              <Shield className="w-6 h-6 text-red-500" />
            </div>
            <h2 className="text-xl font-bold text-white">Delete Space</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>
        <div className="p-6">
          <p className="text-sm text-red-200/80 mb-4">
            This action cannot be undone. This will permanently delete the{" "}
            <span className="font-bold text-white">{spaceName}</span> space, including all channels and messages.
          </p>
          <p className="text-sm text-red-200/80 mb-4">
            Please type <span className="font-bold text-white">{spaceName}</span> to confirm.
          </p>
          <input
            type="text"
            value={confirmationText}
            onChange={(e) => setConfirmationText(e.target.value)}
            className="aurora-input w-full rounded-lg px-3 py-2.5 focus:border-red-500/50 focus:ring-red-500/20"
          />
          <button
            onClick={handleConfirm}
            disabled={!isConfirmed}
            className="w-full mt-4 px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white font-semibold rounded-lg shadow-[0_0_20px_rgba(220,38,38,0.4)] transition-colors disabled:bg-gray-500 disabled:cursor-not-allowed disabled:shadow-none"
          >
            Delete Space
          </button>
        </div>
      </div>
    </div>
  );
}
