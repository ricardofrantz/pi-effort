# pi-effort

Small Pi extension for controlling thinking/effort from inside a Pi session.

## Goal

Provide a simple `/effort` command for:

- showing the current thinking level
- showing model-specific available effort levels
- changing the current session thinking level
- setting a persistent default thinking level

## Commands

```text
/effort
/effort show
/effort options
/effort off
/effort minimal
/effort low
/effort medium
/effort high
/effort xhigh
/effort default off
/effort default minimal
/effort default low
/effort default medium
/effort default high
/effort default xhigh
/effort default clear
```

Behavior:

- `/effort` or `/effort show` shows the current session effort and the persisted
  default effort, plus the Pi-level effort options available for the current model.
- `/effort options` shows only the Pi-level effort options available for the
  current model.
- `/effort <level>` changes the current session thinking level. If the level is
  not supported by the current model, the command is rejected with an error and
  the current level is unchanged.
- `/effort default <level>` changes the default thinking level for future
  sessions by editing `~/.pi/agent/settings.json`.
- `/effort default clear` removes the persisted default.

Invalid commands show a suggestion when the input is close to a valid option
(e.g., `/effort hihg` suggests "Did you mean \"high\"?").

New sessions automatically pick up `defaultThinkingLevel` from Pi's own
session/runtime initialization path. `pi-effort` does not add a separate
`session_start` hook for this because Pi core already applies the default.

## Model-specific options

`pi-effort` follows Pi's own model-level thinking granularity:

- non-reasoning models: `off`
- reasoning models: `off, minimal, low, medium, high`
- xhigh-capable models in Pi:
  - `gpt-5.2*`
  - `gpt-5.3*`
  - `gpt-5.4*`
  - `opus-4.6*`
  - `opus-4.7*`

Important: this is Pi-level effort, not raw provider-native labels. For example,
Anthropic may internally map Pi's `xhigh` to a provider-specific maximum effort,
but the extension surface remains Pi's standard thinking levels.

### Custom xhigh model patterns

You can override the built-in xhigh model list by adding a `xhighModelPatterns`
array to `~/.pi/agent/settings.json`:

```json
{
  "xhighModelPatterns": ["my-custom-model", "another-pattern"]
}
```

If present, these patterns replace the built-in list entirely. Each pattern is
matched as a substring against the model ID.

## Install

### npm (preferred, after publish)

```bash
pi install npm:pi-effort
```

### Git (current install path)

```bash
pi install git:github.com/ricardofrantz/pi-effort
```

### Local development

```bash
npm install
pi --extension ./index.ts
```

## Packaging Notes

- `pi-effort` is a Pi package via `package.json.pi.extensions`
- Pi core runtime imports are declared as `peerDependencies`, per Pi package docs
- once published to npm, the intended install path is `pi install npm:pi-effort`

## Verification

```bash
npm run check
npm test
npm pack --dry-run
npm publish --dry-run
```

## Repo structure

```text
index.ts        Pi extension entrypoint
effort.ts       Parsing, settings helpers, and model capability logic
package.json    Package metadata and Pi manifest
tsconfig.json   TypeScript configuration
```

## License

Apache-2.0
