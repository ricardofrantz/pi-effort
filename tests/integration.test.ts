import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Model, ThinkingLevel } from "@mariozechner/pi-ai";
import {
  AuthStorage,
  createAgentSession,
  createEventBus,
  ModelRegistry,
  SessionManager,
  SettingsManager,
  type LoadExtensionsResult,
  type ResourceLoader,
} from "@mariozechner/pi-coding-agent";
import {
  createExtensionRuntime,
  loadExtensionFromFactory,
} from "../node_modules/@mariozechner/pi-coding-agent/dist/core/extensions/loader.js";
import effortExtension from "../index.ts";

type PiThinkingLevel = ThinkingLevel | "off";

const reasoningModel: Model<any> = {
  id: "minimax/minimax-m2.7",
  name: "MiniMax M2.7",
  api: "openai-completions",
  provider: "openrouter",
  baseUrl: "https://openrouter.ai/api/v1",
  reasoning: true,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 196608,
  maxTokens: 4096,
};

const xhighModel: Model<any> = {
  id: "gpt-5.4",
  name: "GPT-5.4",
  api: "openai-completions",
  provider: "openrouter",
  baseUrl: "https://openrouter.ai/api/v1",
  reasoning: true,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 196608,
  maxTokens: 4096,
};

const plainModel: Model<any> = {
  id: "plain-model",
  name: "Plain Model",
  api: "openai-completions",
  provider: "openrouter",
  baseUrl: "https://openrouter.ai/api/v1",
  reasoning: false,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 128000,
  maxTokens: 4096,
};

function createResourceLoader(extensionsResult: LoadExtensionsResult): ResourceLoader {
  return {
    getExtensions: () => extensionsResult,
    getSkills: () => ({ skills: [], diagnostics: [] }),
    getPrompts: () => ({ prompts: [], diagnostics: [] }),
    getThemes: () => ({ themes: [], diagnostics: [] }),
    getAgentsFiles: () => ({ agentsFiles: [] }),
    getSystemPrompt: () => undefined,
    getAppendSystemPrompt: () => [],
    extendResources: () => {},
    reload: async () => {},
  };
}

function makeSessionConfig() {
  const tempRoot = mkdtempSync(join(tmpdir(), "pi-effort-runtime-"));
  const agentDir = join(tempRoot, "agent");
  const cwd = join(tempRoot, "cwd");
  mkdirSync(agentDir, { recursive: true });
  mkdirSync(cwd, { recursive: true });

  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir;

  const runtime = createExtensionRuntime();
  const eventBus = createEventBus();
  const extensionPromise = loadExtensionFromFactory(effortExtension, cwd, eventBus, runtime, "<pi-effort-test>");

  return {
    tempRoot,
    agentDir,
    cwd,
    previousAgentDir,
    extensionPromise,
    runtime,
    eventBus,
  };
}

async function createTestSession(
  model: Model<any>,
  thinkingLevel: PiThinkingLevel,
  defaultThinkingLevel?: PiThinkingLevel,
  flags: Record<string, boolean | string> = {}
) {
  const config = makeSessionConfig();
  const extension = await config.extensionPromise;
  for (const [name, value] of Object.entries(flags)) {
    config.runtime.flagValues.set(name, value);
  }
  const extensionsResult: LoadExtensionsResult = { extensions: [extension], errors: [], runtime: config.runtime };
  const resourceLoader = createResourceLoader(extensionsResult);

  const settingsManager = SettingsManager.create(config.cwd, config.agentDir);
  if (defaultThinkingLevel) {
    settingsManager.applyOverrides({ defaultThinkingLevel });
  }

  const authStorage = AuthStorage.create(join(config.agentDir, "auth.json"));
  authStorage.set("openrouter", { type: "api_key", key: "test" });
  const modelRegistry = ModelRegistry.create(authStorage, join(config.agentDir, "models.json"));
  const sessionManager = SessionManager.inMemory();

  const { session } = await createAgentSession({
    cwd: config.cwd,
    agentDir: config.agentDir,
    model,
    thinkingLevel,
    settingsManager,
    authStorage,
    modelRegistry,
    sessionManager,
    resourceLoader,
  });
  await session.bindExtensions({});

  return { session, extension, agentDir: config.agentDir, previousAgentDir: config.previousAgentDir };
}

function cleanupSession(previousAgentDir: string | undefined) {
  if (previousAgentDir === undefined) {
    delete process.env.PI_CODING_AGENT_DIR;
  } else {
    process.env.PI_CODING_AGENT_DIR = previousAgentDir;
  }
}

// ─── Basic command tests ────────────────────────────────────────────

test("runtime command changes session thinking level", async () => {
  const { session, previousAgentDir } = await createTestSession(reasoningModel, "medium", "medium");

  try {
    await session.prompt("/effort high");
    assert.equal(session.thinkingLevel, "high" as ThinkingLevel);
  } finally {
    cleanupSession(previousAgentDir);
  }
});

