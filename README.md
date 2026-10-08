# tjabane.thuto.general-agent

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

## Benchmark

Run the GAIA comparison benchmark with its default pair of Ollama models:

```bash
bun run bench
```

The default comparison is `glm-5.3:cloud` versus `qwen3.5:9b`. Pass one or
more model IDs to benchmark a different set, for example:

```bash
bun run bench -- glm-5.3:cloud qwen3.5:9b
```

Set `HF_TOKEN` and `OLLAMA_API_KEY` in `.env` before running it. The command
prints a side-by-side accuracy summary and saves the detailed evaluations to a
timestamped JSON file in `bench-results/`. The directory is ignored by Git.

This project was created using `bun init` in bun v1.4.0. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
