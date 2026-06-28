"""Integration tests for XAI FastAPI endpoints."""

import pytest
import json
from unittest.mock import Mock, patch, MagicMock
from fastapi.testclient import TestClient
from pathlib import Path
import tempfile
import shutil

# Import the FastAPI app from server
# We'll need to create a test-specific app or mock dependencies
import sys
sys.path.insert(0, str(Path(__file__).parent.parent / "intelligence"))

from server import app as fastapi_app
from xai_service import XAIService, ExplanationResult

client = TestClient(fastapi_app)


class TestXAIEndpoints:
    """Test XAI API endpoints."""

    @pytest.fixture
    def temp_db(self):
        """Create temporary database."""
        temp_dir = tempfile.mkdtemp()
        db_path = Path(temp_dir) / "test_xai_api.db"
        yield str(db_path)
        shutil.rmtree(temp_dir)

    @pytest.fixture
    def mock_xai_service(self):
        """Mock XAI service for endpoint tests."""
        service = Mock(spec=XAIService)

        # Mock explain_prediction
        mock_explanation = ExplanationResult(
            trade_id="test_trade_123",
            model_type="rl",
            prediction=0.75,
            feature_importance={"RSI": 0.3, "MACD": 0.2, "Volume": 0.1},
            shap_values={"RSI": 0.02, "MACD": -0.01},
            lime_values=None,
            rationale="RSI oversold + positive MACD suggests bullish momentum",
            counterfactuals=[
                {
                    "feature": "RSI",
                    "current_value": 25.0,
                    "counterfactual_value": 50.0,
                    "required_change": 25.0,
                    "would_flip_prediction_to": 0.5,
                    "description": "If RSI were higher by 25.0, the trade decision would change."
                }
            ],
            confidence=0.85,
            generated_at=Mock(now=lambda: Mock(isoformat=lambda: "2025-01-01T00:00:00"))
        )
        service.explain_prediction.return_value = mock_explanation

        # Mock get_explanation
        service.get_explanation.return_value = mock_explanation

        # Mock list_explanations
        service.list_explanations.return_value = [
            {
                "trade_id": "trade_1",
                "model_type": "rl",
                "prediction": 0.7,
                "rationale": "Test rationale",
                "confidence": 0.8,
                "generated_at": "2025-01-01T00:00:00"
            }
        ]

        # Mock _generate_counterfactuals
        service._generate_counterfactuals.return_value = [
            {
                "feature": "RSI",
                "current_value": 25.0,
                "counterfactual_value": 50.0,
                "required_change": 25.0,
                "would_flip_prediction_to": 0.5,
                "description": "If RSI were higher by 25.0, the trade decision would change."
            }
        ]

        # Mock extract_strategy_rules
        service.extract_strategy_rules.return_value = [
            {
                "rule_id": "test_rsi_0",
                "type": "technical_indicator",
                "indicator": "RSI",
                "condition": "if rsi < 30:",
                "action": "BUY",
                "description": "RSI indicates oversold condition - potential buy signal",
                "line_number": 5
            }
        ]

        # Mock health check attributes
        service._shap_available = True
        service._lime_available = True
        service.deepseek_api_key = "test-key"
        service.enable_persistence = True

        return service

    def test_health_check(self):
        """Test XAI health endpoint."""
        response = client.get("/xai/health")
        assert response.status_code == 200

        data = response.json()
        assert "status" in data
        assert "shap_available" in data
        assert "lime_available" in data
        assert "llm_enabled" in data
        assert "timestamp" in data

    def test_explain_prediction_endpoint(self, mock_xai_service):
        """Test POST /xai/explain endpoint."""
        # Inject mock service
        from xai_endpoints import set_xai_service
        original_service = fastapi_app.state.xai_service if hasattr(fastapi_app, 'state') else None
        set_xai_service(mock_xai_service)

        payload = {
            "model_type": "rl",
            "features": {"RSI": 25.0, "MACD": 0.001, "Volume": 1000000},
            "trade_id": "test_trade_123",
            "generate_visualizations": False
        }

        response = client.post("/xai/explain", json=payload)
        assert response.status_code == 200

        data = response.json()
        assert "explanation" in data
        assert "summary" in data
        assert "top_features" in data
        assert data["explanation"]["trade_id"] == "test_trade_123"
        assert data["explanation"]["model_type"] == "rl"
        assert "rationale" in data["explanation"]
        assert "feature_importance" in data["explanation"]

        # Verify mock was called
        mock_xai_service.explain_prediction.assert_called_once()

    def test_explain_prediction_validation_error(self):
        """Test explain endpoint with invalid payload."""
        payload = {
            "model_type": "invalid_model",  # Should be rl/kronos/strategy
            "features": "not a dict"  # Should be dict
        }

        response = client.post("/xai/explain", json=payload)
        assert response.status_code == 422  # Validation error

    def test_get_explanation_endpoint(self, mock_xai_service):
        """Test GET /xai/explanation/{id} endpoint."""
        from xai_endpoints import set_xai_service
        set_xai_service(mock_xai_service)

        response = client.get("/xai/explanation/test_trade_123")
        assert response.status_code == 200

        data = response.json()
        assert data["trade_id"] == "test_trade_123"

    def test_get_explanation_not_found(self, mock_xai_service):
        """Test GET /xai/explanation/{id} with non-existent ID."""
        from xai_endpoints import set_xai_service
        mock_xai_service.get_explanation.return_value = None
        set_xai_service(mock_xai_service)

        response = client.get("/xai/explanation/nonexistent")
        assert response.status_code == 404

    def test_get_feature_importance_endpoint(self, mock_xai_service):
        """Test GET /xai/feature-importance endpoint."""
        from xai_endpoints import set_xai_service
        set_xai_service(mock_xai_service)

        response = client.get("/xai/feature-importance?model_type=rl&limit=5")
        assert response.status_code == 200

        data = response.json()
        assert data["model_type"] == "rl"
        assert "features" in data
        assert len(data["features"]) <= 5
        assert "generated_at" in data

    def test_get_feature_importance_validation(self):
        """Test feature importance with invalid limit."""
        response = client.get("/xai/feature-importance?model_type=rl&limit=100")
        assert response.status_code == 422  # limit max is 50

    def test_generate_counterfactual_endpoint(self, mock_xai_service):
        """Test POST /xai/counterfactual endpoint."""
        from xai_endpoints import set_xai_service
        set_xai_service(mock_xai_service)

        payload = {
            "features": {"RSI": 25.0, "MACD": 0.001},
            "prediction": 0.75,
            "model_type": "rl",
            "n_counterfactuals": 3
        }

        response = client.post("/xai/counterfactual", json=payload)
        assert response.status_code == 200

        data = response.json()
        assert "original_prediction" in data
        assert "counterfactuals" in data
        assert data["num_generated"] >= 0

    def test_extract_strategy_rules_endpoint(self, mock_xai_service):
        """Test POST /xai/strategy-rules endpoint."""
        from xai_endpoints import set_xai_service
        set_xai_service(mock_xai_service)

        payload = {
            "strategy_code": "def evaluate(self, features):\n    if features['RSI'] < 30:\n        return 'BUY'",
            "strategy_name": "TestStrategy",
            "use_llm": False
        }

        response = client.post("/xai/strategy-rules", json=payload)
        assert response.status_code == 200

        data = response.json()
        assert data["strategy_name"] == "TestStrategy"
        assert "rules" in data
        assert "num_rules" in data
        assert "extraction_method" in data

    def test_visualization_endpoint(self):
        """Test GET /xai/visualization/feature-importance endpoint."""
        features = {"RSI": 0.3, "MACD": 0.2, "Volume": 0.1}
        features_json = json.dumps(features)

        response = client.get(
            f"/xai/visualization/feature-importance?features={features_json}&title=Test"
        )
        assert response.status_code == 200

        data = response.json()
        assert "data" in data
        assert "layout" in data
        # Check Plotly structure
        assert isinstance(data["data"], list)
        assert len(data["data"]) > 0
        assert "x" in data["data"][0] or "r" in data["data"][0]

    def test_visualization_invalid_json(self):
        """Test visualization with invalid features JSON."""
        response = client.get("/xai/visualization/feature-importance?features=invalid&title=Test")
        assert response.status_code == 400
        assert "Invalid JSON" in response.json()["detail"]

    def test_health_check_xai_disabled(self):
        """Test health check when XAI service is not initialized."""
        # The health endpoint should still work even if XAI is disabled
        response = client.get("/health")
        # Depending on server state, may return different status
        # At minimum, the endpoint should not crash
        assert response.status_code in [200, 503]


