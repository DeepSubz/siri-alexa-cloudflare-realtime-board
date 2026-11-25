import sys, numpy as np, soundfile as sf
def f0(path):
    a, sr = sf.read(path, dtype='float32')
    if a.ndim > 1: a = a.mean(1)
    fr, hop = int(.04*sr), int(.01*sr); out=[]
    for i in range(0, len(a)-fr, hop):
        x = a[i:i+fr]; x = x - x.mean()
        if np.sqrt((x*x).mean()) < .02: continue
        c = np.correlate(x, x, 'full')[fr-1:]
        lo, hi = int(sr/400), int(sr/70)
        k = lo + np.argmax(c[lo:hi])
        if c[k] > .3*c[0]: out.append(sr/k)
    o=np.array(out); return np.median(o), np.percentile(o,90)-np.percentile(o,10)
for p in sys.argv[1:]:
    m, r = f0(p); print(f"{p.split('/')[-2]}/{p.split('/')[-1]}: median pitch {m:.0f} Hz, range {r:.0f} Hz")
