# Homebase Release Documentation

This directory contains formal release preparation reports, release notes, packaging checklists, and publication verification logs for production versions of Homebase.

---

## Release History

| Version | Release Date | Cycle | Primary Theme | Package Assets |
|:---:|:---:|:---:|---|---|
| [**v0.17.0**](file:///c:/Users/Administrator/Desktop/Homebase/docs/releases/v0.17.0/) | October 9, 2026 | [Cycle 12](file:///c:/Users/Administrator/Desktop/Homebase/docs/cycles/cycle-12/) | Bookmark Drag Architecture Upgrade | Chrome ZIP, Firefox ZIP |
| [**v0.16.0**](file:///c:/Users/Administrator/Desktop/Homebase/docs/releases/v0.16.0/) | October 2026 | [Cycle 11](file:///c:/Users/Administrator/Desktop/Homebase/docs/cycles/cycle-11/) | Modularization & Settings Architecture | Chrome ZIP, Firefox ZIP |

---

## Release Governance Standard

Every release must produce complete documentation under `docs/releases/vX.Y.Z/`:
1. Version audit & preparation report
2. Release notes (GitHub Release format)
3. Asset preparation checklist (Chrome, Firefox & Edge ZIP packages, manifest version check)
4. Git tag confirmation (annotated tag `vX.Y.Z`)
5. Git push & remote tag verification
6. GitHub release publication confirmation

---

## Published Store Listings

- **Official Firefox Add-ons (AMO) Listing**: [Homebase New Tab Dashboard](https://addons.mozilla.org/en-US/firefox/addon/homebase-new-tab-dashboard/)
- **Firefox Add-ons Version History**: [Version History](https://addons.mozilla.org/en-US/firefox/addon/homebase-new-tab-dashboard/versions/)
- **Recorded Store Status**: Centralized in [`PROJECT_CONTEXT.md`](../../PROJECT_CONTEXT.md#21-published-store-releases) to avoid version duplication across documentation.

### Store Version Verification Rule
When the latest published Firefox version is needed, check the official listing and, if necessary, its version history. Record the version and verification date after checking in [`PROJECT_CONTEXT.md`](../../PROJECT_CONTEXT.md#21-published-store-releases). If access fails, retain the last known value and mark it unverified/stale.

### Distinct Version States
Always keep these three states strictly distinct:
1. **Source / Package Version**: Declared in `package.json` and `manifests/*`.
2. **GitHub Release / Tag Version**: Created in git and published on GitHub Releases (`vX.Y.Z`).
3. **Published Firefox Store Version**: Live version approved and published on Firefox Add-ons (AMO).

*Note: A GitHub release or local build does not prove a store release is published.*
