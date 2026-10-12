import { resolve } from "node:dns";
import type { LLMClient } from "./clients/llm-client";
import type { Tool } from "./contracts/tool";
import type { Message, ToolCall, ToolResult } from "./models/agent";
import { LlmRequest } from "./models/llm";

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
    const request: LlmRequest = new LlmRequest(this.instruction, this.tools, this.messages);
    const reponse =  await this.client.generate(request);

    if(reponse.error)
      return Response.error;
    else if(reponse.data)
    {

    }
  }

  /**
   * Is takes a tool call, finds the right tool from the list and executes it. If the tool fails or it doesnt exist it returns that
   * error in the result
   */
  private Act(action: ToolCall): ToolResult {
    
  }
}
