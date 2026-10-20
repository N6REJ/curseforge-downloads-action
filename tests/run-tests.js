"use strict";

const assert = require("node:assert/strict");

const { buildPayload, mergeSnapshots } = require("../src/lib/compute");
const { parseActionInputs } = require("../src/lib/validation");
const { getFreshCachedTotal } = require("../src/lib/cache");
const { isRetryableWriteConflict } = require("../src/lib/change-utils");
const { createCurseForgeClient } = require("../src/lib/curseforge-api");
const { buildDashboardMarkdown } = require("../src/lib/dashboard");
const { run } = require("../src/index");

function testMergeWindow() {
  const merged = mergeSnapshots(
    {
      "2026-02-15": 10,
      "2026-02-16": 11,
      "2026-02-17": 12,
    },
    "2026-02-18",
    13,
    2,
  );

  assert.deepEqual(merged, {
    "2026-02-17": 12,
    "2026-02-18": 13,
  });
}

function testPayload() {
  const payload = buildPayload({
    owner: "n6rej",
    repo: "demo",
    visibility: "public",
    generatedAt: "2026-02-18T00:00:00.000Z",
    total: 120,
    todayDate: "2026-02-18",
    windowDays: 45,
    series: {
      "2026-02-17": 100,
      "2026-02-18": 120,
    },
    hourlyEnabled: false,
  });

  assert.equal(payload.stats.day, 20);
}

function testPayloadYearly() {
  const payload = buildPayload({
    owner: "n6rej",
    repo: "demo",
    visibility: "public",
    generatedAt: "2026-02-18T00:00:00.000Z",
    total: 1200,
    todayDate: "2026-02-18",
    windowDays: 365,
    series: {
      "2025-02-18": 800,
      "2026-02-18": 1200,
    },
    hourlyEnabled: false,
  });

  assert.equal(payload.stats.year, 400);
  assert.equal(payload.partial.year, false);
}

function testInputs() {
  const parsed = parseActionInputs({
    GITHUB_REPOSITORY: "x/y",
    INPUT_WINDOW_DAYS: "45",
    INPUT_ENABLE_HOURLY_PROFILE: "false",
    INPUT_OUTPUT_BRANCH: "stats-data",
    INPUT_OUTPUT_PATH: "curseforge/downloads.json",
  });

  assert.equal(parsed.owner, "x");
  assert.equal(parsed.repo, "y");
  assert.equal(parsed.minRefreshMinutes, 0);
  assert.equal(parsed.publishChart, false);
  assert.equal(parsed.chartOutputPath, "curseforge/downloads-trend.svg");
  assert.deepEqual(parsed.chartTypes, ["total-trend"]);
  assert.deepEqual(parsed.chartThemes, ["slate"]);
  assert.equal(parsed.chartsOutputDir, "curseforge/charts");
  assert.equal(parsed.chartWidth, 1000);
  assert.equal(parsed.chartHeight, 360);
  assert.equal(parsed.chartZeroBaseline, true);
  assert.equal(parsed.chartYTicks, 6);
  assert.equal(parsed.chartXLabelEveryDays, 0);
  assert.equal(parsed.chartShowValueLabels, false);
  assert.equal(parsed.chartDateLabelFormat, "yyyy-mm-dd");
  assert.equal(parsed.chartShowGeneratedAt, true);
  assert.equal(parsed.chartTitleMode, "default");
  assert.equal(parsed.chartTitleText, "");
  assert.equal(parsed.publishDashboard, true);
  assert.equal(parsed.dashboardPath, "curseforge/dashboard.md");
}

function testInputsDefaultWindowDays() {
  const parsed = parseActionInputs({ GITHUB_REPOSITORY: "x/y" });
  assert.equal(parsed.windowDays, 365);
}

function testInputsDashboard() {
  const parsed = parseActionInputs({
    GITHUB_REPOSITORY: "x/y",
    INPUT_PUBLISH_DASHBOARD: "true",
    INPUT_DASHBOARD_PATH: "stats/dashboard.md",
  });

  assert.equal(parsed.publishDashboard, true);
  assert.equal(parsed.dashboardPath, "stats/dashboard.md");

  assert.throws(
    () =>
      parseActionInputs({
        GITHUB_REPOSITORY: "x/y",
        INPUT_PUBLISH_DASHBOARD: "true",
        INPUT_OUTPUT_PATH: "curseforge/downloads.json",
        INPUT_DASHBOARD_PATH: "curseforge/downloads.json",
      }),
    /dashboard_path/,
  );
}

