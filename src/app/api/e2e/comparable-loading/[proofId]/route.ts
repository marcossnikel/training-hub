import {
  comparableLoadingProofEnabled,
  hasPendingComparableLoadingProof,
  isComparableLoadingProofId,
  releaseComparableLoadingProof,
} from "@/lib/comparable-loading-proof";

function notFound(): Response {
  return new Response("Not found", { status: 404 });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ proofId: string }> }
): Promise<Response> {
  if (!comparableLoadingProofEnabled()) return notFound();
  const { proofId } = await context.params;
  if (!isComparableLoadingProofId(proofId)) return notFound();
  return new Response(null, {
    status: hasPendingComparableLoadingProof(proofId) ? 204 : 409,
  });
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ proofId: string }> }
): Promise<Response> {
  if (!comparableLoadingProofEnabled()) return notFound();
  const { proofId } = await context.params;
  if (!isComparableLoadingProofId(proofId)) return notFound();
  if (!releaseComparableLoadingProof(proofId)) {
    return new Response("Proof is not pending", { status: 409 });
  }
  return new Response(null, { status: 204 });
}
