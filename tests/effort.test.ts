import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { ThinkingLevel } from "@mariozechner/pi-ai";
import {
  USAGE,
  USER_LEVELS,
  getAvailableThinkingLevels,
  getDefaultThinkingLevel,
  getUserFacingLevels,
  parseEffortCommand,
  resolveEffortLevel,
  resolveMaxLevel,
  resolveMinLevel,
  cycleLevel,
  writeDefaultThinkingLevel,
} from "../effort.ts";

// If @mariozechner/pi-ai adds a new ThinkingLevel (e.g. "xmax"), this
// refuses to compile until USER_LEVELS is extended. Removal is already
// caught by `satisfies readonly ThinkingLevel[]` in effort.ts.
type _UncoveredLevels = Exclude<ThinkingLevel, (typeof USER_LEVELS)[number]>;
const _driftCheck: [_UncoveredLevels] extends [never] ? true : never = true;
void _driftCheck;

// ─── parseEffortCommand ──────────────────────────────────────────────

test("parseEffortCommand handles show and help", () => {
  assert.deepEqual(parseEffortCommand(""), { kind: "show" });
  assert.deepEqual(parseEffortCommand("show"), { kind: "show" });
  assert.deepEqual(parseEffortCommand("options"), { kind: "options" });
  assert.deepEqual(parseEffortCommand("help"), { kind: "help" });
});

test("parseEffortCommand handles explicit levels", () => {
  assert.deepEqual(parseEffortCommand("high"), { kind: "set-session", level: "high" });
  assert.deepEqual(parseEffortCommand("xhigh"), { kind: "set-session", level: "xhigh" });
  assert.deepEqual(parseEffortCommand("minimal"), { kind: "set-session", level: "minimal" });
});

test("parseEffortCommand accepts off for backward compat", () => {
  assert.deepEqual(parseEffortCommand("off"), { kind: "set-session", level: "off" });
});

test("parseEffortCommand handles min and max aliases", () => {
  assert.deepEqual(parseEffortCommand("min"), { kind: "set-min" });
  assert.deepEqual(parseEffortCommand("max"), { kind: "set-max" });
});

test("parseEffortCommand handles default persistence commands", () => {
  assert.deepEqual(parseEffortCommand("default high"), { kind: "set-default", level: "high" });
  assert.deepEqual(parseEffortCommand("default clear"), { kind: "set-default", level: null });
});

