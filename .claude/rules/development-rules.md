# Development Rules

# Algo-Trader Visual Aids (supplements user-global development-rules.md)
- Use `/preview --explain` when explaining unfamiliar code patterns or complex logic
- Use `/preview --diagram` for architecture diagrams and data flow visualization
- Use `/preview --slides` for step-by-step walkthroughs and presentations
- Use `/preview --ascii` for terminal-friendly diagrams (no browser needed to understand)
- **Plan context:** Active plan determined from `## Plan Context` in hook injection; visuals save to `{plan_dir}/visuals/`
- If no active plan, fallback to `plans/visuals/` directory
- For Mermaid diagrams, use `/mermaidjs-v11` skill for v11 syntax rules
- See `primary-workflow.md` → Step 6 for workflow integration