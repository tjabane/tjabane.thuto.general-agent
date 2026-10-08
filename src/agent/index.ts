import OpenAI from "openai";

const apiKey = Bun.env.OLLAMA_API_KEY;

if (!apiKey) {
  throw new Error("Set OLLAMA_API_KEY in .env before running the agent.");
}

const client = new OpenAI({
  apiKey,
  baseURL: Bun.env.OLLAMA_BASE_URL ?? "https://ollama.com/v1",
});

const response = await client.chat.completions.create({
  model: Bun.env.OLLAMA_MODEL ?? "glm-5.3",
  messages: [{ role: "user", content: "How is the weather in SF?" }],
  temperature: 0,
});

console.log(response.choices[0]?.message.content ?? "No response content returned.");
