"use client";

import React, { useState, useTransition, useRef, useEffect } from "react";
import { X, Loader2, Sparkles, Globe, Lock, Upload } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { createSpace } from "../../actions/spaces";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import Image from "next/image";

interface CreateSpaceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CreateSpaceModal: React.FC<CreateSpaceModalProps> = ({ isOpen, onClose }) => {
  const [spaceName, setSpaceName] = useState("");
  const [spaceUrl, setSpaceUrl] = useState("");
  const [avatarColor, setAvatarColor] = useState("#6366f1"); // Default indigo
  const [avatarImage, setAvatarImage] = useState<string | null>(null);
  const [privacy, setPrivacy] = useState<"public" | "private">("public");
  const [isUrlManuallyEdited, setIsUrlManuallyEdited] = useState(false);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Auto-slugify space name to URL
  useEffect(() => {
    if (!isUrlManuallyEdited && spaceName) {
      const slug = spaceName
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      setSpaceUrl(slug);
    }
  }, [spaceName, isUrlManuallyEdited]);

  // Handle image upload
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error("Image size must be less than 5MB");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Handle drop zone
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error("Image size must be less than 5MB");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (!spaceName.trim() || spaceName.trim().length < 2) {
      toast.error("Space name must be at least 2 characters long");
      return;
    }

    startTransition(async () => {
      try {
        console.log("Submitting space creation form...", { spaceName: spaceName.trim() });
      const formData = new FormData();
      formData.append("name", spaceName.trim());
        // Use image if uploaded, otherwise use color
        // For base64 data URLs, we'll send them as-is (database accepts TEXT)
        // If the image is too large, we could upload to storage first, but for now we'll use base64
        formData.append("avatar_url", avatarImage || avatarColor);

        console.log("Calling createSpace server action...");
      const result = await createSpace(formData);
        console.log("createSpace result:", result);

      if (result.error) {
        toast.error(result.error);
          console.error("Space creation error:", result.error);
      } else if (result.spaceId) {
        toast.success("Orbit Established", {
          description: `Space "${spaceName}" has been created successfully`,
        });
        setSpaceName("");
          setSpaceUrl("");
        setAvatarColor("#6366f1");
          setAvatarImage(null);
          setPrivacy("public");
          setIsUrlManuallyEdited(false);
        onClose();
        router.refresh(); // Refresh to show the new space
        } else {
          // Fallback error if no error message but also no spaceId
          toast.error("Failed to create space. Please try again.");
          console.error("Space creation failed: No spaceId returned", result);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
        toast.error(`Failed to create space: ${errorMessage}`);
        console.error("Space creation exception:", error);
      }
    });
  };

