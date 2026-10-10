import type { Tool } from "../contracts/tool";
import type { Message } from "../model";

export interface LLMClient {
  generate(instruction: string, tools:Tool[] ,messages: Message[]): Promise<string>;
}