test("runtime default command writes agent settings file", async () => {
  const { session, agentDir, previousAgentDir } = await createTestSession(reasoningModel, "medium", "medium");

  try {
    await session.prompt("/effort default high");
    const persisted = JSON.parse(readFileSync(join(agentDir, "settings.json"), "utf-8"));
    assert.equal(persisted.defaultThinkingLevel, "high");
  } finally {
    cleanupSession(previousAgentDir);
  }
});

test("new sessions inherit defaultThinkingLevel from Pi settings", async () => {
  const { session, previousAgentDir } = await createTestSession(reasoningModel, "high", "high");

  try {
    assert.equal(session.thinkingLevel, "high" as ThinkingLevel);
  } finally {
    cleanupSession(previousAgentDir);
  }
});

// ─── xhigh pre-validation tests ─────────────────────────────────────

test("runtime rejects xhigh on non-xhigh-capable model", async () => {
  const { session, previousAgentDir } = await createTestSession(reasoningModel, "medium", "medium");

  try {
    const before = session.thinkingLevel;
    await session.prompt("/effort xhigh");
    assert.equal(session.thinkingLevel, before as ThinkingLevel);
  } finally {
    cleanupSession(previousAgentDir);
  }
});

test("runtime accepts xhigh on xhigh-capable model", async () => {
  const { session, previousAgentDir } = await createTestSession(xhighModel, "medium", "medium");

  try {
    await session.prompt("/effort xhigh");
    assert.equal(session.thinkingLevel, "xhigh" as ThinkingLevel);
  } finally {
    cleanupSession(previousAgentDir);
  }
});

// ─── min/max semantic alias tests ───────────────────────────────────

test("runtime /effort max resolves to high on non-xhigh model", async () => {
  const { session, previousAgentDir } = await createTestSession(reasoningModel, "medium", "medium");

  try {
    await session.prompt("/effort max");
    assert.equal(session.thinkingLevel, "high" as ThinkingLevel);
  } finally {
    cleanupSession(previousAgentDir);
  }
});

test("runtime /effort max resolves to xhigh on xhigh-capable model", async () => {
  const { session, previousAgentDir } = await createTestSession(xhighModel, "medium", "medium");

  try {
    await session.prompt("/effort max");
    assert.equal(session.thinkingLevel, "xhigh" as ThinkingLevel);
  } finally {
    cleanupSession(previousAgentDir);
  }
});

test("runtime /effort min resolves to minimal on reasoning model", async () => {
  const { session, previousAgentDir } = await createTestSession(reasoningModel, "high", "high");

  try {
    await session.prompt("/effort min");
    assert.equal(session.thinkingLevel, "minimal" as ThinkingLevel);
  } finally {
    cleanupSession(previousAgentDir);
  }
});

test("runtime /effort default max writes resolved level to settings", async () => {
  const { session, agentDir, previousAgentDir } = await createTestSession(xhighModel, "medium", "medium");

  try {
    await session.prompt("/effort default max");
    const persisted = JSON.parse(readFileSync(join(agentDir, "settings.json"), "utf-8"));
    assert.equal(persisted.defaultThinkingLevel, "xhigh");
  } finally {
    cleanupSession(previousAgentDir);
  }
});

// ─── Extension lifecycle surface tests ──────────────────────────────

test("runtime --effort flag resolves aliases on session start", async () => {
  const { session, previousAgentDir } = await createTestSession(xhighModel, "medium", "medium", { effort: "max" });

  try {
    assert.equal(session.thinkingLevel, "xhigh" as ThinkingLevel);
  } finally {
    cleanupSession(previousAgentDir);
  }
});

test("runtime model switch clamps xhigh to the new model maximum", async () => {
  const { session, previousAgentDir } = await createTestSession(xhighModel, "xhigh", "xhigh");

  try {
    await session.setModel(reasoningModel);
    assert.equal(session.thinkingLevel, "high" as ThinkingLevel);
  } finally {
    cleanupSession(previousAgentDir);
  }
});

test("runtime model switch clamps reasoning effort to off for non-reasoning models", async () => {
  const { session, previousAgentDir } = await createTestSession(reasoningModel, "high", "high");

  try {
    await session.setModel(plainModel);
    assert.equal(session.thinkingLevel, "off" as PiThinkingLevel);
  } finally {
    cleanupSession(previousAgentDir);
  }
});

test("argument completions are model-aware but keep explicit default levels", async () => {
  const { extension, previousAgentDir } = await createTestSession(plainModel, "off", "off");

  try {
    const command = extension.commands.get("effort");
    assert.ok(command?.getArgumentCompletions);

    const topLevel = await command.getArgumentCompletions("");
    assert.deepEqual(topLevel?.map((item) => item.value), ["off", "show", "options", "default", "help"]);

    const defaultOptions = await command.getArgumentCompletions("default ");
    assert.deepEqual(defaultOptions?.map((item) => item.value), [
      "default off",
      "default minimal",
      "default low",
      "default medium",
      "default high",
      "default xhigh",
      "default clear",
    ]);
  } finally {
    cleanupSession(previousAgentDir);
  }
});
