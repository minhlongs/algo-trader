export const meta = {
  name: 'churn-prediction-ml',
  description: 'Implement churn prediction ML model: feature engineering, training, deployment, customer success integration',
  phases: [
    { title: 'Churn Model Planning', detail: 'Define churn, data sources, features, evaluation metrics' },
    { title: 'Feature Engineering', detail: 'Build features from usage, billing, support, product data' },
    { title: 'Model Training', detail: 'Train XGBoost/LightGBM model with temporal split' },
    { title: 'Model Evaluation', detail: 'ROC-AUC, precision@k, calibration, business impact' },
    { title: 'Deployment', detail: 'Batch predictions, real-time scoring API' },
    { title: 'Integration', detail: 'Integrate with Customer Success platform' },
    { title: 'Monitoring', detail: 'Model drift, performance monitoring' },
    { title: 'Testing & Sign-off', detail: 'Model validation, business review' },
  ],
};

phase('Planning');
const planning = await agent('Churn Model Plan', {
  label: 'churn-plan',
  agentType: 'cto',
  isolation: 'worktree',
  prompt: `Plan churn prediction ML model. Task #290.

Definition of churn:
- Subscription: cancelation or non-renewal
- Usage-based: 30 days of inactivity

Data sources:
- Usage metrics: API calls, trades, features used
- Billing: invoice history, payment failures
- Support: ticket count, resolution time
- Product: feature adoption, NPS scores

Model: Gradient Boosting (XGBoost/LightGBM)
Evaluation: ROC-AUC > 0.80, precision@20% > 0.50

Create plan: ./plans/churn-prediction-ml/plan.md
`,
});

phase('Feature Engineering');
const features = await parallel([
  () => agent('Build Feature Pipeline', {
    label: 'feature-pipeline',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Feature engineering pipeline.

Features (30+):

Usage (last 30d, 90d):
- api_calls_count, trades_count
- active_days, days_since_last_activity
- features_used_count (breadth of product)
- session_count, avg_session_duration
- avg_order_size, total_volume

Billing:
- invoice_count, avg_invoice_amount
- payment_failures_count
- days_since_last_payment
- discount_used (boolean)

Support:
- tickets_opened_count, tickets_resolved_count
- avg_resolution_time_hours
- satisfaction_score (if CSAT collected)

Product:
- nps_score (if available)
- days_since_signup (tenure)
- plan_type (categorical: starter/pro/enterprise)
- region, industry

Implementation:
- src/ml/feature-pipeline.ts (extract features from D1)
- Database: churn_features_materialized (materialized view)
- Scheduled: refresh daily

`,
  }),
  () => agent('Create Training Dataset', {
    label: 'training-data',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Create labeled training dataset.

Label definition:
- Churned = 1 if tenant cancelled or 0 activity for 30+ days
- Not churned = 0

Label as-of date: snapshot features on day X, observe churn in next 30 days.

Dataset:
SELECT features.*, label
FROM churn_features_materialized
JOIN churn_labels ON tenant_id = ...
WHERE as_of_date BETWEEN '2025-01-01' AND '2025-05-31'

Temporal split:
- Train: Jan-Mar
- Validation: Apr
- Test: May (most recent)

Export: CSV or Parquet to cloud storage for training.

`,
  }),
]);

phase('Model Training');
const training = await parallel([
  () => agent('Train Churn Prediction Model', {
    label: 'model-train',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Train XGBoost model.

Python script (scripts/train-churn-model.py):
1. Load dataset (Pandas/Parquet)
2. Preprocess: handle missing, encode categoricals, scale
3. Split: train/val/test (temporal)
4. Train: XGBClassifier with hyperparameter tuning (Optuna or grid search)
5. Evaluate: ROC-AUC, precision@k, recall@k, calibration
6. Feature importance: SHAP values
7. Save model: model.bin (pickle/joblib), metadata.json

Target metrics:
- ROC-AUC > 0.80 on test set
- Precision@20% > 0.50 (top 20% risk score)
- Brier score < 0.15 (calibration)

`,
  }),
  () => agent('Experiment Tracking', {
    label: 'mlflow',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Set up MLflow for experiment tracking.

Track:
- Hyperparameters
- Metrics (ROC-AUC, precision, recall)
- Feature set version
- Dataset version
- Model artifact

MLflow tracking server: deploy to Cloudflare Workers or separate service.

Store experiments: each training run logged.

`,
  }),
]);

