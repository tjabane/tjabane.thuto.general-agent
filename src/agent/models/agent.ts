export type Role = "user" | "assistant" | "system";

export class Message {
  readonly type:string = "message";
  role: Role;
  content: string;

  constructor(role: Role, content: string) {
    this.role = role;
    this.content = content;
  }
}

export class ToolCall {
  readonly type:string = "tool_call";
  name: string;
  call_id: string;
  arguments: any;

  constructor(name: string, call_id: string, arguments: any) {
    this.name = name;
    this.call_id = call_id;
    this.arguments = arguments;
  }
}

export class ToolResult {
  readonly type:string = "tool_result";
  call_id: string;
  failed: boolean;
  response: any;

  constructor(call_id: string, failed: boolean, response: any) {
    this.call_id = call_id;
    this.failed = failed;
    this.response = response;
  }
}

export type OutputItem = Message | ToolCall | ToolResult;