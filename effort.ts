import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { supportsXhigh } from "@mariozechner/pi-ai";
import type { Model, ThinkingLevel } from "@mariozechner/pi-ai";

/**
 * All levels the extension knows about, including "off" (Pi's internal default).
 * "off" is accepted by the parser for backward compat but not shown in the
 * primary command surface — use `min`/`max` or explicit reasoning levels instead.
 */
export const ALL_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh"] as const;
export const ALL_LEVELS_WITHOUT_XHIGH = ["off", "minimal", "low", "medium", "high"] as const;

/** Levels shown to users in USAGE, tab completion, and /effort options. */
export const USER_LEVELS = ["minimal", "low", "medium", "high", "xhigh"] as const satisfies readonly ThinkingLevel[];

/** Semantic aliases that resolve per-model. */
export const SEMANTIC_ALIASES = ["min", "max"] as const;

export type EffortLevel = (typeof ALL_LEVELS)[number];
export type EffortAlias = (typeof SEMANTIC_ALIASES)[number];

/**
 * Resolve the Pi ThinkingLevel from our EffortLevel.
 * "off" is not in ThinkingLevel but is valid in Pi's internal state.
 */
export function toThinkingLevel(level: EffortLevel): ThinkingLevel | "off" {
  return level;
}

export function isEffortLevel(value: string): value is EffortLevel {
  return ALL_LEVELS.includes(value as EffortLevel);
}

export function isEffortAlias(value: string): value is EffortAlias {
  return SEMANTIC_ALIASES.includes(value as EffortAlias);
}

export type EffortCommand =
  | { kind: "show" }
  | { kind: "options" }
  | { kind: "help" }
  | { kind: "set-session"; level: EffortLevel }
  | { kind: "set-min" }
  | { kind: "set-max" }
  | { kind: "set-default-min" }
  | { kind: "set-default-max" }
  | { kind: "set-default"; level: EffortLevel | null };

export type EffortModel = Pick<Model<any>, "id" | "reasoning">;

// ─── Suggestion helpers ─────────────────────────────────────────────

function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const dp: number[] = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;

  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      if (a[i - 1] === b[j - 1]) {
        dp[j] = prev;
      } else {
        dp[j] = Math.min(prev + 1, dp[j] + 1, dp[j - 1] + 1);
      }
      prev = temp;
    }
  }
  return dp[n];
}

function suggestClosest(input: string, candidates: readonly string[]): string | null {
  let best: string | null = null;
  let bestDist = Infinity;
  for (const candidate of candidates) {
    const dist = levenshteinDistance(input, candidate);
    if (dist < bestDist && dist <= 2) {
      bestDist = dist;
      best = candidate;
    }
  }
  return best;
}

/** All tokens valid as the first argument to /effort. */
const FIRST_TOKEN_CANDIDATES = [...ALL_LEVELS, ...SEMANTIC_ALIASES, "show", "options", "default", "help"];

// ─── Parser ─────────────────────────────────────────────────────────

export function parseEffortCommand(args: string): EffortCommand {
  const tokens = args.trim().split(/\s+/).filter(Boolean);

  if (tokens.length === 0) return { kind: "show" };

  const [first, second, ...rest] = tokens;
  if (rest.length > 0) {
    throw new Error(`Too many arguments.\n${USAGE}`);
  }

  if (first === "help") return { kind: "help" };
  if (first === "options" || first === "available") return { kind: "options" };
  if (first === "show" || first === "status" || first === "current") return { kind: "show" };
  if (first === "max") return { kind: "set-max" };
  if (first === "min") return { kind: "set-min" };

  if (first === "default") {
    if (!second || second === "show" || second === "status") return { kind: "show" };
    if (second === "clear" || second === "unset") return { kind: "set-default", level: null };
    if (second === "max") return { kind: "set-default-max" };
    if (second === "min") return { kind: "set-default-min" };
    if (isEffortLevel(second)) return { kind: "set-default", level: second };
    const suggestion = suggestClosest(second, [...ALL_LEVELS, ...SEMANTIC_ALIASES, "clear", "unset"]);
    const hint = suggestion ? ` Did you mean "${suggestion}"?` : "";
    throw new Error(`Unknown default thinking level "${second}".${hint}`);
  }

  // Accept "off" for backward compat even though it's not in the user-facing list
  if (isEffortLevel(first)) return { kind: "set-session", level: first };

  const suggestion = suggestClosest(first, FIRST_TOKEN_CANDIDATES);
  const hint = suggestion ? ` Did you mean "${suggestion}"?` : "";
  throw new Error(`Unknown effort command "${first}".${hint}`);
}

