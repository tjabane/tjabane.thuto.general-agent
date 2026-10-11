import OpenAI from "openai";
import type { Tool } from "../contracts/tool";
import type { Message } from "../model";
import type { LLMClient } from "./llm-client";

export class OpenAIClient implements LLMClient {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly temperature: number;

  constructor(model: string = "gpt-4o", temperature: number = 1) {
    this.client = new OpenAI();
    this.model = model;
    this.temperature = temperature;
  }

  async generate(
    instruction: string,
    tools: Tool[],
    messages: Message[],
  ): Promise<unknown> {
    const response = await this.client.responses.create({
      model: this.model,
      instructions: instruction,
      tools: OpenAIClient.mapToolsToOpenAITools(tools),
      input: messages,
      temperature: this.temperature,
    });
    return response;
  }

  private static mapToolsToOpenAITools(tools: Tool[]): any[] {
    return tools.map((tool) => ({
      type: "function",
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      strict: true,
    }));
  }
}
