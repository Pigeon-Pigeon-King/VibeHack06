# Package audit: prepared-audio-not-integrated

Status: **REVIEW_REQUIRED** · exit 2

Recorded: 2026-10-31T04:51:30.647929+00:00
Root: `/Users/penguin/VibeHack06`

Windows runtime: **NOT_RUN**. Browser runtime: **NOT_RUN**. Source-to-build reproduction: **NOT_REBUILT**.

| Level | Code | Path | Finding |
| --- | --- | --- | --- |
| review | PUBLIC_METADATA_LOCAL_PATHS | sfx-provenance.json | Metadata contains 5 local-path occurrence(s); redact a distribution copy. These are not classified as runtime fetches. |
| review | PUBLIC_METADATA_LOCAL_PATHS | music-provenance.json | Metadata contains 4 local-path occurrence(s); redact a distribution copy. These are not classified as runtime fetches. |
| review | GENERATED_MUSIC_LICENSE_EVIDENCE | music-provenance.json | Generation/model revisions are recorded, but this distribution metadata contains no model/code/output-use license evidence. Keep pending; no legal conclusion. |

## Boundaries

- No rendering, decoding/playback, first-run, network trace, or target-device test.
- Static JavaScript matching does not resolve arbitrary computed URLs or every bundler transform.
- A source snapshot does not prove these sources compiled to an existing build.
- License/source presence and exact copies do not decide legal sufficiency or the whole-game license.
- Raw provider responses, credential directories, model caches and unlisted originals are not inventoried.
