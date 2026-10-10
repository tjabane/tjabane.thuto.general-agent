import OpenAI from "openai";
import { type Message } from "../model";
import type { LLMClient } from "./llm-client";

export class OpenAIClient implements LLMClient {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly temperature: number;

  constructor(model: string = "gpt-4o", temperature: number = 0.7) {
    this.client = new OpenAI();
    this.model = model;
    this.temperature = temperature;
  }

  async getResponse(instruction: string, messages: Message[]): Promise<string> {
    const response = await this.client.responses.create({
      model: this.model,
      instructions: instruction,
      messages: messages,
      temperature: this.temperature,
    });

    return response.choices[0].message.content;
  }
}
