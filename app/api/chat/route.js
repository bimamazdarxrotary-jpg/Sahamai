import { streamText } from "ai";
import { openai } from "@ai-sdk/openai";

export async function POST(req) {
  const { message } = await req.json();

  const result = await streamText({
    model: openai("gpt-4.1-mini"),
    system: `
You are SahamAI.

You are an expert Indonesian stock analysis assistant.

Always analyze:
- trend
- momentum
- volume
- risk
- probability

Be professional and objective.
`,
    prompt: message
  });

  return result.toDataStreamResponse();
}
