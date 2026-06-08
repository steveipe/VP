-- Create proposals storage bucket and set up RLS policies
-- This migration sets up the storage bucket for storing generated proposal PDFs

-- Create the proposals bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('proposals', 'proposals', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload their own proposals
CREATE POLICY "Users can upload their own proposals"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'proposals' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow authenticated users to read all proposals (public)
CREATE POLICY "Anyone can read proposals"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'proposals');

-- Allow authenticated users to list their own proposals
CREATE POLICY "Users can list their own proposals"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'proposals'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow authenticated users to delete their own proposals
CREATE POLICY "Users can delete their own proposals"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'proposals' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

