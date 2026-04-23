import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  formatUsage,
  getDefaultThinkingLevel,
  parseEffortCommand,
  writeDefaultThinkingLevel,
} from "../effort.ts";

test("parseEffortCommand handles show and current-session levels", () => {
  assert.deepEqual(parseEffortCommand(""), { kind: "show" });
  assert.deepEqual(parseEffortCommand("show"), { kind: "show" });
  assert.deepEqual(parseEffortCommand("xhigh"), { kind: "set-session", level: "xhigh" });
});

test("parseEffortCommand handles default persistence commands", () => {
  assert.deepEqual(parseEffortCommand("default high"), { kind: "set-default", level: "high" });
  assert.deepEqual(parseEffortCommand("default clear"), { kind: "set-default", level: null });
});

test("parseEffortCommand rejects invalid input", () => {
  assert.throws(() => parseEffortCommand("banana"), /Unknown effort command/);
  assert.throws(() => parseEffortCommand("default banana"), /Unknown default thinking level/);
});

test("writeDefaultThinkingLevel preserves unrelated settings", () => {
  const dir = mkdtempSync(join(tmpdir(), "pi-effort-"));
  const settingsPath = join(dir, "settings.json");
  writeFileSync(settingsPath, JSON.stringify({ defaultProvider: "openrouter" }, null, 2));

  writeDefaultThinkingLevel(settingsPath, "high");

  const parsed = JSON.parse(readFileSync(settingsPath, "utf-8"));
  assert.equal(parsed.defaultProvider, "openrouter");
  assert.equal(parsed.defaultThinkingLevel, "high");
  assert.equal(getDefaultThinkingLevel(settingsPath), "high");
});

test("writeDefaultThinkingLevel can clear the persisted default", () => {
  const dir = mkdtempSync(join(tmpdir(), "pi-effort-"));
  const settingsPath = join(dir, "settings.json");
  writeFileSync(settingsPath, JSON.stringify({ defaultThinkingLevel: "xhigh" }, null, 2));

  writeDefaultThinkingLevel(settingsPath, null);

  const parsed = JSON.parse(readFileSync(settingsPath, "utf-8"));
  assert.equal("defaultThinkingLevel" in parsed, false);
  assert.equal(getDefaultThinkingLevel(settingsPath), undefined);
});

test("formatUsage includes the slash command", () => {
  assert.match(formatUsage(), /\/effort/);
});
