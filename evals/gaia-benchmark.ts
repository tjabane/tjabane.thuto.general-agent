import { Agent } from "./agent";
import { GaiaProblem, GaiaOutput } from "./models";
import { asyncBufferFromFile, parquetReadObjects, type AsyncBuffer, type ParquetRow } from "hyparquet";

export const GAIA_Prompt: string = `You are a general AI assistant. I will ask you a question. Report your thoughts, and finish your answer with the following template: FINAL ANSWER: [YOUR FINAL ANSWER].

YOUR FINAL ANSWER should be a number OR as few words as possible OR a comma separated list of numbers and/or strings.

If you are asked for a number, don't use comma to write your number neither use units such as $ or percent sign unless specified otherwise.

If you are asked for a string, don't use articles, neither abbreviations (e.g. for cities), and write the digits in plain text unless specified otherwise.

If you are asked for a comma separated list, apply the above rules depending of whether the element to be put in the list is a number or a string.`;

async function getProblems(level: 1 | 2 | 3, count: number): Promise<GaiaProblem[]> {
    const split: string = process.argv[2] ?? "validation";
    const path: string = `.data/gaia/2023/${split}/metadata.level1.parquet`;
    const file: AsyncBuffer = await asyncBufferFromFile(path);
    const problems: GaiaProblem[] = await parquetReadObjects({file }) as GaiaProblem[];

    return problems.filter((problem) => problem.Level === level).slice(0, count);
}


function createOpenAIAgent(): Agent {
    const instruction: string = GAIA_Prompt;
    const model: string = "gpt-4o";
    const client: LLMClient = new OpenAIClient(instruction, model);
    return new Agent(client);
}

async function solve_problem(agent: Agent, problem: GaiaProblem): Promise<GaiaOutput> {
    const question: string = problem.Question;
    const answer: string = await agent.run(question);

}