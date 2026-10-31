# Package audit: historical-windows-zip-compared-to-candidate

Status: **FAIL** · exit 1

Recorded: 2026-10-31T05:00:24.293909+00:00
Root: `/Users/penguin/VibeHack06-worktree`

Windows runtime: **NOT_RUN**. Browser runtime: **NOT_RUN**. Source-to-build reproduction: **NOT_REBUILT**.

| Level | Code | Path | Finding |
| --- | --- | --- | --- |
| error | INPUT_CHANGED | src/presentation/EpilogueAirCover.ts | Repeated reads differ within this audit; rerun a frozen candidate. |
| error | SOURCE_BUNDLE_STALE | src/presentation/EpilogueAirCover.ts | Packaged component source differs from selected current source. |
| error | SOURCE_BUNDLE_STALE | tests/epilogue-air-cover.test.ts | Packaged component source differs from selected current source. |
| review | GPL_DISTRIBUTION_SCOPE_REVIEW | sources/reused-aircraft/f35b-ganymede-source.zip | GPL-3.0 text and component source are present; overall distribution/corresponding-source sufficiency remains a separate review, not a legal PASS. |
| error | WINDOWS_WEB_MISMATCH | dist/index.html | Windows ASAR is not the selected web candidate. |
| error | WINDOWS_WEB_MISMATCH | dist/licenses/reused-aircraft/f35b/F35B-GPL-3.0.txt | Windows ASAR is not the selected web candidate. |
| error | WINDOWS_WEB_MISMATCH | dist/licenses/reused-aircraft/f35b/NOTICE.md | Windows ASAR is not the selected web candidate. |
| error | WINDOWS_WEB_MISMATCH | dist/licenses/dependencies/Rapier.txt | Windows ASAR is not the selected web candidate. |
| error | WINDOWS_WEB_MISMATCH | dist/licenses/dependencies/Three.txt | Windows ASAR is not the selected web candidate. |
| error | WINDOWS_WEB_MISMATCH | dist/licenses/dependencies/manifest.json | Windows ASAR is not the selected web candidate. |
| error | WINDOWS_WEB_MISMATCH | dist/licenses/WP-AK47/LICENSE | Windows ASAR is not the selected web candidate. |
| error | WINDOWS_WEB_MISMATCH | dist/licenses/WP-AK47/NOTICE.md | Windows ASAR is not the selected web candidate. |
| error | WINDOWS_WEB_MISMATCH | dist/licenses/WP-AK47/SOURCE_LICENSE.md | Windows ASAR is not the selected web candidate. |
| error | WINDOWS_WEB_MISMATCH | dist/models/weapons/ak47-world-r1.glb | Windows ASAR is not the selected web candidate. |
| error | WINDOWS_WEB_MISMATCH | dist/sources/reused-aircraft/f35b-ganymede-source.zip | Windows ASAR is not the selected web candidate. |
| error | WINDOWS_WEB_MISMATCH | dist/assets/EpilogueAirCover-C_Zqspkh.js | Windows ASAR is not the selected web candidate. |
| error | WINDOWS_WEB_MISMATCH | dist/assets/index-BkFxWYCf.css | Windows ASAR is not the selected web candidate. |
| error | WINDOWS_WEB_MISMATCH | dist/assets/index-C11eSd1C.js | Windows ASAR is not the selected web candidate. |
| error | WINDOWS_WEB_FILESET_MISMATCH | dist | Windows and selected web build contain different files. |

## Boundaries

- No rendering, decoding/playback, first-run, network trace, or target-device test.
- Static JavaScript matching does not resolve arbitrary computed URLs or every bundler transform.
- A source snapshot does not prove these sources compiled to an existing build.
- License/source presence and exact copies do not decide legal sufficiency or the whole-game license.
- Raw provider responses, credential directories, model caches and unlisted originals are not inventoried.
