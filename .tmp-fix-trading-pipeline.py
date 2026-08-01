with open("src/desk/trading-pipeline.ts") as f:
    src = f.read()

# Show lines 84-115
lines = src.split("\n")
print("=== Current lines 84-115 ===")
for i in range(83, 115):
    print(f"{i+1}: {repr(lines[i])}")

# Replace the broken block: find "return;\n        try {" pattern
# This is the broken insertion where the if block's closing brace was lost
bad_pattern = "    return;\ntry {"
good_pattern = "    }\n\n    try {"

if bad_pattern in src:
    src = src.replace(bad_pattern, good_pattern, 1)
    print("\nFixed: added closing brace before try block")
else:
    print("\nPattern not found - checking line by line")
    for i, line in enumerate(lines):
        if "emitTradeAuditEvent" in line:
            print(f"  Line {i+1}: {repr(line)}")
        if "return;" in line and i > 85 and i < 100:
            print(f"  Line {i+1} (return): {repr(line)}")
            print(f"  Line {i+2} (next): {repr(lines[i+1])}")
            print(f"  Line {i+3} (next): {repr(lines[i+2])}")

with open("src/desk/trading-pipeline.ts", "w") as f:
    f.write(src)

print("\nDone.")
