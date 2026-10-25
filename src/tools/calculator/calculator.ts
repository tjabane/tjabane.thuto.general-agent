import { type ExecutionContext, Tool } from "@general-agent/agent";

export type CalculatorInput = {
  expression: string;
};

class ExpressionParser {
  private position = 0;

  constructor(private readonly expression: string) {}

  parse(): number {
    const value = this.parseExpression();
    this.skipWhitespace();

    if (this.position !== this.expression.length) {
      throw new Error(
        `Unexpected token at position ${this.position}: ${this.expression[this.position]}`,
      );
    }

    return value;
  }

  private parseExpression(): number {
    let value = this.parseTerm();

    while (true) {
      if (this.consume("+")) {
        value += this.parseTerm();
      } else if (this.consume("-")) {
        value -= this.parseTerm();
      } else {
        return value;
      }
    }
  }

  private parseTerm(): number {
    let value = this.parseUnary();

    while (true) {
      if (this.consume("*")) {
        value *= this.parseUnary();
      } else if (this.consume("/")) {
        const divisor = this.parseUnary();

        if (divisor === 0) {
          throw new Error("Division by zero is not allowed.");
        }

        value /= divisor;
      } else {
        return value;
      }
    }
  }

  private parseUnary(): number {
    if (this.consume("+")) {
      return this.parseUnary();
    }

    if (this.consume("-")) {
      return -this.parseUnary();
    }

    return this.parsePower();
  }

  private parsePower(): number {
    const base = this.parsePrimary();

    return this.consume("^") ? base ** this.parseUnary() : base;
  }

  private parsePrimary(): number {
    if (this.consume("(")) {
      const value = this.parseExpression();

      if (!this.consume(")")) {
        throw new Error("Expected a closing parenthesis.");
      }

      return value;
    }

    this.skipWhitespace();
    const match = /^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i.exec(
      this.expression.slice(this.position),
    );

    if (!match) {
      throw new Error(`Expected a number at position ${this.position}.`);
    }

    this.position += match[0].length;
    return Number(match[0]);
  }

  private consume(token: string): boolean {
    this.skipWhitespace();

    if (!this.expression.startsWith(token, this.position)) {
      return false;
    }

    this.position += token.length;
    return true;
  }

  private skipWhitespace(): void {
    while (/\s/.test(this.expression[this.position] ?? "")) {
      this.position += 1;
    }
  }
}

/** Evaluates a mathematical expression without executing arbitrary code. */
export function evaluateExpression(expression: string): number {
  if (expression.trim() === "") {
    throw new Error("An expression is required.");
  }

  const result = new ExpressionParser(expression).parse();

  if (!Number.isFinite(result)) {
    throw new Error("The expression must produce a finite number.");
  }

  return result;
}

export class CalculatorTool extends Tool<CalculatorInput, number> {
  readonly name = "calculator";
  readonly description =
    "Evaluates an arithmetic expression containing numbers, parentheses, +, -, *, /, and ^.";
  readonly parameters = {
    type: "object" as const,
    properties: {
      expression: {
        type: "string",
        description:
          "The arithmetic expression to evaluate, for example: (2 + 3) * 4.",
      },
    },
    required: ["expression"],
    additionalProperties: false,
  };

  readonly execute = async (
    _context: ExecutionContext,
    { expression }: CalculatorInput,
  ): Promise<number> => evaluateExpression(expression);
}
