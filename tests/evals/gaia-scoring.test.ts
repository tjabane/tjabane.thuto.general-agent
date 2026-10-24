import { describe, expect, test } from "bun:test";
import {
  extractFinalAnswer,
  isCorrectGaiaAnswer,
} from "../../evals/gaia/scoring";

describe("isCorrectGaiaAnswer", () => {
  test("compares numbers after removing $, %, and commas", () => {
    expect(isCorrectGaiaAnswer("17", "17")).toBe(true);
    expect(isCorrectGaiaAnswer("17.0", "17")).toBe(true);
    expect(isCorrectGaiaAnswer("$1,234", "1234")).toBe(true);
    expect(isCorrectGaiaAnswer("18", "17")).toBe(false);
    expect(isCorrectGaiaAnswer("seventeen", "17")).toBe(false);
    expect(isCorrectGaiaAnswer("", "0")).toBe(false);
  });

  test("compares strings ignoring case, spaces, and punctuation", () => {
    expect(isCorrectGaiaAnswer("Saint Petersburg", "saint petersburg")).toBe(
      true,
    );
    expect(isCorrectGaiaAnswer("Right.", "right")).toBe(true);
    expect(isCorrectGaiaAnswer("Paris", "London")).toBe(false);
  });

  test("compares lists element by element", () => {
    expect(isCorrectGaiaAnswer("1, 2, b", "1,2,B")).toBe(true);
    expect(isCorrectGaiaAnswer("1; 2", "1, 2")).toBe(true);
    expect(isCorrectGaiaAnswer("1, 2", "1, 2, 3")).toBe(false);
    expect(isCorrectGaiaAnswer("2, 1", "1, 2")).toBe(false);
  });
});

describe("extractFinalAnswer", () => {
  test("takes the text after the last FINAL ANSWER marker", () => {
    expect(
      extractFinalAnswer(
        "I think FINAL ANSWER: 16\nOn reflection...\nFINAL ANSWER: **17**",
      ),
    ).toBe("17");
  });

  test("falls back to the whole response", () => {
    expect(extractFinalAnswer("  17 \n")).toBe("17");
  });
});
