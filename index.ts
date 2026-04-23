import { join } from "node:path";
import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { getAgentDir } from "@mariozechner/pi-coding-agent";
import {
  THINKING_LEVELS,
  type EffortLevel,
  USAGE,
  getAvailableThinkingLevels,
  getDefaultThinkingLevel,
  parseEffortCommand,
  writeDefaultThinkingLevel,
} from "./effort.js";

function buildShowMessage(
  current: string,
  defaultLevel: EffortLevel | undefined,
  available: readonly EffortLevel[]
): string {
  const defaultText = defaultLevel ?? "(unset)";
  return `Effort: current=${current} | default=${defaultText} | available=${available.join(",")}`;
}

function updateEffortStatus(ctx: ExtensionCommandContext, current: string): void {
  ctx.ui.setStatus("effort", `effort:${current}`);
}

export default function effortExtension(pi: ExtensionAPI): void {
  pi.registerCommand("effort", {
    description: "Show or change session/default thinking effort",
    getArgumentCompletions: (prefix) => {
      const value = prefix.trimStart();
      const tokens = value.split(/\s+/).filter(Boolean);
      const trailingSpace = /\s$/.test(value);

      if (tokens.length === 0) {
        return [
          { value: "show", label: "show" },
          { value: "options", label: "options" },
          { value: "default", label: "default" },
          ...THINKING_LEVELS.map((level) => ({ value: level, label: level })),
        ];
      }

      if (tokens.length === 1 && !trailingSpace) {
        const options = ["show", "options", "default", ...THINKING_LEVELS];
        return options
          .filter((option) => option.startsWith(tokens[0]))
          .map((option) => ({ value: option, label: option }));
      }

      if (tokens[0] === "default") {
        const secondPrefix = trailingSpace ? "" : tokens[1] ?? "";
        const options = ["show", "clear", ...THINKING_LEVELS];
        return options
          .filter((option) => option.startsWith(secondPrefix))
          .map((option) => ({ value: `default ${option}`, label: option }));
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
          updateEffortStatus(ctx, pi.getThinkingLevel());
          ctx.ui.notify(USAGE, "info");
          return;

        case "options": {
          const available = getAvailableThinkingLevels(ctx.model);
          updateEffortStatus(ctx, pi.getThinkingLevel());
          ctx.ui.notify(
            `Available effort options for ${ctx.model?.id ?? "current model"}: ${available.join(", ")}`,
            "info"
          );
          return;
        }

        case "show": {
          const current = pi.getThinkingLevel();
          const available = getAvailableThinkingLevels(ctx.model);
          const defaultLevel = getDefaultThinkingLevel(settingsPath);
          updateEffortStatus(ctx, current);
          ctx.ui.notify(buildShowMessage(current, defaultLevel, available), "info");
          return;
        }

        case "set-session": {
          const available = getAvailableThinkingLevels(ctx.model);
          if (!available.includes(command.level)) {
            ctx.ui.notify(
              `Model ${ctx.model?.id ?? "current model"} does not support ${command.level}. ` +
                `Available: ${available.join(", ")}`,
              "error"
            );
            return;
          }
          const before = pi.getThinkingLevel();
          pi.setThinkingLevel(command.level as EffortLevel & Parameters<typeof pi.setThinkingLevel>[0]);
          const after = pi.getThinkingLevel();
          updateEffortStatus(ctx, after);
          ctx.ui.notify(`Effort changed: ${before} -> ${after}`, "info");
          return;
        }

        case "set-default":
          try {
            writeDefaultThinkingLevel(settingsPath, command.level);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            ctx.ui.notify(`Failed to update default effort: ${message}`, "error");
            return;
          }

          updateEffortStatus(ctx, pi.getThinkingLevel());
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
