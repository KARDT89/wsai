import { NextResponse } from "next/server";
import { runWsaiAgent } from "@/server/agent/run-agent";

export async function POST(req: Request) {
  const body = await req.json();

  const prompt = body.prompt;

  if (!prompt) {
    return NextResponse.json(
      { error: "Prompt is required" },
      { status: 400 }
    );
  }

  const output = await runWsaiAgent(prompt);

  return NextResponse.json({
    output,
  });
}