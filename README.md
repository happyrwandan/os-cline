# OS-Cline

Enhanced autonomous coding agent with Universal Tool Parser, Model Capabilities, YAML Config, and Multi-Model Support via OpenRouter.

Based on [Cline](https://github.com/cline/cline) v3.87.1.

## Install

One command — copy, paste, done:

```bash
curl -L -o /tmp/os-cline.vsix https://github.com/happyrwandan/os-cline/releases/download/v3.87.1/os-cline-3.87.1.vsix && code --install-extension /tmp/os-cline.vsix
```

> **Windows (PowerShell):**
> ```powershell
> Invoke-WebRequest -Uri "https://github.com/happyrwandan/os-cline/releases/download/v3.87.1/os-cline-3.87.1.vsix" -OutFile "$env:TEMP\os-cline.vsix"; code --install-extension "$env:TEMP\os-cline.vsix"
> ```

After installing, set your OpenRouter API key in OS-Cline settings.

## Features

- **Universal Tool Parser** — Normalizes tool calls across all model formats (XML, JSON, function calls)
- **Model Capability Registry** — Profiles for 20+ models with auto-discovery
- **Reasoning Stripper** — Removes thinking tags from reasoning models (DeepSeek, Qwen, etc.)
- **Adaptive Prompts** — Adjusts system prompts based on model capabilities
- **YAML Config** — Pre-configured models: DeepSeek, Qwen, Kimi, GLM, MiMo
- **Open Config Command** — VS Code command "Open Cline Config" to edit config
- **Edit Config Button** — UI button in OpenRouter settings

## Configuration

Edit `~/.cline/config.yaml` to add custom models:

```yaml
models:
  - id: "my-custom-model"
    name: "My Custom Model"
    provider: "openrouter"
    capabilities:
      tools: true
      reasoning: false
      streaming: true
```

Or use the **"Open Cline Config"** command from the VS Code command palette.

## License

Apache-2.0