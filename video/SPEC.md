# SPEC — Family Board: one sentence, end to end

GOAL:    a viewer (technical or not) understands how one spoken sentence travels through six systems to the wall, and leaves convinced the builder knows integrations and system architecture deeply.
OUTPUT:  HyperFrames, 1920 x 1080, 30 fps.
TIME:    set by the Qwen narration (voice_manifest.json → build.mjs); target 8–10 min, hard ceiling 15 min.
LOOK:    home stage = isometric model on drafting paper #e7ebf0 with a 6% ink grid; ink #18202c.
         System colours carry meaning only: Siri #2f6ff2, Alexa #0f9a92, Muse #7350e6, Workers AI #d2458e,
         writes & push #e0662a, files/polling #7d8798, key #a1792a, post-it #fbe88f.
         Display Outfit 700, 64–96 px, -1.5% tracking; body Inter 400/700 30–40 px; code IBM Plex Mono 26–32 px;
         handwriting Bradley Hand Bold on post-its only.
         Rooms: kitchen #f1dfca wall / oak counter #b8875a; living room #d9cab2 wall; evening room #3e5560 wall with warm desk light;
         dawn studio #ecebf3. Shadows: 0 24px 48px rgba(20,24,32,.22).
OBJECTS: iPhone (black bezel, island, Siri edge light, transcript), Echo Show (fabric base, 10" screen, cyan light bar),
         wall TV (thin bezel) with the post-it board (banner, pins, rows), Cloudflare worker box with routes,
         Workers AI cube, Durable Object "Board" with SQLite cylinder, floating tasks.md post-it, Alexa cloud,
         Muse cylinder with Calendar / Gmail / Mail tiles, key vault, laptop, phone.
MOTION:  arrivals expo.out 0.6–0.9 s; camera power2.inOut 1.4–2.4 s; exits power3.in 0.35 s;
         packets linear along paths 0.9–1.6 s; text per word blur-in 0.13 s, 0.07 s apart.
SHOTS:   one composition per narration scene (see script.json), visuals cued to each spoken line.
BANNED:  dark void with floating UI; glow/bloom/particles as decoration; purple-blue gradients; glass cards;
         three cards in a row; corner HUD; everything fading up; text moving while read; docked logo;
         spoken wake words that would trigger a viewer's real assistant (wake words are shown, not said).
QA:      first frame shows the board; every JSON and label ≥ 28 px; each scene's hero fills ≥ 40% of frame;
         no line on screen shorter than its read time.