class TestXAIErrorHandling:
    """Test error handling in XAI endpoints."""

    def test_explain_prediction_exception(self):
        """Test explain endpoint when service raises exception."""
        # This would require mocking at a deeper level
        # For now, ensure endpoint returns 500 on errors
        pass  # TODO: Implement with proper service mocking

    def test_counterfactual_exception(self):
        """Test counterfactual endpoint error handling."""
        pass  # TODO: Implement

    def test_strategy_rules_exception(self):
        """Test strategy rules endpoint error handling."""
        pass  # TODO: Implement


class TestXAIResponseModels:
    """Test Pydantic response models."""

    def test_explanation_response_validation(self):
        """Test ExplanationResponse model validation."""
        from xai_endpoints import ExplanationResponse

        data = {
            "explanation": {
                "trade_id": "test",
                "model_type": "rl",
                "prediction": 0.75,
                "feature_importance": {"a": 0.5},
                "shap_values": None,
                "lime_values": None,
                "rationale": "Test",
                "counterfactuals": [],
                "confidence": 0.8,
                "generated_at": "2025-01-01T00:00:00"
            },
            "summary": "Test summary",
            "top_features": [{"name": "RSI", "importance": 0.3}],
            "visualizations": None
        }

        # Should not raise
        resp = ExplanationResponse(**data)
        assert resp.explanation.trade_id == "test"