function testInputsCurseforge() {
  const parsed = parseActionInputs({
    GITHUB_REPOSITORY: "x/y",
    INPUT_CURSEFORGE_MOD_ID: "234567",
    INPUT_CF_API_KEY: "cf-test-key",
  });

  assert.equal(parsed.curseforgeModId, 234567);
  assert.equal(parsed.cfApiKey, "cf-test-key");

  const missing = parseActionInputs({ GITHUB_REPOSITORY: "x/y" });
  assert.equal(missing.curseforgeModId, null);
  assert.equal(missing.cfApiKey, "");

  assert.throws(
    () => parseActionInputs({ GITHUB_REPOSITORY: "x/y", INPUT_CURSEFORGE_MOD_ID: "abc" }),
    /curseforge_mod_id/,
  );
  assert.throws(
    () => parseActionInputs({ GITHUB_REPOSITORY: "x/y", INPUT_CURSEFORGE_MOD_ID: "0" }),
    /curseforge_mod_id/,
  );
  assert.throws(
    () => parseActionInputs({ GITHUB_REPOSITORY: "x/y", INPUT_CURSEFORGE_MOD_ID: "-3" }),
    /curseforge_mod_id/,
  );
}

function testInputsChartMatrix() {
  const parsed = parseActionInputs({
    GITHUB_REPOSITORY: "x/y",
    INPUT_CHART_TYPES: "total-trend,daily,weekly,monthly,yearly,daily",
    INPUT_CHART_THEMES: "black,slate,orange,slate",
    INPUT_CHARTS_OUTPUT_DIR: "curseforge/charts",
    INPUT_CHART_WIDTH: "1200",
    INPUT_CHART_HEIGHT: "420",
    INPUT_CHART_ZERO_BASELINE: "false",
    INPUT_CHART_Y_TICKS: "10",
    INPUT_CHART_X_LABEL_EVERY_DAYS: "1",
    INPUT_CHART_SHOW_VALUE_LABELS: "true",
    INPUT_CHART_DATE_LABEL_FORMAT: "dd/mm",
    INPUT_CHART_SHOW_GENERATED_AT: "false",
    INPUT_CHART_TITLE_MODE: "custom",
    INPUT_CHART_TITLE_TEXT: "Downloads activity board",
  });

  assert.deepEqual(parsed.chartTypes, ["total-trend", "daily", "weekly", "monthly", "yearly"]);
  assert.deepEqual(parsed.chartThemes, ["black", "slate", "orange"]);
  assert.equal(parsed.chartWidth, 1200);
  assert.equal(parsed.chartHeight, 420);
  assert.equal(parsed.chartZeroBaseline, false);
  assert.equal(parsed.chartYTicks, 10);
  assert.equal(parsed.chartXLabelEveryDays, 1);
  assert.equal(parsed.chartShowValueLabels, true);
  assert.equal(parsed.chartDateLabelFormat, "dd/mm");
  assert.equal(parsed.chartShowGeneratedAt, false);
  assert.equal(parsed.chartTitleMode, "custom");
  assert.equal(parsed.chartTitleText, "Downloads activity board");
}

function testInputsRejectInvalidChartEnums() {
  assert.throws(
    () =>
      parseActionInputs({
        GITHUB_REPOSITORY: "x/y",
        INPUT_CHART_DATE_LABEL_FORMAT: "yyyy/mm/dd",
      }),
    /Allowed values: yyyy-mm-dd, yy\/mm\/dd, dd\/mm, mm\/dd, none/,
  );

  assert.throws(
    () =>
      parseActionInputs({
        GITHUB_REPOSITORY: "x/y",
        INPUT_CHART_TITLE_MODE: "repo",
      }),
    /Allowed values: default, custom, none/,
  );

  assert.throws(
    () =>
      parseActionInputs({
        GITHUB_REPOSITORY: "x/y",
        INPUT_CHART_TITLE_MODE: "custom",
        INPUT_CHART_TITLE_TEXT: "",
      }),
    /chart_title_text' is required/,
  );
}

