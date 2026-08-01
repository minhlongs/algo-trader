with open("src/desk/trading-pipeline.ts") as f:
    lines = f.readlines()

# Check lines 88-95 to confirm exact state
for i in range(87, 96):
    print(f"{i+1}: {repr(lines[i])}")

# The issue: line 93 is "    return;\n", line 94 is "    try {\n"
# We need "    return;\n" then "  }\n" then "\n" then "  try {\n"
# Replace "    return;\n    try {" with "    return;\n  }\n\n  try {"

old = "    return;\n    try {"
new = "    return;\n  }\n\n  try {"

if old in "".join(lines):
    src = "".join(lines)
    src = src.replace(old, new, 1)
    with open("src/desk/trading-pipeline.ts", "w") as f:
        f.write(src)
    print("\nFixed: added closing } for the if block")
else:
    print("\nPattern not found!")
