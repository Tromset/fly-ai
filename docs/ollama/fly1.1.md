# Fly 1.1

A local coding model built on Ministral 3 8B by Mistral AI and tuned for code. At 4.7 GB it is 1.3 GB lighter than `ministral-3:8b`: same model, more compact weights, no image encoder.

```sh
ollama run Tromset/fly1.1:lite       # local, 4.7 GB, Macs with 8 GB or more
ollama run Tromset/fly1.1            # same model (latest)
```

| Tag | Base | Runs | Size | Context |
|---|---|---|---|---|
| `lite`, `latest` | Ministral 3 8B (Apache 2.0), text only, IQ4_XS | your computer | 4.7 GB | 8K tokens |

## What changed since fly1.0:lite

| | `fly1.0:lite` | `fly1.1:lite` |
|---|---|---|
| Size, on disk and in memory | 6.0 GB | **4.7 GB** |
| Image encoder | 0.8 GB | none: coding needs text only |
| Text weights | Q4_K_M, 5.2 GB | IQ4_XS with Unsloth's importance matrix, 4.7 GB |
| System prompt | FlyCoder rules | the same rules, shorter, without Le Chat's long default prompt |

IQ4_XS keeps about 4.25 bits per weight, and the importance matrix spends them where the model is most sensitive, so quality stays close to Q4_K_M. `fly1.0:lite` is still available for those who already use it.

## What it does

- **Code that runs**: exact names and signatures, every import, edge cases handled, a final check before answering, no "TODO", no invented APIs.
- **Secure by default**: no hard-coded secrets, parameterized SQL, validated input, no shell injection.
- **Honest**: never claims it ran your code, and gives you a command to test it instead.
- **Your language**: explanations are short and written in the language you use.
- **Tools**: tool calls go through Ollama's Ministral parser.

## With Le Chonk

For hard work, agents, security and images, use `Tromset/fly1.0:ultra` (Mistral Large 4, in Ollama's cloud, paid cloud usage required). FlyBrain, in the GitHub repository, answers to `fly1.1`. It sends simple questions to `lite` and everything else to `ultra`.

Mistral's sampling: temperature 0.05. Needs Ollama 0.13.1 or later.
License: Ministral 3 under Apache 2.0. Source and FlyBrain: https://github.com/Tromset/fly-ai
