"use strict";

const API_BASE = "https://api.curseforge.com";
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

function statusHint(status) {
  if (status === 401 || status === 403) {
    return " Check the CurseForge API key (input 'cf_api_key' / secret CF_API_KEY).";
  }
  if (status === 404) {
    return " Check the 'curseforge_mod_id' input.";
  }
  return "";
}

function createRequestError(message, noRetry = true, status = null) {
  const error = new Error(message);
  error.noRetry = noRetry;
  if (Number.isInteger(status)) error.status = status;
  return error;
}

function createCurseForgeClient(apiKey) {
  if (!apiKey) throw new Error("Missing CF_API_KEY.");

  async function request(pathname) {
    const url = `${API_BASE}${pathname}`;
    const maxAttempts = 5;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        let response;
        try {
          response = await fetch(url, {
            method: "GET",
            headers: {
              "x-api-key": apiKey,
              Accept: "application/json",
              "User-Agent": "N6REJ/curseforge-downloads-action",
            },
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
            `CurseForge API GET ${pathname} failed (${response.status}): ${detail || "unknown error"}.${statusHint(response.status)}`,
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
            `CurseForge API GET ${pathname} timed out after ${REQUEST_TIMEOUT_MS}ms.`,
            true,
          );
        }
        if (attempt >= maxAttempts) {
          throw error;
        }
        await sleep(computeBackoffMs(attempt, null));
      }
    }

    throw new Error(`CurseForge API GET ${pathname} failed after retries.`);
  }

  async function getDownloadsTotal(modId) {
    const data = await request(`/v1/mods/${encodeURIComponent(String(modId))}`);
    const downloads = Number(data?.data?.downloadCount);

    if (!Number.isFinite(downloads) || downloads < 0) {
      throw new Error(
        `Unexpected CurseForge API response for mod ${modId}: missing numeric 'data.downloadCount'.`,
      );
    }

    return Math.floor(downloads);
  }

  return {
    getDownloadsTotal,
  };
}

module.exports = {
  createCurseForgeClient,
};