function testInputsRejectChartOutputCollisions() {
  assert.throws(
    () =>
      parseActionInputs({
        GITHUB_REPOSITORY: "x/y",
        INPUT_PUBLISH_CHART: "true",
        INPUT_OUTPUT_PATH: "curseforge/downloads.json",
        INPUT_CHART_OUTPUT_PATH: "curseforge/downloads.json",
      }),
    /overlaps chart output files/,
  );

  assert.throws(
    () =>
      parseActionInputs({
        GITHUB_REPOSITORY: "x/y",
        INPUT_PUBLISH_CHART: "true",
        INPUT_OUTPUT_PATH: "curseforge/charts/total-trend--slate.svg",
      }),
    /overlaps chart output files/,
  );
}

function testGetFreshCachedTotal() {
  const now = new Date("2026-02-18T12:00:00.000Z");
  const payload = {
    owner: "x",
    repo: "y",
    generatedAt: "2026-02-18T11:55:00.000Z",
    stats: { total: 123 },
  };

  assert.equal(getFreshCachedTotal(payload, "x", "y", now, 10), 123);
  assert.equal(getFreshCachedTotal(payload, "x", "z", now, 10), null);
  assert.equal(getFreshCachedTotal(payload, "x", "y", now, 1), null);
}

function testRetryableWriteConflictClassification() {
  assert.equal(isRetryableWriteConflict({ status: 409 }), true);
  assert.equal(
    isRetryableWriteConflict({ status: 422, message: "sha does not match" }),
    true,
  );
  assert.equal(isRetryableWriteConflict({ status: 422, message: "unprocessable" }), false);
  assert.equal(isRetryableWriteConflict({ status: 500, message: "boom" }), false);
}

