import { readFileSync, writeFileSync } from "node:fs";
import type { Model, ThinkingLevel } from "@mariozechner/pi-ai";

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

export function parseEffortCommand(args: string): EffortCommand {
  const tokens = args.trim().split(/\s+/).filter(Boolean);

  if (tokens.length === 0) return { kind: "show" };

  const [first, second, ...rest] = tokens;
  if (rest.length > 0) {
    throw new Error("Too many arguments. Use /effort help.");
  }

  if (first === "help") return { kind: "help" };
  if (first === "options" || first === "available") return { kind: "options" };
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

export function supportsXhighThinking(model: EffortModel | null | undefined): boolean {
  if (!model) return false;
  if (model.id.includes("gpt-5.2") || model.id.includes("gpt-5.3") || model.id.includes("gpt-5.4")) {
    return true;
  }

  if (
    model.id.includes("opus-4-6") ||
    model.id.includes("opus-4.6") ||
    model.id.includes("opus-4-7") ||
    model.id.includes("opus-4.7")
  ) {
    return true;
  }

  return false;
}

export function getAvailableThinkingLevels(model: EffortModel | null | undefined): EffortLevel[] {
  if (!model || !model.reasoning) return ["off"];
  return supportsXhighThinking(model) ? [...THINKING_LEVELS] : [...THINKING_LEVELS_WITHOUT_XHIGH];
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
  const settings = readSettingsObject(settingsPath);
  const value = settings.defaultThinkingLevel;
  return typeof value === "string" && isThinkingLevel(value) ? value : undefined;
}

export function writeDefaultThinkingLevel(settingsPath: string, level: EffortLevel | null): void {
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
    "  /effort options",
    "  /effort <off|minimal|low|medium|high|xhigh>",
    "  /effort default <off|minimal|low|medium|high|xhigh>",
    "  /effort default clear",
  ].join("\n");
}
