# pi-effort

Extension for [pi](https://github.com/badlogic/pi-mono) — a provider-agnostic terminal coding agent by Mario Zechner.

Pi extension for controlling thinking/effort with model-adaptive `min`/`max` aliases.

## Goal

Provide a `/effort` command that adapts to the current model:

- `min` — set the lowest reasoning level for this model
- `max` — set the highest reasoning level for this model
- Explicit levels for fine-grained control
- Persistent defaults for future sessions

## Commands

```text
/effort            show current effort and available levels
/effort min        set minimum effort for this model
/effort max        set maximum effort for this model
/effort <level>    set explicit level (off|minimal|low|medium|high|xhigh)
/effort options    show available levels for this model
/effort help       show command help
/effort default min|max|<level>
/effort default clear
```

### How min/max adapt per model

| Model type | `min` | `max` | Available levels |
|---|---|---|---|
| Non-reasoning | — | — | *(thinking unavailable)* |
| Reasoning (standard) | `minimal` | `high` | minimal, low, medium, high |
| Reasoning (xhigh-capable) | `minimal` | `xhigh` | minimal, low, medium, high, xhigh |

xhigh-capable models are determined by pi-ai's `supportsXhigh()`. Run `/effort options` to see what the current model supports.

### Defaults

- `/effort default max` — writes the resolved level (e.g., `xhigh`) to `~/.pi/agent/settings.json`. Future sessions pick it up automatically via Pi core.
- `/effort default clear` — removes the persisted default.

### Backward compat

`/effort off` disables thinking. On reasoning models, `/effort min` is the lowest enabled reasoning level (`minimal`).

## Keyboard shortcut

`Ctrl+Shift+E` — cycle through reasoning effort levels for the current model (skips `off`; use `/effort off` if you want to disable thinking).

## CLI flag

```bash
pi --effort max       # start with maximum effort
pi --effort min       # start with minimum effort
pi --effort high      # start with explicit level
pi --effort off       # start with thinking disabled
```

The flag resolves `min`/`max` against the initial model and applies the level on session start.

## Model switching

When you switch models (via `/model` or model selector), Pi clamps effort to the new model's capabilities and `pi-effort` keeps the UI honest:

1. Syncs completions to the newly selected model
2. Lets Pi's built-in footer show the effective effort immediately
3. Updates the current-turn working label (for example, `Working (high effort)...`)

## Install

Install the published package from npm:

```bash
pi install npm:pi-effort
```

Verify what Pi is loading:

```bash
pi list
npm list -g --depth=0 pi-effort
```

The durable Pi setting is the package entry in `~/.pi/agent/settings.json`:

```json
{
  "packages": [
    "npm:pi-effort"
  ]
}
```

Pi then resolves that package through the configured package manager. On a Homebrew
macOS setup, the installed package typically lives under:

```text
/opt/homebrew/lib/node_modules/pi-effort
```

The package manifest tells Pi which extension file to load:

```json
{
  "pi": {
    "extensions": ["./index.ts"]
  }
}
```

## How this relates to pi-mono

`pi-effort` is independent from the Pi base repository.

`~/pi-mono` is the Pi engine/runtime checkout. It provides the `pi` CLI and loads
packages listed in `~/.pi/agent/settings.json`.

`~/Documents/projects/pi-effort` is the source repository for this extension.
Pi does not load this checkout when the settings entry is `npm:pi-effort`; it
loads the installed npm copy instead.

The normal runtime chain is:

```text
pi command
  -> Pi runtime from ~/pi-mono or another Pi installation
  -> ~/.pi/agent/settings.json
  -> "npm:pi-effort"
  -> installed npm package
  -> index.ts from this package
```

That separation is intentional: Pi core can be updated independently from this
extension, and this extension can be developed, versioned, and published as its
own npm package.

### Local development

For a one-off local test from this checkout:

```bash
npm install
pi -e ./index.ts
```

For a longer local-path development install:

```bash
pi remove npm:pi-effort
pi install "$(pwd)"
```

After publishing a new version, switch back to the npm package:

```bash
npm publish
pi remove "$(pwd)"
pi install npm:pi-effort
```

## Verification

```bash
npm run check
npm test
npm pack --dry-run
```

## Repo structure

```text
index.ts        Pi extension entrypoint (hooks, commands, shortcuts)
effort.ts       Parsing, resolution, settings, and model capability logic
package.json    Package metadata and Pi manifest
tsconfig.json   TypeScript configuration
```

## License

Apache-2.0
