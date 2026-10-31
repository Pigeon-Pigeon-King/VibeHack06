# Package audit: candidate-7877cbf-dirty-web

Status: **FAIL** · exit 1

Recorded: 2026-10-31T05:05:29.186977+00:00
Root: `/Users/penguin/VibeHack06-worktree`

Windows runtime: **NOT_RUN**. Browser runtime: **NOT_RUN**. Source-to-build reproduction: **NOT_REBUILT**.

| Level | Code | Path | Finding |
| --- | --- | --- | --- |
| error | INPUT_CHANGED | src/presentation/EpilogueAirCover.ts | Repeated reads differ within this audit; rerun a frozen candidate. |
| error | SOURCE_BUNDLE_STALE | src/presentation/EpilogueAirCover.ts | Packaged component source differs from selected current source. |
| error | SOURCE_BUNDLE_STALE | tests/epilogue-air-cover.test.ts | Packaged component source differs from selected current source. |
| review | GPL_DISTRIBUTION_SCOPE_REVIEW | sources/reused-aircraft/f35b-ganymede-source.zip | GPL-3.0 text and component source are present; overall distribution/corresponding-source sufficiency remains a separate review, not a legal PASS. |

## Boundaries

- No rendering, decoding/playback, first-run, network trace, or target-device test.
- Static JavaScript matching does not resolve arbitrary computed URLs or every bundler transform.
- A source snapshot does not prove these sources compiled to an existing build.
- License/source presence and exact copies do not decide legal sufficiency or the whole-game license.
- Raw provider responses, credential directories, model caches and unlisted originals are not inventoried.
