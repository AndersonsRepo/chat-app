import { openai } from "@ai-sdk/openai"
import { streamText } from "ai"

// Allow streaming responses up to 30 seconds
export const maxDuration = 30

export async function POST(req: Request) {
  try {
    const { messages } = await req.json()

    const result = streamText({
      model: openai("gpt-4o"),
      messages,
      temperature: 0.7,
      system: `You are a helpful assistant that can chat about various topics. 
      If users ask about calendar, schedule, appointments, or time-related queries, 
      let them know that calendar queries are handled separately by the calendar system.
      For all other topics, provide helpful and engaging responses.`,
    })

    return result.toDataStreamResponse()
  } catch (error) {
    console.error("Chat API error:", error)
    return new Response(JSON.stringify({ error: "Failed to process your request" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
}
