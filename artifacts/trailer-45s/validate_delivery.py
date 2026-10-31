#!/usr/bin/env python3
"""Validate an edit plan, not a finished film. No runtime state is modified."""
from pathlib import Path
import argparse
import csv
import hashlib
import io
import json
import re
import subprocess

BASE = Path(__file__).resolve().parent
ROOT = BASE.parents[1]
NAME = "trailer45.approved-text.draft-timing.zh-CN"

def timestamp(ms, separator):
    hours, rest = divmod(ms, 3600000)
    minutes, rest = divmod(rest, 60000)
    seconds, millis = divmod(rest, 1000)
    return f"{hours:02}:{minutes:02}:{seconds:02}{separator}{millis:03}"

def derived_files(plan):
    cues = plan["approved_text_cues"]
    srt = "\n\n".join(
        f'{i}\n{timestamp(c["start_ms"], ",")} --> {timestamp(c["end_ms"], ",")}\n{c["display"]}'
        for i, c in enumerate(cues, 1)
    ) + "\n"
    vtt = "WEBVTT\n\n" + "\n\n".join(
        f'{c["id"]}\n{timestamp(c["start_ms"], ".")} --> {timestamp(c["end_ms"], ".")}\n{c["display"]}'
        for c in cues
    ) + "\n"
    csv_data = io.StringIO(newline="")
    fields = ["id", "start_tc", "end_tc", "start_frame", "end_frame", "duration_frames", "duration_ms",
              "chapter", "kind", "picture", "source", "capture", "available", "gap", "subtitle", "sound",
              "status", "actual_capture", "source_in_tc", "source_out_tc"]
    writer = csv.DictWriter(csv_data, fieldnames=fields, lineterminator="\n")
    writer.writeheader()
    for shot in plan["shots"]:
        row = {key: shot.get(key) for key in fields}
        row["status"] = "；".join(shot["status"])
        writer.writerow(row)
    return {f"{NAME}.srt": srt, f"{NAME}.vtt": vtt, "timeline.csv": csv_data.getvalue()}

def parse_timestamp(value):
    h, m, s, ms = map(int, re.split("[:,.]", value))
    return h * 3600000 + m * 60000 + s * 1000 + ms

