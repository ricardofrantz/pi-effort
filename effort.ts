import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Model } from "@mariozechner/pi-ai";

export const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh"] as const;
export const THINKING_LEVELS_WITHOUT_XHIGH = ["off", "minimal", "low", "medium", "high"] as const;
export type EffortLevel = (typeof THINKING_LEVELS)[number];

export type EffortCommand =
  | { kind: "show" }
  | { kind: "options" }
  | { kind: "help" }
  | { kind: "set-session"; level: EffortLevel }
  | { kind: "set-default"; level: EffortLevel | null };

export type EffortModel = Pick<Model<any>, "id" | "reasoning">;

export function isThinkingLevel(value: string): value is EffortLevel {
  return THINKING_LEVELS.includes(value as EffortLevel);
}

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

  if (first === "default") {
    if (!second || second === "show" || second === "status") return { kind: "show" };
    if (second === "clear" || second === "unset") return { kind: "set-default", level: null };
    if (isThinkingLevel(second)) return { kind: "set-default", level: second };
    const suggestion = suggestClosest(second, THINKING_LEVELS);
    const hint = suggestion ? ` Did you mean "${suggestion}"?` : "";
    throw new Error(`Unknown default thinking level "${second}".${hint}`);
  }

  if (isThinkingLevel(first)) return { kind: "set-session", level: first };

  const suggestion = suggestClosest(first, [...THINKING_LEVELS, "show", "options", "default", "help"]);
  const hint = suggestion ? ` Did you mean "${suggestion}"?` : "";
  throw new Error(`Unknown effort command "${first}".${hint}`);
}

const DEFAULT_XHIGH_PATTERNS = [
  "gpt-5.2",
  "gpt-5.3",
  "gpt-5.4",
  "opus-4-6",
  "opus-4.6",
  "opus-4-7",
  "opus-4.7",
];

function getXhighPatterns(settings: Record<string, unknown>): string[] {
  const override = settings.xhighModelPatterns;
  if (Array.isArray(override) && override.every((v) => typeof v === "string")) {
    return override as string[];
  }
  return DEFAULT_XHIGH_PATTERNS;
}

export function supportsXhighThinking(
  model: EffortModel | null | undefined,
  patterns?: string[]
): boolean {
  if (!model) return false;
  const checks = patterns ?? DEFAULT_XHIGH_PATTERNS;
  return checks.some((p) => model.id.includes(p));
}

export function getAvailableThinkingLevels(
  model: EffortModel | null | undefined,
  settings?: Record<string, unknown>
): EffortLevel[] {
  if (!model || !model.reasoning) return ["off"];
  const patterns = settings ? getXhighPatterns(settings) : undefined;
  return supportsXhighThinking(model, patterns) ? [...THINKING_LEVELS] : [...THINKING_LEVELS_WITHOUT_XHIGH];
}

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
    return typeof value === "string" && isThinkingLevel(value) ? value : undefined;
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
  const tmpPath = join(dir, `.settings.json.tmp.${Date.now()}`);
  writeFileSync(tmpPath, content, "utf-8");
  renameSync(tmpPath, settingsPath);
}

export const USAGE = [
  "Usage:",
  "  /effort",
  "  /effort show",
  "  /effort options",
  "  /effort <off|minimal|low|medium|high|xhigh>",
  "  /effort default <off|minimal|low|medium|high|xhigh>",
  "  /effort default clear",
].join("\n");
