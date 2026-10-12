export type Role = "user" | "assistant" | "system";

export type Message = {
  role: Role;
  content: string;
};

export type ToolCall = {
  name: string;
  call_id: string;
  arguments: any;
}

export type ToolResult = {
  call_id: string;
  falied: boolean;
  response: any
}

export type OutputItem = Message | ToolCall | ToolResult;