async function testCurseForgeClient() {
  const originalFetch = globalThis.fetch;

  try {
    assert.throws(() => createCurseForgeClient(""), /CF_API_KEY/);

    globalThis.fetch = async () =>
      new Response(JSON.stringify({ data: { downloadCount: 12_345 } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    const client = createCurseForgeClient("test-key");
    assert.equal(await client.getDownloadsTotal(42), 12_345);

    globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    await assert.rejects(
      () => createCurseForgeClient("bad-key").getDownloadsTotal(42),
      /CF_API_KEY/,
    );

    globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
    await assert.rejects(() => createCurseForgeClient("test-key").getDownloadsTotal(42), /curseforge_mod_id/);

    globalThis.fetch = async () =>
      new Response(JSON.stringify({ data: {} }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    await assert.rejects(
      () => createCurseForgeClient("test-key").getDownloadsTotal(42),
      /downloadCount/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function testRunRequiresCurseforgeInputs() {
  const baseParse = (overrides) => () => ({
    token: "",
    owner: "x",
    repo: "y",
    curseforgeModId: 123,
    cfApiKey: "key",
    ...overrides,
  });

  await assert.rejects(
    () =>
      run({
        env: { GITHUB_TOKEN: "token" },
        parseActionInputs: baseParse({ curseforgeModId: null }),
        logger: { log() {}, warn() {} },
      }),
    /mod id is required/,
  );

  await assert.rejects(
    () =>
      run({
        env: { GITHUB_TOKEN: "token" },
        parseActionInputs: baseParse({ cfApiKey: "" }),
        logger: { log() {}, warn() {} },
      }),
    /API key is required/,
  );
}

async function testRunUsesCacheAndSkipsApi() {
  const now = new Date("2026-02-18T12:00:00.000Z");
  const owner = "x";
  const repo = "y";
  const previousPayload = buildPayload({
    owner,
    repo,
    visibility: "public",
    generatedAt: "2026-02-18T11:55:00.000Z",
    total: 100,
    todayDate: "2026-02-18",
    windowDays: 45,
    series: {
      "2026-02-17": 90,
      "2026-02-18": 100,
    },
    hourlyEnabled: false,
  });

  let apiCalls = 0;
  let putCalls = 0;
  const outputs = {};

  const client = {
    async getRepository() {
      return { default_branch: "main", private: false };
    },
    async ensureBranch() {},
    async getFile() {
      return {
        sha: "sha-1",
        content: JSON.stringify(previousPayload),
      };
    },
    async putFile() {
      putCalls += 1;
    },
  };

  const curseForgeClient = {
    async getDownloadsTotal() {
      apiCalls += 1;
      return 999;
    },
  };

  await run({
    env: { GITHUB_TOKEN: "token" },
    parseActionInputs: () => ({
      token: "",
      owner,
      repo,
      curseforgeModId: 234567,
      cfApiKey: "cf-test-key",
      windowDays: 45,
      hourlyEnabled: false,
      outputBranch: "stats-data",
      outputPath: "curseforge/downloads.json",
      minRefreshMinutes: 10,
      publishChart: false,
      chartOutputPath: "curseforge/downloads-trend.svg",
      chartTypes: ["total-trend"],
      chartThemes: ["slate"],
      chartsOutputDir: "curseforge/charts",
      chartWidth: 1000,
      chartHeight: 360,
      chartZeroBaseline: true,
      chartYTicks: 6,
      chartXLabelEveryDays: 0,
      chartShowValueLabels: false,
      chartDateLabelFormat: "yyyy-mm-dd",
      chartShowGeneratedAt: true,
      chartTitleMode: "default",
      chartTitleText: "",
    }),
    createGitHubClient: () => client,
    createCurseForgeClient: () => curseForgeClient,
    nowProvider: () => now,
    setOutput: (name, value) => {
      outputs[name] = value;
    },
    appendSummary: () => {},
    logger: { log() {}, warn() {} },
  });

  assert.equal(apiCalls, 0);
  assert.equal(putCalls, 0);
  assert.equal(outputs.total_source, "cache");
  assert.equal(outputs.published, false);
  assert.equal(outputs.chart_published, false);
  assert.equal(outputs.chart_published_count, 0);
  assert.equal(outputs.chart_total_count, 0);
  assert.equal(outputs.chart_files, "");
}

async function testRunRetriesOnWriteConflict() {
  const now = new Date("2026-02-18T12:00:00.000Z");
  const owner = "x";
  const repo = "y";
  const previousPayload = buildPayload({
    owner,
    repo,
    visibility: "public",
    generatedAt: "2026-02-17T12:00:00.000Z",
    total: 10,
    todayDate: "2026-02-17",
    windowDays: 45,
    series: {
      "2026-02-17": 10,
    },
    hourlyEnabled: false,
  });

  let getFileCalls = 0;
  let apiCalls = 0;
  let putCalls = 0;
  const putShas = [];
  const warnings = [];
  const outputs = {};

  const client = {
    async getRepository() {
      return { default_branch: "main", private: false };
    },
    async ensureBranch() {},
    async getFile() {
      getFileCalls += 1;
      return {
        sha: getFileCalls === 1 ? "sha-old" : "sha-new",
        content: JSON.stringify(previousPayload),
      };
    },
    async putFile(_owner, _repo, _path, _branch, _content, _message, sha) {
      putCalls += 1;
      putShas.push(sha);
      if (putCalls === 1) {
        const error = new Error("sha mismatch conflict");
        error.status = 409;
        throw error;
      }
    },
  };

  const curseForgeClient = {
    async getDownloadsTotal() {
      apiCalls += 1;
      return 20;
    },
  };

  await run({
    env: { GITHUB_TOKEN: "token" },
    parseActionInputs: () => ({
      token: "",
      owner,
      repo,
      curseforgeModId: 234567,
      cfApiKey: "cf-test-key",
      windowDays: 45,
      hourlyEnabled: false,
      outputBranch: "stats-data",
      outputPath: "curseforge/downloads.json",
      minRefreshMinutes: 0,
      publishChart: false,
      chartOutputPath: "curseforge/downloads-trend.svg",
      chartTypes: ["total-trend"],
      chartThemes: ["slate"],
      chartsOutputDir: "curseforge/charts",
      chartWidth: 1000,
      chartHeight: 360,
      chartZeroBaseline: true,
      chartYTicks: 6,
      chartXLabelEveryDays: 0,
      chartShowValueLabels: false,
      chartDateLabelFormat: "yyyy-mm-dd",
      chartShowGeneratedAt: true,
      chartTitleMode: "default",
      chartTitleText: "",
    }),
    createGitHubClient: () => client,
    createCurseForgeClient: () => curseForgeClient,
    nowProvider: () => now,
    setOutput: (name, value) => {
      outputs[name] = value;
    },
    appendSummary: () => {},
    logger: {
      log() {},
      warn(message) {
        warnings.push(message);
      },
    },
  });

  assert.equal(apiCalls, 1);
  assert.equal(getFileCalls, 2);
  assert.equal(putCalls, 2);
  assert.deepEqual(putShas, ["sha-old", "sha-new"]);
  assert.equal(warnings.length, 1);
  assert.equal(outputs.total_source, "api");
  assert.equal(outputs.published, true);
  assert.equal(outputs.chart_published, false);
  assert.equal(outputs.chart_published_count, 0);
  assert.equal(outputs.chart_total_count, 0);
  assert.equal(outputs.chart_files, "");
}

async function testRunPublishesChartWhenEnabled() {
  const now = new Date("2026-02-18T12:00:00.000Z");
  const owner = "x";
  const repo = "y";
  const outputs = {};
  let chartPutCalls = 0;
  const chartPaths = [];

  const existingPayload = buildPayload({
    owner,
    repo,
    visibility: "public",
    generatedAt: "2026-02-17T12:00:00.000Z",
    total: 10,
    todayDate: "2026-02-17",
    windowDays: 45,
    series: { "2026-02-17": 10 },
    hourlyEnabled: false,
  });

  const client = {
    async getRepository() {
      return { default_branch: "main", private: false };
    },
    async ensureBranch() {},
    async getFile(_owner, _repo, path) {
      if (path === "curseforge/downloads.json") {
        return { sha: "sha-json", content: JSON.stringify(existingPayload) };
      }
      return { sha: "sha-chart", content: "<svg/>" };
    },
    async putFile(_owner, _repo, path) {
      if (path.endsWith(".svg")) {
        chartPutCalls += 1;
        chartPaths.push(path);
      }
    },
  };

  const curseForgeClient = {
    async getDownloadsTotal() {
      return 20;
    },
  };

  await run({
    env: { GITHUB_TOKEN: "token" },
    parseActionInputs: () => ({
      token: "",
      owner,
      repo,
      curseforgeModId: 234567,
      cfApiKey: "cf-test-key",
      windowDays: 45,
      hourlyEnabled: false,
      outputBranch: "stats-data",
      outputPath: "curseforge/downloads.json",
      minRefreshMinutes: 0,
      publishChart: true,
      chartOutputPath: "curseforge/downloads-trend.svg",
      chartTypes: ["total-trend", "daily"],
      chartThemes: ["black", "slate"],
      chartsOutputDir: "curseforge/charts",
      chartWidth: 1000,
      chartHeight: 360,
      chartZeroBaseline: true,
      chartYTicks: 6,
      chartXLabelEveryDays: 1,
      chartShowValueLabels: true,
      chartDateLabelFormat: "yy/mm/dd",
      chartShowGeneratedAt: true,
      chartTitleMode: "custom",
      chartTitleText: "Mod Downloads Dashboard",
    }),
    createGitHubClient: () => client,
    createCurseForgeClient: () => curseForgeClient,
    nowProvider: () => now,
    setOutput: (name, value) => {
      outputs[name] = value;
    },
    appendSummary: () => {},
    logger: { log() {}, warn() {} },
  });

  assert.equal(chartPutCalls, 5);
  assert.deepEqual(chartPaths.sort(), [
    "curseforge/charts/daily--black.svg",
    "curseforge/charts/daily--slate.svg",
    "curseforge/charts/total-trend--black.svg",
    "curseforge/charts/total-trend--slate.svg",
    "curseforge/downloads-trend.svg",
  ]);
  assert.equal(outputs.chart_published, true);
  assert.equal(outputs.chart_output_path, "curseforge/downloads-trend.svg");
  assert.equal(outputs.chart_published_count, 5);
  assert.equal(outputs.chart_total_count, 5);
  assert.equal(
    outputs.chart_files,
    "curseforge/downloads-trend.svg,curseforge/charts/total-trend--black.svg,curseforge/charts/total-trend--slate.svg,curseforge/charts/daily--black.svg,curseforge/charts/daily--slate.svg",
  );
}

function baseInputs(overrides = {}) {
  return {
    token: "",
    owner: "x",
    repo: "y",
    curseforgeModId: 234567,
    cfApiKey: "cf-test-key",
    windowDays: 45,
    hourlyEnabled: false,
    outputBranch: "stats-data",
    outputPath: "curseforge/downloads.json",
    minRefreshMinutes: 0,
    publishChart: false,
    chartOutputPath: "curseforge/downloads-trend.svg",
    chartTypes: ["total-trend"],
    chartThemes: ["slate"],
    chartsOutputDir: "curseforge/charts",
    chartWidth: 1000,
    chartHeight: 360,
    chartZeroBaseline: true,
    chartYTicks: 6,
    chartXLabelEveryDays: 0,
    chartShowValueLabels: false,
    chartDateLabelFormat: "yyyy-mm-dd",
    chartShowGeneratedAt: true,
    chartTitleMode: "default",
    chartTitleText: "",
    publishDashboard: false,
    dashboardPath: "curseforge/dashboard.md",
    ...overrides,
  };
}

function testBuildDashboardMarkdown() {
  const payload = buildPayload({
    owner: "x",
    repo: "y",
    visibility: "public",
    generatedAt: "2026-02-18T12:00:00.000Z",
    total: 120,
    todayDate: "2026-02-18",
    windowDays: 30,
    series: { "2026-02-18": 120 },
    hourlyEnabled: false,
  });

  const markdown = buildDashboardMarkdown({
    inputs: baseInputs({ publishDashboard: true, windowDays: 30 }),
    payload,
  });

  assert.ok(markdown.length > 0);
  assert.match(markdown, /^# x\/y downloads/);
  assert.match(markdown, /logo=curseforge/);
  assert.match(markdown, /style=flat-square/);
  assert.match(markdown, /cacheSeconds=900/);
  assert.match(markdown, /\| Window \| 30 days \|/);
  assert.match(markdown, /\| Year \| 0 \(partial\) \|/);
  assert.match(markdown, /downloads%2Fyear/);
  assert.match(markdown, /\| CurseForge mod id \| `234567` \|/);
  assert.match(markdown, /raw\.githubusercontent\.com\/x\/y\/stats-data\/curseforge\/downloads\.json/);
  assert.ok(!markdown.includes("## Trend"));
}

function testDashboardMarkdownTracksWindowDays() {
  const inputs = baseInputs({ publishDashboard: true, windowDays: 90 });
  const series = { "2026-02-18": 5 };
  const payload = buildPayload({
    owner: "x",
    repo: "y",
    visibility: "public",
    generatedAt: "2026-02-18T12:00:00.000Z",
    total: 5,
    todayDate: "2026-02-18",
    windowDays: inputs.windowDays,
    series,
    hourlyEnabled: false,
  });

  const markdown = buildDashboardMarkdown({ inputs, payload });
  assert.match(markdown, /\| Window \| 90 days \|/);
}

function testDashboardMarkdownIncludesCharts() {
  const payload = buildPayload({
    owner: "x",
    repo: "y",
    visibility: "public",
    generatedAt: "2026-02-18T12:00:00.000Z",
    total: 120,
    todayDate: "2026-02-18",
    windowDays: 45,
    series: { "2026-02-18": 120 },
    hourlyEnabled: false,
  });

  const markdown = buildDashboardMarkdown({
    inputs: baseInputs({
      publishDashboard: true,
      publishChart: true,
      chartTypes: ["total-trend", "daily"],
      chartThemes: ["black", "slate"],
    }),
    payload,
  });

  assert.match(markdown, /## Trend/);
  assert.match(markdown, /## All charts/);
  assert.match(markdown, /total-trend--black\.svg/);
  assert.match(markdown, /daily--slate\.svg/);
}

async function testRunPublishesDashboardWhenEnabled() {
  const now = new Date("2026-02-18T12:00:00.000Z");
  const owner = "x";
  const repo = "y";
  const outputs = {};
  let dashboardPutCalls = 0;
  let dashboardContent = "";

  const existingPayload = buildPayload({
    owner,
    repo,
    visibility: "public",
    generatedAt: "2026-02-17T12:00:00.000Z",
    total: 10,
    todayDate: "2026-02-17",
    windowDays: 45,
    series: { "2026-02-17": 10 },
    hourlyEnabled: false,
  });

  const client = {
    async getRepository() {
      return { default_branch: "main", private: false };
    },
    async ensureBranch() {},
    async getFile(_owner, _repo, path) {
      if (path === "curseforge/downloads.json") {
        return { sha: "sha-json", content: JSON.stringify(existingPayload) };
      }
      if (path === "curseforge/dashboard.md") {
        return null;
      }
      return { sha: "sha-x", content: "" };
    },
    async putFile(_owner, _repo, path, _branch, content) {
      if (path === "curseforge/dashboard.md") {
        dashboardPutCalls += 1;
        dashboardContent = content;
      }
    },
  };

  const curseForgeClient = {
    async getDownloadsTotal() {
      return 20;
    },
  };

  await run({
    env: { GITHUB_TOKEN: "token" },
    parseActionInputs: () =>
      baseInputs({
        publishDashboard: true,
        outputPath: "curseforge/downloads.json",
      }),
    createGitHubClient: () => client,
    createCurseForgeClient: () => curseForgeClient,
    nowProvider: () => now,
    setOutput: (name, value) => {
      outputs[name] = value;
    },
    appendSummary: () => {},
    logger: { log() {}, warn() {} },
  });

  assert.equal(dashboardPutCalls, 1);
  assert.ok(dashboardContent.length > 0);
  assert.match(dashboardContent, /^# x\/y downloads/);
  assert.equal(outputs.dashboard_path, "curseforge/dashboard.md");
  assert.equal(outputs.dashboard_published, true);
}

async function testRunSkipsDashboardMissingWindowRow() {
  const now = new Date("2026-02-18T12:00:00.000Z");
  const owner = "x";
  const repo = "y";
  const outputs = {};
  let dashboardPutCalls = 0;
  const warnings = [];

  const existingPayload = buildPayload({
    owner,
    repo,
    visibility: "public",
    generatedAt: "2026-02-17T12:00:00.000Z",
    total: 10,
    todayDate: "2026-02-17",
    windowDays: 45,
    series: { "2026-02-17": 10 },
    hourlyEnabled: false,
  });

  const client = {
    async getRepository() {
      return { default_branch: "main", private: false };
    },
    async ensureBranch() {},
    async getFile(_owner, _repo, path) {
      if (path === "curseforge/downloads.json") {
        return { sha: "sha-json", content: JSON.stringify(existingPayload) };
      }
      if (path === "curseforge/dashboard.md") {
        return { sha: "sha-dash", content: "# x/y downloads\n\nhand-edited, window row removed\n" };
      }
      return { sha: "sha-x", content: "" };
    },
    async putFile(_owner, _repo, path, _branch, content) {
      if (path === "curseforge/dashboard.md") {
        dashboardPutCalls += 1;
      }
    },
  };

  const curseForgeClient = {
    async getDownloadsTotal() {
      return 20;
    },
  };

  await run({
    env: { GITHUB_TOKEN: "token" },
    parseActionInputs: () => baseInputs({ publishDashboard: true }),
    createGitHubClient: () => client,
    createCurseForgeClient: () => curseForgeClient,
    nowProvider: () => now,
    setOutput: (name, value) => {
      outputs[name] = value;
    },
    appendSummary: () => {},
    logger: {
      log() {},
      warn(message) {
        warnings.push(message);
      },
    },
  });

  assert.equal(dashboardPutCalls, 0);
  assert.equal(outputs.dashboard_published, false);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /missing the window row/);
}

async function runTests() {
  testMergeWindow();
  testPayload();
  testPayloadYearly();
  testInputs();
  testInputsDefaultWindowDays();
  testInputsDashboard();
  testInputsCurseforge();
  testInputsChartMatrix();
  testInputsRejectInvalidChartEnums();
  testInputsRejectChartOutputCollisions();
  testGetFreshCachedTotal();
  testRetryableWriteConflictClassification();
  testBuildDashboardMarkdown();
  testDashboardMarkdownTracksWindowDays();
  testDashboardMarkdownIncludesCharts();
  await testCurseForgeClient();
  await testRunRequiresCurseforgeInputs();
  await testRunUsesCacheAndSkipsApi();
  await testRunRetriesOnWriteConflict();
  await testRunPublishesChartWhenEnabled();
  await testRunPublishesDashboardWhenEnabled();
  await testRunSkipsDashboardMissingWindowRow();
  console.log("public tests passed");
}

if (require.main === module) {
  runTests().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  runTests,
};
