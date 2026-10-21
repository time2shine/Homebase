# Homebase Release Documentation

This directory contains formal release preparation reports, release notes, packaging checklists, and publication verification logs for production versions of Homebase.

---

## Release History

| Version | Release Date | Cycle | Primary Theme | Package Assets |
|:---:|:---:|:---:|---|---|
| [**v1.0.5**](file:///c:/Users/Administrator/Desktop/Homebase/docs/release/v1.0.5-release-notes.md) | October 22, 2026 | Maintenance | Context Menu Repositioning, Offline Favicon Persistence, Local Address Fallback | Chrome ZIP, Firefox ZIP, Edge ZIP |
| [**v1.0.4**](file:///c:/Users/Administrator/Desktop/Homebase/docs/release/v1.0.4-release-notes.md) | October 21, 2026 | Maintenance | Search, Bookmark & Settings Accessibility, Backup Import Fix | Chrome ZIP, Firefox ZIP, Edge ZIP |
| [**v1.0.3**](file:///c:/Users/Administrator/Desktop/Homebase/docs/release/v1.0.3-release-notes.md) | October 20, 2026 | Maintenance | Wallpaper Lifecycle & Crossfade, Performance Mode, Settings Layout | Chrome ZIP, Firefox ZIP, Edge ZIP |
| [**v1.0.2**](file:///c:/Users/Administrator/Desktop/Homebase/docs/release/v1.0.2-release-notes.md) | October 16, 2026 | Maintenance | Bookmark Styling, Transparent Mode Default, Folder Resolution | Chrome ZIP, Firefox ZIP, Edge ZIP |
| [**v1.0.1**](file:///c:/Users/Administrator/Desktop/Homebase/docs/release/v1.0.1-release-notes.md) | October 14, 2026 | Maintenance | Settings Transactional Behavior & Live Preview | Chrome ZIP, Firefox ZIP |
| [**v1.0.0**](file:///c:/Users/Administrator/Desktop/Homebase/docs/release/v1.0.0-release-notes.md) | October 13, 2026 | [Cycle 13](file:///c:/Users/Administrator/Desktop/Homebase/docs/cycles/cycle-13/) | Runtime Diagnostics, Error Boundary & Widget Lifecycle | Chrome ZIP, Firefox ZIP |
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

## Published Store Listings & Centralized Store Tracking

Homebase targets Firefox Add-ons (AMO), Chrome Web Store, and Microsoft Edge Add-ons. To prevent duplicate or divergent records across documentation, all active store publication statuses, listing URLs, product IDs, and verification records are centralized in:

👉 **[`PROJECT_CONTEXT.md` Section 2.1 — Published Store Releases](../../PROJECT_CONTEXT.md#21-published-store-releases)**

### Store Version Verification Rule
When the latest published version for any store is needed, check the official listing (and version history where available). Record the verified version, verification date, and evidence source in [`PROJECT_CONTEXT.md`](../../PROJECT_CONTEXT.md#21-published-store-releases). If access fails or status cannot be verified directly, retain the last known value and mark it unverified/stale.

### Distinct Version States
Always keep these four states strictly distinct:
1. **Source / Package Version**: Declared in `package.json` and `manifests/*`.
2. **GitHub Release / Tag Version**: Created in git and published on GitHub Releases (`vX.Y.Z`).
3. **Submitted Version**: Package uploaded to store developer consoles for review.
4. **Publicly Published Store Version**: Live version approved and publicly available for install on the official store listing.

*Note: A GitHub release, git tag, local build, or pending store submission does not prove a store release is publicly published.*
