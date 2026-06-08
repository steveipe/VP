import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEFAULT_BUCKET = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET || "proposals";

if (!SUPABASE_URL) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL environment variable");
}
if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY environment variable");
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, fileName, pdfBase64, bucket } = body as {
      userId?: string;
      fileName?: string;
      pdfBase64?: string;
      bucket?: string;
    };

    if (!userId || !fileName || !pdfBase64) {
      return NextResponse.json({ error: "userId, fileName, and pdfBase64 are required" }, { status: 400 });
    }

    const targetBucket = bucket || DEFAULT_BUCKET;
    const proposalId = crypto.randomUUID();
    const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${userId}/${proposalId}_${safeFileName}`;
    const fileBuffer = Buffer.from(pdfBase64, "base64");

    const { error: uploadError } = await supabaseAdmin.storage
      .from(targetBucket)
      .upload(storagePath, fileBuffer, {
        upsert: true,
        contentType: "application/pdf",
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data: publicUrlData, error: publicUrlError } = await supabaseAdmin.storage
      .from(targetBucket)
      .getPublicUrl(storagePath);

    if (publicUrlError) {
      return NextResponse.json({ error: publicUrlError.message }, { status: 500 });
    }

    const publicUrl = publicUrlData.publicUrl;
    let contractId = (body as any).contractId as string | undefined;
    const vendorName = (body as any).vendorName as string | undefined;
    const price = (body as any).price as string | undefined;
    const timeline = (body as any).timeline as string | undefined;
    const proposalData = (body as any).proposal_data as string | undefined;
    const contractTitle = (body as any).contractTitle as string | undefined;
    const contractDescription = (body as any).contractDescription as string | undefined;

    if (!contractId) {
      const contractPayload: Record<string, any> = {
        title: contractTitle || fileName || "Vendor proposal",
        description: contractDescription || `Generated proposal for ${fileName}`,
        budget: price || null,
        deadline: timeline || null,
        industry: (body as any).industry || null,
        rfp_file_name: fileName,
        posted_by: null,
        posted_by_name: vendorName || null,
        status: "draft",
      };

      const { data: contractData, error: contractError } = await supabaseAdmin
        .from("contracts")
        .insert(contractPayload)
        .select("id")
        .limit(1);

      if (contractError || !contractData?.length) {
        console.warn("Failed to create contract for proposal:", contractError?.message || contractError);
      } else {
        contractId = contractData[0].id;
        console.log("Created contract for proposal", contractId);
      }
    }

    if (!contractId) {
      return NextResponse.json({ error: "Unable to create or resolve contract for proposal" }, { status: 500 });
    }

    // Insert a proposals DB row using the service-role key so the proposal appears immediately
    try {
      const insertPayload: Record<string, any> = {
        vendor_id: userId,
        contract_id: contractId,
        proposal_file: publicUrl,
        proposal_file_name: safeFileName,
        proposal_type: "generated",
        created_at: new Date().toISOString(),
      };

      if (vendorName) insertPayload.vendor_name = vendorName;
      if (price) insertPayload.price = price;
      if (timeline) insertPayload.timeline = timeline;
      if (proposalData) insertPayload.proposal_data = proposalData;

      const { data: inserted, error: insertError } = await supabaseAdmin
        .from("proposals")
        .insert(insertPayload)
        .select()
        .limit(1);

      if (insertError) {
        console.warn("Failed to insert proposal row:", insertError.message || insertError);
      } else {
        console.log("Inserted proposal row for user", userId, inserted?.[0]);
      }
    } catch (e) {
      console.debug("Error inserting proposal row:", e);
    }

    return NextResponse.json({ url: publicUrl, path: storagePath, contractId });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
