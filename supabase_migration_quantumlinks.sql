-- =====================================================
-- Migration: QuantumLinks (Pinned Chats)
-- =====================================================
-- This migration introduces the QuantumLinks feature
-- which allows users to pin/favorite their most important chats.
--
-- HOW TO USE:
-- 1. Open your Supabase project dashboard
-- 2. Go to SQL Editor
-- 3. Paste and run this entire script
-- 4. Verify the migration was successful
--
-- FEATURES:
-- - Users can pin/unpin chats (DMs, groups, channels)
-- - Pinned chats appear at the top of the conversation list
-- - Supports custom ordering (position field)
-- - Can pin spaces, rooms, or both
-- =====================================================

-- =====================================================
-- 1. QUANTUMLINKS TABLE
-- =====================================================
-- Stores pinned chats/rooms/spaces for each user
-- "QuantumLinks" are quick-access shortcuts to important conversations
CREATE TABLE IF NOT EXISTS quantumlinks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    room_id TEXT, -- Pinned room/chat (nullable if linking to space)
    space_id UUID, -- Pinned space (nullable if linking to room, references spaces.id if spaces table exists)
    position INTEGER NOT NULL DEFAULT 0, -- Order/position in pinned list (lower = higher priority)
    label TEXT, -- Custom label/name for the link (optional)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Ensure at least one of room_id or space_id is provided
    CONSTRAINT quantumlinks_has_target CHECK (
        (room_id IS NOT NULL) OR (space_id IS NOT NULL)
    ),
    -- Prevent duplicate pins (same user, same room/space)
    UNIQUE(user_id, room_id, space_id)
);

-- Add foreign key constraint to spaces table if it exists
-- This allows the migration to work even if spaces migration hasn't been run yet
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'spaces') THEN
        -- Add foreign key constraint if spaces table exists
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints 
            WHERE constraint_name = 'quantumlinks_space_id_fkey'
        ) THEN
            ALTER TABLE quantumlinks 
            ADD CONSTRAINT quantumlinks_space_id_fkey 
            FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE;
        END IF;
    END IF;
END $$;

-- Indexes for quantumlinks
CREATE INDEX IF NOT EXISTS idx_quantumlinks_user_id ON quantumlinks(user_id);
CREATE INDEX IF NOT EXISTS idx_quantumlinks_room_id ON quantumlinks(room_id) WHERE room_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_quantumlinks_space_id ON quantumlinks(space_id) WHERE space_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_quantumlinks_user_position ON quantumlinks(user_id, position ASC);
CREATE INDEX IF NOT EXISTS idx_quantumlinks_user_created ON quantumlinks(user_id, created_at DESC);

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS update_quantumlinks_updated_at ON quantumlinks;
CREATE TRIGGER update_quantumlinks_updated_at
    BEFORE UPDATE ON quantumlinks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 2. HELPER FUNCTIONS
-- =====================================================

-- Function to get the next position for a user's pinned items
-- This helps when adding a new pin (adds to end of list)
CREATE OR REPLACE FUNCTION public.get_next_quantumlink_position(p_user_id UUID)
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(MAX(position), -1) + 1
  FROM public.quantumlinks
  WHERE user_id = p_user_id;
$$;

