import type { Message } from "../model";

export interface LLMClient {
    getResponse(messages: Message[]): Promise<string>;
}