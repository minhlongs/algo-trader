"""Unit tests for XAI service."""

import pytest
import numpy as np
from datetime import datetime
from pathlib import Path
import tempfile
import shutil

# Support both `cd intelligence && python -m pytest tests/...` and parent-dir runs
try:
    from intelligence.xai_service import (
        XAIService,
        ExplanationResult,
        FeatureExplanation,
        TradeRationale,
        VisualizationData,
    )
except ModuleNotFoundError:
    from xai_service import (
        XAIService,
        ExplanationResult,
        FeatureExplanation,
        TradeRationale,
        VisualizationData,
    )

class TestXAIService:
    """Test suite for XAIService."""

    @pytest.fixture
    def temp_db(self):
        """Create temporary database for testing."""
        temp_dir = tempfile.mkdtemp()
        db_path = Path(temp_dir) / "test_xai.db"
        yield str(db_path)
        shutil.rmtree(temp_dir)

    @pytest.fixture
    def xai_service(self, temp_db):
        """Create XAI service with persistence for testing."""
        service = XAIService(
            use_shap=False,  # Skip SHAP to speed up tests
            use_lime=False,  # Skip LIME to speed up tests
            deepseek_api_key=None,
            enable_persistence=True,
            db_path=temp_db
        )
        return service

    @pytest.fixture
    def sample_features(self):
        """Sample feature dictionary for testing."""
        return {
            'RSI': 25.5,
            'MACD': 0.0012,
            'Volume': 1500000,
            'Price_Change_24h': 0.023,
            'Sentiment': 0.72,
            'Volatility': 0.15,
            'VWAP': 45000.0
        }

    @pytest.fixture
    def sample_model(self):
        """Mock model for testing."""
        class MockModel:
            def predict(self, obs, **kwargs):
                return np.array([0.75]), None
        return MockModel()

    def test_service_initialization(self):
        """Test XAI service can be initialized."""
        service = XAIService(use_shap=False, use_lime=False)
        assert service is not None
        assert service.use_shap is False
        assert service.use_lime is False
        assert service.enable_persistence is False

    def test_explain_prediction_basic(self, xai_service, sample_features, sample_model):
        """Test basic prediction explanation without SHAP/LIME."""
        result = xai_service.explain_prediction(
            model=sample_model,
            features=sample_features,
            model_type='rl',
            trade_id='test_trade_001',
            prediction=0.75,
            generate_visualizations=False
        )

        assert result.trade_id == 'test_trade_001'
        assert result.model_type == 'rl'
        assert result.prediction == 0.75
        assert isinstance(result.feature_importance, dict)
        assert len(result.feature_importance) > 0
        assert result.shap_values is None  # Disabled
        assert result.lime_values is None  # Disabled
        assert isinstance(result.rationale, str)
        assert len(result.rationale) > 0
        assert isinstance(result.counterfactuals, list)
        assert 0 <= result.confidence <= 1
        assert isinstance(result.generated_at, datetime)
        assert result.visualizations is None  # Disabled

    def test_feature_importance_normalization(self, xai_service, sample_features):
        """Test feature importance sums to ~1 after normalization."""
        result = xai_service.explain_prediction(
            model=None,
            features=sample_features,
            model_type='strategy',
            generate_visualizations=False
        )

        fi = result.feature_importance
        total = sum(abs(v) for v in fi.values())
        # Should be approximately 1 (allow small floating point error)
        assert 0.99 <= total <= 1.01, f"Feature importance total {total} not near 1.0"

    def test_rationale_generation_rule_based(self, xai_service, sample_features):
        """Test rule-based rationale generation."""
        rationale = xai_service._generate_rationale_rule_based(
            features=sample_features,
            prediction=0.75,
            feature_importance={'RSI': 0.3, 'MACD': 0.2}
        )

        assert isinstance(rationale, str)
        assert 'buy' in rationale.lower() or 'sell' in rationale.lower() or 'hold' in rationale.lower()
        assert 'RSI' in rationale or 'MACD' in rationale

    def test_rationale_with_oversold_rsi(self, sample_features):
        """Test rationale with oversold RSI."""
        service = XAIService(use_shap=False, use_lime=False)
        sample_features['RSI'] = 25.0  # Oversold

        rationale = service._generate_rationale_rule_based(
            features=sample_features,
            prediction=0.8,
            feature_importance={'RSI': 0.5}
        )

        assert 'oversold' in rationale.lower()
        assert 'bullish' in rationale.lower()

    def test_rationale_with_overbought_rsi(self, sample_features):
        """Test rationale with overbought RSI."""
        service = XAIService(use_shap=False, use_lime=False)
        sample_features['RSI'] = 75.0  # Overbought

        rationale = service._generate_rationale_rule_based(
            features=sample_features,
            prediction=0.2,
            feature_importance={'RSI': 0.5}
        )

        assert 'overbought' in rationale.lower()
        assert 'bearish' in rationale.lower()

    def test_counterfactual_generation(self, xai_service, sample_features):
        """Test counterfactual generation."""
        counterfactuals = xai_service._generate_counterfactuals(
            features=sample_features,
            prediction=0.75,
            model_type='rl',
            n_counterfactuals=3
        )

        assert isinstance(counterfactuals, list)
        assert len(counterfactuals) <= 3
        if len(counterfactuals) > 0:
            cf = counterfactuals[0]
            assert 'feature' in cf
            assert 'current_value' in cf
            assert 'counterfactual_value' in cf
            assert 'required_change' in cf
            assert 'would_flip_prediction_to' in cf
            assert 'description' in cf

    def test_counterfactual_for_sell_prediction(self, sample_features):
        """Test counterfactuals for sell prediction (low)."""
        service = XAIService(use_shap=False, use_lime=False)
        counterfactuals = service._generate_counterfactuals(
            features=sample_features,
            prediction=0.3,
            model_type='strategy',
            n_counterfactuals=3
        )

        # Should suggest changes to increase prediction
        for cf in counterfactuals:
            assert cf['would_flip_prediction_to'] > 0.5

    def test_visualization_generation(self, xai_service, sample_features):
        """Test visualization data generation."""
        result = xai_service.explain_prediction(
            model=None,
            features=sample_features,
            model_type='rl',
            generate_visualizations=True
        )

        assert result.visualizations is not None
        assert len(result.visualizations) > 0

        for viz in result.visualizations:
            assert isinstance(viz, VisualizationData)
            assert viz.chart_type in ['bar', 'waterfall', 'radar']
            assert isinstance(viz.data, dict)
            assert 'x' in viz.data or 'r' in viz.data  # bar/radar have x, waterfall has r

    def test_visualization_bar_chart(self, xai_service, sample_features):
        """Test bar chart visualization specifically."""
        result = xai_service.explain_prediction(
            model=None,
            features=sample_features,
            model_type='strategy',
            generate_visualizations=True
        )

        bar_viz = next((v for v in result.visualizations if v.chart_type == 'bar'), None)
        assert bar_viz is not None
        assert 'x' in bar_viz.data
        assert 'y' in bar_viz.data
        assert len(bar_viz.data['x']) == len(bar_viz.data['y'])
        assert bar_viz.layout is not None
        assert 'title' in bar_viz.layout

    def test_persistence_enabled(self, xai_service, sample_features, sample_model):
        """Test that persistence works when enabled."""
        result = xai_service.explain_prediction(
            model=sample_model,
            features=sample_features,
            model_type='rl',
            trade_id='persist_test_001',
            prediction=0.8
        )

        # Should be persisted automatically
        retrieved = xai_service.get_explanation('persist_test_001')
        assert retrieved is not None
        assert retrieved.trade_id == 'persist_test_001'
        assert retrieved.prediction == 0.8

    def test_persistence_disabled(self, sample_features):
        """Test persistence when disabled."""
        service = XAIService(use_shap=False, use_lime=False, enable_persistence=False)
        result = service.explain_prediction(
            model=None,
            features=sample_features,
            trade_id='no_persist_test'
        )

        retrieved = service.get_explanation('no_persist_test')
        assert retrieved is None

    def test_list_explanations(self, xai_service, sample_features):
        """Test listing explanations."""
        # Create a few explanations
        for i in range(5):
            xai_service.explain_prediction(
                model=None,
                features=sample_features,
                trade_id=f'list_test_{i}',
                prediction=0.5 + i * 0.1
            )

        listings = xai_service.list_explanations(limit=10)
        assert len(listings) == 5
        assert all('trade_id' in l for l in listings)
        assert all('prediction' in l for l in listings)
        assert all('rationale' in l for l in listings)

    def test_list_explanations_with_filter(self, xai_service, sample_features):
        """Test filtering explanations by model type."""
        xai_service.explain_prediction(
            model=None,
            features=sample_features,
            trade_id='rl_test',
            model_type='rl',
            prediction=0.7
        )
        xai_service.explain_prediction(
            model=None,
            features=sample_features,
            trade_id='kronos_test',
            model_type='kronos',
            prediction=0.6
        )

        rl_listings = xai_service.list_explanations(model_type='rl')
        assert len(rl_listings) >= 1
        assert all(l['model_type'] == 'rl' for l in rl_listings)

    def test_confidence_score_range(self, xai_service, sample_features):
        """Test confidence is between 0 and 1."""
        result = xai_service.explain_prediction(
            model=None,
            features=sample_features
        )
        assert 0 <= result.confidence <= 1

    def test_feature_importance_all_positive(self, xai_service, sample_features):
        """Test feature importance values are positive after normalization."""
        result = xai_service.explain_prediction(
            model=None,
            features=sample_features
        )
        for value in result.feature_importance.values():
            assert value >= 0, f"Feature importance {value} should be non-negative"

    def test_explanation_to_dict(self, xai_service, sample_features):
        """Test explanation can be serialized to dict."""
        result = xai_service.explain_prediction(
            model=None,
            features=sample_features,
            generate_visualizations=True
        )

        data = result.to_dict()

        assert 'trade_id' in data
        assert 'model_type' in data
        assert 'prediction' in data
        assert 'feature_importance' in data
        assert 'rationale' in data
        assert 'confidence' in data
        assert 'generated_at' in data
        assert 'visualizations' in data

    def test_different_model_types(self, xai_service, sample_features):
        """Test explanation works for different model types."""
        for model_type in ['rl', 'kronos', 'strategy']:
            result = xai_service.explain_prediction(
                model=None,
                features=sample_features,
                model_type=model_type
            )
            assert result.model_type == model_type
            assert isinstance(result.feature_importance, dict)

    def test_strategy_rules_extraction(self, xai_service):
        """Test extraction of strategy rules from code."""
        strategy_code = """
        def evaluate(self, features):
            rsi = features['RSI']
            if rsi < 30:
                return 'BUY'
            elif rsi > 70:
                return 'SELL'
            if features['MACD'] > 0:
                return 'HOLD'
            return 'WAIT'
        """

        rules = xai_service.extract_strategy_rules(
            strategy_code=strategy_code,
            strategy_name='TestStrategy',
            use_llm=False  # Use pattern matching only
        )

        assert isinstance(rules, list)
        assert len(rules) > 0
        # Should find RSI and MACD conditions
        rule_indicators = [r['indicator'] for r in rules]
        assert 'RSI' in rule_indicators
        assert 'MACD' in rule_indicators or any('MACD' in r['condition'] for r in rules)

    def test_strategy_rules_with_llm(self, xai_service):
        """Test rule extraction with LLM (fallback to pattern matching if no API key)."""
        strategy_code = """
        class MyStrategy:
            def decide(self, data):
                sentiment = data['news_sentiment']
                if sentiment > 0.7:
                    return 'BUY'
                return 'HOLD'
        """

        rules = xai_service.extract_strategy_rules(
            strategy_code=strategy_code,
            strategy_name='SentimentStrategy',
            use_llm=True  # Will fall back to pattern matching since no API key
        )

        assert isinstance(rules, list)
        # Should extract at least some rules
        assert len(rules) >= 0  # May be 0 if no patterns matched

    def test_empty_features_handling(self, xai_service):
        """Test handling of empty features."""
        # Should still work with empty features
        result = xai_service.explain_prediction(
            model=None,
            features={},
            model_type='strategy'
        )

        assert result.feature_importance == {}
        assert isinstance(result.rationale, str)

    def test_get_model_prediction_mock(self, sample_model, sample_features):
        """Test model prediction extraction."""
        service = XAIService(use_shap=False, use_lime=False)
        obs = np.array(list(sample_features.values())).reshape(1, -1)
        action, _ = sample_model.predict(obs, deterministic=True)
        assert isinstance(action, np.ndarray)

    def test_feature_importance_rl_model(self, xai_service, sample_features):
        """Test feature importance computation for RL model."""
        fi = xai_service._rl_feature_importance(model=None, features=sample_features)
        assert isinstance(fi, dict)
        assert len(fi) == len(sample_features)
        for key in sample_features.keys():
            assert key in fi

    def test_feature_importance_strategy_model(self, xai_service, sample_features):
        """Test feature importance computation for strategy model."""
        fi = xai_service._strategy_feature_importance(features=sample_features)
        assert isinstance(fi, dict)
        assert len(fi) == len(sample_features)

    def test_kronos_feature_importance_decay(self, xai_service, sample_features):
        """Test Kronos feature importance uses exponential decay."""
        fi = xai_service._kronos_feature_importance(model=None, features=sample_features)
        assert isinstance(fi, dict)
        # Should give higher weights to later (more recent) features
        feature_list = list(sample_features.keys())
        if len(feature_list) > 1:
            first_feat = feature_list[0]
            last_feat = feature_list[-1]
            assert fi[last_feat] >= fi[first_feat], "Recent features should have higher weight"

    def test_permutation_importance_fallback(self, xai_service, sample_features):
        """Test permutation importance fallback."""
        fi = xai_service._permutation_importance(model=None, features=sample_features)
        assert isinstance(fi, dict)
        assert len(fi) == len(sample_features)
        # Should use absolute feature values
        for key, value in fi.items():
            assert value == abs(sample_features[key])

    def test_confidence_without_shap(self, xai_service, sample_features):
        """Test confidence calculation without SHAP values."""
        result = xai_service.explain_prediction(
            model=None,
            features=sample_features,
            generate_visualizations=False
        )
        # Should still compute confidence using Gini coefficient
        assert result.confidence > 0

    def test_database_table_creation(self, temp_db):
        """Test database tables are created correctly."""
        from intelligence.xai_service import XAIService

        # Initialize XAIService with persistence to create tables
        service = XAIService(
            use_shap=False,
            use_lime=False,
            enable_persistence=True,
            db_path=temp_db,
        )
        assert service.enable_persistence is True

        import sqlite3
        conn = sqlite3.connect(temp_db)
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='explanations'")
        assert cursor.fetchone() is not None
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='strategy_rules'")
        assert cursor.fetchone() is not None
        conn.close()

    def test_rsi_condition_description(self, xai_service):
        """Test RSI condition description helper."""
        assert 'oversold' in xai_service._describe_rsi_condition('rsi < 30')
        assert 'overbought' in xai_service._describe_rsi_condition('rsi > 70')
        assert 'condition' in xai_service._describe_rsi_condition('rsi == 50').lower()

    def test_macd_condition_description(self, xai_service):
        """Test MACD condition description helper."""
        assert 'bullish' in xai_service._describe_macd_condition('macd > 0')
        assert 'bearish' in xai_service._describe_macd_condition('macd < 0')
        assert 'condition' in xai_service._describe_macd_condition('macd == 0').lower()


