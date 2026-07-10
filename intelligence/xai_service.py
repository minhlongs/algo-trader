"""XAI (Explainable AI) Service for trading models.

Provides SHAP/LIME explanations, feature importance, trade rationales,
counterfactual explanations, and strategy rule extraction.
"""

import logging
from typing import Optional, Dict, Any, List, Tuple
from pathlib import Path
import json
import numpy as np
import pandas as pd
from dataclasses import dataclass, asdict
from datetime import datetime
from functools import lru_cache
import hashlib

logger = logging.getLogger(__name__)


@dataclass
class VisualizationData:
    """Container for visualization-ready data."""
    chart_type: str  # 'bar', 'waterfall', 'force', 'radar'
    data: Dict[str, Any]  # Plotly/Chart.js compatible data
    layout: Optional[Dict[str, Any]] = None

    def to_plotly_dict(self) -> Dict[str, Any]:
        """Convert to Plotly figure dict."""
        return {
            'data': self.data,
            'layout': self.layout or {}
        }


@dataclass
class ExplanationResult:
    """Container for explanation results."""
    trade_id: str
    model_type: str
    prediction: float
    feature_importance: Dict[str, float]
    shap_values: Optional[Dict[str, float]]
    lime_values: Optional[Dict[str, float]]
    rationale: str
    counterfactuals: Optional[List[Dict[str, Any]]]
    confidence: float
    generated_at: datetime
    visualizations: Optional[List[VisualizationData]] = None

    def to_dict(self) -> Dict[str, Any]:
        data = asdict(self)
        data['generated_at'] = self.generated_at.isoformat()
        if self.visualizations:
            data['visualizations'] = [v.to_plotly_dict() for v in self.visualizations]
        return data


@dataclass
class FeatureExplanation:
    """Individual feature explanation."""
    feature_name: str
    importance: float
    shap_value: Optional[float]
    direction: str  # 'positive' or 'negative'
    description: str


@dataclass
class TradeRationale:
    """Human-readable trade explanation."""
    trade_id: str
    action: str  # 'BUY', 'SELL', 'HOLD'
    symbol: str
    reasons: List[str]
    key_factors: List[Dict[str, Any]]
    confidence: float
    alternative_scenarios: List[str]


