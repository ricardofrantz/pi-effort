import { join } from "node:path";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { getAgentDir } from "@mariozechner/pi-coding-agent";
import {
  ALL_LEVELS,
  SEMANTIC_ALIASES,
  USER_LEVELS,
  USAGE,
  type EffortLevel,
  type EffortModel,
  cycleLevel,
  getAvailableThinkingLevels,
  getDefaultThinkingLevel,
  getUserFacingLevels,
  isEffortAlias,
  parseEffortCommand,
  resolveEffortLevel,
  resolveMaxLevel,
  resolveMinLevel,
  toThinkingLevel,
  writeDefaultThinkingLevel,
} from "./effort.js";

function modelName(model: EffortModel | null | undefined): string {
  return model?.id ?? "current model";
}

function formatAvailableLevels(model: EffortModel | null | undefined): string {
  return getAvailableThinkingLevels(model).join(", ");
}

function buildShowMessage(
  current: string,
  defaultLevel: EffortLevel | undefined,
  model: EffortModel | null | undefined
): string {
  const defaultText = defaultLevel ?? "(unset)";
  const min = resolveMinLevel(model);
  const max = resolveMaxLevel(model);
  const parts = [`current=${current}`, `default=${defaultText}`, `available=${formatAvailableLevels(model)}`];
  if (min && max) parts.push(`min=${min} max=${max}`);
  return `Effort: ${parts.join(" | ")}`;
}

function requestEffortRender(ctx: ExtensionContext): void {
  // Pi's built-in footer already renders the model's thinking level from
  // session state. Clear older pi-effort status lines and request a render
  // without adding duplicate footer text.
  ctx.ui.setStatus("effort", undefined);
}

function updateEffortUi(ctx: ExtensionContext, current: string, updateWorkingMessage = true): void {
  requestEffortRender(ctx);
  if (updateWorkingMessage) {
    ctx.ui.setWorkingMessage(current === "off" ? undefined : `Working (${current} effort)...`);
  }
}

function applySessionLevel(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  level: EffortLevel
): void {
  const available = getAvailableThinkingLevels(ctx.model);
  if (!available.includes(level)) {
    ctx.ui.notify(
      `Model ${modelName(ctx.model)} does not support ${level}. Available: ${formatAvailableLevels(ctx.model)}`,
      "error"
    );
    return;
  }

  const before = pi.getThinkingLevel();
  pi.setThinkingLevel(toThinkingLevel(level));
  const after = pi.getThinkingLevel();
  const appliesNow = ctx.isIdle();
  updateEffortUi(ctx, after, appliesNow);
  const suffix = appliesNow ? "" : " (applies next prompt)";
  ctx.ui.notify(before === after ? `Effort already ${after}` : `Effort changed: ${before} -> ${after}${suffix}`, "info");
}

