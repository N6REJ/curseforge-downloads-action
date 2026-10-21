"use strict";

const fs = require("node:fs");

function fileExists(filePath) {
  return fs.existsSync(filePath);
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function assertIncludes(errors, filePath, needle, label) {
  const text = readText(filePath);
  if (!text.includes(needle)) {
    errors.push(`${filePath} missing ${label}: ${needle}`);
  }
}

function main() {
  const errors = [];

  const requiredFiles = [
    "README.md",
    "action.yml",
    "src/lib/chart-config.js",
    ".github/EULA.md",
    ".github/PRIVACY.md",
    "templates/workflows/curseforge-daily.yml",
    "templates/workflows/curseforge-hourly.yml",
    "templates/workflows/curseforge-daily-with-chart.yml",
  ];

  for (const filePath of requiredFiles) {
    if (!fileExists(filePath)) {
      errors.push(`Missing required file: ${filePath}`);
    }
  }

  if (fileExists("action.yml")) {
    assertIncludes(errors, "action.yml", "curseforge_mod_id", "CurseForge mod id input");
    assertIncludes(errors, "action.yml", "cf_studio_api_key", "CurseForge for Studios API key input");
    assertIncludes(errors, "action.yml", "node24", "Node 24 runtime");
    assertIncludes(errors, "action.yml", "chart_date_label_format", "chart date format input");
    assertIncludes(errors, "action.yml", "chart_show_generated_at", "generated footer input");
    assertIncludes(errors, "action.yml", "chart_title_mode", "title mode input");
    assertIncludes(errors, "action.yml", "chart_title_text", "custom title input");
    assertIncludes(errors, "action.yml", "publish_dashboard", "dashboard toggle input");
    assertIncludes(errors, "action.yml", "dashboard_path", "dashboard path input");
    assertIncludes(errors, "action.yml", "partial_year", "year partial output");
    assertIncludes(errors, "action.yml", "yearly", "yearly chart type");
  }

  if (fileExists("src/lib/chart-config.js")) {
    assertIncludes(errors, "src/lib/chart-config.js", "yearly", "yearly chart type meta");
  }

  if (fileExists("src/lib/dashboard.js")) {
    assertIncludes(
      errors,
      "src/lib/dashboard.js",
      'require("./chart-config")',
      "shared chart config import",
    );
  }

  if (fileExists("src/lib/chart.js")) {
    assertIncludes(
      errors,
      "src/lib/chart.js",
      'require("./chart-config")',
      "shared chart config import",
    );
  }

  if (fileExists("README.md")) {
    assertIncludes(errors, "README.md", "curseforge_mod_id", "CurseForge mod id docs");
    assertIncludes(errors, "README.md", "CF_STUDIO_API_KEY", "CurseForge API key secret docs");
    assertIncludes(errors, "README.md", "chart_date_label_format", "chart date format docs");
    assertIncludes(errors, "README.md", "chart_show_generated_at", "generated footer docs");
    assertIncludes(errors, "README.md", "chart_title_mode", "title mode docs");
    assertIncludes(errors, "README.md", "chart_title_text", "custom title docs");
    assertIncludes(errors, "README.md", "publish_dashboard", "dashboard toggle docs");
    assertIncludes(errors, "README.md", "dashboard_path", "dashboard path docs");
    assertIncludes(errors, "README.md", "partial_year", "year partial docs");
    assertIncludes(errors, "README.md", "yearly", "yearly chart docs");
  }

  if (fileExists(".github/EULA.md")) {
    assertIncludes(
      errors,
      ".github/EULA.md",
      "curseforge-downloads-action",
      "repository name",
    );
  }

  if (fileExists("templates/workflows/curseforge-daily-with-chart.yml")) {
    assertIncludes(
      errors,
      "templates/workflows/curseforge-daily-with-chart.yml",
      'publish_chart: "true"',
      "chart workflow publishing",
    );
  }

  if (errors.length > 0) {
    console.error("Release checks failed:");
    for (const issue of errors) {
      console.error(`- ${issue}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("Release checks passed.");
}

main();
