# The explainer film (rendered from code)

A 9-minute explainer of this architecture, built as HTML and animation code with [HyperFrames](https://hyperframes.heygen.com), narrated with **Qwen3-TTS** running locally, and timed automatically to the narration.

```
script.json      narration, line by line, with voice descriptions
src/lib.js       shared code: isometric world, devices, board, packets, labels
src/scenes/      one scene per narration block (22 scenes)
build.mjs        times every scene to the voice files and writes compositions/ + index.html
captions.mjs     builds burned-in subtitles and an .srt from a transcript
tools/run_tts.py generates the narration with Qwen3-TTS (MLX, Apple Silicon)
music.json       where the music beds go (tracks not included)
```

## Build it

1. **Voice (Apple Silicon Mac):**
   `python3 -m venv qwenv && qwenv/bin/pip install mlx-audio soundfile`
   `qwenv/bin/python tools/run_tts.py .` downloads Qwen3-TTS (1.7B VoiceDesign + Base), designs the narrator voice, clones it for every line and writes `assets/voice/*.wav` plus `voice_manifest.json`.
2. **Music (optional):** download free tracks (for example *Infographic Technology* and *Ambient Technology* by The_Mountain on Pixabay) into `assets/music/` with the file names in `music.json`.
3. **Handwriting font (optional):** the board text uses *Bradley Hand* if it is installed (macOS), otherwise put any handwriting `.ttf` at `assets/fonts/hand.ttf`.
4. **Assemble:** `node build.mjs` (add `FAST=1` for the fast-paced cut).
5. **Subtitles (optional):** transcribe the narration track (`npx hyperframes transcribe <wav> --json`), then `node captions.mjs <transcript.json>` and `node build.mjs` again.
6. **Preview and render:** `npx hyperframes preview`, then `npx hyperframes render --quality delivery`.

Media files (voices, music, fonts, renders) are not included in the repository.
