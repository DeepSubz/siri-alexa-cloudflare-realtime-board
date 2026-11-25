import os, sys, json, time
import numpy as np, soundfile as sf, mlx.core as mx
from mlx_audio.tts.utils import load_model

proj = sys.argv[1]; only = sys.argv[2] if len(sys.argv) > 2 else None
script = json.load(open(os.path.join(proj, "script.json")))
out = os.path.join(proj, "assets", "voice"); os.makedirs(out, exist_ok=True)
SR = 24000

def trim(a, thr=0.012, pad=0.06):
    idx = np.where(np.abs(a) > thr)[0]
    if not len(idx): return a
    s = max(0, idx[0] - int(pad * SR)); e = min(len(a), idx[-1] + int(pad * 1.6 * SR))
    return a[s:e]

def run(model, **kw):
    res = list(model.generate(lang_code="en", **kw)) if False else list(model.generate(**kw))
    return np.concatenate([np.array(r.audio, dtype=np.float32) for r in res])

design = load_model("mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-bf16")
ref_path = os.path.join(out, "_nar_ref.wav")
REF_TEXT = "Every voice in this house speaks to one wall. Tonight, we follow a single sentence, from a phone in the kitchen, all the way to a note on the wall."
if not os.path.exists(ref_path):
    mx.random.seed(7)
    a = trim(run(design, text=REF_TEXT, instruct=script["voices"]["nar"], language="English"))
    sf.write(ref_path, a, SR)
base = load_model("mlx-community/Qwen3-TTS-12Hz-1.7B-Base-bf16")
ref_audio = mx.array(sf.read(ref_path, dtype="float32")[0])

manifest_path = os.path.join(proj, "voice_manifest.json")
manifest = json.load(open(manifest_path)) if os.path.exists(manifest_path) else {}
for sc in script["scenes"]:
    if only and sc["id"] != only: continue
    for i, (who, text) in enumerate(sc["lines"]):
        key = f'{sc["id"]}_{i:02d}'
        path = os.path.join(out, key + ".wav")
        if os.path.exists(path) and manifest.get(key, {}).get("text") == text: continue
        t = time.time()
        mx.random.seed(11 + i)
        if who == "nar":
            a = run(base, text=text, ref_audio=ref_audio, ref_text=REF_TEXT, language="English")
        else:
            a = run(design, text=text, instruct=script["voices"][who], language="English")
        a = trim(a)
        peak = np.max(np.abs(a)) or 1.0
        a = a * min(1.0, 0.89 / peak)
        sf.write(path, a, SR)
        manifest[key] = {"who": who, "text": text, "dur": round(len(a) / SR, 3), "file": f"assets/voice/{key}.wav"}
        json.dump(manifest, open(manifest_path, "w"), indent=1)
        print(key, who, manifest[key]["dur"], f"{time.time()-t:.1f}s", flush=True)
print("DONE", flush=True)
