import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { type GaiaOutput, GaiaOutputSchema, type Message } from "../model";
import type { LLMClient } from "./llm-client";

export class OpenAIClient implements LLMClient {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly instruction: string;

  constructor(instruction: string, model: string = "gpt-4o") {
    this.client = new OpenAI();
    this.model = model;
    this.instruction = instruction;
  }

  async getResponse(messages: Message[]): Promise<GaiaOutput> {
    const response = await this.client.responses.parse({
      model: this.model,
      instructions: this.instruction,
      input: messages,
      text: {
        format: zodTextFormat(GaiaOutputSchema, "gaia_output"),
      },
    });

    if (!response.output_parsed) {
      throw new Error("The model did not return a structured GAIA output.");
    }

    return response.output_parsed;
  }
}