  const handleClose = () => {
    if (!isPending) {
      setSpaceName("");
      setSpaceUrl("");
      setAvatarColor("#6366f1");
      setAvatarImage(null);
      setPrivacy("public");
      setIsUrlManuallyEdited(false);
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
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
            <div className="aurora-glass-premium w-full max-w-md rounded-3xl border border-white/10 backdrop-blur-2xl p-6 shadow-2xl relative overflow-hidden">
              {/* Close Button */}
              <button
                onClick={handleClose}
                disabled={isPending}
                className="absolute top-4 right-4 p-2 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition-colors disabled:opacity-50"
              >
                <X size={20} />
              </button>

              {/* Header */}
              <div className="mb-6">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-indigo-500/20 rounded-lg">
                    <Sparkles className="w-5 h-5 text-indigo-400" />
                  </div>
                  <h2 className="text-2xl font-bold text-white">Create Space</h2>
                </div>
                <p className="text-sm text-white/50">
                  Establish a new orbit for your team or community
                </p>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Space Icon Upload - Centered, Prominent */}
                <div className="flex flex-col items-center">
                  <label className="block text-xs font-medium text-white/60 mb-3 uppercase tracking-wider">
                    Space Icon
                  </label>
                  <div
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onClick={() => fileInputRef.current?.click()}
                    className={`w-24 h-24 rounded-full flex items-center justify-center cursor-pointer transition-all ${
                      avatarImage
                        ? "border-2 border-solid border-indigo-500/50 shadow-[0_0_20px_rgba(99,102,241,0.3)]"
                        : "border-2 border-dashed border-white/20 hover:border-white/30"
                    }`}
                    style={
                      avatarImage
                        ? {}
                        : { backgroundColor: avatarColor }
                    }
                  >
                    {avatarImage ? (
                      <div className="relative w-full h-full rounded-full overflow-hidden">
                        <Image
                          src={avatarImage}
                          alt="Space icon"
                          fill
                          className="object-cover"
                          unoptimized
                        />
                      </div>
                    ) : (
                      <Upload className="w-8 h-8 text-white/40" />
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                    disabled={isPending}
                  />
                  <p className="mt-2 text-xs text-white/40 text-center">
                    {avatarImage ? "Click to change" : "Click or drag to upload"}
                  </p>
                </div>

                {/* Space Name Input */}
                <div className="group">
                  <label className="block text-xs font-medium text-white/60 mb-1.5 ml-1 uppercase tracking-wider">
                    Space Name
                  </label>
                  <input
                    type="text"
                    value={spaceName}
                    onChange={(e) => setSpaceName(e.target.value)}
                    placeholder="Enter space name..."
                    disabled={isPending}
                    required
                    minLength={2}
                    className="w-full h-12 rounded-xl px-4 bg-black/20 border border-white/10 text-white placeholder:text-white/30 focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>

                {/* Space URL Input */}
                <div className="group">
                  <label className="block text-xs font-medium text-white/60 mb-1.5 ml-1 uppercase tracking-wider">
                    Space URL
                  </label>
                      <input
                    type="text"
                    value={spaceUrl}
                    onChange={(e) => {
                      setSpaceUrl(e.target.value);
                      setIsUrlManuallyEdited(true);
                    }}
                    placeholder="space-url"
                        disabled={isPending}
                    className="w-full h-12 rounded-xl px-4 bg-black/20 border border-white/10 text-white placeholder:text-white/30 focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  <p className="mt-1 text-xs text-white/40">
                    Auto-generated from space name
                  </p>
                </div>

                {/* Privacy Selectors - Glass Cards */}
                <div className="group">
                  <label className="block text-xs font-medium text-white/60 mb-3 ml-1 uppercase tracking-wider">
                    Privacy
                    </label>
                  <div className="grid grid-cols-2 gap-3">
                    {/* Public Card */}
                    <button
                      type="button"
                      onClick={() => setPrivacy("public")}
                        disabled={isPending}
                      className={`p-4 rounded-xl border transition-all flex flex-col items-center gap-2 ${
                        privacy === "public"
                          ? "bg-indigo-500/20 border-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.3)]"
                          : "bg-white/5 border-white/10 hover:bg-white/10"
                      }`}
                    >
                      <Globe className={`w-5 h-5 ${privacy === "public" ? "text-indigo-400" : "text-white/50"}`} />
                      <span className={`text-sm font-medium ${privacy === "public" ? "text-white" : "text-white/70"}`}>
                        Public
                      </span>
                      <span className={`text-xs ${privacy === "public" ? "text-white/60" : "text-white/40"}`}>
                        Anyone can join
                      </span>
                    </button>

                    {/* Private Card */}
                    <button
                      type="button"
                      onClick={() => setPrivacy("private")}
                      disabled={isPending}
                      className={`p-4 rounded-xl border transition-all flex flex-col items-center gap-2 ${
                        privacy === "private"
                          ? "bg-indigo-500/20 border-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.3)]"
                          : "bg-white/5 border-white/10 hover:bg-white/10"
                      }`}
                    >
                      <Lock className={`w-5 h-5 ${privacy === "private" ? "text-indigo-400" : "text-white/50"}`} />
                      <span className={`text-sm font-medium ${privacy === "private" ? "text-white" : "text-white/70"}`}>
                        Private
                      </span>
                      <span className={`text-xs ${privacy === "private" ? "text-white/60" : "text-white/40"}`}>
                        Invite only
                      </span>
                    </button>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={handleClose}
                    disabled={isPending}
                    className="aurora-glass-base flex-1 py-3 px-4 rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isPending || !spaceName.trim()}
                    className="flex-1 py-3 px-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:opacity-90 text-white font-semibold rounded-xl shadow-[0_0_20px_rgba(99,102,241,0.3)] transition-all transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-2"
                  >
                    {isPending ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        Create Space
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default CreateSpaceModal;