test("parseEffortCommand handles default min and default max", () => {
  assert.deepEqual(parseEffortCommand("default min"), { kind: "set-default-min" });
  assert.deepEqual(parseEffortCommand("default max"), { kind: "set-default-max" });
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

test("parseEffortCommand suggests min/max and off for close typos", () => {
  assert.throws(() => parseEffortCommand("mn"), /Did you mean "min"\?/);
  assert.throws(() => parseEffortCommand("maxe"), /Did you mean "max"\?/);
  assert.throws(() => parseEffortCommand("default of"), /Did you mean "off"\?/);
});

test("parseEffortCommand does not suggest distant typos", () => {
  assert.throws(() => parseEffortCommand("xyz"), /Unknown effort command/);
  let message = "";
  try {
    parseEffortCommand("xyz");
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }
  assert.doesNotMatch(message, /Did you mean/);
});

// ─── resolveMinLevel / resolveMaxLevel ───────────────────────────────

test("resolveMinLevel returns minimal for reasoning models", () => {
  assert.equal(resolveMinLevel({ id: "minimax/minimax-m2.7", reasoning: true }), "minimal");
  assert.equal(resolveMinLevel({ id: "gpt-5.4", reasoning: true }), "minimal");
});

test("resolveMinLevel returns undefined for non-reasoning models", () => {
  assert.equal(resolveMinLevel({ id: "plain-model", reasoning: false }), undefined);
  assert.equal(resolveMinLevel(null), undefined);
});

test("resolveMaxLevel returns high for reasoning models without xhigh", () => {
  assert.equal(resolveMaxLevel({ id: "minimax/minimax-m2.7", reasoning: true }), "high");
});

test("resolveMaxLevel returns xhigh for xhigh-capable models", () => {
  assert.equal(resolveMaxLevel({ id: "gpt-5.4", reasoning: true }), "xhigh");
  assert.equal(resolveMaxLevel({ id: "claude-opus-4.6", reasoning: true }), "xhigh");
});

test("resolveMaxLevel returns undefined for non-reasoning models", () => {
  assert.equal(resolveMaxLevel({ id: "plain-model", reasoning: false }), undefined);
  assert.equal(resolveMaxLevel(null), undefined);
});

test("resolveEffortLevel resolves semantic aliases per model", () => {
  const standard = { id: "minimax/minimax-m2.7", reasoning: true } as const;
  const xhigh = { id: "gpt-5.4", reasoning: true } as const;

  assert.equal(resolveEffortLevel("min", standard), "minimal");
  assert.equal(resolveEffortLevel("max", standard), "high");
  assert.equal(resolveEffortLevel("max", xhigh), "xhigh");
  assert.equal(resolveEffortLevel("medium", standard), "medium");
  assert.equal(resolveEffortLevel("min", { id: "plain-model", reasoning: false }), undefined);
});

// ─── xhigh capability (via public functions) ─────────────────────────

test("xhigh capability: gpt-5.4 includes xhigh in available levels", () => {
  assert.deepEqual(getAvailableThinkingLevels({ id: "gpt-5.4", reasoning: true }), [
    "off", "minimal", "low", "medium", "high", "xhigh",
  ]);
});

test("xhigh capability: opus-4.6 includes xhigh in available levels", () => {
  assert.deepEqual(getAvailableThinkingLevels({ id: "claude-opus-4.6", reasoning: true }), [
    "off", "minimal", "low", "medium", "high", "xhigh",
  ]);
});

test("xhigh capability: minimax does not include xhigh in available levels", () => {
  assert.deepEqual(getAvailableThinkingLevels({ id: "minimax/minimax-m2.7", reasoning: true }), [
    "off", "minimal", "low", "medium", "high",
  ]);
});

// ─── getAvailableThinkingLevels / getUserFacingLevels ────────────────

test("getAvailableThinkingLevels includes off for all reasoning models", () => {
  assert.deepEqual(getAvailableThinkingLevels({ id: "plain-model", reasoning: false }), ["off"]);
  assert.deepEqual(getAvailableThinkingLevels({ id: "minimax/minimax-m2.7", reasoning: true }), [
    "off", "minimal", "low", "medium", "high",
  ]);
  assert.deepEqual(getAvailableThinkingLevels({ id: "gpt-5.4", reasoning: true }), [
    "off", "minimal", "low", "medium", "high", "xhigh",
  ]);
});

test("getUserFacingLevels excludes off", () => {
  assert.deepEqual(getUserFacingLevels({ id: "plain-model", reasoning: false }), []);
  assert.deepEqual(getUserFacingLevels({ id: "minimax/minimax-m2.7", reasoning: true }), [
    "minimal", "low", "medium", "high",
  ]);
  assert.deepEqual(getUserFacingLevels({ id: "gpt-5.4", reasoning: true }), [
    "minimal", "low", "medium", "high", "xhigh",
  ]);
});

// ─── cycleLevel ──────────────────────────────────────────────────────

test("cycleLevel advances through user-facing levels", () => {
  const model = { id: "gpt-5.4", reasoning: true } as const;
  assert.equal(cycleLevel("minimal", model), "low");
  assert.equal(cycleLevel("medium", model), "high");
  assert.equal(cycleLevel("xhigh", model), "minimal"); // wraps
});

test("cycleLevel returns first level for unknown current", () => {
  const model = { id: "gpt-5.4", reasoning: true } as const;
  assert.equal(cycleLevel("off", model), "minimal");
  assert.equal(cycleLevel("unknown", model), "minimal");
});

test("cycleLevel returns undefined for non-reasoning models", () => {
  assert.equal(cycleLevel("high", { id: "plain-model", reasoning: false }), undefined);
});

// ─── Settings persistence ────────────────────────────────────────────

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
  const tempFiles = files.filter((f) => f.startsWith(".settings.json.tmp"));
  assert.equal(tempFiles.length, 0);
});

test("writeDefaultThinkingLevel creates the settings directory", () => {
  const dir = join(mkdtempSync(join(tmpdir(), "pi-effort-")), "missing", "agent");
  const settingsPath = join(dir, "settings.json");

  writeDefaultThinkingLevel(settingsPath, "low");

  assert.equal(existsSync(settingsPath), true);
  assert.equal(getDefaultThinkingLevel(settingsPath), "low");
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
  const badPath = dir; // readFileSync on a directory throws EISDIR

  assert.equal(getDefaultThinkingLevel(badPath), undefined);
});

// ─── USAGE ───────────────────────────────────────────────────────────

test("USAGE includes min, max, and off", () => {
  assert.match(USAGE, /min/);
  assert.match(USAGE, /max/);
  assert.match(USAGE, /off/);
  assert.match(USAGE, /\/effort/);
});

// ─── Completion filtering (via getUserFacingLevels) ──────────────────

test("completion filter: non-reasoning model — no thinking levels", () => {
  const model = { id: "some-gpt-3.5", reasoning: false };
  const levels = getUserFacingLevels(model);
  assert.deepEqual(levels, []);
});

test("completion filter: reasoning model without xhigh — includes high but not xhigh", () => {
  const model = { id: "minimax/minimax-m2.7", reasoning: true };
  const levels = getUserFacingLevels(model);
  assert.ok(levels.includes("high"), "should include high");
  assert.equal(levels.includes("xhigh" as any), false, "should not include xhigh");
});

test("completion filter: xhigh-capable model — includes xhigh", () => {
  const model = { id: "gpt-5.4", reasoning: true };
  const levels = getUserFacingLevels(model);
  assert.ok(levels.includes("xhigh" as any), "should include xhigh");
});
