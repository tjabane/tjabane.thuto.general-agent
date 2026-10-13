import type { LLMClient } from "./clients/llm-client";
import { ExecutionContext, Event } from "./models/agent-runtime";
import type { Tool } from "./contracts/tool";
import { Message, ToolCall, ToolResult } from "./models/agent";
import { LlmRequest } from "./models/llm";

export class Agent {
  private readonly messages: Message[];
  private readonly client: LLMClient;
  private readonly instruction: string;
  private readonly tools: Tool[];
  private readonly maxIterations: number = 10;

  constructor(client: LLMClient, instruction: string, tools: Tool[], maxIterations: number = 10) {
    this.messages = [];
    this.client = client;
    this.instruction = instruction;
    this.tools = tools;
    this.maxIterations = maxIterations;
  }

  async run(message: string, context: ExecutionContext): Promise<any> {
    if(!context) {
      context = new ExecutionContext();
    }

    const userMessage = new Message("user", message);
    const userEvent = new Event(context.runId, "user", userMessage);
    this.messages.push(userMessage);
    context.addEvent(userEvent);
    
    let request: LlmRequest = new LlmRequest(this.instruction, this.tools, this.messages);
    
    for(let iteration = 0; iteration < this.maxIterations; iteration++) {
      const response =  await this.client.generate(request);
      if(response.error) {
        throw new Error(response.error);
      }

      if(response.data instanceof ToolCall) {
        const toolResult = this.Act(response.data);
        context.addEvent(new Event(context.runId, toolResult.type, toolResult));
        request = new LlmRequest(this.instruction, this.tools, this.messages, [toolResult]);
      }
    }


  }

  /**
   * Is takes a tool call, finds the right tool from the list and executes it. If the tool fails or it doesnt exist it returns that
   * error in the result
   */
  private Act(action: ToolCall): ToolResult {
    
  }
}
