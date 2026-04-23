# pi-effort

Small Pi extension for controlling thinking/effort from inside a Pi session.

## Goal

Provide a simple `/effort` command for:

- showing the current thinking level
- changing the current session thinking level
- setting a persistent default thinking level

Planned command surface:

```text
/effort show
/effort off
/effort minimal
/effort low
/effort medium
/effort high
/effort xhigh
/effort default <off|minimal|low|medium|high|xhigh>
```

## Commands

```text
/effort
/effort show
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
  default effort.
- `/effort <level>` changes the current session thinking level.
- `/effort default <level>` changes the default thinking level for future
  sessions by editing `~/.pi/agent/settings.json`.
- `/effort default clear` removes the persisted default.

## Install

### From Git

```bash
pi install git:github.com/ricardofrantz/pi-effort
```

### Local development

```bash
npm install
```

Then load it from a local checkout:

```bash
pi --extension ./index.ts
```

Or install the package into Pi:

```bash
pi install git:github.com/ricardofrantz/pi-effort
```

## Verification

```bash
npm run check
npm test
```

## Repo structure

```text
index.ts        Pi extension entrypoint
effort.ts       Parsing and settings helpers
package.json    Package metadata and Pi manifest
tsconfig.json   TypeScript configuration
```

## License

Apache-2.0
