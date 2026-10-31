#!/usr/bin/env python3
"""Render the explicitly labelled 45 s trailer pre-edit, without gameplay claims.

Pillow rasterizes all text, including Chinese subtitles. FFmpeg receives RGB
frames and the existing audio master, so drawtext/libass are not required.
Real sourceClip replacements are optional; their audio is deliberately ignored.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
import wave
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_PROJECT = ROOT / "artifacts/trailer-45s/v2/preedit-project/project.json"
FONT_CANDIDATES = (
    "/System/Library/Fonts/STHeiti Medium.ttc",
    "/System/Library/Fonts/PingFang.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
)
LABEL = "预剪稿 · 实机镜头待补"
TIME_RE = re.compile(r"^(\d{2}):(\d{2}):(\d{2}),(\d{3})$")


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def resolve(value: str, root: Path = ROOT) -> Path:
    path = Path(value).expanduser()
    return path.resolve() if path.is_absolute() else (root / path).resolve()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def stamp(value: str) -> float:
    match = TIME_RE.fullmatch(value.strip())
    if not match:
        raise ValueError(f"Invalid SRT timestamp: {value!r}")
    h, m, s, ms = map(int, match.groups())
    if m > 59 or s > 59:
        raise ValueError(f"Invalid SRT timestamp: {value!r}")
    return 3600 * h + 60 * m + s + ms / 1000


def read_srt(path: Path, fps: int, duration: float) -> list[dict]:
    text = path.read_text(encoding="utf-8-sig").replace("\r\n", "\n").strip()
    cues: list[dict] = []
    for block in re.split(r"\n\s*\n", text):
        lines = block.splitlines()
        if len(lines) < 3 or " --> " not in lines[1]:
            raise ValueError(f"Invalid SRT block: {block!r}")
        left, right = lines[1].split(" --> ", 1)
        start, end = stamp(left), stamp(right)
        if not (0 <= start < end <= duration):
            raise ValueError(f"SRT cue is outside the film: {lines[0]}")
        if cues and start < cues[-1]["endSeconds"]:
            raise ValueError("Overlapping SRT cues are not supported")
        cues.append({"id": lines[0], "startSeconds": start, "endSeconds": end,
                     "startFrame": math.ceil(start * fps - 1e-8),
                     "endFrameExclusive": math.ceil(end * fps - 1e-8),
                     "text": "\n".join(lines[2:])})
    if not cues:
        raise ValueError("SRT contains no cues")
    return cues


def inspect_wav(path: Path, duration: float) -> dict:
    with wave.open(str(path), "rb") as audio:
        result = {"sampleRate": audio.getframerate(), "sampleFrames": audio.getnframes(),
                  "channels": audio.getnchannels(), "sampleWidthBytes": audio.getsampwidth()}
    if result["sampleRate"] != 48000 or result["sampleFrames"] != round(duration * 48000):
        raise ValueError(f"Expected an exact 45 s / 48 kHz PCM master: {path}")
    return result


def load_project(path: Path, font_override: str | None = None) -> dict:
    project = read_json(path)
    timeline_path = resolve(project["timeline"])
    timeline = read_json(timeline_path)
    video = timeline["video"]
    if (video["targetWidth"], video["targetHeight"], video["fps"], video["frameCount"],
            video["durationSeconds"]) != (1920, 1080, 30, 1350, 45):
        raise ValueError("This pre-edit requires 1920x1080 / 30 fps / 1350 frames / 45 s")
    overrides = {item["id"]: item for item in project["shots"]}
    if len(overrides) != len(project["shots"]) or set(overrides) != {s["id"] for s in timeline["shots"]}:
        raise ValueError("Project must configure each timeline shot exactly once")
    shots: list[dict] = []
    previous = 0
    for base in timeline["shots"]:
        shot = dict(base)
        override = overrides[base["id"]]
        for key in ("cardTitle", "cardDetail", "sourceClip", "sourceInSeconds", "provenance"):
            shot[key] = override.get(key)
        if shot["startFrame"] != previous or shot["endFrameExclusive"] <= previous:
            raise ValueError("Timeline shots must be contiguous and nonempty")
        if (shot["startSeconds"] * 30 != shot["startFrame"] or
                shot["endSeconds"] * 30 != shot["endFrameExclusive"]):
            raise ValueError("Timeline seconds and frame indices disagree")
        previous = shot["endFrameExclusive"]
        if not shot["cardTitle"]:
            raise ValueError(f"Missing concise card title: {shot['id']}")
        if shot["sourceClip"] is not None:
            source = resolve(shot["sourceClip"])
            if not source.is_file() or source.suffix.lower() not in {".mp4", ".mov", ".m4v", ".mkv", ".webm"}:
                raise ValueError(f"sourceClip must be an existing video file: {source}")
            incoming = shot["sourceInSeconds"]
            if not isinstance(incoming, (float, int)) or not math.isfinite(incoming) or incoming < 0:
                raise ValueError("A real sourceClip needs a nonnegative sourceInSeconds")
            provenance = shot["provenance"]
            if not isinstance(provenance, dict) or not all(provenance.get(k) for k in ("sceneId", "buildId", "captureKind")):
                raise ValueError("A real sourceClip needs provenance.sceneId/buildId/captureKind")
            shot["resolvedSource"] = source
            shot["sourceSha256"] = sha256(source)
            if provenance.get("sha256") and provenance["sha256"] != shot["sourceSha256"]:
                raise ValueError(f"Source hash differs from its provenance: {source}")
        else:
            shot["resolvedSource"] = None
            shot["sourceSha256"] = None
        shots.append(shot)
    if len(shots) != 11 or previous != 1350 or shots[-1]["startFrame"] != 1230:
        raise ValueError("Expected 11 shots, with the final title at frames 1230..1349")
    audio_path, subtitle_path, title_path = (resolve(project[key]) for key in ("audioMix", "subtitles", "titlePng"))
    for asset in (audio_path, subtitle_path, title_path):
        if not asset.is_file():
            raise FileNotFoundError(asset)
    audio_info = inspect_wav(audio_path, 45)
    subtitles = read_srt(subtitle_path, 30, 45)
    font_path = resolve(font_override) if font_override else next((Path(p) for p in FONT_CANDIDATES if Path(p).is_file()), None)
    if not font_path or not font_path.is_file():
        raise FileNotFoundError("A Chinese font is required; pass --font /path/to/font.ttc")
    ImageFont.truetype(str(font_path), 48)
    with Image.open(title_path) as image:
        if image.mode != "RGBA" or image.getchannel("A").getextrema() == (255, 255):
            raise ValueError("The title must retain its original transparent RGBA alpha channel")
    return {"projectPath": path, "timelinePath": timeline_path, "project": project,
            "shots": shots, "audioPath": audio_path, "audioInfo": audio_info,
            "subtitlePath": subtitle_path, "subtitles": subtitles, "titlePath": title_path,
            "fontPath": font_path, "width": 1920, "height": 1080, "fps": 30, "frames": 1350}


class Compositor:
    def __init__(self, loaded: dict):
        self.loaded = loaded
        self.fonts = {size: ImageFont.truetype(str(loaded["fontPath"]), size) for size in (28, 30, 34, 40, 52, 66, 96)}
        self.background = Image.new("RGB", (1920, 1080))
        draw = ImageDraw.Draw(self.background)
        for y in range(1080):
            t = y / 1079
            draw.line((0, y, 1919, y), fill=(round(12 + 5 * t), round(20 + 6 * t), round(29 + 8 * t)))
        draw.line((96, 205, 1824, 205), fill=(47, 63, 76), width=2)
        with Image.open(loaded["titlePath"]) as original:
            self.title = original.copy()
        self.title.thumbnail((1480, 500), Image.Resampling.LANCZOS)

    def wrap(self, text: str, font: ImageFont.FreeTypeFont, max_width: int) -> list[str]:
        draw = ImageDraw.Draw(self.background)
        result: list[str] = []
        for paragraph in text.split("\n"):
            line = ""
            for char in paragraph:
                if line and draw.textlength(line + char, font=font) > max_width:
                    result.append(line)
                    line = char
                else:
                    line += char
            result.append(line)
        return result

    def render(self, shot: dict, cue: dict | None, source: Image.Image | None = None) -> Image.Image:
        picture = source.copy() if source is not None else self.background.copy()
        draw = ImageDraw.Draw(picture, "RGBA")
        if shot["id"] == "T11":
            if source is not None:
                draw.rectangle((0, 0, 1920, 1080), fill=(0, 0, 0, 170))
            picture.paste(self.title, ((1920 - self.title.width) // 2, (1080 - self.title.height) // 2), self.title)
            draw = ImageDraw.Draw(picture, "RGBA")
        elif source is None:
            draw.text((96, 290), f"{shot['id']}  /  11", font=self.fonts[40], fill=(141, 164, 181, 255))
            lines = self.wrap(shot["cardTitle"], self.fonts[66], 1710)
            if len(lines) > 2:
                raise ValueError(f"Card title is too long: {shot['id']}")
            for index, line in enumerate(lines):
                draw.text((92, 380 + index * 90), line, font=self.fonts[66], fill=(235, 240, 242, 255))
            detail_y = 400 + len(lines) * 90
            draw.line((96, detail_y, 250, detail_y), fill=(222, 172, 103, 255), width=5)
            for index, line in enumerate(self.wrap(shot.get("cardDetail") or "实机镜头待补", self.fonts[34], 1650)):
                draw.text((96, detail_y + 40 + index * 48), line, font=self.fonts[34], fill=(153, 172, 186, 255))
        # This badge is deliberately mandatory, including the title and any real-footage replacements.
        draw.rounded_rectangle((72, 54, 710, 133), radius=14, fill=(11, 17, 24, 235), outline=(150, 111, 64, 255), width=2)
        draw.ellipse((98, 84, 116, 102), fill=(231, 178, 106, 255))
        draw.text((138, 70), LABEL, font=self.fonts[40], fill=(244, 216, 174, 255))
        time_label = f"{shot['id']}   {shot['startSeconds']:02.0f}—{shot['endSeconds']:02.0f} s"
        draw.text((1824, 82), time_label, font=self.fonts[30], fill=(174, 190, 202, 255), anchor="ra")
        if cue:
            lines = self.wrap(cue["text"], self.fonts[52], 1630)
            if len(lines) > 2:
                raise ValueError(f"Subtitle needs more than two lines: {cue['id']}")
            panel_top = 980 - len(lines) * 72 - 24
            draw.rounded_rectangle((116, panel_top, 1804, 1010), radius=16, fill=(3, 8, 13, 224))
            for index, line in enumerate(lines):
                draw.text((960, panel_top + 22 + index * 72), line, font=self.fonts[52],
                          fill=(249, 249, 246, 255), anchor="ma", stroke_width=1, stroke_fill=(0, 0, 0, 255))
        return picture


def read_exact(stream, count: int) -> bytes:
    chunks: list[bytes] = []
    remaining = count
    while remaining:
        block = stream.read(remaining)
        if not block:
            break
        chunks.append(block)
        remaining -= len(block)
    return b"".join(chunks)


def render(loaded: dict, ffmpeg: str, output: Path, overwrite: bool, threads: int) -> dict:
    if output.exists() and not overwrite:
        raise FileExistsError(f"Output exists; use --overwrite only for this pre-edit: {output}")
    output.parent.mkdir(parents=True, exist_ok=True)
    compositor = Compositor(loaded)
    with tempfile.TemporaryDirectory(prefix="preedit-render-", dir=str(output.parent)) as temp_name:
        temp = Path(temp_name)
        partial = temp / "trailer-preedit.mp4"
        error_log = output.with_suffix(".ffmpeg.log")
        command = [ffmpeg, "-hide_banner", "-loglevel", "warning", "-y",
                   "-f", "rawvideo", "-pixel_format", "rgb24", "-video_size", "1920x1080",
                   "-framerate", "30", "-i", "pipe:0", "-i", str(loaded["audioPath"]),
                   "-map", "0:v:0", "-map", "1:a:0", "-c:v", "libx264", "-preset", "fast",
                   "-crf", "18", "-threads", str(threads), "-pix_fmt", "yuv420p", "-r", "30",
                   "-frames:v", "1350", "-t", "45", "-video_track_timescale", "30000",
                   "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2",
                   "-af", "atrim=duration=45,asetpts=PTS-STARTPTS", "-movflags", "+faststart",
                   "-metadata", "title=重返木卫三｜预剪稿·实机镜头待补",
                   "-metadata", "comment=Placeholder pre-edit. Existing music and narration only; no gameplay SFX.",
                   str(partial)]
        with error_log.open("wb") as errors:
            encoder = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=errors)
            decoder = None
            try:
                assert encoder.stdin is not None
                for shot in loaded["shots"]:
                    frames = shot["endFrameExclusive"] - shot["startFrame"]
                    cache_key, cached = None, None
                    decoder_log = None
                    print(f"{shot['id']} {shot['startSeconds']:g}—{shot['endSeconds']:g}s: "
                          f"{'SOURCE VIDEO' if shot['resolvedSource'] else 'LABELLED PLACEHOLDER'}", flush=True)
                    if shot["resolvedSource"]:
                        decoder_log = (temp / f"{shot['id']}-decode.log").open("wb")
                        decode_command = [ffmpeg, "-hide_banner", "-loglevel", "error", "-ss", str(shot["sourceInSeconds"]),
                                          "-i", str(shot["resolvedSource"]), "-map", "0:v:0", "-an",
                                          "-vf", "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30",
                                          "-frames:v", str(frames), "-threads", str(threads),
                                          "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"]
                        decoder = subprocess.Popen(decode_command, stdout=subprocess.PIPE, stderr=decoder_log)
                    try:
                        for frame in range(shot["startFrame"], shot["endFrameExclusive"]):
                            cue = next((c for c in loaded["subtitles"] if c["startFrame"] <= frame < c["endFrameExclusive"]), None)
                            if decoder:
                                pixels = read_exact(decoder.stdout, 1920 * 1080 * 3)
                                if len(pixels) != 1920 * 1080 * 3:
                                    raise RuntimeError(f"{shot['id']} source ended early; refusing freeze-frame padding")
                                source = Image.frombytes("RGB", (1920, 1080), pixels)
                                cached = compositor.render(shot, cue, source).tobytes()
                            elif cache_key != (shot["id"], cue["id"] if cue else None):
                                cache_key = (shot["id"], cue["id"] if cue else None)
                                cached = compositor.render(shot, cue).tobytes()
                            encoder.stdin.write(cached)
                    finally:
                        if decoder:
                            if decoder.poll() is None:
                                decoder.terminate()
                            decoder.wait(timeout=20)
                            decoder.stdout.close()
                            decoder = None
                        if decoder_log:
                            decoder_log.close()
                encoder.stdin.close()
                code = encoder.wait(timeout=180)
                if code:
                    raise RuntimeError(f"FFmpeg exited {code}; see {error_log}")
            except BaseException:
                if decoder and decoder.poll() is None:
                    decoder.terminate()
                if encoder.poll() is None:
                    encoder.terminate()
                    encoder.wait(timeout=20)
                raise
        os.replace(partial, output)
    report = {
        "status": "RENDERED_PREEDIT_NOT_GAMEPLAY_FINAL",
        "output": str(output), "sha256": sha256(output), "persistentLabel": LABEL,
        "renderedFrames": 1350, "fps": 30, "intendedDurationSeconds": 45,
        "independentMediaInspection": "PENDING", "humanListeningReview": "PENDING",
        "gameSfxIncluded": False, "audioMaster": str(loaded["audioPath"]),
        "audioMasterSha256": sha256(loaded["audioPath"]), "audioMasterInfo": loaded["audioInfo"],
        "subtitleFile": str(loaded["subtitlePath"]), "subtitleSha256": sha256(loaded["subtitlePath"]),
        "subtitleCues": loaded["subtitles"], "subtitleFrameRounding": "ceil at 30 fps; original SRT times retained",
        "titlePng": str(loaded["titlePath"]), "titlePngSha256": sha256(loaded["titlePath"]),
        "titleFrames": [1230, 1350], "project": str(loaded["projectPath"]),
        "projectSha256": sha256(loaded["projectPath"]), "timelineSha256": sha256(loaded["timelinePath"]),
        "shots": [{"id": s["id"], "startFrame": s["startFrame"], "endFrameExclusive": s["endFrameExclusive"],
                   "kind": "source_clip" if s["resolvedSource"] else "labelled_placeholder",
                   "sourceClip": str(s["resolvedSource"]) if s["resolvedSource"] else None,
                   "sourceSha256": s["sourceSha256"], "sourceInSeconds": s["sourceInSeconds"] if s["resolvedSource"] else None,
                   "playbackSpeed": 1 if s["resolvedSource"] else None, "sourceAudioUsed": False,
                   "provenance": s["provenance"]} for s in loaded["shots"]],
    }
    output.with_suffix(".render.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", type=Path, default=DEFAULT_PROJECT)
    parser.add_argument("--ffmpeg", default=shutil.which("ffmpeg"))
    parser.add_argument("--font", help="Chinese TTF/TTC font path")
    parser.add_argument("--output", type=Path)
    parser.add_argument("--threads", type=int, default=2, help="Limit encoding load; default 2")
    parser.add_argument("--overwrite", action="store_true")
    parser.add_argument("--check-only", action="store_true", help="Validate local inputs; create no media")
    args = parser.parse_args()
    try:
        loaded = load_project(args.project.resolve(), args.font)
        if args.threads < 1:
            raise ValueError("--threads must be positive")
        if args.check_only:
            print(json.dumps({"status": "INPUTS_VALID", "shots": len(loaded["shots"]), "frames": 1350,
                              "srtCues": len(loaded["subtitles"]), "audio": loaded["audioInfo"],
                              "font": str(loaded["fontPath"]), "mediaRendered": False}, ensure_ascii=False))
            return 0
        if not args.ffmpeg:
            raise FileNotFoundError("Pass the existing FFmpeg executable with --ffmpeg")
        ffmpeg = str(resolve(args.ffmpeg)) if "/" in args.ffmpeg else shutil.which(args.ffmpeg)
        if not ffmpeg or not os.access(ffmpeg, os.X_OK):
            raise FileNotFoundError(f"FFmpeg is not executable: {args.ffmpeg}")
        output = args.output.resolve() if args.output else (args.project.resolve().parent / "output/trailer-45s-preedit.mp4")
        if output.suffix.lower() != ".mp4":
            raise ValueError("Output must end in .mp4")
        report = render(loaded, ffmpeg, output, args.overwrite, args.threads)
        print(json.dumps({"status": report["status"], "output": report["output"], "sha256": report["sha256"]}, ensure_ascii=False))
        return 0
    except (ValueError, FileNotFoundError, FileExistsError, RuntimeError, OSError, subprocess.SubprocessError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
