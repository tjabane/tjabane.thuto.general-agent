import { LLMClient } from "./clients/llm-client";
import type { Message } from "./model";


export class Agent {
    private readonly messages: Message[];
    private readonly client: LLMClient;

    constructor(LLMClient: LLMClient) {
        this.messages = [];
        this.client = LLMClient;
    }

    async run(message: string): Promise<string> {
        this.messages.push({ role: "user", content: message });
        return await this.client.getResponse(this.messages);
    }
}