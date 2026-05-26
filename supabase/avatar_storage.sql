-- ============================================================
-- AfyaWork — Profile Picture Storage
-- Run in Supabase SQL Editor
-- ============================================================

-- ── Add avatar_url to public.users ──

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- ── Create the avatars storage bucket (public reads) ──

INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- ── Storage RLS policies ──

DROP POLICY IF EXISTS "Avatar images are publicly accessible"   ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own avatar"       ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own avatar"       ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own avatar"       ON storage.objects;

-- Public read (bucket is public, but explicit policy is good practice)
CREATE POLICY "Avatar images are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

-- Only upload to your own folder  (path format: {user_id}/avatar.{ext})
CREATE POLICY "Users can upload their own avatar"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars' AND
    name LIKE auth.uid()::text || '/%'
  );

CREATE POLICY "Users can update their own avatar"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars' AND
    name LIKE auth.uid()::text || '/%'
  );

CREATE POLICY "Users can delete their own avatar"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'avatars' AND
    name LIKE auth.uid()::text || '/%'
  );
