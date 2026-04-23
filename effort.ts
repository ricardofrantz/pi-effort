import { readFileSync, writeFileSync } from "node:fs";
import type { ThinkingLevel } from "@mariozechner/pi-ai";

export const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh"] as const;

export type EffortCommand =
  | { kind: "show" }
  | { kind: "help" }
  | { kind: "set-session"; level: ThinkingLevel }
  | { kind: "set-default"; level: ThinkingLevel | null };

export function isThinkingLevel(value: string): value is ThinkingLevel {
  return THINKING_LEVELS.includes(value as ThinkingLevel);
}

export function parseEffortCommand(args: string): EffortCommand {
  const tokens = args.trim().split(/\s+/).filter(Boolean);

  if (tokens.length === 0) return { kind: "show" };

  const [first, second, ...rest] = tokens;
  if (rest.length > 0) {
    throw new Error("Too many arguments. Use /effort help.");
  }

  if (first === "help") return { kind: "help" };
  if (first === "show" || first === "status" || first === "current") return { kind: "show" };

  if (first === "default") {
    if (!second || second === "show" || second === "status") return { kind: "show" };
    if (second === "clear" || second === "unset") return { kind: "set-default", level: null };
    if (isThinkingLevel(second)) return { kind: "set-default", level: second };
    throw new Error(`Unknown default thinking level "${second}".`);
  }

  if (isThinkingLevel(first)) return { kind: "set-session", level: first };

  throw new Error(`Unknown effort command "${first}".`);
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

export function getDefaultThinkingLevel(settingsPath: string): ThinkingLevel | undefined {
  const settings = readSettingsObject(settingsPath);
  const value = settings.defaultThinkingLevel;
  return typeof value === "string" && isThinkingLevel(value) ? value : undefined;
}

export function writeDefaultThinkingLevel(settingsPath: string, level: ThinkingLevel | null): void {
  const settings = readSettingsObject(settingsPath);

  if (level === null) {
    delete settings.defaultThinkingLevel;
  } else {
    settings.defaultThinkingLevel = level;
  }

  writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf-8");
}

export function formatUsage(): string {
  return [
    "Usage:",
    "  /effort",
    "  /effort show",
    "  /effort <off|minimal|low|medium|high|xhigh>",
    "  /effort default <off|minimal|low|medium|high|xhigh>",
    "  /effort default clear",
  ].join("\n");
}
