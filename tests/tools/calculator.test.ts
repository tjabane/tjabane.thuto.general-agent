import { describe, expect, test } from "bun:test";
import { CalculatorTool, evaluateExpression } from "../../src/tools";

describe("evaluateExpression", () => {
  test("evaluates arithmetic and parentheses", () => {
    expect(evaluateExpression("(2 + 3) * 4 - 6 / 2")).toBe(17);
  });

  test("respects exponent precedence and associativity", () => {
    expect(evaluateExpression("2 ^ 3 ^ 2")).toBe(512);
    expect(evaluateExpression("-2 ^ 2")).toBe(-4);
    expect(evaluateExpression("2 ^ -2")).toBe(0.25);
  });

  test("accepts decimals, scientific notation, and whitespace", () => {
    expect(evaluateExpression(" 1.5e2 + .25 ")).toBe(150.25);
  });

  test("rejects invalid or unsafe input", () => {
    expect(() => evaluateExpression("")).toThrow("An expression is required.");
    expect(() => evaluateExpression("2 / 0")).toThrow("Division by zero");
    expect(() => evaluateExpression("2 + process.exit()")).toThrow(
      "Expected a number",
    );
    expect(() => evaluateExpression("(2 + 3")).toThrow(
      "Expected a closing parenthesis.",
    );
  });
});

test("CalculatorTool executes an expression", async () => {
  const calculator = new CalculatorTool();

  await expect(
    calculator.execute({ runId: "test-run" }, { expression: "8 * (7 - 2)" }),
  ).resolves.toBe(40);
});
