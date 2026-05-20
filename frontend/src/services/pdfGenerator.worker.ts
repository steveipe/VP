import { generateProposalPDF, type ProposalPDFInput } from "./pdfGenerator";

type PdfWorkerRequest = {
  id: string;
  input: ProposalPDFInput;
};

type PdfWorkerSuccessResponse = {
  id: string;
  success: true;
  blob: Blob;
};

type PdfWorkerErrorResponse = {
  id: string;
  success: false;
  error: string;
  stack?: string;
};

type PdfWorkerResponse = PdfWorkerSuccessResponse | PdfWorkerErrorResponse;

const isMessageEvent = (value: unknown): value is MessageEvent<PdfWorkerRequest> => {
  return typeof value === "object" && value !== null && "data" in value;
};

self.addEventListener("message", async (event) => {
  if (!isMessageEvent(event)) return;
  const { id, input } = event.data;

  try {
    const blob = generateProposalPDF(input).output("blob");
    const response: PdfWorkerSuccessResponse = { id, success: true, blob };
    self.postMessage(response, [blob]);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    const response: PdfWorkerErrorResponse = {
      id,
      success: false,
      error: err.message,
      stack: err.stack,
    };
    self.postMessage(response);
  }
});
