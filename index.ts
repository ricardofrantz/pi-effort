import { join } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { getAgentDir } from "@mariozechner/pi-coding-agent";
import {
  THINKING_LEVELS,
  formatUsage,
  getDefaultThinkingLevel,
  parseEffortCommand,
  writeDefaultThinkingLevel,
} from "./effort.js";

function buildShowMessage(settingsPath: string, current: string): string {
  const defaultLevel = getDefaultThinkingLevel(settingsPath);
  const defaultText = defaultLevel ?? "(unset)";
  return `Effort: current=${current} | default=${defaultText}`;
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
          { value: "default", label: "default" },
          ...THINKING_LEVELS.map((level) => ({ value: level, label: level })),
        ];
      }

      if (tokens.length === 1 && !trailingSpace) {
        const options = ["show", "default", ...THINKING_LEVELS];
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
        ctx.ui.notify(`${message}\n${formatUsage()}`, "error");
        return;
      }

      switch (command.kind) {
        case "help":
          ctx.ui.notify(formatUsage(), "info");
          return;

        case "show":
          ctx.ui.notify(buildShowMessage(settingsPath, pi.getThinkingLevel()), "info");
          return;

        case "set-session": {
          const before = pi.getThinkingLevel();
          pi.setThinkingLevel(command.level);
          const after = pi.getThinkingLevel();
          if (after === command.level) {
            ctx.ui.notify(`Effort changed: ${before} -> ${after}`, "info");
          } else {
            ctx.ui.notify(
              `Effort request clamped by current model: requested ${command.level}, effective ${after}`,
              "warning",
            );
          }
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