export default function effortExtension(pi: ExtensionAPI): void {
  // ─── Closure: track current model for tab completion ─────────────
  let currentModel: EffortModel | null = null;
  let activeRunEffort: string | undefined;

  function syncEffortUi(ctx: ExtensionContext, current: string = pi.getThinkingLevel()): string {
    updateEffortUi(ctx, current);
    return current;
  }

  // ─── CLI flag ────────────────────────────────────────────────────
  pi.registerFlag("effort", {
    description: "Initial thinking effort level (off|min|max|minimal|low|medium|high|xhigh)",
    type: "string",
  });

  // ─── Keyboard shortcut: Ctrl+Shift+E to cycle effort ─────────────
  pi.registerShortcut("ctrl+shift+e", {
    description: "Cycle effort level",
    handler: (ctx) => {
      const current = pi.getThinkingLevel();
      const next = cycleLevel(current, ctx.model);
      if (!next) {
        ctx.ui.notify("Thinking not available for this model", "warning");
        return;
      }
      pi.setThinkingLevel(toThinkingLevel(next));
      const after = pi.getThinkingLevel();
      const appliesNow = ctx.isIdle();
      updateEffortUi(ctx, after, appliesNow);
      const suffix = appliesNow ? "" : " (applies next prompt)";
      ctx.ui.notify(`Effort: ${current} -> ${after}${suffix}`, "info");
    },
  });

  // ─── session_start: sync visible effort UI + apply --effort flag ─
  pi.on("session_start", (_event, ctx) => {
    // Track model for tab completion
    currentModel = ctx.model ?? null;
    // Sync current effort labels
    syncEffortUi(ctx);

    // Apply --effort CLI flag if present
    const flagValue = pi.getFlag("effort");
    if (typeof flagValue === "string" && flagValue) {
      const requested = flagValue.trim();
      const isKnownRequest = ALL_LEVELS.includes(requested as EffortLevel) || isEffortAlias(requested);
      if (!isKnownRequest) {
        ctx.ui.notify(`--effort ${flagValue}: unknown effort level`, "warning");
        return;
      }

      const resolved = resolveEffortLevel(requested as EffortLevel | "min" | "max", ctx.model);
      if (!resolved) {
        ctx.ui.notify(`--effort ${flagValue}: thinking not available for ${modelName(ctx.model)}`, "warning");
        return;
      }

      const available = getAvailableThinkingLevels(ctx.model);
      if (!available.includes(resolved)) {
        ctx.ui.notify(
          `--effort ${flagValue}: not supported by ${modelName(ctx.model)}. Available: ${formatAvailableLevels(ctx.model)}`,
          "warning"
        );
        return;
      }

      pi.setThinkingLevel(toThinkingLevel(resolved));
      syncEffortUi(ctx);
    }
  });

  // ─── model_select: sync visible effort UI ────────────────────────
  pi.on("model_select", (event, ctx) => {
    currentModel = event.model;
    const visibleEffort = ctx.isIdle() ? pi.getThinkingLevel() : activeRunEffort ?? pi.getThinkingLevel();
    syncEffortUi(ctx, visibleEffort);
  });

  // Keep labels fresh if the user changes thinking through Pi's native UI.
  // During an active run, keep the loader tied to the run-start effort so a
  // mid-stream change is not misrepresented as affecting in-flight requests.
  pi.on("agent_start", (_event, ctx) => {
    currentModel = ctx.model ?? currentModel;
    activeRunEffort = pi.getThinkingLevel();
    syncEffortUi(ctx, activeRunEffort);
  });

  pi.on("turn_start", (_event, ctx) => {
    currentModel = ctx.model ?? currentModel;
    activeRunEffort ??= pi.getThinkingLevel();
    syncEffortUi(ctx, activeRunEffort);
  });

  pi.on("agent_end", (_event, ctx) => {
    activeRunEffort = undefined;
    syncEffortUi(ctx);
  });

  // ─── /effort command ─────────────────────────────────────────────
  pi.registerCommand("effort", {
    description: "Show or change thinking effort (min/max adapt per model)",
    getArgumentCompletions: (prefix) => {
      const value = prefix.trimStart();
      const tokens = value.split(/\s+/).filter(Boolean);
      const trailingSpace = /\s$/.test(value);

      // Build model-aware level list for completions
      const modelLevels = getUserFacingLevels(currentModel);
      const modelAliases = modelLevels.length > 0 ? [...SEMANTIC_ALIASES] : [];

      // Top-level completions: min, max (if reasoning), explicit levels (filtered), subcommands
      const topLevel = [...modelAliases, ...modelLevels, "off", "show", "options", "default", "help"];

      if (tokens.length === 0) {
        return topLevel.map((t) => ({ value: t, label: t }));
      }

      if (tokens.length === 1 && !trailingSpace) {
        return topLevel
          .filter((t) => t.startsWith(tokens[0]))
          .map((t) => ({ value: t, label: t }));
      }

      // "default" subcommand completions. Explicit default levels remain useful
      // even when the current model does not support thinking.
      if (tokens[0] === "default") {
        const secondPrefix = trailingSpace ? "" : tokens[1] ?? "";
        const defaultOptions = [...modelAliases, "off", ...USER_LEVELS, "clear"];
        return defaultOptions
          .filter((t) => t.startsWith(secondPrefix))
          .map((t) => ({ value: `default ${t}`, label: t }));
      }

      return null;
    },
    handler: async (args, ctx) => {
      const settingsPath = join(getAgentDir(), "settings.json");

      let command;
      try {
        command = parseEffortCommand(args);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.ui.notify(message, "error");
        return;
      }

      switch (command.kind) {
        case "help":
          requestEffortRender(ctx);
          ctx.ui.notify(USAGE, "info");
          return;

        case "options": {
          const min = resolveMinLevel(ctx.model);
          const max = resolveMaxLevel(ctx.model);
          requestEffortRender(ctx);
          let msg = `Available effort for ${modelName(ctx.model)}: ${formatAvailableLevels(ctx.model)}`;
          if (min && max) msg += ` (min=${min}, max=${max})`;
          ctx.ui.notify(msg, "info");
          return;
        }

        case "show": {
          const current = pi.getThinkingLevel();
          requestEffortRender(ctx);
          const defaultLevel = getDefaultThinkingLevel(settingsPath);
          ctx.ui.notify(buildShowMessage(current, defaultLevel, ctx.model), "info");
          return;
        }

        case "set-session": {
          applySessionLevel(pi, ctx, command.level);
          return;
        }

        case "set-min": {
          const resolved = resolveMinLevel(ctx.model);
          if (!resolved) {
            ctx.ui.notify(`Thinking not available for ${modelName(ctx.model)}`, "error");
            return;
          }
          applySessionLevel(pi, ctx, resolved);
          return;
        }

        case "set-max": {
          const resolved = resolveMaxLevel(ctx.model);
          if (!resolved) {
            ctx.ui.notify(`Thinking not available for ${modelName(ctx.model)}`, "error");
            return;
          }
          applySessionLevel(pi, ctx, resolved);
          return;
        }

        case "set-default-min": {
          const resolved = resolveMinLevel(ctx.model);
          if (!resolved) {
            ctx.ui.notify(`Thinking not available for ${ctx.model?.id ?? "current model"}`, "error");
            return;
          }
          try {
            writeDefaultThinkingLevel(settingsPath, resolved);
          } catch (error) {
            ctx.ui.notify(`Failed to update default effort: ${error instanceof Error ? error.message : String(error)}`, "error");
            return;
          }
          ctx.ui.notify(`Default effort set to ${resolved} (min for ${ctx.model?.id ?? "current model"})`, "info");
          return;
        }

        case "set-default-max": {
          const resolved = resolveMaxLevel(ctx.model);
          if (!resolved) {
            ctx.ui.notify(`Thinking not available for ${ctx.model?.id ?? "current model"}`, "error");
            return;
          }
          try {
            writeDefaultThinkingLevel(settingsPath, resolved);
          } catch (error) {
            ctx.ui.notify(`Failed to update default effort: ${error instanceof Error ? error.message : String(error)}`, "error");
            return;
          }
          ctx.ui.notify(`Default effort set to ${resolved} (max for ${ctx.model?.id ?? "current model"})`, "info");
          return;
        }

        case "set-default":
          try {
            writeDefaultThinkingLevel(settingsPath, command.level);
          } catch (error) {
            ctx.ui.notify(`Failed to update default effort: ${error instanceof Error ? error.message : String(error)}`, "error");
            return;
          }
          if (command.level === null) {
            ctx.ui.notify("Default effort cleared for future sessions.", "info");
          } else {
            ctx.ui.notify(`Default effort set to ${command.level} for future sessions.`, "info");
          }
          return;
      }
    },
  });
}
