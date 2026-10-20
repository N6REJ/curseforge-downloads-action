# Joomla badge & chart generator

This guide shows how to publish an interactive **badge generator** and **chart generator**
on a Joomla site, matching the "generate badge" / "generate chart" tools on the
[justagwas GDA site](https://www.justagwas.com/projects/gda/?tab=chart).

The result is a self-contained, **client-side** tool: the visitor enters an owner and
repository, picks a metric/chart type/theme, and the page builds the Markdown and the
image URL for them to copy. There is **no server code, no database, and no API key**
involved — the tool only assembles strings that the visitor pastes into their own README.

## What this tool does and does not do

- **Does**: build `img.shields.io` badge URLs and `raw.githubusercontent.com` chart
  image URLs for a repository that already runs this action.
- **Does not**: call the CurseForge API, read the downloads JSON, or need any secret.
  It never touches the visitor's GitHub account.
- Prerequisite: the target repository must already publish data to its `stats-data`
  branch (that is what the action does). The generated URLs point at that branch.

## Files in this folder

| File | Purpose |
|---|---|
| `docs/joomla-badge-chart-generator.md` | This implementation guide. |
| `docs/joomla-badge-chart-generator.html` | Ready-to-paste Custom HTML module: markup + CSS + JavaScript. |

## Default paths this tool assumes

The generator builds URLs from the action's defaults. If the visitor's workflow
changed these inputs, they must adjust the corresponding field in the tool.

| Value | Default | Action input |
|---|---|---|
| Branch | `stats-data` | `output_branch` |
| JSON path | `curseforge/downloads.json` | `output_path` |
| Primary chart path | `curseforge/downloads-trend.svg` | `chart_output_path` |
| Chart matrix dir | `curseforge/charts` | `charts_output_dir` |
| Badge style | `flat-square` | (fixed in dashboard) |
| Badge cache | `900` seconds | (fixed in dashboard) |

Badge metrics (JSON pointer → label → color):

| Metric | JSON query | Color |
|---|---|---|
| Total | `$.stats.total` | `0A7EA4` |
| Day | `$.stats.day` | `1E8E3E` |
| Week | `$.stats.week` | `0069C2` |
| Month | `$.stats.month` | `B26A00` |
| Year | `$.stats.year` | `6A1B9A` |
| Profile | `$.profile.defaultMode` | `5E35B1` |

Chart types: `total-trend`, `daily`, `weekly`, `monthly`, `yearly`.
Chart themes: `black`, `slate`, `orange`.

> These lists are kept in sync with `src/lib/chart-config.js` and the README badge
> examples. If you add a metric or chart type to the action, update them here too.

## Generated URL shapes

Badge (dynamic JSON badge):

```text
https://img.shields.io/badge/dynamic/json?url=<encoded JSON raw URL>&query=<encoded JSON path>&label=<encoded label>&color=<hex>&style=flat-square&logo=curseforge&cacheSeconds=900
```

where the JSON raw URL is:

```text
https://raw.githubusercontent.com/<owner>/<repo>/<branch>/<output_path>
```

Chart (primary):

```text
https://raw.githubusercontent.com/<owner>/<repo>/<branch>/<chart_output_path>
```

Chart (matrix entry):

```text
https://raw.githubusercontent.com/<owner>/<repo>/<branch>/<charts_output_dir>/<type>--<theme>.svg
```

## Installation in Joomla

You can host the tool either as a **Custom HTML module** or as an **article**.
The module route is recommended because Joomla keeps `<script>` and `<style>` intact
in Custom HTML modules on default settings.

### Option A — Custom HTML module (recommended)

1. In Joomla admin, go to **Content → Site Modules → New → Custom**.
2. Give it a title (for example "Badge & Chart Generator").
3. Open the **editor** and switch to **Code / Source** view.
4. Paste the entire contents of `docs/joomla-badge-chart-generator.html`.
5. Under **Options**, set the editor to **None** if your editor tries to rewrite the
   markup (Global Configuration → Text Filters may also need to allow raw HTML for your
   user group).
6. Assign the module to the menu item/page where you want it, then **Save**.
7. On the published page, the tool renders: a form, live previews, and copy buttons.

### Option B — Article with a Custom HTML module inside

1. Create the article, then in the editor insert a **{loadmodule}`** or a Custom HTML
   block, or set the article editor to Code view and paste the same HTML.
2. If your editor strips `<script>`/`<style>`, either:
   - use the Custom HTML module (Option A), or
   - install a snippet extension such as **Sourcerer** or a "Custom Code" content plugin
     that permits JavaScript inside article text, then paste the same HTML.

### Option C — Tighter control (no scripting)

If JavaScript is not permitted at all, use the copy-paste **generators already in the
project README** (`## Badge generator` and `## Chart generator`). Those are Bash and
PowerShell snippets; visitors run them locally. The Joomla tool is simply a friendlier,
in-browser version of the same logic.

## Editor / filter notes (common Joomla gotchas)

- **TinyMCE / JCE** often "clean" pasted HTML. Always edit in **Code view** and set the
  text filter for your user group to allow the markup, or the `<script>` will be removed.
- **Content Security Policy**: if the site sets a CSP header, it must allow
  `script-src` to run the inline script. The module uses no external scripts and no
  inline `onclick` handlers, which minimizes CSP friction. If your site forbids inline
  scripts entirely, move the JavaScript to a separate `.js` file served from
  `media/` or `templates/` and enqueue it via a template override.
- **Joomla cache**: if the module output looks stale after an edit, clear
  **System → Clear Cache**.
- The tool renders its own `<style>` block; if the site theme is aggressive, keep the
  module published in a "no wrapper" style to avoid conflicts.

## Security / privacy

- No secrets, tokens, or API keys are used anywhere.
- No network request is made by the page for generating URLs. Previews load the badge
  and chart images directly from `img.shields.io` and `raw.githubusercontent.com`,
  which is normal image loading.
- Inputs are validated/sanitized in the script (owner/repo restricted to safe
  GitHub characters) before being interpolated, to avoid injecting markup.

## Verification checklist

After publishing:

1. Enter `N6REJ/curseforge-downloads-action` as owner/repo.
2. Confirm the badge preview images load.
3. Copy a badge Markdown line and confirm it matches the README examples.
4. Select `yearly` + `slate` and confirm the chart URL ends with
   `curseforge/charts/yearly--slate.svg`.
5. Paste a copied badge into a scratch README and confirm it renders.

## Keeping this in sync

When the action changes any of the following, update
`docs/joomla-badge-chart-generator.html` accordingly:

- default `output_branch`, `output_path`, `chart_output_path`, `charts_output_dir`;
- the badge metric list (JSON pointers and colors);
- the chart type list or theme list (`src/lib/chart-config.js`);
- the badge style/cache values.