// ─── Model capability resolution ────────────────────────────────────

/** Levels available for the given model, including "off". */
export function getAvailableThinkingLevels(model: EffortModel | null | undefined): EffortLevel[] {
  if (!model || !model.reasoning) return ["off"];
  return supportsXhigh(model as Model<any>) ? [...ALL_LEVELS] : [...ALL_LEVELS_WITHOUT_XHIGH];
}

/** Levels shown to the user for the given model (excludes "off"). */
export function getUserFacingLevels(model: EffortModel | null | undefined): EffortLevel[] {
  return getAvailableThinkingLevels(model).filter((l) => l !== "off");
}

/**
 * Resolve "min" to the lowest reasoning level for the model.
 * Returns undefined for non-reasoning models (thinking unavailable).
 */
export function resolveMinLevel(model: EffortModel | null | undefined): EffortLevel | undefined {
  if (!model?.reasoning) return undefined;
  return "minimal";
}

/**
 * Resolve "max" to the highest available level for the model.
 * Returns undefined for non-reasoning models (thinking unavailable).
 */
export function resolveMaxLevel(model: EffortModel | null | undefined): EffortLevel | undefined {
  if (!model?.reasoning) return undefined;
  return supportsXhigh(model as Model<any>) ? "xhigh" : "high";
}

/** Resolve a user-facing level or semantic alias against the active model. */
export function resolveEffortLevel(
  value: EffortLevel | EffortAlias,
  model: EffortModel | null | undefined
): EffortLevel | undefined {
  if (value === "min") return resolveMinLevel(model);
  if (value === "max") return resolveMaxLevel(model);
  return value;
}

/** Cycle to the next effort level for the given model. Wraps around. */
export function cycleLevel(current: string, model: EffortModel | null | undefined): EffortLevel | undefined {
  const levels = getUserFacingLevels(model);
  if (levels.length === 0) return undefined;
  const idx = levels.indexOf(current as EffortLevel);
  if (idx === -1) return levels[0];
  return levels[(idx + 1) % levels.length];
}

// ─── Settings persistence ───────────────────────────────────────────

export function readSettingsObject(settingsPath: string): Record<string, unknown> {
  try {
    const raw = readFileSync(settingsPath, "utf-8").trim();
    if (raw.length === 0) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    throw new Error("settings.json is not a JSON object");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

export function getDefaultThinkingLevel(settingsPath: string): EffortLevel | undefined {
  try {
    const settings = readSettingsObject(settingsPath);
    const value = settings.defaultThinkingLevel;
    return typeof value === "string" && isEffortLevel(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

export function writeDefaultThinkingLevel(settingsPath: string, level: EffortLevel | null): void {
  const settings = readSettingsObject(settingsPath);

  if (level === null) {
    delete settings.defaultThinkingLevel;
  } else {
    settings.defaultThinkingLevel = level;
  }

  const content = `${JSON.stringify(settings, null, 2)}\n`;
  const dir = dirname(settingsPath);
  mkdirSync(dir, { recursive: true });
  const tmpPath = join(dir, `.settings.json.tmp.${process.pid}.${randomUUID()}`);

  try {
    writeFileSync(tmpPath, content, "utf-8");
    renameSync(tmpPath, settingsPath);
  } catch (error) {
    try {
      unlinkSync(tmpPath);
    } catch {
      // Best effort: the original write failure is more useful to callers.
    }
    throw error;
  }
}

// ─── Help text ──────────────────────────────────────────────────────

export const USAGE = [
  "Usage:",
  "  /effort            show current effort",
  "  /effort min        set minimum effort for this model",
  "  /effort max        set maximum effort for this model",
  "  /effort <level>    set explicit level (off|minimal|low|medium|high|xhigh)",
  "  /effort options    show available levels for this model",
  "  /effort help       show command help",
  "  /effort default min|max|<level>",
  "  /effort default clear",
].join("\n");
