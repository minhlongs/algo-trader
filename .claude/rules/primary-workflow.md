# Visual Explanations (Algo-Trader specific — supplements user-global primary-workflow.md)

When explaining complex code, protocols, or architecture:
- **When to use:** User asks "explain", "how does X work", "visualize", or topic has 3+ interacting components
- Use `/preview --explain <topic>` to generate visual explanation with ASCII + Mermaid
- Use `/preview --diagram <topic>` for architecture and data flow diagrams
- Use `/preview --slides <topic>` for step-by-step walkthroughs
- Use `/preview --ascii <topic>` for terminal-friendly output only
- **Plan context:** Visuals save to plan folder from `## Plan Context` hook injection; if none, uses `plans/visuals/`
- Auto-opens in browser via markdown-novel-viewer with Mermaid rendering
- See `development-rules.md` → "Visual Aids" section for additional guidance
