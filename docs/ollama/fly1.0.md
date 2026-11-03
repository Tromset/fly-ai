# Fly 1.0

The Fly 1.0 range is built on Mistral's open-weight models. Le Chonk (Mistral Large 4) handles hard coding, agent and security work. A small local expert handles simple requests and keeps the RAM free.

```sh
ollama signin                        # once: ultra runs in Ollama's cloud
ollama run Tromset/fly1.0:ultra      # Le Chonk, for hard work and agents
ollama run Tromset/fly1.0:lite       # local, Macs with 8 GB or more
```

| Tag | Base | Runs | Size | Context |
|---|---|---|---|---|
| `ultra` | Mistral Large 4 "Le Chonk", 1T parameters (52B active) | Ollama cloud | no local memory | 1M tokens |
| `lite` | Ministral 3 8B (Apache 2.0), Q4_K_M | your computer | 6.0 GB | 8K tokens |

- **Code that runs**: exact names and signatures, every import, edge cases handled, a final check before answering, no "TODO", no invented APIs.
- **Built for agents**: `ultra` reads files before editing, makes minimal changes, reports real test output, never runs a destructive command without asking.
- **Security for defenders**: `ultra` finds and fixes vulnerabilities, hardens code, and refuses to write attacks.
- **Light on memory**: FlyBrain (in the GitHub repository) answers to `fly1.0`, sends simple questions to `lite` and hard requests, tools and long contexts to `ultra`.

Mistral's sampling: temperature 1.0 and top_p 0.95 for `ultra`, temperature 0.05 for `lite`.

Licenses: Mistral Large 4 under the Mistral Ecosystem Open-Weight License, Ministral 3 under Apache 2.0.
`lite` needs Ollama 0.13.1 or later. Source and FlyBrain: https://github.com/Tromset/fly-ai
