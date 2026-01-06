-- =====================================================
-- Translatr Database Schema for Supabase
-- =====================================================
-- This script creates all necessary tables, relationships,
-- indexes, and RLS policies for the Translatr application.
--
-- HOW TO USE:
-- 1. Open your Supabase project dashboard
-- 2. Go to SQL Editor
-- 3. Paste and run this entire script
-- 4. Create storage bucket via Dashboard:
--    - Go to Storage section
--    - Create bucket: "attachments" (public)
-- 5. Set up storage policies (see comments at bottom of file)
--
-- IMPORTANT: Make sure to enable Row Level Security (RLS)
-- in your Supabase project settings if not already enabled.
-- =====================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- 1. PROFILES TABLE
-- =====================================================
-- Stores user profile information linked to auth.users
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name TEXT,
    email TEXT, -- Denormalized from auth.users for easier queries
    bio TEXT,
    preferred_language TEXT NOT NULL DEFAULT 'en',
    theme TEXT NOT NULL DEFAULT 'aurora' CHECK (theme IN ('aurora', 'midnight')),
    status TEXT NOT NULL DEFAULT 'offline' CHECK (status IN ('online', 'offline', 'away', 'invisible')),
    plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro')),
    subscription_end_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for profiles
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_display_name ON profiles(display_name);
CREATE INDEX IF NOT EXISTS idx_profiles_status ON profiles(status);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 2. CONTACTS TABLE
-- =====================================================
-- Manages relationships between users (friends, pending requests, blocked)
CREATE TABLE IF NOT EXISTS contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    contact_id UUID NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'blocked')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, contact_id),
    CONSTRAINT contacts_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE,
    CONSTRAINT contacts_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES profiles(id) ON DELETE CASCADE
);

-- Indexes for contacts
CREATE INDEX IF NOT EXISTS idx_contacts_user_id ON contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_contact_id ON contacts(contact_id);
CREATE INDEX IF NOT EXISTS idx_contacts_status ON contacts(status);
CREATE INDEX IF NOT EXISTS idx_contacts_user_contact ON contacts(user_id, contact_id);

-- =====================================================
-- 3. ROOM_MEMBERS TABLE
-- =====================================================
-- Tracks which users are members of which chat rooms
CREATE TABLE IF NOT EXISTS room_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id TEXT NOT NULL,
    profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(room_id, profile_id)
);

-- Indexes for room_members
CREATE INDEX IF NOT EXISTS idx_room_members_room_id ON room_members(room_id);
CREATE INDEX IF NOT EXISTS idx_room_members_profile_id ON room_members(profile_id);
CREATE INDEX IF NOT EXISTS idx_room_members_room_profile ON room_members(room_id, profile_id);

-- =====================================================
-- 4. MESSAGES TABLE
-- =====================================================
-- Stores chat messages with translation data
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id TEXT NOT NULL,
    sender_id UUID NOT NULL,
    original_text TEXT NOT NULL,
    original_language TEXT NOT NULL DEFAULT 'en',
    translations JSONB DEFAULT '{}'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb, -- Stores: { iv, encrypted, attachment_meta }
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES profiles(id) ON DELETE CASCADE
);

-- Indexes for messages
CREATE INDEX IF NOT EXISTS idx_messages_room_id ON messages(room_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_room_created ON messages(room_id, created_at DESC);
-- Full-text search index for message content
CREATE INDEX IF NOT EXISTS idx_messages_original_text ON messages USING gin(to_tsvector('english', original_text));

-- =====================================================
-- 4.5. CALL RECORDS TABLE
-- =====================================================
-- Stores call history records in chatrooms
CREATE TABLE IF NOT EXISTS call_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id TEXT NOT NULL,
    caller_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    receiver_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    call_type TEXT NOT NULL CHECK (call_type IN ('audio', 'video')),
    status TEXT NOT NULL CHECK (status IN ('initiated', 'accepted', 'declined', 'missed', 'ended')),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    duration_seconds INTEGER, -- Duration in seconds (null if not accepted/ended)
    call_id TEXT, -- Optional: LiveKit call ID
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT call_records_caller_fkey FOREIGN KEY (caller_id) REFERENCES profiles(id) ON DELETE CASCADE,
    CONSTRAINT call_records_receiver_fkey FOREIGN KEY (receiver_id) REFERENCES profiles(id) ON DELETE SET NULL
);

