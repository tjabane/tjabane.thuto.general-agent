# Human conversation evaluation

This evaluation opens an interactive terminal conversation with one agent. The
same agent and session are reused for every turn, so the agent retains the
conversation history.

Start with OpenAI:

```sh
bun run eval:human
```

Or use Ollama:

```sh
bun run eval:human --provider ollama
```

You can supply a different system instruction:

```sh
bun run eval:human --instruction "You are a patient programming tutor."
```

Enter `/exit`, `/quit`, or press Ctrl+C to finish. Completed conversations are
saved as JSON under `.data/human/runs/`, including response times and the agent
event trace.
