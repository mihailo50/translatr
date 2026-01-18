import React from 'react';
import { Phone, Video, PhoneOff, Clock } from 'lucide-react';

interface CallRecordBubbleProps {
  record: {
    id: string;
    caller_id: string;
    receiver_id: string | null;
    call_type: 'audio' | 'video';
    status: 'initiated' | 'accepted' | 'declined' | 'missed' | 'ended';
    started_at: string;
    ended_at: string | null;
    duration_seconds: number | null;
    created_at: string;
    caller?: {
      display_name?: string | null;
      email?: string | null;
    } | null;
    receiver?: {
      display_name?: string | null;
      email?: string | null;
    } | null;
  };
  currentUserId: string;
  isGroup?: boolean;
  roomName?: string;
  roomParticipants?: Array<{ id: string; name: string }>;
}

const CallRecordBubble: React.FC<CallRecordBubbleProps> = ({ 
  record, 
  currentUserId,
  isGroup = false,
  roomName,
  roomParticipants = []
}) => {
  const isCaller = record.caller_id === currentUserId;
  const isReceiver = record.receiver_id === currentUserId;
  
  // Determine the other person's name or group name
  let otherPersonName: string;
  
  if (isGroup || record.receiver_id === null) {
    // Group call - use room name or format participant names
    if (roomName && roomName !== 'Loading...' && roomName !== 'Unknown') {
      otherPersonName = roomName;
    } else if (roomParticipants.length > 0) {
      // Use participant names (excluding current user)
      const otherParticipants = roomParticipants.filter(p => p.id !== currentUserId);
      if (otherParticipants.length === 1) {
        otherPersonName = otherParticipants[0].name;
      } else if (otherParticipants.length > 1) {
        const names = otherParticipants.slice(0, 2).map(p => p.name).join(', ');
        otherPersonName = otherParticipants.length > 2 
          ? `${names} +${otherParticipants.length - 2}`
          : names;
      } else {
        otherPersonName = 'Group';
      }
    } else {
      otherPersonName = 'Group';
    }
  } else {
    // Direct call - use receiver/caller profile
    otherPersonName = isCaller 
      ? (record.receiver?.display_name || record.receiver?.email?.split('@')[0] || 'Unknown')
      : (record.caller?.display_name || record.caller?.email?.split('@')[0] || 'Unknown');
  }
  
  // Format duration
  const formatDuration = (seconds: number | null): string => {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins > 0) {
      return `${mins}m ${secs}s`;
    }
    return `${secs}s`;
  };
  
  // Get status text and icon
  const getStatusInfo = () => {
    if (record.status === 'accepted' && record.duration_seconds !== null) {
      return {
        text: `Call with ${otherPersonName} - ${formatDuration(record.duration_seconds)}`,
        icon: record.call_type === 'video' ? Video : Phone,
        color: 'text-green-400',
        bgColor: 'bg-green-500/10',
        borderColor: 'border-green-500/20'
      };
    } else if (record.status === 'declined') {
      if (isCaller) {
        return {
          text: `${otherPersonName} declined your ${record.call_type} call`,
          icon: PhoneOff,
          color: 'text-red-400',
          bgColor: 'bg-red-500/10',
          borderColor: 'border-red-500/20'
        };
      } else {
        return {
          text: `You declined ${otherPersonName}'s ${record.call_type} call`,
          icon: PhoneOff,
          color: 'text-red-400',
          bgColor: 'bg-red-500/10',
          borderColor: 'border-red-500/20'
        };
      }
    } else if (record.status === 'missed') {
      if (isCaller) {
        return {
          text: `Missed ${record.call_type} call to ${otherPersonName}`,
          icon: PhoneOff,
          color: 'text-yellow-400',
          bgColor: 'bg-yellow-500/10',
          borderColor: 'border-yellow-500/20'
        };
      } else {
        return {
          text: `Missed ${record.call_type} call from ${otherPersonName}`,
          icon: PhoneOff,
          color: 'text-yellow-400',
          bgColor: 'bg-yellow-500/10',
          borderColor: 'border-yellow-500/20'
        };
      }
    } else if (record.status === 'ended') {
      return {
        text: `Ended ${record.call_type} call with ${otherPersonName}${record.duration_seconds ? ` - ${formatDuration(record.duration_seconds)}` : ''}`,
        icon: PhoneOff,
        color: 'text-white/60',
        bgColor: 'bg-white/5',
        borderColor: 'border-white/10'
      };
    } else {
      // initiated
      if (isCaller) {
        return {
          text: `You called ${otherPersonName}`,
          icon: record.call_type === 'video' ? Video : Phone,
          color: 'text-indigo-400',
          bgColor: 'bg-indigo-500/10',
          borderColor: 'border-indigo-500/20'
        };
      } else {
        return {
          text: `${otherPersonName} called you`,
          icon: record.call_type === 'video' ? Video : Phone,
          color: 'text-indigo-400',
          bgColor: 'bg-indigo-500/10',
          borderColor: 'border-indigo-500/20'
        };
      }
    }
  };
  
  const statusInfo = getStatusInfo();
  const Icon = statusInfo.icon;
  
  // Format time
  const formatTime = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };
  
  return (
    <div className="flex justify-center my-4">
      <div className={`flex items-center gap-2 px-4 py-2 rounded-full ${statusInfo.bgColor} ${statusInfo.borderColor} border text-sm ${statusInfo.color}`}>
        <Icon size={14} className="shrink-0" />
        <span>{statusInfo.text}</span>
        <span className="text-white/40 text-xs ml-1">• {formatTime(record.created_at)}</span>
      </div>
    </div>
  );
};

export default CallRecordBubble;

