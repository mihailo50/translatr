-- =====================================================
-- SPACE INVITATIONS TABLE
-- =====================================================
-- Tracks space invitations sent to users
-- Invitations expire after 7 days
CREATE TABLE IF NOT EXISTS space_invitations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    space_id UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
    inviter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    invitee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled', 'expired')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
    accepted_at TIMESTAMPTZ,
    declined_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    UNIQUE(space_id, invitee_id, status) -- Prevent duplicate pending invitations
);

-- Indexes for space_invitations
CREATE INDEX IF NOT EXISTS idx_space_invitations_space_id ON space_invitations(space_id);
CREATE INDEX IF NOT EXISTS idx_space_invitations_inviter_id ON space_invitations(inviter_id);
CREATE INDEX IF NOT EXISTS idx_space_invitations_invitee_id ON space_invitations(invitee_id);
CREATE INDEX IF NOT EXISTS idx_space_invitations_status ON space_invitations(status);
CREATE INDEX IF NOT EXISTS idx_space_invitations_expires_at ON space_invitations(expires_at);
CREATE INDEX IF NOT EXISTS idx_space_invitations_space_invitee_status ON space_invitations(space_id, invitee_id, status);

-- Function to automatically expire old invitations
CREATE OR REPLACE FUNCTION public.expire_old_invitations()
RETURNS INTEGER AS $$
DECLARE
    expired_count INTEGER;
BEGIN
    UPDATE space_invitations
    SET status = 'expired'
    WHERE status = 'pending'
      AND expires_at < NOW();
    
    GET DIAGNOSTICS expired_count = ROW_COUNT;
    RETURN expired_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enable RLS
ALTER TABLE space_invitations ENABLE ROW LEVEL SECURITY;

-- RLS Policies for space_invitations
-- Users can read invitations they sent or received
DROP POLICY IF EXISTS "Users can read their invitations" ON space_invitations;
CREATE POLICY "Users can read their invitations"
    ON space_invitations FOR SELECT
    USING (
        inviter_id = auth.uid()
        OR invitee_id = auth.uid()
    );

-- Space admins can create invitations
DROP POLICY IF EXISTS "Space admins can create invitations" ON space_invitations;
CREATE POLICY "Space admins can create invitations"
    ON space_invitations FOR INSERT
    WITH CHECK (
        public.is_space_admin(space_id, auth.uid())
        OR public.is_space_owner(space_id, auth.uid())
    );

-- Invitees can update their own invitations (accept/decline)
DROP POLICY IF EXISTS "Invitees can update their invitations" ON space_invitations;
CREATE POLICY "Invitees can update their invitations"
    ON space_invitations FOR UPDATE
    USING (invitee_id = auth.uid());

-- Inviters and space admins can cancel invitations
DROP POLICY IF EXISTS "Inviters and admins can cancel invitations" ON space_invitations;
CREATE POLICY "Inviters and admins can cancel invitations"
    ON space_invitations FOR UPDATE
    USING (
        inviter_id = auth.uid()
        OR public.is_space_admin(space_id, auth.uid())
        OR public.is_space_owner(space_id, auth.uid())
    );

-- Update notifications table to include space_invite type
DO $$
BEGIN
    -- Check if space_invite is already in the check constraint
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.check_constraints 
        WHERE constraint_name = 'notifications_type_check' 
        AND check_clause LIKE '%space_invite%'
    ) THEN
        -- Drop existing constraint
        ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
        
        -- Add new constraint with space_invite
        ALTER TABLE notifications ADD CONSTRAINT notifications_type_check 
            CHECK (type IN ('message', 'contact_request', 'system', 'call', 'space_invite'));
    END IF;
END $$;

-- Enable real-time for space_invitations
DO $$ 
BEGIN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE space_invitations';
EXCEPTION
    WHEN duplicate_object THEN
        NULL;
    WHEN OTHERS THEN
        RAISE NOTICE 'Could not add space_invitations to realtime publication: %', SQLERRM;
END $$;

COMMENT ON TABLE space_invitations IS 'Space invitations with 7-day expiration';
COMMENT ON COLUMN space_invitations.expires_at IS 'Invitation expires 7 days after creation';
COMMENT ON COLUMN space_invitations.status IS 'pending, accepted, declined, cancelled, or expired';
