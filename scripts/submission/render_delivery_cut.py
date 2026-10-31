#!/usr/bin/env python3
"""Finish the authorized 45-second cut from existing recordings and screenshots."""
from pathlib import Path
import json
import subprocess
import sys
from PIL import Image, ImageDraw
import render_trailer_preedit as base

ROOT = base.ROOT
OUT = ROOT / 'artifacts/trailer-45s/v2/delivery-cut'
FFMPEG = ROOT / 'design/audio/round-01/.tools/music-venv/lib/python3.12/site-packages/imageio_ffmpeg/binaries/ffmpeg-macos-aarch64-v7.1'
WORLD = ROOT / 'artifacts/trailer-45s/v2/paean-capture/s05/take02/s05-initial.png'
MEMORY = ROOT / 'artifacts/submission/captured-scenes/story-scenes-02/s01-father-memory-hud.png'
RAW = ROOT / 'artifacts/trailer-45s/v2/paean-capture/s05/take02/s05-raw.webm'


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    loaded = base.load_project(ROOT / 'artifacts/trailer-45s/v2/preedit-project/project.json')
    compositor = base.Compositor(loaded)
    images = {'world': Image.open(WORLD).convert('RGB'), 'memory': Image.open(MEMORY).convert('RGB')}
    # Crops remove menu/HUD bands, without reconstructing or replacing pixels.
    crops = {'world': (0, 190, 1280, 630), 'memory': (0, 140, 1280, 560)}
    kinds = ['world', 'memory', 'world', 'world', 'world', 'memory', 'world', 'world', 'world', 'world', 'world']
    pans = [(0.5, .50), (.80, .55), (.62, .40), (.55, .55), (.74, .44), (.46, .58), (.32, .55), (.65, .55), (.53, .52), (.63, .45), (.50, .50)]
    output = OUT / 'ganymede-story-trailer-45s.mp4'
    log = OUT / 'render.log'
    with log.open('wb') as errors:
        encoder = subprocess.Popen([str(FFMPEG), '-v', 'warning', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24',
            '-s', '1920x1080', '-r', '30', '-i', 'pipe:0', '-i', str(loaded['audioPath']),
            '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'libx264', '-preset', 'fast', '-crf', '19',
            '-threads', '4', '-pix_fmt', 'yuv420p', '-frames:v', '1350', '-t', '45',
            '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', '-movflags', '+faststart',
            '-metadata', 'title=重返木卫三｜45秒故事预告', '-metadata',
            'comment=3.6 seconds of existing actual recording, followed by labelled actual screenshots; dedicated score and narration; no game SFX.',
            str(output)], stdin=subprocess.PIPE, stderr=errors)
        decoder = subprocess.Popen([str(FFMPEG), '-v', 'error', '-ss', '132', '-i', str(RAW), '-an',
            '-vf', 'crop=1280:440:0:190,scale=1920:660,pad=1920:1080:0:210:color=0x070c12,fps=30',
            '-frames:v', '108', '-threads', '2', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'],
            stdout=subprocess.PIPE, stderr=errors)
        shot_records = []
        try:
            for index, shot in enumerate(loaded['shots']):
                kind = kinds[index]
                still = images[kind].crop(crops[kind])
                n = shot['endFrameExclusive'] - shot['startFrame']
                shot_records.append({'id': shot['id'], 'start': shot['startSeconds'], 'end': shot['endSeconds'],
                    'image': str(MEMORY if kind == 'memory' else WORLD), 'scene': 'S01' if kind == 'memory' else 'S05',
                    'imageCrop': crops[kind], 'imageTreatment': 'slow editorial zoom and pan; not camera input',
                    'actualRecording': {'file': str(RAW), 'sourceIn': 132, 'duration': 3.6} if index == 0 else None})
                for local, number in enumerate(range(shot['startFrame'], shot['endFrameExclusive'])):
                    moving = number < 108
                    if moving:
                        data = base.read_exact(decoder.stdout, 1920 * 1080 * 3)
                        if len(data) != 1920 * 1080 * 3:
                            raise RuntimeError('The existing 3.6-second recording ended early')
                        frame = Image.frombytes('RGB', (1920, 1080), data)
                    else:
                        frame = Image.new('RGB', (1920, 1080), (7, 12, 18))
                        progress = local / max(1, n - 1)
                        zoom = 1.02 + .055 * progress
                        width, height = still.size
                        w, h = width / zoom, height / zoom
                        cx, cy = pans[index]
                        x, y = (width - w) * cx, (height - h) * cy
                        picture = still.crop((round(x), round(y), round(x + w), round(y + h)))
                        target_h = round(1920 * picture.height / picture.width)
                        picture = picture.resize((1920, target_h), Image.Resampling.BICUBIC)
                        frame.paste(picture, (0, (1080 - target_h) // 2))
                    draw = ImageDraw.Draw(frame, 'RGBA')
                    if index == 10:
                        draw.rectangle((0, 0, 1920, 1080), fill=(0, 0, 0, 175))
                        frame.paste(compositor.title, ((1920 - compositor.title.width)//2,
                            (1080 - compositor.title.height)//2), compositor.title)
                    else:
                        label = '实机录屏' if moving else '实机截图'
                        scene = '十年前 · 闻川的记忆' if kind == 'memory' else '木卫三 · 北闸'
                        draw.text((100, 105), scene, font=compositor.fonts[34], fill=(177, 192, 202, 255))
                        draw.text((1820, 109), label, font=compositor.fonts[28], anchor='ra', fill=(149, 168, 181, 255))
                        cue = next((cue for cue in loaded['subtitles'] if cue['startFrame'] <= number < cue['endFrameExclusive']), None)
                        if cue:
                            draw.text((960, 934), cue['text'], anchor='ma', font=compositor.fonts[52],
                                fill=(245, 244, 239, 255), stroke_width=1, stroke_fill=(0, 0, 0, 255))
                    encoder.stdin.write(frame.tobytes())
                print(f"{shot['id']} complete", flush=True)
            encoder.stdin.close()
            if encoder.wait(timeout=60):
                raise RuntimeError('Encoder failed; see render.log')
        finally:
            if decoder.poll() is None:
                decoder.terminate()
            decoder.wait(timeout=10)
            decoder.stdout.close()
            if encoder.poll() is None:
                encoder.terminate()
                encoder.wait(timeout=10)
    manifest = {'status': 'DELIVERED_STORY_CUT_FROM_EXISTING_MEDIA', 'output': str(output),
        'width': 1920, 'height': 1080, 'fps': 30, 'frames': 1350, 'durationSeconds': 45,
        'sha256': base.sha256(output), 'actualRecordingSeconds': 3.6, 'screenshotAndTitleSeconds': 41.4,
        'gameSfxIncluded': False, 'dedicatedMusicAndNarrationIncluded': True,
        'userDecision': 'Stop all new recording; finish editing and HTML immediately. Game SFX optional.',
        'notClaimed': ['continuous combat demonstration', 'movement or firing footage', 'S02/S08/S12 captured', 'human playthrough'],
        'runtimeBaseline': 'a9030c6', 'titleAlphaPreserved': True, 'titleSeconds': [41, 45],
        'sources': {str(path): base.sha256(path) for path in (WORLD, MEMORY, RAW, loaded['audioPath'], loaded['titlePath'], loaded['subtitlePath'])},
        'shots': shot_records, 'humanListeningReview': 'PENDING'}
    (OUT / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'output': str(output), 'sha256': manifest['sha256']}, ensure_ascii=False))


if __name__ == '__main__':
    main()
