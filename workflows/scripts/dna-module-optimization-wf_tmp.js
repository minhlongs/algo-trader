export const meta = {
  name: 'dna-module-optimization',
  description: 'Optimize DNA module for clarity and maintainability: refactor orchestrator, improve testability, documentation',
  phases: [
    { title: 'DNA Analysis', detail: 'Analyze current DNA code, identify complexity issues' },
    { title: 'Refactor Orchestrator', detail: 'Split orchestrator into focused modules' },
    { title: 'Improve Testability', detail: 'Extract dependencies, enable mocking' },
    { title: 'Performance Optimization', detail: 'Reduce memory usage, optimize inference' },
    { title: 'Documentation', detail: 'Architecture docs, inline comments, examples' },
    { title: 'Testing & Sign-off', detail: 'Regression tests, performance benchmarks' },
  ],
};

phase('Analysis');
const analysis = await agent('Analyze DNA Module', {
  label: 'dna-analysis',
  agentType: 'cto',
  isolation: 'worktree',
  prompt: `Analyze DNA (Dynamic Neural Architecture) module.

Current issues:
- src/dna/orchestrator.ts likely too large (>200 lines)
- Poor separation of concerns
- Hard to test (tightly coupled)
- Unclear data flow

Analyze:
1. Read src/dna/orchestrator.ts
2. Identify distinct responsibilities
3. Map dependencies
4. Find complexity hotspots (cyclomatic complexity >10)

Report in ./plans/dna-optimization/analysis.md

`,
});

phase('Refactor Orchestrator');
const refactor = await parallel([
  () => agent('Split Orchestrator into Modules', {
    label: 'dna-refactor',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Refactor DNA orchestrator.

Split orchestrator.ts into:
1. src/dna/orchestrator/trainer.ts - training logic
2. src/dna/orchestrator/predictor.ts - inference logic
3. src/dna/orchestrator/registry.ts - model registry
4. src/dna/orchestrator/manager.ts - high-level coordination (thin wrapper)

Each module:
- Single responsibility
- Clear interfaces (TypeScript interfaces)
- Unit testable in isolation
- <200 lines each

Update imports throughout codebase: src/strategy/dna-strategy.ts, src/ml/dna-predictor.ts

`,
  }),
  () => agent('Create DNA Architecture Documentation', {
    label: 'dna-docs',
    agentType: 'docs-manager',
    isolation: 'worktree',
    prompt: `Document DNA architecture:

docs/architecture/dna-module.md:
- Overview: purpose, key components
- Module breakdown: trainer, predictor, registry, manager
- Data flow: training → registry → prediction
- APIs: interfaces, methods
- Configuration: DNA hyperparameters

Include diagrams: component diagram, sequence diagram.

`,
  }),
]);

phase('Improve Testability');
const testability = await parallel([
  () => agent('Extract Dependencies for Mocking', {
    label: 'dna-deps',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Make DNA module testable:

1. Use dependency injection:
   - trainer receives ITensorProvider (can be mocked)
   - predictor receives IModelRegistry (mock)
2. Extract external calls:
   - Redis → IR Cache interface
   - D1 → IDatabase interface
3. Pure functions: move math/utils to separate modules (easy to test)

Refactor to enable:
- Unit tests without real Redis/DB
- Deterministic tests (seeded random)
- Fast tests (<100ms each)

`,
  }),
  () => agent('Write Unit Tests for DNA Components', {
    label: 'dna-unit-tests',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `Write comprehensive unit tests:

trainer.test.ts:
- train(data) returns trained model
- Early stopping triggers
- Hyperparameter search works

predictor.test.ts:
- predict(input) returns probabilities
- Caches predictions (if cache enabled)
- Handles missing input gracefully

registry.test.ts:
- register(model) stores model
- get(name) retrieves
- versioning works

Coverage >90%.

`,
  }),
]);

phase('Performance Optimization');
const perf = await parallel([
  () => agent('Optimize DNA Inference Speed', {
    label: 'dna-perf',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Optimize DNA inference:

1. Model caching: load model to memory once, reuse
2. Batch prediction: predict(batch) for multiple inputs
3. Quantization: FP32 → FP16 if precision acceptable
4. Pruning: remove unused neurons/weights
5. Tensor optimization: reuse buffers, avoid allocations

Benchmark:
- Before: latency X ms per prediction
- After: target 50% reduction

Use benchmark.js or custom.

`,
  }),
  () => agent('Reduce Memory Usage', {
    label: 'dna-memory',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Reduce DNA memory footprint:

1. Model size: prune unnecessary weights
2. Cache size limits: LRU cache, max 100 models
3. Streaming inference: process large batches in chunks
4. GC pressure: reuse objects, avoid churn

Measure:
- Memory per model (target: <10MB)
- Peak memory during training (target: <500MB)

`,
  }),
]);

phase('Documentation');
const docs = await parallel([
  () => agent('Create DNA Developer Guide', {
    label: 'dna-devguide',
    agentType: 'docs-manager',
    isolation: 'worktree',
    prompt: `Create DNA developer guide:

docs/ml/dna-developer-guide.md:
- Getting started: install, basic usage
- Training your first model
- Hyperparameter tuning
- Deployment: register, predict
- Troubleshooting: common errors, debugging

Include code examples for each scenario.

`,
  }),
  () => agent('Add Inline Documentation', {
    label: 'dna-inline-docs',
    agentType: 'docs-manager',
    isolation: 'worktree',
    prompt: `Add JSDoc comments to DNA modules:

For each class/function:
- @description
- @param with types and descriptions
- @returns with type and description
- @throws if errors
- @example for complex usage

Aim: IDE autocomplete works perfectly.

`,
  }),
]);

phase('Testing & Sign-off');
const testing = await parallel([
  () => agent('Run Regression Tests', {
    label: 'dna-regression',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `Regression testing:

1. All existing DNA tests pass (don't break existing behavior)
2. Prediction accuracy unchanged (<1% difference)
3. Training converges to same loss
4. No new bugs introduced

Run: npx vitest run src/dna/**/*.test.ts

`,
  }),
  () => agent('Run Performance Benchmarks', {
    label: 'dna-benchmarks',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `Benchmark DNA after optimization:

1. Inference latency: measure before/after
2. Memory usage: peak during training
3. Throughput: predictions/sec
4. Model load time

Report: benchmarks/dna-optimization-benchmarks.json

`,
  }),
  () => agent('DNA Optimization Sign-off', {
    label: 'dna-signoff',
    agentType: 'cto',
    isolation: 'worktree',
    prompt: `Sign-off DNA optimization.

Review:
✅ Code refactored (modular, testable)
✅ Documentation complete
✅ Tests passing (>90% coverage)
✅ Performance improved (benchmarks met)
✅ Memory reduced

Decision: CODE QUALITY IMPROVEMENT COMPLETE.

`,
  }),
]);

log('DNA Module Optimization workflow launched');