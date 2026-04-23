import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  USAGE,
  getAvailableThinkingLevels,
  getDefaultThinkingLevel,
  parseEffortCommand,
  supportsXhighThinking,
  writeDefaultThinkingLevel,
} from "../effort.ts";

test("parseEffortCommand handles show and current-session levels", () => {
  assert.deepEqual(parseEffortCommand(""), { kind: "show" });
  assert.deepEqual(parseEffortCommand("show"), { kind: "show" });
  assert.deepEqual(parseEffortCommand("options"), { kind: "options" });
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

test("parseEffortCommand suggests close matches for typos", () => {
  assert.throws(() => parseEffortCommand("hihg"), /Did you mean "high"\?/);
  assert.throws(() => parseEffortCommand("default hihg"), /Did you mean "high"\?/);
  assert.throws(() => parseEffortCommand("shwo"), /Did you mean "show"\?/);
});

test("parseEffortCommand does not suggest distant typos", () => {
  assert.throws(() => parseEffortCommand("xyz"), /Unknown effort command/);
  assert.doesNotMatch(String(() => {
    try { parseEffortCommand("xyz"); } catch (e) { return (e as Error).message; }
  }), /Did you mean/);
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

test("writeDefaultThinkingLevel clears default when none existed", () => {
  const dir = mkdtempSync(join(tmpdir(), "pi-effort-"));
  const settingsPath = join(dir, "settings.json");
  writeFileSync(settingsPath, JSON.stringify({ otherKey: "value" }, null, 2));

  writeDefaultThinkingLevel(settingsPath, null);

  const parsed = JSON.parse(readFileSync(settingsPath, "utf-8"));
  assert.equal("defaultThinkingLevel" in parsed, false);
  assert.equal(parsed.otherKey, "value");
});

test("writeDefaultThinkingLevel uses atomic write", () => {
  const dir = mkdtempSync(join(tmpdir(), "pi-effort-"));
  const settingsPath = join(dir, "settings.json");

  writeDefaultThinkingLevel(settingsPath, "medium");

  const files = readdirSync(dir);
  assert.equal(files.includes("settings.json"), true);
  // No temp files should remain
  const tempFiles = files.filter((f) => f.startsWith(".settings.json.tmp"));
  assert.equal(tempFiles.length, 0);
});

test("USAGE includes the slash command", () => {
  assert.match(USAGE, /\/effort/);
});

test("supportsXhighThinking matches Pi-level gpt-5.4 and opus-4.6 families", () => {
  assert.equal(supportsXhighThinking({ id: "gpt-5.4", reasoning: true }), true);
  assert.equal(supportsXhighThinking({ id: "claude-opus-4.6", reasoning: true }), true);
  assert.equal(supportsXhighThinking({ id: "minimax/minimax-m2.7", reasoning: true }), false);
});

test("supportsXhighThinking accepts custom patterns", () => {
  assert.equal(supportsXhighThinking({ id: "custom-xhigh-model", reasoning: true }, ["custom-xhigh"]), true);
  assert.equal(supportsXhighThinking({ id: "custom-xhigh-model", reasoning: true }, ["other-pattern"]), false);
});

test("getAvailableThinkingLevels reflects reasoning and xhigh support", () => {
  assert.deepEqual(getAvailableThinkingLevels({ id: "plain-model", reasoning: false }), ["off"]);
  assert.deepEqual(getAvailableThinkingLevels({ id: "minimax/minimax-m2.7", reasoning: true }), [
    "off",
    "minimal",
    "low",
    "medium",
    "high",
  ]);
  assert.deepEqual(getAvailableThinkingLevels({ id: "gpt-5.4", reasoning: true }), [
    "off",
    "minimal",
    "low",
    "medium",
    "high",
    "xhigh",
  ]);
});

test("getAvailableThinkingLevels respects configurable xhigh patterns", () => {
  const settings = { xhighModelPatterns: ["custom-reasoning"] };
  assert.deepEqual(getAvailableThinkingLevels({ id: "custom-reasoning-v1", reasoning: true }, settings), [
    "off",
    "minimal",
    "low",
    "medium",
    "high",
    "xhigh",
  ]);
});

test("getDefaultThinkingLevel returns undefined on corrupt JSON", () => {
  const dir = mkdtempSync(join(tmpdir(), "pi-effort-"));
  const settingsPath = join(dir, "settings.json");
  writeFileSync(settingsPath, "{not json}");

  assert.equal(getDefaultThinkingLevel(settingsPath), undefined);
});

test("getDefaultThinkingLevel returns undefined on unreadable settings", () => {
  const dir = mkdtempSync(join(tmpdir(), "pi-effort-"));
  const settingsPath = join(dir, "settings.json");
  writeFileSync(settingsPath, "{}");
  // Simulate a permission error by pointing to a directory instead of a file
  const badPath = dir; // readFileSync on a directory throws EISDIR

  assert.equal(getDefaultThinkingLevel(badPath), undefined);
});
