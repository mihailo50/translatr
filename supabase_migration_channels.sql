-- =====================================================
-- Migration: Dedicated Channels Table
-- =====================================================
-- This migration creates a dedicated channels table
-- for better organization and management of space channels.
--
-- HOW TO USE:
-- 1. Open your Supabase project dashboard
-- 2. Go to SQL Editor
-- 3. Paste and run this entire script
-- 4. Verify the migration was successful
--
-- IMPORTANT: This migration creates a new channels table.
-- Existing channels in the rooms table will need to be migrated
-- or you can keep using rooms table for backward compatibility.
-- =====================================================

-- =====================================================
-- 1. CHANNELS TABLE
-- =====================================================
-- Dedicated table for space channels (text and voice)
CREATE TABLE IF NOT EXISTS channels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    space_id UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('text', 'voice')),
    created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Ensure unique channel names within a space
    UNIQUE(space_id, name)
);

-- Indexes for channels
CREATE INDEX IF NOT EXISTS idx_channels_space_id ON channels(space_id);
CREATE INDEX IF NOT EXISTS idx_channels_type ON channels(type);
CREATE INDEX IF NOT EXISTS idx_channels_created_by ON channels(created_by);
CREATE INDEX IF NOT EXISTS idx_channels_created_at ON channels(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_channels_space_name ON channels(space_id, name);

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS update_channels_updated_at ON channels;
CREATE TRIGGER update_channels_updated_at
    BEFORE UPDATE ON channels
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 2. ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================

-- Enable RLS on channels table
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;

-- View: All members of the space can view channels
DROP POLICY IF EXISTS "Space members can view channels" ON channels;
CREATE POLICY "Space members can view channels"
    ON channels FOR SELECT
    USING (
        public.is_space_member(channels.space_id, auth.uid())
    );

-- Insert/Update/Delete: Only Space Admins (role 'admin' or 'owner') can perform these actions
DROP POLICY IF EXISTS "Space admins can create channels" ON channels;
CREATE POLICY "Space admins can create channels"
    ON channels FOR INSERT
    WITH CHECK (
        public.is_space_owner(channels.space_id, auth.uid())
        OR public.is_space_admin(channels.space_id, auth.uid())
    );

DROP POLICY IF EXISTS "Space admins can update channels" ON channels;
CREATE POLICY "Space admins can update channels"
    ON channels FOR UPDATE
    USING (
        public.is_space_owner(channels.space_id, auth.uid())
        OR public.is_space_admin(channels.space_id, auth.uid())
    );

DROP POLICY IF EXISTS "Space admins can delete channels" ON channels;
CREATE POLICY "Space admins can delete channels"
    ON channels FOR DELETE
    USING (
        public.is_space_owner(channels.space_id, auth.uid())
        OR public.is_space_admin(channels.space_id, auth.uid())
    );

-- =====================================================
-- 3. LINK CHANNELS TO ROOMS TABLE (Optional)
-- =====================================================
-- If you want to maintain backward compatibility with the rooms table,
-- you can add a channel_id column to rooms to link them.
-- For now, we'll keep channels as a separate table.

-- Add channel_id to rooms table for linking (optional)
ALTER TABLE rooms 
ADD COLUMN IF NOT EXISTS channel_id UUID REFERENCES channels(id) ON DELETE SET NULL;

-- Index for channel_id in rooms
CREATE INDEX IF NOT EXISTS idx_rooms_channel_id ON rooms(channel_id) WHERE channel_id IS NOT NULL;

-- =====================================================
-- 4. REAL-TIME REPLICATION (Optional)
-- =====================================================
-- Enable real-time for channels if needed

DO $$ 
BEGIN
    -- Try to add channels table to publication
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE channels';
EXCEPTION
    WHEN duplicate_object THEN
        NULL;
    WHEN OTHERS THEN
        RAISE NOTICE 'Could not add channels to realtime publication: %', SQLERRM;
END $$;

-- =====================================================
-- 5. COMMENTS (Documentation)
-- =====================================================

COMMENT ON TABLE channels IS 'Dedicated table for space channels (text and voice)';
COMMENT ON COLUMN channels.space_id IS 'The space this channel belongs to';
COMMENT ON COLUMN channels.type IS 'Channel type: text or voice';
COMMENT ON COLUMN channels.created_by IS 'User who created this channel';
COMMENT ON COLUMN rooms.channel_id IS 'Links room to a channel (for backward compatibility)';

-- =====================================================
-- END OF MIGRATION
-- =====================================================
-- 
-- NEXT STEPS:
-- 1. Update your application code to use the channels table
-- 2. Migrate existing channels from rooms table if needed
-- 3. Update server actions to use channels table
-- 4. Ensure messages table uses channel_id or room_id appropriately
--
-- NOTE: The rooms table can still be used for backward compatibility.
-- Messages can reference either room_id (for DMs/groups) or channel_id (for space channels).
-- =====================================================
