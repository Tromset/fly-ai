# Fly 1.0

Fly 1.0 is a new range of coding models for [Ollama](https://ollama.com), from the makers of [FlyCoder](https://github.com/Tromset/flycoder). Its flagship, `fly1.0:ultra`, is built on **Le Chonk** (Mistral Large 4, 1T parameters). FlyCoder's lightening method is applied to it: a coding system prompt, the publisher's sampling settings, a small quantized local expert, and the FlyBrain router between the two.

```sh
ollama signin                        # once: ultra runs in Ollama's cloud
ollama run Tromset/fly1.0:ultra      # Le Chonk, for hard work, agents and security
ollama run Tromset/fly1.0:lite       # local, 4.7 GB, Macs with 8 GB or more
```

## The models

| Model | Base | Runs | Weights | Context |
|---|---|---|---|---|
| [`Tromset/fly1.0:ultra`](https://ollama.com/Tromset/fly1.0) | Mistral Large 4 "Le Chonk", 1T parameters (52B active) | Ollama cloud | no local memory | 1M tokens |
| [`Tromset/fly1.0:lite`](https://ollama.com/Tromset/fly1.0) | Ministral 3 8B, text only, GGUF IQ4_XS | your computer | 4.7 GB | 8,192 tokens |

> **`ultra` needs paid Ollama cloud usage.** Mistral Large 4 is not in Ollama's free cloud plan: without usage credits or a paid plan on the account that runs it, `ollama run Tromset/fly1.0:ultra` answers `402 Payment Required` ([ollama.com/settings](https://ollama.com/settings), [ollama.com/upgrade](https://ollama.com/upgrade)). `lite` and FlyBrain's simple route stay free and local.

### Why ultra runs in the cloud

Le Chonk does not fit on any Mac, even compressed. Its smallest published quantization (IQ1_S, about 1.9 bits per weight) weighs 233 GB, and Q4_K_M weighs 605 GB. FlyCoder's method keeps the heavy model where it fits. `ultra` uses Ollama's cloud copy (`mistral-large-4:cloud`) with the FlyCoder settings, and the local work goes to `lite`, a quantized 4.7 GB model.

### Why lite weighs 4.7 GB and not 6.0 GB

`ministral-3:8b` from Ollama's library weighs 6.0 GB: 5.2 GB of Q4_K_M text weights and a 0.8 GB image encoder. `lite` keeps the same Ministral 3 8B and drops what a coding expert does not use:

| | `ministral-3:8b` | `fly1.0:lite` | Saved |
|---|---|---|---|
| Image encoder | 0.8 GB | none: FlyBrain sends images to `ultra`, which reads them | 0.8 GB |
| Text weights | Q4_K_M, 5.2 GB | IQ4_XS with Unsloth's importance matrix, 4.7 GB | 0.5 GB |
| **Total, on disk and in memory** | **6.0 GB** | **4.7 GB** | **1.3 GB** |

IQ4_XS stays at about 4.25 bits per weight, the importance matrix spends them where the model is most sensitive, and its quality is close to Q4_K_M's. Below 4 bits (Q3_K_M, 4.2 GB) code quality drops noticeably, so `lite` stops here. The weights come from [unsloth/Ministral-3-8B-Instruct-2512-GGUF](https://huggingface.co/unsloth/Ministral-3-8B-Instruct-2512-GGUF): `scripts/weights.sh` downloads them and checks their SHA-256 before `ollama create`.

### `fly1.0:lite` cannot be found

`Tromset/fly1.0:lite` is published on [ollama.com/Tromset/fly1.0](https://ollama.com/Tromset/fly1.0/tags) and built from `Modelfile.lite`. When Ollama says it does not exist, the cause is almost always the command:

| Ollama says | Cause | Fix |
|---|---|---|
| `pull model manifest: file does not exist` after `ollama run fly1.0:lite` | the `Tromset/` namespace is missing, so Ollama looks in its official library | `ollama run Tromset/fly1.0:lite` |
| `file does not exist` after `ollama run Tromset/fly1.0` | no tag means `latest`, which was not published before | add `:lite`, or republish with `sh scripts/publish.sh Tromset fly1.0:latest` |
| `requires a newer version of Ollama` | `lite` needs Ollama 0.13.1 or later (Ministral 3) | update Ollama |
| `ollama list` does not show it | the model is downloaded on first use only | `ollama pull Tromset/fly1.0:lite` |

To build it locally from this repository instead: `sh scripts/weights.sh Modelfile.lite` (4.7 GB download, checked), `ollama create fly1.0:lite -f Modelfile.lite`, then `ollama run fly1.0:lite`.

## FlyBrain: Le Chonk only when it is needed

FlyBrain is a small, dependency-free Node 22 server in front of Ollama, taken from FlyCoder. It answers to `fly1.0` (and `fly`):

| Request | Expert |
|---|---|
| Short question ("what is", "how do I", "explique"...) | `fly1.0:lite`, local |
| Tools (agents), images, long context, several code blocks, a detailed spec, debugging, security, algorithms | `fly1.0:ultra`, cloud |
| Unclear | `fly1.0:ultra`, which costs no local memory |

A conversation keeps its expert and can only move up to `ultra`. `lite` is the only local model and `ultra` uses no local memory, so FlyBrain never unloads anything. Without paid cloud usage, requests routed to `ultra` come back with Ollama's `402 Payment Required`, unchanged.

```sh
ollama pull Tromset/fly1.0:lite && ollama pull Tromset/fly1.0:ultra
npm run brain                                   # node brain/flybrain.mjs --prefix Tromset/
OLLAMA_HOST=127.0.0.1:11435 ollama run fly1.0
```

Options: `--port` (11435), `--ollama` (http://127.0.0.1:11434), `--prefix`. Each answer carries the headers `x-flybrain-expert` and `x-flybrain-reason`.

## What Fly 1.0 sets up on top of the bases

- **The right sampling**: Mistral's recommendations, temperature 1.0 and top_p 0.95 for Mistral Large 4, and a temperature below 0.1 (0.05) for Ministral 3.
- **The FlyCoder system prompt**: exact names and signatures, complete code without "TODO", edge cases, no invented APIs, a final check before answering, secure defaults, answers in the user's language. `lite` gets a short version, and its chat template drops Le Chat's long default system prompt.
- **`ultra` adds** the FlyCoder rules for coding agents and a defender-only rule for security work, which is Mistral Large 4's strong point.

## Publishing

From a machine signed in to the Tromset account (`ollama signin`, then approve the device key on ollama.com):

```sh
sh scripts/publish.sh                    # every model
sh scripts/publish.sh Tromset fly1.0:lite  # one model
```

The ollama.com page is pasted by hand from `docs/ollama/fly1.0.md`.

## Repository contents

- `Modelfile.ultra`, `Modelfile.lite`: the two models.
- `brain/`: FlyBrain for Fly 1.0. `tests/`: `npm test`.
- `scripts/publish.sh`: publishing. `scripts/weights.sh`: downloads and checks lite's GGUF into `models/`. `docs/ollama/`: the ollama.com page.

## Licenses

- Mistral Large 4 ("Le Chonk"): [Mistral Ecosystem Open-Weight License](https://huggingface.co/mistralai/Mistral-Large-4-1T-A52B/blob/main/LICENSE), a modified MIT license. Commercial and non-commercial use are allowed, but running a Model-as-a-Service business needs a separate commercial license from Mistral.
- Ministral 3 8B: Apache 2.0.
- Repository code: MIT.
