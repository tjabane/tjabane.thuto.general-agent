
import type { Tool } from "../contracts/tool";
import type { Message, OutputItem, ToolResult } from "./agent";


export class LlmRequest {
    readonly instruction: string;
    readonly tools: Tool[];
    readonly messages: Message[];
    readonly toolResults: ToolResult[];
    readonly previousResponseId?: string;

    constructor(instruction: string, tools: Tool[], messages: Message[], toolResults: ToolResult[] =[], previousResponseId?: string){
        this.instruction = instruction;
        this.messages = messages;
        this.tools = tools;
        this.toolResults = toolResults;
        this.previousResponseId = previousResponseId;
    }
}

// The client can return either a message or a tool call plus other metadata. How do I abstract the data coming out? What data do I care about...
export class LLMResponse {
    readonly error: string;
    readonly data: OutputItem|OutputItem[];
    readonly metadata: Record<string, any>;

    constructor(data: OutputItem|OutputItem[], metadata: Record<string, any>, error: string = "")
    {
        this.data = data;
        this.metadata = metadata
        this.error = error;
    }
}