def parse_subtitle(content, vtt=False):
    blocks = content.strip().split("\n\n")
    if vtt:
        assert blocks.pop(0) == "WEBVTT"
    parsed = []
    for index, block in enumerate(blocks, 1):
        lines = block.splitlines()
        assert len(lines) >= 3
        if not vtt:
            assert lines[0] == str(index)
        pair = lines[1].split(" --> ")
        assert len(pair) == 2
        parsed.append((parse_timestamp(pair[0]), parse_timestamp(pair[1]), "\n".join(lines[2:])))
    return parsed

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true", help="Regenerate only derived text assets.")
    args = parser.parse_args()
    plan = json.loads((BASE / "timeline.json").read_text())
    proposals = json.loads((BASE / "dialogue-candidates.json").read_text())["candidates"]
    assert plan["video"]["fps_num"] == 30 and plan["video"]["fps_den"] == 1
    assert plan["video"]["total_frames"] == 1350 and plan["video"]["total_ms"] == 45000
    assert plan["final_video"] is None
    cursor = 0
    for shot in plan["shots"]:
        assert shot["start_frame"] == cursor, (shot["id"], "gap or overlap")
        assert shot["end_frame"] > cursor
        assert shot["duration_frames"] == shot["end_frame"] - cursor
        assert shot["duration_ms"] * 30 == shot["duration_frames"] * 1000
        assert shot["actual_capture"] is None
        cursor = shot["end_frame"]
    assert cursor == 1350
    assert sum(s["duration_ms"] for s in plan["shots"]) == 45000
    assert plan["video"]["audio_pcm_samples"] == 45000 * 48
    assert plan["title"]["end_frame"] - plan["title"]["start_frame"] == 75

    protected = {
        "A01": "你们他妈的冲我来啊……啊——",
        "A02": "哥，你的灵魂是被重力束缚太久了吧？",
        "A03": "你个臭小子。",
        "A04": "你往后走，这一组才能跟着收。",
        "A05": "闻川啊，地球，真的很美好。",
    }
    prior_end = -1
    cue_metrics = []
    for cue in plan["approved_text_cues"]:
        assert cue["text"] == protected[cue["id"]]
        assert cue["display"].replace("\n", "") == cue["speaker"] + "：" + cue["text"]
        assert cue["text_approval"] in {"approved_user_text", "selected_in_existing_trailer_plan"}
        assert 0 <= cue["start_ms"] < cue["end_ms"] <= 45000
        assert cue["start_ms"] >= prior_end
        assert cue["start_ms"] * 30 % 1000 == 0 and cue["end_ms"] * 30 % 1000 == 0
        assert len(cue["display"].splitlines()) <= 2
        assert max(map(len, cue["display"].splitlines())) <= 24
        prior_end = cue["end_ms"]
        cue_metrics.append({"id": cue["id"], "duration_ms": cue["end_ms"] - cue["start_ms"],
                            "max_line_characters": max(map(len, cue["display"].splitlines())),
                            "audio_alignment": "NOT_RUN"})
    assert all(c["approval"] == "NOT_APPROVED" and c["burn_in"] is False for c in proposals)
    assert not {c["id"] for c in proposals} & set(protected)

    files = derived_files(plan)
    for filename, content in files.items():
        if args.write:
            with (BASE / filename).open("w", encoding="utf-8", newline="") as output:
                output.write(content)
        assert (BASE / filename).read_text(encoding="utf-8").replace("\r\n", "\n") == content.replace("\r\n", "\n")
    srt = parse_subtitle(files[f"{NAME}.srt"])
    vtt = parse_subtitle(files[f"{NAME}.vtt"], True)
    assert srt == vtt
    assert len(srt) == 5
    for candidate in proposals:
        assert candidate["text"] not in "\n".join(item[2] for item in srt)

    roadshow = json.loads((BASE / "roadshow-timeline.json").read_text())
    cursor = 0
    for segment in roadshow["segments"]:
        assert segment["start_s"] == cursor and segment["end_s"] > cursor
        cursor = segment["end_s"]
    assert cursor == 180
    assert roadshow["segments"][2]["start_s"] == 20 and roadshow["segments"][2]["end_s"] == 65
    assert sum(s["end_s"] - s["start_s"] for s in roadshow["segments"] if s["kind"] == "gameplay_or_transition") == 95

    source_files = [
        "design/TRAILER_45S.md", "design/audio/TRAILER_AUDIO_BRIEF.md",
        "docs/SUBMISSION_PLAN.md", "docs/COMPETITION_COMPLIANCE.md",
        "docs/handoff/current/03_CHARACTERS_AND_ARCS.md",
        "docs/handoff/current/04_CAMPAIGN_AND_LEVELS.md",
        "src/main.ts", "src/ui/GameUI.ts", "src/player/Input.ts",
        "src/content/chapter-flow.ts", "src/mission/Rescue.ts", "src/mission/Simulation.ts",
        "src/mission/Relief.ts", "src/content/rescue-layout.ts",
        "src/presentation/rescue-environment.ts", "tests/finale-interactions.test.ts",
        "tests/fixtures/finale/rescue-4.json", "tests/fixtures/finale/rescue-4.source.json",
        "package.json", "vite.config.ts"
    ]
    source_hashes = {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in source_files}
    provenance = json.loads((ROOT / "tests/fixtures/finale/rescue-4.source.json").read_text())
    assert source_hashes["tests/fixtures/finale/rescue-4.json"] == provenance["sha256"]
    report = {
        "status": "PASS_STRUCTURAL_PLAN_AND_TEXT_ONLY",
        "baseline": plan["source_baseline"],
        "validation_git_head": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
        "shot_count": len(plan["shots"]), "video_frames": 1350,
        "video_seconds": 45, "fps": 30, "title_seconds": 2.5,
        "approved_subtitle_cues": len(srt), "candidate_lines_excluded": len(proposals),
        "subtitles_utf8_parse": "PASS", "srt_vtt_equivalence": "PASS",
        "subtitle_time_order_no_overlap": "PASS", "protected_texts": "PASS",
        "subtitle_metrics": cue_metrics, "roadshow_allocated_seconds": cursor,
        "roadshow_sections": {"intro_s": 20, "film_s": 45, "gameplay_with_disclosed_transition_s": 95, "outro_s": 20},
        "actual_human_180s_rehearsal": "NOT_RUN", "voice_timing_listen": "NOT_RUN",
        "source_video_capture": "NOT_RUN", "final_video_export": "NOT_RUN",
        "rendered_subtitle_projection_readability": "NOT_RUN",
        "source_sha256_at_validation": source_hashes,
        "derived_sha256": {name: hashlib.sha256((BASE / name).read_bytes()).hexdigest() for name in files}
    }
    (BASE / "validation.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({key: report[key] for key in ["status", "shot_count", "video_seconds", "approved_subtitle_cues", "candidate_lines_excluded", "roadshow_allocated_seconds"]}, ensure_ascii=False))

if __name__ == "__main__":
    main()
