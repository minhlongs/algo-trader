#!/usr/bin/env python3
path = '/Users/macbook/algo-trader/src/platform/workers/edge-proxy.ts'
with open(path, 'r') as f:
    lines = f.readlines()

# Show lines 317-345 with repr for safe editing
for i in range(317, min(346, len(lines))):
    print(f'{i+1}: {repr(lines[i])}')
