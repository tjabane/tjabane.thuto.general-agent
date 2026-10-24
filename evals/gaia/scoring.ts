// A port of the official GAIA scorer (question_scorer in the GAIA leaderboard's scorer.py).

const PUNCTUATION = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/g;

function isNumber(value: string): boolean {
  return value.trim() !== "" && !Number.isNaN(Number(value));
}

function normalizeNumber(value: string): number {
  const number = Number(value.replace(/[$%,]/g, ""));
  return value.trim() === "" || Number.isNaN(number)
    ? Number.POSITIVE_INFINITY
    : number;
}

function normalizeString(value: string, removePunctuation = true): string {
  const noSpaces = value.replace(/\s/g, "");
  return (
    removePunctuation ? noSpaces.replace(PUNCTUATION, "") : noSpaces
  ).toLowerCase();
}

function splitList(value: string): string[] {
  return value.split(/[,;]/);
}

/** Scores an answer against GAIA's ground truth the same way the leaderboard does. */
export function isCorrectGaiaAnswer(
  answer: string,
  groundTruth: string,
): boolean {
  if (isNumber(groundTruth)) {
    return normalizeNumber(answer) === Number(groundTruth);
  }

  if (/[,;]/.test(groundTruth)) {
    const answers = splitList(answer);
    const truths = splitList(groundTruth);

    return (
      answers.length === truths.length &&
      truths.every((truth, index) => {
        const item = answers[index] ?? "";
        return isNumber(truth)
          ? normalizeNumber(item) === Number(truth)
          : normalizeString(item, false) === normalizeString(truth, false);
      })
    );
  }

  return normalizeString(answer) === normalizeString(groundTruth);
}

/** Takes the text after the last "FINAL ANSWER:", or the whole response if there is none. */
export function extractFinalAnswer(response: string): string {
  const matches = [...response.matchAll(/FINAL ANSWER:\s*(.*)/gi)];
  const answer = matches.at(-1)?.[1] ?? response;

  return answer.replace(/\*\*/g, "").trim();
}
