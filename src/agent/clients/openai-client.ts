import OpenAI from "openai";
import type { LLMClient } from "./llm-client";
import type { Message } from "../model";

export class OpenAIClient implements LLMClient {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly instruction: string;

  constructor(instruction: string, model: string = "gpt-4o") {
    this.client = new OpenAI();
    this.model = model;
    this.instruction = instruction;
  }

  async getResponse(messages: Message[]): Promise<string> {
    const response = await this.client.responses.create({
      model: this.model,
      instructions: this.instruction,
      input: messages,
    });

    return response.output_text;
  }
}
