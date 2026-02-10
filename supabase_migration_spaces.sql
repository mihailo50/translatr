-- =====================================================
-- Migration: Super-Groups (Spaces) Architecture
-- =====================================================
-- This migration introduces the hierarchical "Spaces" concept
-- to support community/work/friends groups with channels.
--
-- HOW TO USE:
-- 1. Open your Supabase project dashboard
-- 2. Go to SQL Editor
-- 3. Paste and run this entire script
-- 4. Verify the migration was successful
--
-- IMPORTANT: This is a backward-compatible migration.
-- Existing DMs and legacy groups will continue to work
-- (they will have space_id = NULL).
-- =====================================================

-- =====================================================
-- 1. SPACES TABLE
-- =====================================================
-- Represents a "Super-Group" or "Space" (formerly called "Nebula")
-- Can be a community, work space, or friends group
CREATE TABLE IF NOT EXISTS spaces (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    avatar_url TEXT,
    type TEXT NOT NULL DEFAULT 'community' CHECK (type IN ('community', 'work', 'friends')),
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for spaces
CREATE INDEX IF NOT EXISTS idx_spaces_owner_id ON spaces(owner_id);
CREATE INDEX IF NOT EXISTS idx_spaces_type ON spaces(type);
CREATE INDEX IF NOT EXISTS idx_spaces_created_at ON spaces(created_at DESC);

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS update_spaces_updated_at ON spaces;
CREATE TRIGGER update_spaces_updated_at
    BEFORE UPDATE ON spaces
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 2. SPACE_MEMBERS TABLE
-- =====================================================
-- Tracks membership in spaces with role-based permissions
-- This solves the Admin Role requirement
CREATE TABLE IF NOT EXISTS space_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    space_id UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'moderator', 'member')),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(space_id, user_id)
);

-- Indexes for space_members
CREATE INDEX IF NOT EXISTS idx_space_members_space_id ON space_members(space_id);
CREATE INDEX IF NOT EXISTS idx_space_members_user_id ON space_members(user_id);
CREATE INDEX IF NOT EXISTS idx_space_members_role ON space_members(role);
CREATE INDEX IF NOT EXISTS idx_space_members_space_user ON space_members(space_id, user_id);

