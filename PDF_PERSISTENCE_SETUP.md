# PDF Persistence Implementation - Setup Guide

## Overview
When users submit a proposal, the system now:
1. Generates the PDF from the proposal content
2. Uploads it to Supabase storage (`proposals` bucket)
3. Stores the file URL in the proposals database table
4. Allows users to view/download the PDF from their profile

## Changes Made

### Frontend Changes

#### 1. `frontend/src/app/apply/page.tsx`
- Added `generatePdfBlob()` helper function
  - Generates PDF from proposal using existing backend job system
  - Returns PDF as a Blob for uploading
  
- Enhanced `handleSubmit()` to:
  - Generate PDF blob
  - Upload to Supabase storage: `proposals/{userId}/{proposalId}.pdf`
  - Store file URL in proposals table
  - Redirect to profile page after successful submission

#### 2. `frontend/src/app/profile/page.tsx`
- Added `proposal_file` field to VendorProposal interface
- Added "View PDF" button for each proposal
- Button links directly to the stored PDF file
- Only displays if PDF file exists

### Database Schema
- The `proposals` table already includes `proposal_file` column (text)
- This stores the public URL to the PDF in Supabase storage

### Storage Configuration
- Migration file: `frontend/supabase/migrations/20260509_setup_proposals_storage.sql`
- Creates `proposals` storage bucket
- Sets up RLS policies for secure access

## Setup Instructions

### Step 1: Run Supabase Migration
Apply the storage bucket migration to set up the proposals bucket and RLS policies:

```bash
cd frontend
supabase migration up
```

Or manually in Supabase dashboard:
1. Go to SQL Editor
2. Run the SQL from `frontend/supabase/migrations/20260509_setup_proposals_storage.sql`

**What this does:**
- Creates a `proposals` storage bucket
- Allows authenticated users to upload to `proposals/{userId}/*`
- Makes PDFs publicly readable
- Allows users to delete their own PDFs

### Step 2: Verify Setup
1. Ensure frontend is running: `npm run dev` (http://localhost:3000)
2. Ensure backend is running: `python -m uvicorn app.main:app --reload` (http://127.0.0.1:8000)
3. Log in with a test account

### Step 3: Test the Feature
1. Go to the proposal builder (`/apply`)
2. Complete all proposal steps
3. Click "Submit Proposal"
4. System will:
   - Generate PDF from proposal content
   - Upload to Supabase storage
   - Save proposal to database
   - Redirect to profile
5. Go to profile page (`/profile`)
6. Click "View PDF" button to open the proposal
7. PDF should open in a new tab (verify file uploaded successfully)

## File Structure
```
proposals/
├── {userId}/
│   ├── {proposalId}-proposal_name.pdf
│   ├── {proposalId}-another_proposal.pdf
│   └── ...
```

## Troubleshooting

### PDFs not uploading
- Check browser console for errors
- Verify Supabase storage bucket exists and is named `proposals`
- Check RLS policies are correctly applied
- Ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set

### "View PDF" button not showing
- Ensure migration was applied successfully
- Check that `proposal_file` column exists in proposals table
- Verify PDFs were uploaded with proper URLs

### Upload fails with permission error
- Check storage bucket exists and is public
- Verify RLS policies were created correctly
- Ensure user is authenticated before uploading

## Architecture

### Upload Flow
```
User clicks "Submit Proposal"
↓
generatePdfBlob() → generates PDF from proposal
↓
supabase.storage.from("proposals").upload() → uploads to storage
↓
getPublicUrl() → gets shareable link
↓
Insert into proposals table with proposal_file URL
↓
Redirect to profile page
↓
User sees "View PDF" button on profile
↓
Click button → opens PDF in new tab
```

### Storage Paths
- Bucket: `proposals`
- Path: `{userId}/{proposalId}-{sanitizedName}.pdf`
- Access: Public URL returned from `getPublicUrl()`

## Security Notes

- RLS policies ensure users can only upload to their own user ID folder
- PDF URLs are public but predictable (could be hardened with signed URLs in future)
- For sensitive PDFs, consider implementing signed URLs instead of public access

## Future Enhancements

- [ ] Add signed URLs for private PDF access
- [ ] Implement PDF preview modal on profile page
- [ ] Add download counter and metadata
- [ ] Email users when PDF submission completes
- [ ] Add version history for proposal edits
- [ ] Implement PDF compression for large files
- [ ] Add OCR text extraction for search/indexing
