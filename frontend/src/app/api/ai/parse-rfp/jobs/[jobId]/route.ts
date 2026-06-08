import { NextRequest, NextResponse } from "next/server";
import { getLocalJob } from "@/lib/appApi";
import { getBackendBaseUrl } from "@/lib/api";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const job = getLocalJob(jobId);
  if (!job) {
    try {
      // Fallback to backend job store (useful in dev when Next.js spawns multiple server instances)
      const backendUrl = new URL(`/api/ai/parse-rfp/jobs/${jobId}`, `${getBackendBaseUrl()}/`).toString();
      const resp = await fetch(backendUrl, { method: "GET", headers: { Accept: "application/json" } });
      const data = await resp.json().catch(() => null);
      if (resp.ok && data?.job) {
        return NextResponse.json({ job: data.job });
      }
    } catch (e) {
      // fall through to return not found
    }
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  return NextResponse.json({ job });
}