REVOKE ALL ON FUNCTION public.get_next_quantumlink_position(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_next_quantumlink_position(UUID) TO authenticated;

-- Function to reorder quantumlinks after deletion
-- This ensures positions are sequential (0, 1, 2, 3...) after a pin is removed
CREATE OR REPLACE FUNCTION public.reorder_quantumlinks(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    link_record RECORD;
    new_position INTEGER := 0;
BEGIN
    -- Reorder all quantumlinks for the user
    FOR link_record IN
        SELECT id
        FROM public.quantumlinks
        WHERE user_id = p_user_id
        ORDER BY position ASC, created_at ASC
    LOOP
        UPDATE public.quantumlinks
        SET position = new_position
        WHERE id = link_record.id;
        
        new_position := new_position + 1;
    END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.reorder_quantumlinks(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reorder_quantumlinks(UUID) TO authenticated;

-- =====================================================
-- 3. ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================

-- Enable RLS on quantumlinks table
ALTER TABLE quantumlinks ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- QUANTUMLINKS POLICIES
-- =====================================================

-- Users can read their own quantumlinks
DROP POLICY IF EXISTS "Users can read own quantumlinks" ON quantumlinks;
CREATE POLICY "Users can read own quantumlinks"
    ON quantumlinks FOR SELECT
    USING (auth.uid() = user_id);

-- Users can create their own quantumlinks
DROP POLICY IF EXISTS "Users can create own quantumlinks" ON quantumlinks;
CREATE POLICY "Users can create own quantumlinks"
    ON quantumlinks FOR INSERT
    WITH CHECK (
        auth.uid() = user_id
        AND (
            -- If pinning a room, user must be a member
            (room_id IS NOT NULL AND public.is_room_member(room_id, auth.uid()))
            OR
            -- If pinning a space, user must be a member
            -- Note: If spaces table doesn't exist yet, this will error - run spaces migration first
            (space_id IS NOT NULL AND public.is_space_member(space_id, auth.uid()))
        )
    );

-- Users can update their own quantumlinks (for reordering, renaming)
DROP POLICY IF EXISTS "Users can update own quantumlinks" ON quantumlinks;
CREATE POLICY "Users can update own quantumlinks"
    ON quantumlinks FOR UPDATE
    USING (auth.uid() = user_id);

-- Users can delete their own quantumlinks
DROP POLICY IF EXISTS "Users can delete own quantumlinks" ON quantumlinks;
CREATE POLICY "Users can delete own quantumlinks"
    ON quantumlinks FOR DELETE
    USING (auth.uid() = user_id);

-- =====================================================
-- 4. TRIGGERS
-- =====================================================

-- Trigger to automatically reorder positions after deletion
-- This keeps positions sequential (0, 1, 2, 3...) without gaps
CREATE OR REPLACE FUNCTION public.quantumlinks_after_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Reorder remaining quantumlinks for this user
    PERFORM public.reorder_quantumlinks(OLD.user_id);
    RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS quantumlinks_reorder_after_delete ON quantumlinks;
CREATE TRIGGER quantumlinks_reorder_after_delete
    AFTER DELETE ON quantumlinks
    FOR EACH ROW
    EXECUTE FUNCTION public.quantumlinks_after_delete();

-- =====================================================
-- 5. REAL-TIME REPLICATION (Optional)
-- =====================================================
-- Enable real-time for quantumlinks so UI can update instantly

DO $$ 
BEGIN
    -- Try to add quantumlinks table to publication
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE quantumlinks';
EXCEPTION
    WHEN duplicate_object THEN
        NULL;
    WHEN OTHERS THEN
        RAISE NOTICE 'Could not add quantumlinks to realtime publication: %', SQLERRM;
END $$;

-- =====================================================
-- 6. COMMENTS (Documentation)
-- =====================================================

COMMENT ON TABLE quantumlinks IS 'QuantumLinks: User-pinned chats/rooms/spaces for quick access';
COMMENT ON COLUMN quantumlinks.room_id IS 'Pinned room/chat ID. NULL if linking to a space instead';
COMMENT ON COLUMN quantumlinks.space_id IS 'Pinned space ID. NULL if linking to a room instead';
COMMENT ON COLUMN quantumlinks.position IS 'Display order (0 = top, higher = lower). Lower numbers appear first';
COMMENT ON COLUMN quantumlinks.label IS 'Custom label/name for the pinned link (optional, defaults to room/space name)';

-- =====================================================
-- END OF MIGRATION
-- =====================================================
-- 
-- USAGE EXAMPLES:
--
-- 1. Pin a room/chat:
--    INSERT INTO quantumlinks (user_id, room_id, position)
--    VALUES (auth.uid(), 'direct_user1_user2', 0);
--
-- 2. Pin a space:
--    INSERT INTO quantumlinks (user_id, space_id, position)
--    VALUES (auth.uid(), 'space-uuid', 0);
--
-- 3. Get user's pinned items (ordered):
--    SELECT * FROM quantumlinks
--    WHERE user_id = auth.uid()
--    ORDER BY position ASC, created_at ASC;
--
-- 4. Reorder a pinned item:
--    UPDATE quantumlinks
--    SET position = 1
--    WHERE id = 'link-uuid' AND user_id = auth.uid();
--
-- 5. Unpin an item:
--    DELETE FROM quantumlinks
--    WHERE id = 'link-uuid' AND user_id = auth.uid();
--    -- Position reordering happens automatically via trigger
--
-- NEXT STEPS:
-- 1. Update TypeScript types to include QuantumLink interface
-- 2. Create server actions for pin/unpin operations
-- 3. Update UI to show pinned chats at the top
-- 4. Add drag-and-drop reordering (optional)
-- 5. Add custom label editing (optional)
-- =====================================================