class XAIService:
    """Main XAI service for model explanations and trade rationales."""

    def __init__(
        self,
        use_shap: bool = True,
        use_lime: bool = True,
        deepseek_api_key: Optional[str] = None,
        cache_size: int = 1000,
        enable_persistence: bool = False,
        db_path: Optional[str] = None
    ):
        """
        Initialize XAI service.

        Args:
            use_shap: Enable SHAP explanations (requires shap library)
            use_lime: Enable LIME explanations (requires lime library)
            deepseek_api_key: API key for DeepSeek LLM (for rationale generation)
            cache_size: Size of LRU cache for expensive computations
            enable_persistence: Enable database persistence for explanations
            db_path: Path to SQLite database (if persistence enabled)
        """
        self.use_shap = use_shap
        self.use_lime = use_lime
        self.deepseek_api_key = deepseek_api_key
        self.enable_persistence = enable_persistence
        self.db_path = db_path
        self._shap_available = False
        self._lime_available = False
        self._explainer_cache: Dict[str, Any] = {}
        self._persistence_conn = None

        self._check_dependencies()

        if self.enable_persistence:
            self._init_persistence()

    def _check_dependencies(self) -> None:
        """Check if XAI libraries are available."""
        try:
            import shap  # noqa: F401
            self._shap_available = True
            logger.info("SHAP library available")
        except ImportError:
            logger.warning("SHAP not installed. Install with: pip install shap")
            self.use_shap = False

        try:
            import lime  # noqa: F401
            self._lime_available = True
            logger.info("LIME library available")
        except ImportError:
            logger.warning("LIME not installed. Install with: pip install lime")
            self.use_lime = False

    def _init_persistence(self) -> None:
        """Initialize database persistence layer."""
        if not self.enable_persistence:
            return

        try:
            import sqlite3
            self._persistence_conn = sqlite3.connect(
                self.db_path or str(Path(__file__).parent / "data" / "xai_explanations.db"),
                check_same_thread=False
            )
            self._create_tables()
            logger.info(f"XAI persistence initialized at {self.db_path}")
        except Exception as e:
            logger.error(f"Failed to initialize persistence: {e}")
            self.enable_persistence = False

    def _create_tables(self) -> None:
        """Create necessary database tables."""
        if not self._persistence_conn:
            return

        cursor = self._persistence_conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS explanations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                trade_id TEXT UNIQUE NOT NULL,
                model_type TEXT NOT NULL,
                prediction REAL NOT NULL,
                feature_importance TEXT NOT NULL,
                shap_values TEXT,
                lime_values TEXT,
                rationale TEXT NOT NULL,
                counterfactuals TEXT,
                confidence REAL NOT NULL,
                generated_at TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS strategy_rules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                strategy_id TEXT NOT NULL,
                rule_type TEXT NOT NULL,
                condition TEXT NOT NULL,
                action TEXT,
                description TEXT,
                line_number INTEGER,
                extracted_at TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        self._persistence_conn.commit()

    def explain_prediction(
        self,
        model: Any,
        features: Dict[str, float],
        model_type: str = "rl",
        trade_id: str = None,
        prediction: float = None,
        generate_visualizations: bool = True
    ) -> ExplanationResult:
        """
        Generate comprehensive explanation for a model prediction.

        Args:
            model: The trained model (RL policy, Kronos, etc.)
            features: Feature dictionary {name: value}
            model_type: Type of model ('rl', 'kronos', 'strategy')
            trade_id: Unique identifier for the trade
            prediction: Model's prediction (computed if None)
            generate_visualizations: Generate chart data (can be expensive)

        Returns:
            ExplanationResult with all explanation components
        """
        if trade_id is None:
            trade_id = f"trade_{datetime.now().timestamp()}"

        # Get prediction if not provided
        if prediction is None:
            prediction = self._get_model_prediction(model, features)

        # Compute feature importance
        feature_importance = self._compute_feature_importance(model, features, model_type)

        # Compute SHAP values if available
        shap_values = None
        if self.use_shap and self._shap_available:
            shap_values = self._compute_shap_values(model, features, model_type)

        # Compute LIME values if available
        lime_values = None
        if self.use_lime and self._lime_available:
            lime_values = self._compute_lime_values(model, features, model_type)

        # Generate rationale using LLM or rule-based
        rationale = self._generate_rationale(features, prediction, feature_importance)

        # Generate counterfactuals
        counterfactuals = self._generate_counterfactuals(features, prediction, model_type)

        # Generate visualizations
        visualizations = None
        if generate_visualizations:
            visualizations = self._generate_visualizations(
                feature_importance, shap_values, lime_values, prediction
            )

        # Compute confidence
        confidence = self._compute_confidence(feature_importance, shap_values)

        result = ExplanationResult(
            trade_id=trade_id,
            model_type=model_type,
            prediction=prediction,
            feature_importance=feature_importance,
            shap_values=shap_values,
            lime_values=lime_values,
            rationale=rationale,
            counterfactuals=counterfactuals,
            confidence=confidence,
            generated_at=datetime.now(),
            visualizations=visualizations
        )

        # Persist if enabled
        if self.enable_persistence:
            self._persist_explanation(result)

        return result

    def _get_model_prediction(self, model: Any, features: Dict[str, float]) -> float:
        """Extract prediction from model (routing by model type)."""
        # This is a simplified implementation
        # In practice, would handle different model types specifically
        if hasattr(model, 'predict'):
            # RL model from stable-baselines3
            obs = np.array(list(features.values())).reshape(1, -1)
            action, _ = model.predict(obs, deterministic=True)
            return float(action[0])
        elif hasattr(model, 'forward'):
            # PyTorch model (Kronos)
            return 0.5  # placeholder
        return 0.0

    def _compute_feature_importance(
        self,
        model: Any,
        features: Dict[str, float],
        model_type: str
    ) -> Dict[str, float]:
        """
        Compute feature importance using appropriate method.

        For RL: Use policy network weights or perturbation-based importance
        For Kronos: Use attention weights or gradient-based methods
        For Strategies: Use rule-based scoring
        """
        importance = {}

        if model_type == "rl":
            importance = self._rl_feature_importance(model, features)
        elif model_type == "kronos":
            importance = self._kronos_feature_importance(model, features)
        elif model_type == "strategy":
            importance = self._strategy_feature_importance(features)
        else:
            # Fallback: permutation importance
            importance = self._permutation_importance(model, features)

        # Normalize to sum to 1
        total = sum(abs(v) for v in importance.values())
        if total > 0:
            importance = {k: abs(v) / total for k, v in importance.items()}

        return importance

    def _rl_feature_importance(
        self,
        model: Any,
        features: Dict[str, float]
    ) -> Dict[str, float]:
        """Compute feature importance for RL models using policy analysis."""
        # Simplified: use feature variance as proxy
        # In practice, could use:
        # - Integrated gradients
        # - Attention weights (if transformer-based)
        # - Saliency maps
        importance = {}
        for name, value in features.items():
            # Weight by magnitude and volatility
            importance[name] = abs(value) * (1.0 if abs(value) > 1 else abs(value))
        return importance

    def _kronos_feature_importance(
        self,
        model: Any,
        features: Dict[str, float]
    ) -> Dict[str, float]:
        """Compute feature importance for Kronos time-series model."""
        # Kronos uses transformer architecture
        # Could extract attention weights or use gradient-based attribution
        # For now: use heuristic based on recent price changes
        importance = {}
        feature_list = list(features.keys())

        # Give higher weight to recent features (time-series)
        n = len(feature_list)
        for i, name in enumerate(feature_list):
            # Exponential decay: recent features more important
            weight = np.exp(-0.1 * (n - i - 1))
            importance[name] = weight * abs(features[name])

        return importance

    def _strategy_feature_importance(
        self,
        features: Dict[str, float]
    ) -> Dict[str, float]:
        """Compute feature importance for rule-based strategies."""
        # For technical indicators, use normalized magnitude
        importance = {}
        for name, value in features.items():
            # Common indicators: RSI, MACD, SMA, Bollinger, etc.
            if name.upper() in ['RSI', 'MACD', 'SMA', 'EMA', 'ATR']:
                importance[name] = abs(value) / 100.0 if name.upper() == 'RSI' else abs(value)
            else:
                importance[name] = abs(value)

        return importance

    def _permutation_importance(
        self,
        model: Any,
        features: Dict[str, float],
        n_repeats: int = 10
    ) -> Dict[str, float]:
        """Compute permutation importance as fallback."""
        # Requires a validation dataset - not implemented here
        # Placeholder: use feature magnitudes
        return {k: abs(v) for k, v in features.items()}

    def _compute_shap_values(
        self,
        model: Any,
        features: Dict[str, float],
        model_type: str
    ) -> Optional[Dict[str, float]]:
        """Compute SHAP values using KernelSHAP or DeepSHAP."""
        if not self._shap_available:
            return None

        try:
            import shap

            # Convert features to DataFrame
            feature_names = list(features.keys())
            X = pd.DataFrame([list(features.values())], columns=feature_names)

            # Use appropriate explainer
            if model_type == "rl":
                # KernelSHAP for black-box models
                explainer = shap.KernelExplainer(
                    lambda x: self._get_model_prediction(model, dict(zip(feature_names, x[0]))),
                    X
                )
                shap_values = explainer.shap_values(X, nsamples=100)
            elif model_type == "kronos":
                # DeepSHAP for neural networks (if supported)
                # For now, use KernelSHAP
                explainer = shap.KernelExplainer(
                    lambda x: self._get_model_prediction(model, dict(zip(feature_names, x[0]))),
                    X
                )
                shap_values = explainer.shap_values(X, nsamples=100)
            else:
                return None

            # shap_values might be a list for multi-output
            if isinstance(shap_values, list):
                shap_values = shap_values[0]

            # Convert to dict
            shap_dict = {name: float(val) for name, val in zip(feature_names, shap_values[0])}
            return shap_dict

        except Exception as e:
            logger.error(f"SHAP computation failed: {e}")
            return None

    def _compute_lime_values(
        self,
        model: Any,
        features: Dict[str, float],
        model_type: str,
        n_samples: int = 1000
    ) -> Optional[Dict[str, float]]:
        """Compute LIME explanations using TabularExplainer."""
        if not self._lime_available:
            return None

        try:
            import lime
            from lime.lime_tabular import LimeTabularExplainer

            feature_names = list(features.keys())
            training_data = np.random.randn(100, len(feature_names))  # Placeholder; in practice use real training data

            explainer = LimeTabularExplainer(
                training_data,
                feature_names=feature_names,
                mode='regression',
                discretize_continuous=True
            )

            # Convert features to array
            instance = np.array(list(features.values()))

            # Get explanation
            exp = explainer.explain_instance(
                instance,
                lambda x: self._get_model_prediction(model, dict(zip(feature_names, x[0]))),
                num_samples=n_samples
            )

            # Extract local explanation
            lime_dict = dict(exp.as_list())

            # Clean up feature names (LIME adds conditions like 'feature > 0.5')
            cleaned_dict = {}
            for name, value in lime_dict.items():
                # Extract base feature name
                base_name = feature_names[0]  # fallback
                for fname in feature_names:
                    if fname in name:
                        base_name = fname
                        break
                cleaned_dict[base_name] = value

            return cleaned_dict

        except Exception as e:
            logger.error(f"LIME computation failed: {e}")
            return None

    def _generate_visualizations(
        self,
        feature_importance: Dict[str, float],
        shap_values: Optional[Dict[str, float]],
        lime_values: Optional[Dict[str, float]],
        prediction: float
    ) -> List[VisualizationData]:
        """Generate visualization data for charts."""
        visualizations = []

        # 1. Feature Importance Bar Chart
        sorted_features = sorted(
            feature_importance.items(),
            key=lambda x: x[1],
            reverse=True
        )[:10]

        visualizations.append(VisualizationData(
            chart_type='bar',
            data={
                'x': [f[0] for f in sorted_features],
                'y': [f[1] for f in sorted_features],
                'type': 'bar',
                'marker': {'color': 'rgb(55, 128, 191)'}
            },
            layout={
                'title': 'Feature Importance',
                'xaxis': {'title': 'Feature', 'tickangle': -45},
                'yaxis': {'title': 'Importance'},
                'margin': {'b': 100}
            }
        ))

        # 2. SHAP Waterfall (if available)
        if shap_values:
            sorted_shap = sorted(
                shap_values.items(),
                key=lambda x: abs(x[1]),
                reverse=True
            )[:10]

            visualizations.append(VisualizationData(
                chart_type='waterfall',
                data={
                    'x': [f[0] for f in sorted_shap] + ['Prediction'],
                    'y': [f[1] for f in sorted_shap] + [prediction],
                    'type': 'bar',
                    'orientation': 'h'
                },
                layout={
                    'title': 'SHAP Values (Feature Contribution)',
                    'xaxis': {'title': 'SHAP Value'},
                }
            ))

        # 3. Radar Chart for top 6 features
        if len(sorted_features) >= 6:
            top6 = sorted_features[:6]
            visualizations.append(VisualizationData(
                chart_type='radar',
                data={
                    'r': [f[1] for f in top6],
                    'theta': [f[0] for f in top6],
                    'type': 'scatterpolar',
                    'fill': 'toself'
                },
                layout={
                    'title': 'Feature Importance Radar',
                    'polar': {'radialaxis': {'visible': True}}
                }
            ))

        return visualizations

    def _generate_rationale(
        self,
        features: Dict[str, float],
        prediction: float,
        feature_importance: Dict[str, float]
    ) -> str:
        """
        Generate human-readable trade rationale.

        Uses DeepSeek API if available, otherwise rule-based generation.
        """
        if self.deepseek_api_key:
            return self._generate_rationale_llm(features, prediction, feature_importance)
        else:
            return self._generate_rationale_rule_based(features, prediction, feature_importance)

    def _generate_rationale_llm(
        self,
        features: Dict[str, float],
        prediction: float,
        feature_importance: Dict[str, float]
    ) -> str:
        """Generate rationale using DeepSeek LLM."""
        try:
            import requests

            # Sort features by importance
            sorted_features = sorted(
                feature_importance.items(),
                key=lambda x: x[1],
                reverse=True
            )[:5]

            prompt = f"""Generate a concise trading rationale (2-3 sentences) for a trade decision.

Prediction: {prediction:.4f}

Top influencing factors:
{chr(10).join(f'- {name}: {features[name]:.4f} (importance: {imp:.2%})' for name, imp in sorted_features)}

Write a clear explanation of why this trade was made, referencing the key factors above. Be specific about the conditions."""

            response = requests.post(
                "https://api.deepseek.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.deepseek_api_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": "deepseek-chat",
                    "messages": [
                        {"role": "system", "content": "You are a trading assistant that explains trade decisions clearly and concisely."},
                        {"role": "user", "content": prompt}
                    ],
                    "max_tokens": 150,
                    "temperature": 0.3
                },
                timeout=10
            )

            if response.status_code == 200:
                result = response.json()
                return result['choices'][0]['message']['content'].strip()
            else:
                logger.warning(f"DeepSeek API error: {response.status_code}")
                return self._generate_rationale_rule_based(features, prediction, feature_importance)

        except Exception as e:
            logger.error(f"LLM rationale generation failed: {e}")
            return self._generate_rationale_rule_based(features, prediction, feature_importance)

    def _generate_rationale_rule_based(
        self,
        features: Dict[str, float],
        prediction: float,
        feature_importance: Dict[str, float]
    ) -> str:
        """Generate rationale using rule-based approach."""
        reasons = []

        # Sort features by importance
        sorted_features = sorted(
            feature_importance.items(),
            key=lambda x: x[1],
            reverse=True
        )[:3]

        for name, _ in sorted_features:
            value = features.get(name, 0)
            if name.upper() == 'RSI':
                if value < 30:
                    reasons.append(f"RSI oversold ({value:.1f}) indicating potential bullish reversal")
                elif value > 70:
                    reasons.append(f"RSI overbought ({value:.1f}) indicating potential bearish reversal")
                else:
                    reasons.append(f"RSI neutral ({value:.1f})")
            elif name.upper() in ['MACD', 'MACD_LINE']:
                if value > 0:
                    reasons.append(f"MACD positive ({value:.4f}) suggests bullish momentum")
                else:
                    reasons.append(f"MACD negative ({value:.4f}) suggests bearish momentum")
            elif 'sentiment' in name.lower():
                sentiment = "positive" if value > 0.5 else "negative" if value < 0.5 else "neutral"
                reasons.append(f"News sentiment is {sentiment} ({value:.2f})")
            elif 'volatility' in name.lower():
                reasons.append(f"Market volatility is {'high' if value > 0.5 else 'low'} ({value:.2f})")
            else:
                reasons.append(f"{name}: {value:.4f}")

        if prediction > 0.5:
            action = "buy"
        elif prediction < 0.5:
            action = "sell"
        else:
            action = "hold"

        rationale = f"Decision: {action.upper()} based on {len(reasons)} key factors. "
        rationale += "Key reasons: " + "; ".join(reasons[:2])

        return rationale

    def _generate_counterfactuals(
        self,
        features: Dict[str, float],
        prediction: float,
        model_type: str,
        n_counterfactuals: int = 3
    ) -> List[Dict[str, Any]]:
        """
        Generate counterfactual explanations.

        Shows what minimal changes would flip the decision.
        """
        counterfactuals = []

        # Sort features by importance
        sorted_features = sorted(
            features.items(),
            key=lambda x: abs(x[1]),
            reverse=True
        )[:n_counterfactuals]

        for name, value in sorted_features:
            # Calculate change needed to flip prediction
            # This is simplified; in practice would use optimization
            if prediction > 0.5:
                target = 0.3  # Flip to sell/hold
            elif prediction < 0.5:
                target = 0.7  # Flip to buy
            else:
                target = None

            if target is not None:
                change_needed = target - prediction
                # Estimate feature change needed (linear approximation)
                feature_impact = change_needed * 2  # crude approximation

                cf_value = value + feature_impact
                cf_value = max(0, min(1, cf_value))  # clamp to [0,1] for normalized features

                if abs(cf_value - value) > 0.05:  # Only meaningful changes
                    counterfactuals.append({
                        'feature': name,
                        'current_value': float(value),
                        'counterfactual_value': float(cf_value),
                        'required_change': float(cf_value - value),
                        'would_flip_prediction_to': target,
                        'description': f"If {name} were {'higher' if cf_value > value else 'lower'} by {abs(cf_value - value):.3f}, the trade decision would change."
                    })

        return counterfactuals[:n_counterfactuals]

    def _compute_confidence(
        self,
        feature_importance: Dict[str, float],
        shap_values: Optional[Dict[str, float]]
    ) -> float:
        """
        Compute confidence score for the explanation.

        Based on:
        - Feature concentration (Gini coefficient)
        - SHAP value consistency (if available)
        """
        if not feature_importance:
            return 0.5

        # Gini coefficient of feature importance
        values = np.array(list(feature_importance.values()))
        values = values[values > 0]  # Only positive
        if len(values) == 0:
            return 0.5

        values = np.sort(values)
        index = np.arange(1, len(values) + 1)
        n = len(values)
        gini = (np.sum((2 * index - n - 1) * values)) / (n * np.sum(values))

        # Convert Gini (0=equal, 1=concentrated) to confidence
        # High concentration (high Gini) = higher confidence
        confidence = 0.5 + 0.5 * gini

        # Adjust based on SHAP consistency if available
        if shap_values:
            shap_array = np.array(list(shap_values.values()))
            # Consistency: low variance in SHAP values across features
            shap_std = np.std(shap_array)
            shap_confidence = 1.0 / (1.0 + shap_std)
            confidence = 0.6 * confidence + 0.4 * shap_confidence

        return float(np.clip(confidence, 0.0, 1.0))

    def extract_strategy_rules(
        self,
        strategy_code: str,
        strategy_name: str,
        use_llm: bool = True
    ) -> List[Dict[str, Any]]:
        """
        Extract human-readable trading rules from strategy code.

        Args:
            strategy_code: Source code of the strategy
            strategy_name: Name of the strategy

        Returns:
            List of extracted rules with conditions and actions
        """
        rules = []

        # Simple pattern matching for common conditions
        # In practice, could use AST parsing or LLM-based extraction

        lines = strategy_code.split('\n')
        for i, line in enumerate(lines):
            line = line.strip()
            line_lower = line.lower()

            # Look for RSI conditions
            if 'rsi' in line_lower and ('<' in line or '>' in line or '==' in line):
                rules.append({
                    'rule_id': f"{strategy_name}_rsi_{len(rules)}",
                    'type': 'technical_indicator',
                    'indicator': 'RSI',
                    'condition': line,
                    'line_number': i + 1,
                    'description': self._describe_rsi_condition(line)
                })

            # Look for MACD conditions
            elif 'macd' in line_lower and ('<' in line or '>' in line or '==' in line):
                rules.append({
                    'rule_id': f"{strategy_name}_macd_{len(rules)}",
                    'type': 'technical_indicator',
                    'indicator': 'MACD',
                    'condition': line,
                    'line_number': i + 1,
                    'description': self._describe_macd_condition(line)
                })

            # Look for Bollinger Bands
            elif 'bollinger' in line_lower or 'bb' in line_lower:
                rules.append({
                    'rule_id': f"{strategy_name}_bollinger_{len(rules)}",
                    'type': 'technical_indicator',
                    'indicator': 'BollingerBands',
                    'condition': line,
                    'line_number': i + 1,
                    'description': 'Bollinger Bands condition'
                })

            # Look for sentiment
            elif 'sentiment' in line_lower:
                rules.append({
                    'rule_id': f"{strategy_name}_sentiment_{len(rules)}",
                    'type': 'sentiment',
                    'indicator': 'NewsSentiment',
                    'condition': line,
                    'line_number': i + 1,
                    'description': 'News sentiment condition'
                })

        # If DeepSeek available, enhance with LLM extraction
        if self.deepseek_api_key and len(rules) < 5:
            llm_rules = self._extract_rules_llm(strategy_code, strategy_name)
            rules.extend(llm_rules)

        return rules

    def _describe_rsi_condition(self, condition: str) -> str:
        """Generate human description for RSI condition."""
        if '< 30' in condition or 'oversold' in condition.lower():
            return "RSI indicates oversold condition - potential buy signal"
        elif '> 70' in condition or 'overbought' in condition.lower():
            return "RSI indicates overbought condition - potential sell signal"
        else:
            return "RSI condition check"

    def _describe_macd_condition(self, condition: str) -> str:
        """Generate human description for MACD condition."""
        if 'cross up' in condition.lower() or '> 0' in condition:
            return "MACD bullish crossover - momentum shifting up"
        elif 'cross down' in condition.lower() or '< 0' in condition:
            return "MACD bearish crossover - momentum shifting down"
        else:
            return "MACD condition check"

    def _extract_rules_llm(
        self,
        strategy_code: str,
        strategy_name: str
    ) -> List[Dict[str, Any]]:
        """Use DeepSeek LLM to extract trading rules."""
        try:
            import requests

            prompt = f"""Extract all trading rules from this strategy code. For each rule, identify:
- The condition (entry/exit)
- The indicators used
- The action taken (BUY/SELL/HOLD)

Code:
{strategy_code[:2000]}  # Truncate if too long

Output as JSON list with format:
[{{"condition": "...", "indicators": ["..."], "action": "BUY|SELL|HOLD", "description": "..."}}]"""

            response = requests.post(
                "https://api.deepseek.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.deepseek_api_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": "deepseek-chat",
                    "messages": [
                        {"role": "system", "content": "You are a trading strategy analyst."},
                        {"role": "user", "content": prompt}
                    ],
                    "max_tokens": 500,
                    "temperature": 0.3
                },
                timeout=15
            )

            if response.status_code == 200:
                result = response.json()
                content = result['choices'][0]['message']['content']
                # Parse JSON from response
                import re
                json_match = re.search(r'\[.*\]', content, re.DOTALL)
                if json_match:
                    rules_json = json.loads(json_match.group())
                    return [
                        {
                            'rule_id': f"{strategy_name}_llm_{i}",
                            'type': 'extracted',
                            'condition': r.get('condition', ''),
                            'indicators': r.get('indicators', []),
                            'action': r.get('action', 'UNKNOWN'),
                            'description': r.get('description', ''),
                            'line_number': None,
                        }
                        for i, r in enumerate(rules_json)
                    ]

        except Exception as e:
            logger.error(f"LLM rule extraction failed: {e}")

        return []

    def _persist_explanation(self, result: ExplanationResult) -> None:
        """Save explanation to database."""
        if not self.enable_persistence or not self._persistence_conn:
            return

        try:
            cursor = self._persistence_conn.cursor()
            cursor.execute("""
                INSERT OR REPLACE INTO explanations
                (trade_id, model_type, prediction, feature_importance, shap_values,
                 lime_values, rationale, counterfactuals, confidence, generated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                result.trade_id,
                result.model_type,
                result.prediction,
                json.dumps(result.feature_importance),
                json.dumps(result.shap_values) if result.shap_values else None,
                json.dumps(result.lime_values) if result.lime_values else None,
                result.rationale,
                json.dumps(result.counterfactuals) if result.counterfactuals else None,
                result.confidence,
                result.generated_at.isoformat()
            ))
            self._persistence_conn.commit()
        except Exception as e:
            logger.error(f"Failed to persist explanation: {e}")

    def get_explanation(self, trade_id: str) -> Optional[ExplanationResult]:
        """Retrieve stored explanation by trade ID."""
        if not self.enable_persistence or not self._persistence_conn:
            return None

        try:
            cursor = self._persistence_conn.cursor()
            cursor.execute("""
                SELECT trade_id, model_type, prediction, feature_importance,
                       shap_values, lime_values, rationale, counterfactuals,
                       confidence, generated_at
                FROM explanations
                WHERE trade_id = ?
            """, (trade_id,))

            row = cursor.fetchone()
            if not row:
                return None

            (
                tid, mtype, pred, fi_json, shap_json, lime_json,
                rationale, cf_json, conf, gen_at
            ) = row

            return ExplanationResult(
                trade_id=tid,
                model_type=mtype,
                prediction=pred,
                feature_importance=json.loads(fi_json),
                shap_values=json.loads(shap_json) if shap_json else None,
                lime_values=json.loads(lime_json) if lime_json else None,
                rationale=rationale,
                counterfactuals=json.loads(cf_json) if cf_json else None,
                confidence=conf,
                generated_at=datetime.fromisoformat(gen_at)
            )
        except Exception as e:
            logger.error(f"Failed to retrieve explanation: {e}")
            return None

    def list_explanations(
        self,
        model_type: Optional[str] = None,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """List recent explanations with summary."""
        if not self.enable_persistence or not self._persistence_conn:
            return []

        try:
            cursor = self._persistence_conn.cursor()
            query = """
                SELECT trade_id, model_type, prediction, rationale,
                       confidence, generated_at
                FROM explanations
            """
            params = []
            if model_type:
                query += " WHERE model_type = ?"
                params.append(model_type)
            query += " ORDER BY created_at DESC LIMIT ?"
            params.append(limit)

            cursor.execute(query, params)
            rows = cursor.fetchall()

            return [
                {
                    'trade_id': row[0],
                    'model_type': row[1],
                    'prediction': row[2],
                    'rationale': row[3],
                    'confidence': row[4],
                    'generated_at': row[5]
                }
                for row in rows
            ]
        except Exception as e:
            logger.error(f"Failed to list explanations: {e}")
            return []


# Convenience factory function
def create_xai_service(
    deepseek_api_key: Optional[str] = None,
    enable_shap: bool = True,
    enable_lime: bool = False
) -> XAIService:
    """Create and configure XAI service."""
    return XAIService(
        use_shap=enable_shap,
        use_lime=enable_lime,
        deepseek_api_key=deepseek_api_key
    )