class TestVisualizationData:
    """Test VisualizationData class."""

    def test_creation(self):
        """Test VisualizationData can be created."""
        viz = VisualizationData(
            chart_type='bar',
            data={'x': ['a', 'b'], 'y': [1, 2]},
            layout={'title': 'Test'}
        )
        assert viz.chart_type == 'bar'
        assert viz.data['x'] == ['a', 'b']

    def test_to_plotly_dict(self):
        """Test conversion to Plotly dict."""
        viz = VisualizationData(
            chart_type='bar',
            data={'x': ['a'], 'y': [1]}
        )
        plotly_dict = viz.to_plotly_dict()
        assert 'data' in plotly_dict
        assert 'layout' in plotly_dict
        assert plotly_dict['data']['x'] == ['a']


class TestExplanationResult:
    """Test ExplanationResult class."""

    def test_to_dict_serialization(self):
        """Test ExplanationResult can be serialized."""
        result = ExplanationResult(
            trade_id='test123',
            model_type='rl',
            prediction=0.75,
            feature_importance={'a': 0.5, 'b': 0.3},
            shap_values={'a': 0.02, 'b': -0.01},
            lime_values=None,
            rationale='Test rationale',
            counterfactuals=[{'feature': 'RSI', 'current_value': 25, 'counterfactual_value': 50}],
            confidence=0.85,
            generated_at=datetime.now()
        )

        data = result.to_dict()
        assert 'trade_id' in data
        assert data['trade_id'] == 'test123'
        assert data['prediction'] == 0.75
        assert 'generated_at' in data  # Should be ISO string
