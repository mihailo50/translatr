import React, { useState } from 'react';
import { X, User, Shield, CreditCard, Mail, Activity, Check } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useUserStatus, UserStatus } from '../../hooks/useUserStatus';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: any;
}

const STATUS_OPTIONS: { value: UserStatus; label: string; color: string }[] = [
    { value: 'online', label: 'Online', color: 'bg-green-500' },
    { value: 'busy', label: 'Busy', color: 'bg-red-500' },
    { value: 'dnd', label: 'Do Not Disturb', color: 'bg-red-500 border border-white/20' },
    { value: 'invisible', label: 'Invisible', color: 'bg-slate-500' },
];

const UserProfileModal: React.FC<UserProfileModalProps> = ({ isOpen, onClose, user }) => {
  const { theme } = useTheme();
  
  // Hook for handling real-time status update
  const { status, updateUserStatus } = useUserStatus({ id: user?.id || '' });
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);

  if (!isOpen) return null;

  return (
    <div 
        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
    >
      <div 
        className="glass-strong w-full max-w-md p-6 rounded-3xl border border-white/10 shadow-2xl relative overflow-hidden m-4"
        onClick={e => e.stopPropagation()}
      >
        <button 
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-colors"
        >
            <X size={20} />
        </button>

        {/* Header */}
        <div className="flex flex-col items-center mb-6">
            <div className="relative">
                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-aurora-indigo to-aurora-purple p-1 mb-4 shadow-lg shadow-aurora-indigo/20">
                    <div className="w-full h-full rounded-full bg-slate-900 overflow-hidden relative flex items-center justify-center">
                        <div className="text-4xl font-bold text-white">
                            {user?.name?.[0]?.toUpperCase() || 'U'}
                        </div>
                    </div>
                </div>
                {/* Status Indicator / Selector Trigger */}
                <button 
                    onClick={() => setIsStatusDropdownOpen(!isStatusDropdownOpen)}
                    className="absolute bottom-4 right-0 bg-slate-900 rounded-full p-1 border border-white/10 hover:scale-110 transition-transform cursor-pointer"
                >
                     <div className={`w-5 h-5 rounded-full ${STATUS_OPTIONS.find(o => o.value === status)?.color || 'bg-green-500'}`}></div>
                </button>
                
                {/* Status Dropdown */}
                {isStatusDropdownOpen && (
                    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-48 rounded-2xl border border-white/10 overflow-hidden z-20 shadow-[0_20px_40px_rgba(0,0,0,0.6)] animate-in fade-in zoom-in-95 duration-200 bg-[#050510]/95 backdrop-blur-2xl">
                        <div className="p-1.5">
                        {STATUS_OPTIONS.map((opt) => (
                            <button
                                key={opt.value}
                                onClick={() => { updateUserStatus(opt.value); setIsStatusDropdownOpen(false); }}
                                    className={`w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-3 transition-all duration-200 ${
                                        status === opt.value 
                                            ? 'bg-white/5 text-white' 
                                            : 'text-white/80 hover:text-white hover:bg-white/10'
                                    }`}
                            >
                                <div className={`w-3 h-3 rounded-full ${opt.color}`}></div>
                                    <span className="text-sm font-medium flex-1">{opt.label}</span>
                                    {status === opt.value && <Check size={14} className="text-white" />}
                            </button>
                        ))}
                        </div>
                    </div>
                )}
            </div>

            <h2 className="text-2xl font-bold text-white mb-1">{user?.name}</h2>
            <p className="text-white/50">{user?.email}</p>
            <div className="mt-3 px-3 py-1 rounded-full bg-aurora-indigo/10 border border-aurora-indigo/20 text-aurora-indigo text-xs font-semibold uppercase tracking-wider">
                {user?.plan || 'Pro Plan'}
            </div>
        </div>

        {/* Details List */}
        <div className="space-y-3">
            <div className="p-3 rounded-xl bg-white/5 border border-white/5 flex items-center gap-3">
                <User size={18} className="text-white/40" />
                <div className="flex-1">
                    <p className="text-xs text-white/40 uppercase">Full Name</p>
                    <p className="text-sm text-white font-medium">{user?.name}</p>
                </div>
            </div>

            <div className="p-3 rounded-xl bg-white/5 border border-white/5 flex items-center gap-3">
                <Activity size={18} className="text-white/40" />
                <div className="flex-1">
                    <p className="text-xs text-white/40 uppercase">Current Status</p>
                    <p className="text-sm text-white font-medium capitalize">{STATUS_OPTIONS.find(o => o.value === status)?.label || 'Online'}</p>
                </div>
            </div>

            <div className="p-3 rounded-xl bg-white/5 border border-white/5 flex items-center gap-3">
                <Shield size={18} className="text-white/40" />
                <div className="flex-1">
                    <p className="text-xs text-white/40 uppercase">Account Status</p>
                    <p className="text-sm text-green-400 font-medium flex items-center gap-1">
                        Active <span className="w-1.5 h-1.5 rounded-full bg-green-500 ml-1"></span>
                    </p>
                </div>
            </div>
        </div>

        <div className="mt-6 pt-6 border-t border-white/10 flex justify-between items-center">
            <button className="text-sm text-white/50 hover:text-white transition-colors">
                Manage Subscription
            </button>
            <button 
                onClick={onClose}
                className="px-6 py-2 rounded-xl bg-white text-slate-900 font-semibold hover:bg-gray-200 transition-colors"
            >
                Close
            </button>
        </div>

      </div>
    </div>
  );
};

export default UserProfileModal;