-- Indexes for call_records
CREATE INDEX IF NOT EXISTS idx_call_records_room_id ON call_records(room_id);
CREATE INDEX IF NOT EXISTS idx_call_records_caller_id ON call_records(caller_id);
CREATE INDEX IF NOT EXISTS idx_call_records_receiver_id ON call_records(receiver_id);
CREATE INDEX IF NOT EXISTS idx_call_records_room_created ON call_records(room_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_records_call_id ON call_records(call_id) WHERE call_id IS NOT NULL;

-- RLS Policies for call_records
ALTER TABLE call_records ENABLE ROW LEVEL SECURITY;

-- Users can read call records for rooms they're in
DROP POLICY IF EXISTS "Users can read call records in their rooms" ON call_records;
CREATE POLICY "Users can read call records in their rooms"
    ON call_records FOR SELECT
    USING (
        public.is_room_member(call_records.room_id, auth.uid())
        OR caller_id = auth.uid()
        OR receiver_id = auth.uid()
    );

-- Service role can insert/update call records (via server actions)
-- Note: Server actions use service role, so they bypass RLS

-- =====================================================
-- 5. NOTIFICATIONS TABLE
-- =====================================================
-- Stores user notifications
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recipient_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('message', 'contact_request', 'system', 'call')),
    content JSONB NOT NULL DEFAULT '{}'::jsonb, -- Stores: { sender_name, preview }
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    read_at TIMESTAMPTZ, -- Timestamp when notification was marked as read
    related_id TEXT, -- Optional: room_id, contact_id, etc.
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add read_at column if it doesn't exist (for existing tables)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'notifications' AND column_name = 'read_at'
    ) THEN
        ALTER TABLE notifications ADD COLUMN read_at TIMESTAMPTZ;
    END IF;
END $$;

