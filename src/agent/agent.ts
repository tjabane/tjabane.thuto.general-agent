import type { LLMClient } from "./clients/llm-client";
import type { Tool } from "./contracts/tool";
import type { Message } from "./models/agent";

export class Agent {
  private readonly messages: Message[];
  private readonly client: LLMClient;
  private readonly instruction: string;
  private readonly tools: Tool[];

  constructor(client: LLMClient, instruction: string, tools: Tool[]) {
    this.messages = [];
    this.client = client;
    this.instruction = instruction;
    this.tools = tools;
  }

  async run(message: string): Promise<unknown> {
    this.messages.push({ role: "user", content: message });
    return await this.client.generate(
      this.instruction,
      this.tools,
      this.messages,
    );
  }
}
