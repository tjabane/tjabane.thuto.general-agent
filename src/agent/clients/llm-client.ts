import type { GaiaOutput, Message } from "../model";

export interface LLMClient {
  getResponse(messages: Message[]): Promise<GaiaOutput>;
}