-- Indexes for notifications
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_id ON notifications(recipient_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_read ON notifications(recipient_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_read_at ON notifications(read_at) WHERE read_at IS NOT NULL;

-- Enable real-time replication for notifications table
-- This allows Supabase real-time subscriptions to work
-- Note: If table already exists in publication, this will error but can be ignored
DO $$ 
BEGIN
    -- Try to add table to publication, ignore if already exists
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE notifications';
EXCEPTION
    WHEN duplicate_object THEN
        -- Table already in publication, that's fine
        NULL;
    WHEN OTHERS THEN
        -- Other errors, log but don't fail
        RAISE NOTICE 'Could not add notifications to realtime publication: %', SQLERRM;
END $$;

-- Enable real-time replication for messages table
-- This allows real-time message subscriptions to work
DO $$ 
BEGIN
    -- Try to add table to publication, ignore if already exists
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE messages';
EXCEPTION
    WHEN duplicate_object THEN
        -- Table already in publication, that's fine
        NULL;
    WHEN OTHERS THEN
        -- Other errors, log but don't fail
        RAISE NOTICE 'Could not add messages to realtime publication: %', SQLERRM;
END $$;

-- =====================================================
-- 6. HIDDEN_MESSAGES TABLE
-- =====================================================
-- Tracks which messages are hidden for which users (per-user chat clearing)
CREATE TABLE IF NOT EXISTS hidden_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id TEXT NOT NULL,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    message_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(room_id, user_id, message_id)
);

-- Indexes for hidden_messages
CREATE INDEX IF NOT EXISTS idx_hidden_messages_room_id ON hidden_messages(room_id);
CREATE INDEX IF NOT EXISTS idx_hidden_messages_user_id ON hidden_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_hidden_messages_room_user ON hidden_messages(room_id, user_id);
CREATE INDEX IF NOT EXISTS idx_hidden_messages_message_id ON hidden_messages(message_id);

-- =====================================================
-- 6. ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE hidden_messages ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- PROFILES POLICIES
-- =====================================================

-- Users can read all profiles (for search, contacts, etc.)
DROP POLICY IF EXISTS "Users can read all profiles" ON profiles;
CREATE POLICY "Users can read all profiles"
    ON profiles FOR SELECT
    USING (true);

-- Users can only update their own profile
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile"
    ON profiles FOR UPDATE
    USING (auth.uid() = id);

-- Users can insert their own profile
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile"
    ON profiles FOR INSERT
    WITH CHECK (auth.uid() = id);

-- =====================================================
-- CONTACTS POLICIES
-- =====================================================

-- Users can read contacts where they are involved
DROP POLICY IF EXISTS "Users can read own contacts" ON contacts;
CREATE POLICY "Users can read own contacts"
    ON contacts FOR SELECT
    USING (auth.uid() = user_id OR auth.uid() = contact_id);

-- Users can create contact requests
DROP POLICY IF EXISTS "Users can create contact requests" ON contacts;
CREATE POLICY "Users can create contact requests"
    ON contacts FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can update contacts where they are involved
DROP POLICY IF EXISTS "Users can update own contacts" ON contacts;
CREATE POLICY "Users can update own contacts"
    ON contacts FOR UPDATE
    USING (auth.uid() = user_id OR auth.uid() = contact_id);

-- Users can delete contacts where they are involved
DROP POLICY IF EXISTS "Users can delete own contacts" ON contacts;
CREATE POLICY "Users can delete own contacts"
    ON contacts FOR DELETE
    USING (auth.uid() = user_id OR auth.uid() = contact_id);

-- =====================================================
-- ROOM_MEMBERS POLICIES
-- =====================================================

-- Helper: check if a user is a member of a room.
-- IMPORTANT: This must be SECURITY DEFINER to avoid infinite recursion when used in RLS,
-- because querying room_members inside a room_members policy otherwise re-triggers itself.
-- NOTE: Do NOT drop this function during migrations because RLS policies can depend on it.
CREATE OR REPLACE FUNCTION public.is_room_member(p_room_id TEXT, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.room_members rm
    WHERE rm.room_id = p_room_id
      AND rm.profile_id = p_user_id
  );
$$;

REVOKE ALL ON FUNCTION public.is_room_member(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_room_member(TEXT, UUID) TO authenticated;

-- Users can read room members for rooms they're in (uses SECURITY DEFINER helper to avoid recursion)
DROP POLICY IF EXISTS "Users can read room members" ON room_members;
CREATE POLICY "Users can read room members"
    ON room_members FOR SELECT
    USING (
        public.is_room_member(room_members.room_id, auth.uid())
    );

-- Users can insert themselves into rooms
DROP POLICY IF EXISTS "Users can insert themselves into rooms" ON room_members;
CREATE POLICY "Users can insert themselves into rooms"
    ON room_members FOR INSERT
    WITH CHECK (auth.uid() = profile_id);

-- Users can delete themselves from rooms
DROP POLICY IF EXISTS "Users can delete themselves from rooms" ON room_members;
CREATE POLICY "Users can delete themselves from rooms"
    ON room_members FOR DELETE
    USING (auth.uid() = profile_id);

-- =====================================================
-- MESSAGES POLICIES
-- =====================================================

-- Users can read messages from rooms they're members of
DROP POLICY IF EXISTS "Users can read messages in their rooms" ON messages;
CREATE POLICY "Users can read messages in their rooms"
    ON messages FOR SELECT
    USING (
        public.is_room_member(messages.room_id, auth.uid())
    );

-- Users can insert messages into rooms they're members of
DROP POLICY IF EXISTS "Users can insert messages in their rooms" ON messages;
CREATE POLICY "Users can insert messages in their rooms"
    ON messages FOR INSERT
    WITH CHECK (
        auth.uid() = sender_id
        AND public.is_room_member(messages.room_id, auth.uid())
    );

-- Users can update their own messages (for editing/deleting)
DROP POLICY IF EXISTS "Users can update own messages" ON messages;
CREATE POLICY "Users can update own messages"
    ON messages FOR UPDATE
    USING (auth.uid() = sender_id);

-- Users can delete their own messages
DROP POLICY IF EXISTS "Users can delete own messages" ON messages;
CREATE POLICY "Users can delete own messages"
    ON messages FOR DELETE
    USING (auth.uid() = sender_id);

-- =====================================================
-- NOTIFICATIONS POLICIES
-- =====================================================

-- Users can only read their own notifications
DROP POLICY IF EXISTS "Users can read own notifications" ON notifications;
CREATE POLICY "Users can read own notifications"
    ON notifications FOR SELECT
    USING (auth.uid() = recipient_id);

-- System can insert notifications (handled via service role)
-- For user-created notifications, we'll use a function
DROP POLICY IF EXISTS "Users can insert notifications for others" ON notifications;
CREATE POLICY "Users can insert notifications for others"
    ON notifications FOR INSERT
    WITH CHECK (true); -- Will be restricted by application logic

-- Users can update their own notifications (mark as read)
DROP POLICY IF EXISTS "Users can update own notifications" ON notifications;
CREATE POLICY "Users can update own notifications"
    ON notifications FOR UPDATE
    USING (auth.uid() = recipient_id);

-- Users can delete their own notifications
DROP POLICY IF EXISTS "Users can delete own notifications" ON notifications;
CREATE POLICY "Users can delete own notifications"
    ON notifications FOR DELETE
    USING (auth.uid() = recipient_id);

-- =====================================================
-- HIDDEN_MESSAGES POLICIES
-- =====================================================

-- Users can read their own hidden messages
DROP POLICY IF EXISTS "Users can read own hidden messages" ON hidden_messages;
CREATE POLICY "Users can read own hidden messages"
    ON hidden_messages FOR SELECT
    USING (auth.uid() = user_id);

-- Users can insert hidden messages for themselves
DROP POLICY IF EXISTS "Users can insert own hidden messages" ON hidden_messages;
CREATE POLICY "Users can insert own hidden messages"
    ON hidden_messages FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can delete their own hidden messages (to unhide)
DROP POLICY IF EXISTS "Users can delete own hidden messages" ON hidden_messages;
CREATE POLICY "Users can delete own hidden messages"
    ON hidden_messages FOR DELETE
    USING (auth.uid() = user_id);

-- =====================================================
-- 7. FUNCTIONS & TRIGGERS
-- =====================================================

-- Function to automatically create a profile when a user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, display_name)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile on user signup
-- Note: Creating triggers on auth.users requires superuser privileges
-- If you don't have permissions, you can set this up via Supabase Dashboard:
-- Dashboard > Database > Webhooks > New Webhook (on auth.users INSERT)
-- Or use Supabase Auth Hooks
DO $$ 
BEGIN
    -- Try to drop existing trigger if it exists
    DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
    
    -- Try to create the trigger
    EXECUTE 'CREATE TRIGGER on_auth_user_created
        AFTER INSERT ON auth.users
        FOR EACH ROW
        EXECUTE FUNCTION public.handle_new_user()';
EXCEPTION
    WHEN insufficient_privilege THEN
        RAISE NOTICE 'Cannot create trigger on auth.users - requires superuser privileges. Set up via Dashboard > Database > Webhooks instead.';
    WHEN OTHERS THEN
        RAISE NOTICE 'Could not create trigger on auth.users: %', SQLERRM;
END $$;

-- Function to create notification (can be called from server-side)
CREATE OR REPLACE FUNCTION public.create_notification(
    p_recipient_id UUID,
    p_type TEXT,
    p_content JSONB,
    p_related_id TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_notification_id UUID;
BEGIN
    INSERT INTO notifications (recipient_id, type, content, related_id)
    VALUES (p_recipient_id, p_type, p_content, p_related_id)
    RETURNING id INTO v_notification_id;
    
    RETURN v_notification_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to delete old read notifications (older than 7 days)
-- This follows standard practice: read notifications are kept for 7 days, then automatically deleted
CREATE OR REPLACE FUNCTION public.cleanup_old_read_notifications()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Delete read notifications that were read more than 7 days ago
    DELETE FROM notifications
    WHERE is_read = TRUE
      AND read_at IS NOT NULL
      AND read_at < NOW() - INTERVAL '7 days';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user is a member of a room (bypasses RLS for storage policies)
-- NOTE: Already defined above as SECURITY DEFINER `public.is_room_member(text, uuid)`.

-- =====================================================
-- 8. STORAGE BUCKETS & POLICIES
-- =====================================================
-- Note: Storage bucket needs to be created via Supabase Dashboard first:
-- 1. Go to Storage section
-- 2. Create bucket: "attachments" (public)
-- 
-- IMPORTANT: Storage policies require superuser permissions.
-- If you get permission errors, create them via Dashboard:
-- Storage > [bucket name] > Policies > New Policy
-- 
-- Note: RLS is already enabled on storage.objects by default in Supabase

-- =====================================================
-- STORAGE POLICIES - MUST BE CREATED VIA DASHBOARD
-- =====================================================
-- Storage policies CANNOT be created via SQL - they require owner/superuser privileges.
-- You MUST create them manually via the Supabase Dashboard.
-- 
-- Steps to create storage policies:
-- 1. Go to Storage > attachments bucket > Policies tab
-- 2. Click "New Policy" for each of the 3 policies below
-- 
-- Policy 1: "Users can upload attachments to their rooms"
--   Operation: INSERT
--   Policy: bucket_id = 'attachments' AND public.is_room_member((storage.foldername(name))[1], auth.uid())
-- 
-- Policy 2: "Users can read attachments from their rooms"
--   Operation: SELECT
--   Policy: bucket_id = 'attachments' AND public.is_room_member((storage.foldername(name))[1], auth.uid())
-- 
-- Policy 3: "Users can delete attachments from their rooms"
--   Operation: DELETE
--   Policy: bucket_id = 'attachments' AND public.is_room_member((storage.foldername(name))[1], auth.uid())
--
-- NOTE: The DO block below is commented out because it requires owner privileges.
-- Uncomment and run ONLY if you have superuser access.
/*
DO $$ 
BEGIN
    -- =====================================================
    -- ATTACHMENTS BUCKET POLICIES
    -- =====================================================
    
    -- Users can upload files to rooms they're members of
    DROP POLICY IF EXISTS "Users can upload attachments to their rooms" ON storage.objects;
    EXECUTE 'CREATE POLICY "Users can upload attachments to their rooms"
        ON storage.objects FOR INSERT
        WITH CHECK (
            bucket_id = ''attachments''
            AND public.is_room_member((storage.foldername(name))[1], auth.uid())
        )';
    
    -- Users can read/view attachments from rooms they're members of
    DROP POLICY IF EXISTS "Users can read attachments from their rooms" ON storage.objects;
    EXECUTE 'CREATE POLICY "Users can read attachments from their rooms"
        ON storage.objects FOR SELECT
        USING (
            bucket_id = ''attachments''
            AND public.is_room_member((storage.foldername(name))[1], auth.uid())
        )';
    
    -- Users can delete their own uploaded attachments
    DROP POLICY IF EXISTS "Users can delete attachments from their rooms" ON storage.objects;
    EXECUTE 'CREATE POLICY "Users can delete attachments from their rooms"
        ON storage.objects FOR DELETE
        USING (
            bucket_id = ''attachments''
            AND public.is_room_member((storage.foldername(name))[1], auth.uid())
        )';
    
        
EXCEPTION
    WHEN insufficient_privilege THEN
        RAISE NOTICE 'Cannot create storage policies - requires superuser privileges. Create them via Dashboard: Storage > [bucket] > Policies';
    WHEN OTHERS THEN
        RAISE NOTICE 'Could not create storage policies: %. Create them via Dashboard instead.', SQLERRM;
END $$;
*/

-- Allow authenticated users to upload attachments
-- CREATE POLICY "Users can upload attachments"
--     ON storage.objects FOR INSERT
--     WITH CHECK (
--         bucket_id = 'attachments' 
--         AND auth.role() = 'authenticated'
--     );

-- Allow authenticated users to read attachments
-- CREATE POLICY "Users can read attachments"
--     ON storage.objects FOR SELECT
--     USING (
--         bucket_id = 'attachments' 
--         AND auth.role() = 'authenticated'
--     );


-- =====================================================
-- 9. COMMENTS (Documentation)
-- =====================================================

COMMENT ON TABLE profiles IS 'User profiles linked to auth.users';
COMMENT ON TABLE contacts IS 'User relationships: friends, pending requests, blocked users';
COMMENT ON TABLE room_members IS 'Chat room membership tracking';
COMMENT ON TABLE messages IS 'Chat messages with translation support';
COMMENT ON TABLE notifications IS 'User notifications for messages, contact requests, etc.';
COMMENT ON TABLE hidden_messages IS 'Tracks messages hidden per-user (for per-user chat clearing)';

COMMENT ON COLUMN messages.translations IS 'JSONB object mapping language codes to translated text';
COMMENT ON COLUMN messages.metadata IS 'JSONB object containing encryption data (iv, encrypted) and attachment metadata';
COMMENT ON COLUMN notifications.content IS 'JSONB object containing notification content (sender_name, preview)';

-- =====================================================
-- END OF SCHEMA
-- =====================================================

