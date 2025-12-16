import React from 'react';
import { createClient } from '../../../utils/supabase/server';
import ChatRoom, { RoomDetails } from '../../../components/chat/ChatRoom';
import { redirect } from 'next/navigation';

// Mocking the Django API /api/v1/rooms/{id}/
async function getRoomDetails(roomId: string): Promise<RoomDetails> {
    // In a real implementation:
    // const res = await fetch(`${process.env.API_URL}/rooms/${roomId}`);
    // return res.json();
    
    // Simulating response based on ID patterns
    const isGroup = roomId.startsWith('group') || roomId.includes('project');
    
    if (isGroup) {
        return {
            id: roomId,
            room_type: 'group',
            name: 'Project Alpha Team',
            members_count: 5,
            participants: [
                { id: '1', name: 'Sarah', avatar: 'https://picsum.photos/seed/sarah/50/50', status: 'online' },
                { id: '2', name: 'Mike', avatar: 'https://picsum.photos/seed/mike/50/50', status: 'offline' },
                { id: '3', name: 'Jessica', avatar: 'https://picsum.photos/seed/jessica/50/50', status: 'online' },
            ]
        };
    }

    return {
        id: roomId,
        room_type: 'direct',
        name: 'Alex Morgan',
        members_count: 2,
        participants: [
             { id: 'other-user', name: 'Alex Morgan', avatar: 'https://picsum.photos/seed/alex/50/50', status: 'online' }
        ]
    };
}

export default async function ChatRoomPage({ params }: { params: { roomId: string } }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/login');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  const roomDetails = await getRoomDetails(params.roomId);

  return (
    <div className="h-full w-full">
      <ChatRoom 
        roomId={params.roomId}
        roomDetails={roomDetails}
        userId={user.id}
        userName={profile?.display_name || user.email?.split('@')[0] || 'Unknown'}
        userPreferredLanguage={profile?.preferred_language || 'en'}
      />
    </div>
  );
}