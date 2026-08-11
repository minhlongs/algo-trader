#!/usr/bin/env python3
import os, re
base = '/Users/macbook/algo-trader/plans'
results = []
for d in sorted(os.listdir(base)):
    if d in ['reports', 'templates']:
        continue
    full = os.path.join(base, d)
    pm = os.path.join(full, 'plan.md')
    if not os.path.isfile(pm):
        continue
    txt = open(pm).read(3000).lower()
    if any(w in txt for w in ['status: complete', 'status: done', 'archived', 'status: closed', 'status: superseded']):
        continue
    m = re.search(r'priority[:\s]+([pP]\d)', txt)
    prio = m.group(1).upper() if m else 'P9'
    m2 = re.search(r'^#\s+(.+)$', txt, re.MULTILINE)
    title = m2.group(1).strip() if m2 else d

    # Get phase statuses
    phases = []
    for fname in os.listdir(full):
        if fname.startswith('phase-') and fname.endswith('.md'):
            fpath = os.path.join(full, fname)
            ftxt = open(fpath).read(500).lower()
            sm = re.search(r'status:\s*(pending|complete|in_progress|blocked)', ftxt)
            if sm:
                phases.append(f"{fname}:{sm.group(1)}")

    results.append((prio, d, title[:60], phases[:3]))  # only show first 3 phases

for prio, d, title, phases in sorted(results):
    phase_str = ', '.join(phases) if phases else 'no phases'
    print(f'{prio} | {d} | {title} | {phase_str}')
