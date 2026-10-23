import type { LLMClient } from "./clients/llm-client";
import type { Tool } from "./contracts/tool";
import { Message, ToolCall, ToolResult } from "./models/agent";
import { AgentResult, Event, ExecutionContext } from "./models/agent-runtime";
import { type LLMResponse, LlmRequest } from "./models/llm";

export class Agent {
  private readonly messages: Message[];
  private readonly client: LLMClient;
  private readonly instruction: string;
  private readonly tools: Tool[];
  private readonly maxIterations: number = 10;

  constructor(
    client: LLMClient,
    instruction: string,
    tools: Tool[],
    maxIterations: number = 10,
  ) {
    this.messages = [];
    this.client = client;
    this.instruction = instruction;
    this.tools = tools;
    this.maxIterations = maxIterations;
  }

  async run(
    message: string,
    context: ExecutionContext = new ExecutionContext(),
  ): Promise<AgentResult> {
    const userMessage = new Message("user", message);
    const userEvent = new Event(context.runId, "user", userMessage);
    this.messages.push(userMessage);
    context.addEvent(userEvent);

    let request: LlmRequest = new LlmRequest(
      this.instruction,
      this.tools,
      this.messages,
    );

    for (let iteration = 0; iteration < this.maxIterations; iteration++) {
      const response: LLMResponse = await this.client.generate(request);
      context.addEvent(new Event(context.runId, "assistant", response.data));
      if (response.error) {
        throw new Error(response.error);
      }

      if ( Array.isArray(response.data)) {
        const toolRequests = response.data.filter((item) => item instanceof ToolCall)
        const toolResults = await this.act(context, toolRequests);
        request = new LlmRequest(
          this.instruction,
          this.tools,
          this.messages,
          toolResults,
          response.metadata.response_id,
        );
      } 
      else if (response.data instanceof Message) {
        this.messages.push(response.data);
        context.result = response.data.content;
        return new AgentResult(response.data.content, context);
      }
      context.incrementIteration();
    }

    throw new Error(
      `Agent stopped after ${this.maxIterations} iterations without a final answer.`,
    );
  }

  /**
   * Is takes a tool call, finds the right tool from the list and executes it. If the tool fails or it doesnt exist it returns that
   * error in the result
   */
  private async act(
    context: ExecutionContext,
    actions: ToolCall[],
  ): Promise<ToolResult[]> {

    return Promise.all(actions.map(async action => {
      let toolResult:ToolResult; 
      const tool = this.tools.find((t) => t.name === action.name);
      if (!tool) {
        toolResult = new ToolResult(action.call_id, true, `Tool ${action.name} not found`,);
      }
      else {
        try {
          const result = await tool.execute(context, action.arguments);
          toolResult = new ToolResult(action.call_id, false, result);
        } 
        catch (error) {
          toolResult = new ToolResult(action.call_id, true, `Error occurred while executing tool ${action.name}: ${error}`,);
        }
      }
      context.addEvent(new Event(context.runId, toolResult.type, toolResult))
      return toolResult
    })
    )
  }
}