-- =====================================================
-- 3. ADD AVATAR_URL TO PROFILES (if not exists)
-- =====================================================
-- Ensure profiles table has avatar_url for user profile pictures
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- =====================================================
-- 4. CREATE ROOMS TABLE (for group metadata)
-- =====================================================
-- Store room metadata including avatar_url for groups
-- This allows groups to have custom avatars
CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY, -- room_id (e.g., "direct_user1_user2" or "group_uuid")
    name TEXT,
    avatar_url TEXT, -- Group/room avatar image
    room_type TEXT NOT NULL DEFAULT 'direct' CHECK (room_type IN ('direct', 'group', 'channel')),
    space_id UUID REFERENCES spaces(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for rooms
CREATE INDEX IF NOT EXISTS idx_rooms_space_id ON rooms(space_id) WHERE space_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rooms_room_type ON rooms(room_type);
CREATE INDEX IF NOT EXISTS idx_rooms_created_at ON rooms(created_at DESC);

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS update_rooms_updated_at ON rooms;
CREATE TRIGGER update_rooms_updated_at
    BEFORE UPDATE ON rooms
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 5. UPDATE MESSAGES TABLE
-- =====================================================
-- Add space_id to messages table to link messages to spaces
-- If space_id is NULL, it's a DM or legacy group (backward compatible)
-- If space_id exists, the message belongs to a channel within that space
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS space_id UUID REFERENCES spaces(id) ON DELETE SET NULL;

-- Index for space_id in messages
CREATE INDEX IF NOT EXISTS idx_messages_space_id ON messages(space_id) WHERE space_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_space_room ON messages(space_id, room_id) WHERE space_id IS NOT NULL;

-- =====================================================
-- 6. UPDATE ROOM_MEMBERS TABLE (Optional Enhancement)
-- =====================================================
-- Add space_id to room_members for easier querying
-- This allows us to quickly find all rooms in a space
-- Note: This is optional - we can also query via messages.space_id
ALTER TABLE room_members 
ADD COLUMN IF NOT EXISTS space_id UUID REFERENCES spaces(id) ON DELETE SET NULL;

-- Index for space_id in room_members
CREATE INDEX IF NOT EXISTS idx_room_members_space_id ON room_members(space_id) WHERE space_id IS NOT NULL;

-- =====================================================
-- 7. ROOMS ROW LEVEL SECURITY (RLS)
-- =====================================================

-- Enable RLS on rooms table
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;

-- Users can read rooms they're members of
DROP POLICY IF EXISTS "Users can read rooms they're in" ON rooms;
CREATE POLICY "Users can read rooms they're in"
    ON rooms FOR SELECT
    USING (
        public.is_room_member(rooms.id, auth.uid())
        OR rooms.space_id IS NOT NULL AND public.is_space_member(rooms.space_id, auth.uid())
    );

-- Users can create/update rooms they're members of (for group metadata)
DROP POLICY IF EXISTS "Users can update rooms they're in" ON rooms;
CREATE POLICY "Users can update rooms they're in"
    ON rooms FOR UPDATE
    USING (
        public.is_room_member(rooms.id, auth.uid())
        OR rooms.space_id IS NOT NULL AND (
            public.is_space_owner(rooms.space_id, auth.uid())
            OR public.is_space_admin(rooms.space_id, auth.uid())
        )
    );

-- Users can insert rooms (when creating groups)
DROP POLICY IF EXISTS "Users can create rooms" ON rooms;
CREATE POLICY "Users can create rooms"
    ON rooms FOR INSERT
    WITH CHECK (true); -- Will be restricted by application logic

-- =====================================================
-- 8. HELPER FUNCTIONS
-- =====================================================

-- Function to check if user is a member of a space
CREATE OR REPLACE FUNCTION public.is_space_member(p_space_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.space_members sm
    WHERE sm.space_id = p_space_id
      AND sm.user_id = p_user_id
  );
$$;

REVOKE ALL ON FUNCTION public.is_space_member(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_space_member(UUID, UUID) TO authenticated;

-- Function to check if user has admin role in a space
CREATE OR REPLACE FUNCTION public.is_space_admin(p_space_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.space_members sm
    WHERE sm.space_id = p_space_id
      AND sm.user_id = p_user_id
      AND sm.role = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION public.is_space_admin(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_space_admin(UUID, UUID) TO authenticated;

-- Function to check if user is space owner
CREATE OR REPLACE FUNCTION public.is_space_owner(p_space_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.spaces s
    WHERE s.id = p_space_id
      AND s.owner_id = p_user_id
  );
$$;

REVOKE ALL ON FUNCTION public.is_space_owner(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_space_owner(UUID, UUID) TO authenticated;

-- =====================================================
-- 9. ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================

-- Enable RLS on new tables
ALTER TABLE spaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE space_members ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- SPACES POLICIES
-- =====================================================

-- Users can read all spaces (for discovery)
DROP POLICY IF EXISTS "Users can read all spaces" ON spaces;
CREATE POLICY "Users can read all spaces"
    ON spaces FOR SELECT
    USING (true);

-- Space owners can update their spaces
DROP POLICY IF EXISTS "Space owners can update their spaces" ON spaces;
CREATE POLICY "Space owners can update their spaces"
    ON spaces FOR UPDATE
    USING (auth.uid() = owner_id);

-- Users can create spaces
DROP POLICY IF EXISTS "Users can create spaces" ON spaces;
CREATE POLICY "Users can create spaces"
    ON spaces FOR INSERT
    WITH CHECK (auth.uid() = owner_id);

-- Space owners and admins can delete spaces
DROP POLICY IF EXISTS "Space owners and admins can delete spaces" ON spaces;
CREATE POLICY "Space owners and admins can delete spaces"
    ON spaces FOR DELETE
    USING (
        auth.uid() = owner_id
        OR public.is_space_admin(spaces.id, auth.uid())
    );

-- =====================================================
-- SPACE_MEMBERS POLICIES
-- =====================================================

-- Users can read space members for spaces they're in
DROP POLICY IF EXISTS "Users can read space members" ON space_members;
CREATE POLICY "Users can read space members"
    ON space_members FOR SELECT
    USING (
        public.is_space_member(space_members.space_id, auth.uid())
    );

-- Space owners and admins can add members
DROP POLICY IF EXISTS "Space owners and admins can add members" ON space_members;
CREATE POLICY "Space owners and admins can add members"
    ON space_members FOR INSERT
    WITH CHECK (
        public.is_space_owner(space_members.space_id, auth.uid())
        OR public.is_space_admin(space_members.space_id, auth.uid())
    );

-- Space owners and admins can update member roles
DROP POLICY IF EXISTS "Space owners and admins can update member roles" ON space_members;
CREATE POLICY "Space owners and admins can update member roles"
    ON space_members FOR UPDATE
    USING (
        public.is_space_owner(space_members.space_id, auth.uid())
        OR public.is_space_admin(space_members.space_id, auth.uid())
    );

-- Space owners, admins, and users themselves can remove members
DROP POLICY IF EXISTS "Users can remove space members" ON space_members;
CREATE POLICY "Users can remove space members"
    ON space_members FOR DELETE
    USING (
        auth.uid() = user_id
        OR public.is_space_owner(space_members.space_id, auth.uid())
        OR public.is_space_admin(space_members.space_id, auth.uid())
    );

-- =====================================================
-- 10. UPDATE EXISTING MESSAGE POLICIES (Optional)
-- =====================================================
-- If you want to add space-based permissions to messages,
-- you can extend the existing message policies to check space membership
-- For now, we'll keep the existing room-based policies for backward compatibility

-- =====================================================
-- 11. COMMENTS (Documentation)
-- =====================================================

COMMENT ON TABLE spaces IS 'Super-Groups (Spaces): Hierarchical containers for channels and conversations';
COMMENT ON TABLE space_members IS 'Space membership with role-based permissions (admin, moderator, member)';
COMMENT ON TABLE rooms IS 'Room metadata including name and avatar_url for groups/channels';
COMMENT ON COLUMN profiles.avatar_url IS 'User profile picture URL';
COMMENT ON COLUMN spaces.avatar_url IS 'Space/Super-Group avatar image URL';
COMMENT ON COLUMN rooms.avatar_url IS 'Group/Channel avatar image URL';
COMMENT ON COLUMN messages.space_id IS 'Links message to a space. NULL = DM or legacy group (backward compatible)';
COMMENT ON COLUMN room_members.space_id IS 'Links room to a space. NULL = DM or legacy group (backward compatible)';

-- =====================================================
-- 12. REAL-TIME REPLICATION (Optional)
-- =====================================================
-- Enable real-time for spaces and space_members if needed

DO $$ 
BEGIN
    -- Try to add spaces table to publication
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE spaces';
EXCEPTION
    WHEN duplicate_object THEN
        NULL;
    WHEN OTHERS THEN
        RAISE NOTICE 'Could not add spaces to realtime publication: %', SQLERRM;
END $$;

DO $$ 
BEGIN
    -- Try to add space_members table to publication
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE space_members';
EXCEPTION
    WHEN duplicate_object THEN
        NULL;
    WHEN OTHERS THEN
        RAISE NOTICE 'Could not add space_members to realtime publication: %', SQLERRM;
END $$;

-- =====================================================
-- END OF MIGRATION
-- =====================================================
-- 
-- NEXT STEPS:
-- 1. Test the migration in a development environment
-- 2. Update your application code to:
--    - Create spaces when users create "Super-Groups"
--    - Link conversations/channels to spaces via space_id
--    - Use space_members for role-based permissions
-- 3. Migrate existing groups to spaces (if needed)
-- 4. Update UI to show spaces hierarchy
--
-- BACKWARD COMPATIBILITY:
-- - All existing DMs and groups will have space_id = NULL
-- - They will continue to work exactly as before
-- - New spaces can be created alongside existing conversations
-- =====================================================
