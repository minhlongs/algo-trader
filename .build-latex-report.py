path = "/Users/macbook/algo-trader/plans/reports/task-071-publish-content-ready-report-v2.md"
existing = open(path).read()

addon = r"""
"""

open(path, "w").write(existing + addon)
print("Discord section appended")
