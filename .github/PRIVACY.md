# Privacy Notice

Last updated: February 21, 2026

This notice explains how `N6REJ/curseforge-downloads-action` handles data.

## Short version

- This action reads mod download statistics from the CurseForge API.
- It writes aggregated download stats (and optional charts) back to your repository.
- It is not designed to collect personal data.
- No external analytics or ad tracking is built into this action.

## What this action reads

When the workflow runs, it:

- calls the CurseForge API (`api.curseforge.com`) with your CurseForge API key to read the mod metadata and lifetime `downloadCount` for the configured `curseforge_mod_id`
- uses a GitHub token to call GitHub APIs for:
  - repository metadata (owner/repo, branch info, visibility)
  - existing output files in the configured output branch/path

## What this action writes

It can publish:

- `downloads.json` snapshot data
- optional SVG chart files

These files are written to the repository path/branch you configure. If you publish to a public branch, the data becomes publicly accessible.

## What this action does not do

- It does not run its own telemetry service.
- It does not send repository data to third-party analytics providers.
- It does not sell data.
- It does not intentionally collect personal profile data from users.

## Data retention

Data retention is controlled by your repository:

- snapshots are kept according to `window_days`
- published files remain in your git history unless you rewrite history
- workflow logs are retained according to your GitHub Actions settings

## Third-party services

This action runs on GitHub Actions infrastructure, uses the GitHub APIs, and calls the CurseForge API. Their handling of data is governed by the respective GitHub and CurseForge policies and your repository settings.

## Your responsibilities

If you use this action, you are responsible for:

- choosing what repository data is made public
- configuring permissions (`contents: write` when needed)
- providing any notices required by your own organization or law

## Contact

For privacy-related questions about this action, open an issue at <https://github.com/N6REJ/curseforge-downloads-action/issues>.
