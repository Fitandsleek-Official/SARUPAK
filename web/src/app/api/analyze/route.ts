import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy to the owned AI worker (local or Hugging Face Space).
 * Set NEXT_PUBLIC_WORKER_URL=http://localhost:7860
 */
export async function POST(req: NextRequest) {
  const worker = process.env.NEXT_PUBLIC_WORKER_URL;
  if (!worker) {
    return NextResponse.json(
      {
        error: "Worker not configured",
        hint: "Set NEXT_PUBLIC_WORKER_URL to your FastAPI / HF Space URL",
      },
      { status: 503 },
    );
  }

  const form = await req.formData();
  const upstream = await fetch(`${worker.replace(/\/$/, "")}/v1/analyze`, {
    method: "POST",
    body: form,
  });

  const data = await upstream.json();
  return NextResponse.json(data, { status: upstream.status });
}