phase('Model Evaluation');
const evaluation = await parallel([
  () => agent('Evaluate Model Performance', {
    label: 'model-eval',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Comprehensive model evaluation:

1. ROC curve, AUC score
2. Precision-Recall curve
3. Confusion matrix at optimal threshold
4. Calibration plot (reliability diagram)
5. Feature importance (SHAP summary plot)
6. Business impact simulation:
   - Top 20% at risk: what % actually churn?
   - Cost of intervention vs. retained revenue
   - ROI calculation

Generate report: reports/churn-model-evaluation.html

`,
  }),
  () => agent('Validate Model Fairness', {
    label: 'fairness',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Fairness audit:

Check for bias across:
1. Plan type (starter vs enterprise)
2. Region (geography)
3. Industry

Metrics:
- Selection rate: % predicted churn by group
- False positive rate by group
- Equal opportunity difference

If bias detected: mitigate (reweigh, adversarial debiasing).

`,
  }),
]);

phase('Deployment');
const deploy = await parallel([
  () => agent('Implement Batch Prediction Pipeline', {
    label: 'batch-pred',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Batch prediction pipeline:

Daily (cron):
1. Extract latest features for all active tenants
2. Load model
3. Predict churn probability (0-1)
4. Store predictions: churn_predictions (tenant_id, as_of_date, churn_prob, model_version)
5. Export to CSV/S3 for CS team

Scheduler: cron job on Workers or Kubernetes CronJob.

Script: src/ml/batch-predict.ts or Python script.

`,
  }),
  () => agent('Implement Real-Time Scoring API', {
    label: 'realtime-api',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Real-time scoring API for CS team.

GET /api/v1/churn/score/:tenant_id
Returns: { tenant_id, churn_prob, risk_tier (high/medium/low), top_risk_factors[] }

Implementation:
- Load model in memory (singleton)
- Extract features on-demand from D1
- Predict
- Cache result for 24h (Redis)

Also: POST /api/v1/churn/feedback to record interventions/outcomes.

`,
  }),
]);

phase('Integration');
const integration = await parallel([
  () => agent('Integrate with Customer Success Platform', {
    label: 'cs-integration',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Integrate churn predictions with CS platform:

1. Daily report: top 50 at-risk tenants to CS team
2. Dashboard: churn risk score in customer 360 view
3. Alerts: high risk (>70%) triggers immediate notification
4. Action tracking: CS team interventions recorded
5. Feedback loop: track if customer churned after intervention → improve model

CS Dashboard (in customer success UI):
- Risk score for each customer
- Risk factors (why at risk)
- Historical trend (score over time)

`,
  }),
  () => agent('Implement Intervention Workflow', {
    label: 'intervention',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Intervention workflow:

When churn risk > threshold:
1. CS rep receives alert (Slack/email)
2. Review customer 360: usage, billing, support history
3. Take action: outreach, discount, training, feature demo
4. Record intervention: type, date, outcome
5. Monitor: did risk score decrease? did customer renew?

Track intervention effectiveness to calculate model ROI.

`,
  }),
]);

phase('Monitoring');
const monitoring = await parallel([
  () => agent('Monitor Model Drift', {
    label: 'drift-monitor',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Model drift detection:

1. Population drift: compare feature distribution in production vs training
   - KL divergence for continuous features
   - Population stability index (PSI)
2. Performance drift: track actual churn rate vs predicted probability (over time)
3. Alert if drift exceeds threshold (PSI > 0.2)

Scheduled: weekly drift report.

`,
  }),
  () => agent('Monitor Prediction Distribution', {
    label: 'pred-dist',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Monitor prediction distribution:

Metrics:
- Mean churn probability (should be stable ~5%)
- % high risk (>70%): alert if spikes
- % low risk (<10%): should be majority

Dashboard: prediction histogram, distribution over time.

Alert: sudden shift → investigate data quality or market change.

`,
  }),
]);

phase('Testing & Sign-off');
const testing = await parallel([
  () => agent('Backtest Model Performance', {
    label: 'backtest',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `Backtest on holdout period (June 2025):

1. Generate predictions on May 31 for June churn
2. Compare predictions to actual churn in June
3. Calculate precision@k, ROC-AUC
4. Verify performance matches validation metrics (within 5%)

If degraded: investigate drift, retrain.

`,
  }),
  () => agent('Churn Model Sign-off', {
    label: 'churn-signoff',
    agentType: 'cto',
    isolation: 'worktree',
    prompt: `Sign-off churn prediction model.

Review:
✅ Feature pipeline complete
✅ Model trained (ROC-AUC > 0.80)
✅ Fairness audit passed
✅ Batch & real-time APIs
✅ CS platform integration
✅ Intervention workflow
✅ Monitoring in place
✅ Backtest successful

Decision: PRODUCTION DEPLOYMENT APPROVED.

`,
  }),
]);

log('Churn Prediction ML workflow launched');