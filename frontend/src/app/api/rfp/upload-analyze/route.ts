import { NextRequest, NextResponse } from "next/server";
import { apiUrl } from "@/lib/api";

export async function POST(request: NextRequest) {
  try {
    const { pdfUrl, fileName } = await request.json();

    if (!pdfUrl) {
      return NextResponse.json(
        { error: "PDF URL is required" },
        { status: 400 }
      );
    }

    // Fetch the PDF from the URL
    const pdfResponse = await fetch(pdfUrl);
    if (!pdfResponse.ok) {
      return NextResponse.json(
        { error: "Failed to fetch PDF from URL" },
        { status: 400 }
      );
    }

    const pdfBuffer = await pdfResponse.arrayBuffer();
    const pdfBase64 = Buffer.from(pdfBuffer).toString("base64");

    // Call the backend RFP parsing endpoint with the PDF
    const backendResponse = await fetch(apiUrl("/api/ai/parse-rfp/background"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        rfp_text: "",
        contract_title: fileName || "Uploaded RFP",
        file_base64: pdfBase64,
        file_name: fileName || "document.pdf",
        content_type: "application/pdf",
      }),
    });

    if (!backendResponse.ok) {
      const errorData = await backendResponse.json().catch(() => null);
      return NextResponse.json(
        { error: errorData?.detail || "Failed to start analysis" },
        { status: backendResponse.status }
      );
    }

    const backendData = await backendResponse.json();
    const jobId = backendData.job_id;

    if (!jobId) {
      return NextResponse.json(
        { error: "No job ID returned from backend" },
        { status: 500 }
      );
    }

    // Poll the backend for job completion (with timeout)
    const maxAttempts = 120; // 2 minutes with 1-second intervals
    let attempts = 0;
    let jobResult = null;

    while (attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      attempts++;

      try {
        const statusResponse = await fetch(
          apiUrl(`/api/ai/parse-rfp/jobs/${jobId}`)
        );

        if (!statusResponse.ok) {
          continue;
        }

        const statusData = await statusResponse.json();
        const job = statusData.job;

        if (!job) {
          continue;
        }

        if (job.status === "completed") {
          jobResult = job.result || {};
          break;
        }

        if (job.status === "failed") {
          return NextResponse.json(
            { error: job.error || "RFP analysis failed" },
            { status: 500 }
          );
        }
      } catch (e) {
        console.error("Error polling job status:", e);
      }
    }

    if (!jobResult) {
      return NextResponse.json(
        { error: "RFP analysis timed out" },
        { status: 504 }
      );
    }

    // Return the analysis result
    return NextResponse.json({
      analysis: jobResult,
      fileName: fileName || "document.pdf",
      url: pdfUrl,
      overallScore: jobResult.key_requirements ? jobResult.key_requirements.length * 15 : 0,
      strengths: jobResult.key_requirements || [],
      suggestions: [],
    });
  } catch (error) {
    console.error("RFP upload-analyze error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
