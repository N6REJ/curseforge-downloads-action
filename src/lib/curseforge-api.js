"use strict";

const API_BASE = "https://api.curseforge.com";
const CFWIDGET_BASE = "https://api.cfwidget.com";
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const REQUEST_TIMEOUT_MS = 15_000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterMs(response) {
  const retryAfter = response.headers.get("retry-after");
  if (!retryAfter) return null;

  const seconds = Number.parseInt(retryAfter, 10);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, 8_000);
  }
  return null;
}

function computeBackoffMs(attempt, response) {
  const retryAfterMs = response ? parseRetryAfterMs(response) : null;
  if (retryAfterMs !== null) return retryAfterMs;

  const base = 350;
  const exponential = base * 2 ** (attempt - 1);
  const jitter = Math.floor(Math.random() * 180);
  return Math.min(exponential + jitter, 4_000);
}

function normalizeErrorDetail(text) {
  if (!text) return "";
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed === "string") return parsed;
    if (parsed && typeof parsed.error === "string") return parsed.error;
    if (Array.isArray(parsed?.error)) return parsed.error.join("; ");
    if (parsed && typeof parsed.message === "string") return parsed.message;
    if (parsed && typeof parsed.title === "string") return parsed.title;
  } catch {
    // ignore
  }
  return text;
}

function statusHint(status, source) {
  const label = source === "cfwidget" ? "cfwidget" : "CurseForge";
  if (status === 401 || status === 403) {
    if (source === "cfwidget") {
      return " The cfwidget fallback rejected the request; retry later, or set a CurseForge API key (input 'cf_api_key' / secret CF_API_KEY).";
    }
    return " Check the CurseForge API key (input 'cf_api_key' / secret CF_API_KEY).";
  }
  if (status === 404) {
    return " Check the 'curseforge_mod_id' input.";
  }
  return ` See the ${label} response for details.`;
}

function createRequestError(message, noRetry = true, status = null) {
  const error = new Error(message);
  error.noRetry = noRetry;
  if (Number.isInteger(status)) error.status = status;
  return error;
}

function parseTotalFromResponse(data, modId, source) {
  const downloads =
    source === "cfwidget" ? Number(data?.downloads?.total) : Number(data?.data?.downloadCount);

  if (!Number.isFinite(downloads) || downloads < 0) {
    const pointer = source === "cfwidget" ? "downloads.total" : "data.downloadCount";
    throw new Error(
      `Unexpected ${source} response for mod ${modId}: missing numeric '${pointer}'.`,
    );
  }

  return Math.floor(downloads);
}

function createTotalClient({ base, apiKey, source }) {
  async function request(pathname) {
    const url = `${base}${pathname}`;
    const maxAttempts = 5;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        let response;
        try {
          const headers = {
            Accept: "application/json",
            "User-Agent": "N6REJ/curseforge-downloads-action",
          };
          if (apiKey) headers["x-api-key"] = apiKey;
          response = await fetch(url, {
            method: "GET",
            headers,
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeout);
        }

        if (!response.ok) {
          const raw = await response.text();
          const detail = normalizeErrorDetail(raw);
          const retryable =
            RETRYABLE_STATUSES.has(response.status) ||
            parseRetryAfterMs(response) !== null;
          if (retryable && attempt < maxAttempts) {
            await sleep(computeBackoffMs(attempt, response));
            continue;
          }

          throw createRequestError(
            `${source} API GET ${pathname} failed (${response.status}): ${detail || "unknown error"}.${statusHint(response.status, source)}`,
            true,
            response.status,
          );
        }

        return response.json();
      } catch (error) {
        if (error && error.noRetry) {
          throw error;
        }
        if (error && error.name === "AbortError" && attempt >= maxAttempts) {
          throw createRequestError(
            `${source} API GET ${pathname} timed out after ${REQUEST_TIMEOUT_MS}ms.`,
            true,
          );
        }
        if (attempt >= maxAttempts) {
          throw error;
        }
        await sleep(computeBackoffMs(attempt, null));
      }
    }

    throw new Error(`${source} API GET ${pathname} failed after retries.`);
  }

  async function getDownloadsTotal(modId) {
    const data = await request(`/v1/mods/${encodeURIComponent(String(modId))}`);
    return parseTotalFromResponse(data, modId, source);
  }

  return {
    source,
    getDownloadsTotal,
  };
}

function createCurseForgeClient(apiKey) {
  if (!apiKey) throw new Error("Missing CF_API_KEY.");

  return createTotalClient({ base: API_BASE, apiKey, source: "curseforge" });
}

function createCfwidgetClient() {
  return createTotalClient({ base: CFWIDGET_BASE, apiKey: "", source: "cfwidget" });
}

function createDownloadsClient({ cfApiKey, fallbackFactory } = {}) {
  const madeFallback = fallbackFactory || createCfwidgetClient;
  const fallback = madeFallback();

  if (!cfApiKey) {
    return {
      source: fallback.source,
      async getDownloadsTotal(modId, logger = console) {
        logger.log(
          "No CurseForge API key provided; using the public cfwidget fallback (no key required).",
        );
        return fallback.getDownloadsTotal(modId);
      },
    };
  }

  const primary = createCurseForgeClient(cfApiKey);
  let lastSource = primary.source;

  return {
    get source() {
      return lastSource;
    },
    async getDownloadsTotal(modId, logger = console) {
      try {
        const total = await primary.getDownloadsTotal(modId);
        lastSource = primary.source;
        return total;
      } catch (error) {
        logger.warn(
          `Official CurseForge API failed (${error instanceof Error ? error.message : String(error)}); falling back to cfwidget.`,
        );
        const total = await fallback.getDownloadsTotal(modId);
        lastSource = fallback.source;
        return total;
      }
    },
  };
}

module.exports = {
  createCurseForgeClient,
  createCfwidgetClient,
  createDownloadsClient,
};
