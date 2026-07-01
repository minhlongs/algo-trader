"""XAI (Explainable AI) API endpoints for AlphaEar Intelligence Sidecar.

Provides:
- POST /xai/explain - Explain a model prediction
- GET /xai/explanation/{explanation_id} - Retrieve stored explanation
- GET /xai/feature-importance - Get aggregated feature importance
- POST /xai/counterfactual - Generate counterfactual scenarios
- POST /xai/strategy-rules - Extract rules from strategy code
- GET /xai/visualization/bar - Feature importance bar chart data
- GET /xai/health - XAI service health check
"""

from fastapi import APIRouter, HTTPException, Body, Query, Depends
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
from datetime import datetime
import sys
from pathlib import Path

# Add parent directory to path for xai_service import
intelligence_dir = Path(__file__).parent
if str(intelligence_dir) not in sys.path:
    sys.path.insert(0, str(intelligence_dir))

from xai_service import XAIService, ExplanationResult, VisualizationData

router = APIRouter()

# Global XAI service instance (set by server.py lifespan)
_xai_service: Optional[XAIService] = None


def set_xai_service(service: XAIService) -> None:
    """Inject XAI service instance from server."""
    global _xai_service
    _xai_service = service


def get_xai_service() -> XAIService:
    """Dependency to get XAI service, raising if not initialized."""
    if _xai_service is None:
        raise HTTPException(503, "XAI service not initialized")
    return _xai_service


# ──── Models ────

class ExplanationRequest(BaseModel):
    """Request for model explanation."""
    model_type: str = Field(..., description="Type of model: 'rl', 'kronos', 'strategy'")
    features: Dict[str, float] = Field(..., description="Feature values dictionary")
    prediction: Optional[float] = Field(None, description="Model prediction (computed if not provided)")
    trade_id: Optional[str] = Field(None, description="Optional trade identifier")
    generate_visualizations: bool = Field(True, description="Generate chart data")


class CounterfactualRequest(BaseModel):
    """Request for counterfactual explanation."""
    features: Dict[str, float]
    prediction: float
    model_type: str
    target_outcome: Optional[float] = Field(None, description="Desired prediction outcome")
    constraints: Optional[Dict[str, Dict[str, float]]] = Field(None, description="Feature constraints {feature: {min, max}}")
    n_counterfactuals: int = Field(5, ge=1, le=10, description="Number of counterfactuals to generate")


class StrategyRulesRequest(BaseModel):
    """Request for strategy rule extraction."""
    strategy_code: str = Field(..., description="Source code of the strategy")
    strategy_name: str = Field(..., description="Name of the strategy")
    use_llm: bool = Field(True, description="Use LLM for enhanced extraction")


class FeatureImportanceResponse(BaseModel):
    """Response for feature importance."""
    model_type: str
    features: List[Dict[str, Any]]
    generated_at: datetime
    metadata: Optional[Dict[str, Any]] = None


class ExplanationResponse(BaseModel):
    """Full explanation response."""
    explanation: Dict[str, Any]  # ExplanationResult as dict
    summary: str
    top_features: List[Dict[str, float]]
    visualizations: Optional[List[Dict[str, Any]]] = None


class TradeRationaleResponse(BaseModel):
    """Trade rationale response."""
    rationale: str
    explanation_id: str
    confidence: float


# ──── Endpoints ────

@router.post("/xai/explain")
async def explain_prediction(
    req: ExplanationRequest,
    xai_service: XAIService = Depends(get_xai_service)
) -> ExplanationResponse:
    """
    Generate explanation for a model prediction.

    Provides SHAP/LIME values, feature importance, counterfactuals,
    and human-readable rationale.

    - **model_type**: Type of model ('rl', 'kronos', 'strategy')
    - **features**: Dict of feature names and values
    - **prediction**: Optional pre-computed prediction
    - **trade_id**: Optional identifier for storing/retrieving
    - **generate_visualizations**: Include chart data (may increase latency)
    """
    try:
        # Model parameter is None; in production, would load from registry
        explanation = xai_service.explain_prediction(
            model=None,
            features=req.features,
            model_type=req.model_type,
            trade_id=req.trade_id,
            prediction=req.prediction,
            generate_visualizations=req.generate_visualizations
        )

        # Create summary
        top_features = sorted(
            explanation.feature_importance.items(),
            key=lambda x: x[1],
            reverse=True
        )[:5]

        summary = f"Prediction: {explanation.prediction:.4f}. "
        summary += f"Top factors: {', '.join(f'{k} ({v:.1%})' for k, v in top_features)}. "
        summary += f"Confidence: {explanation.confidence:.1%}"

        return ExplanationResponse(
            explanation=explanation.to_dict(),
            summary=summary,
            top_features=[{"name": k, "importance": v} for k, v in top_features],
            visualizations=[
                v.to_plotly_dict() for v in explanation.visualizations
            ] if explanation.visualizations else None
        )

    except Exception as exc:
        logger.error(f"Explanation failed: {exc}")
        raise HTTPException(500, detail=f"Explanation failed: {str(exc)}")


@router.get("/xai/explanation/{explanation_id}")
async def get_explanation(
    explanation_id: str,
    xai_service: XAIService = Depends(get_xai_service)
) -> Dict[str, Any]:
    """
    Retrieve stored explanation by trade ID.

    Looks up explanation from database if persistence is enabled.
    """
    try:
        explanation = xai_service.get_explanation(explanation_id)
        if not explanation:
            raise HTTPException(404, detail="Explanation not found")

        return explanation.to_dict()
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Failed to retrieve explanation: {exc}")
        raise HTTPException(500, detail=f"Retrieval failed: {str(exc)}")


@router.get("/xai/feature-importance")
async def get_feature_importance(
    model_type: str = Query(..., description="Model type: rl, kronos, strategy"),
    limit: int = Query(10, ge=1, le=50, description="Number of top features to return"),
    xai_service: XAIService = Depends(get_xai_service)
) -> FeatureImportanceResponse:
    """
    Get aggregated feature importance across recent explanations.

    Returns top features based on persisted explanations or sample data.
    """
    try:
        # Try to get from persisted data first
        if xai_service.enable_persistence:
            explanations = xai_service.list_explanations(model_type=model_type, limit=100)
            if explanations:
                # Aggregate feature importance
                agg_importance: Dict[str, float] = {}
                count = 0
                for ex in explanations:
                    fi = ex.get('feature_importance', {})
                    for feat, imp in fi.items():
                        agg_importance[feat] = agg_importance.get(feat, 0) + imp
                    count += 1

                # Average and sort
                if count > 0:
                    agg_importance = {k: v/count for k, v in agg_importance.items()}

                sorted_features = sorted(
                    agg_importance.items(),
                    key=lambda x: x[1],
                    reverse=True
                )[:limit]

                features = [
                    {
                        "name": name,
                        "importance": imp,
                        "description": _get_feature_description(name)
                    }
                    for name, imp in sorted_features
                ]

                return FeatureImportanceResponse(
                    model_type=model_type,
                    features=features,
                    generated_at=datetime.now(),
                    metadata={"source": "persisted", "count": count}
                )

        # Fallback: return sample data
        sample_features = [
            {"name": "RSI", "importance": 0.25, "description": "Relative Strength Index"},
            {"name": "MACD", "importance": 0.20, "description": "Moving Average Convergence Divergence"},
            {"name": "Volume", "importance": 0.15, "description": "Trading volume"},
            {"name": "Price_Change_24h", "importance": 0.12, "description": "24-hour price change"},
            {"name": "Sentiment", "importance": 0.10, "description": "News sentiment score"},
            {"name": "Volatility", "importance": 0.08, "description": "Market volatility"},
            {"name": "SPX_Correlation", "importance": 0.05, "description": "S&P 500 correlation"},
            {"name": "VWAP", "importance": 0.03, "description": "Volume Weighted Average Price"},
            {"name": "Order_Book_Imbalance", "importance": 0.02, "description": "Order book depth ratio"},
            {"name": "Funding_Rate", "importance": 0.005, "description": "Funding rate spread"},
        ][:limit]

        return FeatureImportanceResponse(
            model_type=model_type,
            features=sample_features,
            generated_at=datetime.now(),
            metadata={"source": "sample"}
        )

    except Exception as exc:
        logger.error(f"Feature importance query failed: {exc}")
        raise HTTPException(500, detail=f"Query failed: {str(exc)}")


@router.post("/xai/counterfactual")
async def generate_counterfactual(
    req: CounterfactualRequest,
    xai_service: XAIService = Depends(get_xai_service)
) -> Dict[str, Any]:
    """
    Generate counterfactual explanations.

    Shows what minimal changes to features would flip the prediction.
    """
    try:
        counterfactuals = xai_service._generate_counterfactuals(
            features=req.features,
            prediction=req.prediction,
            model_type=req.model_type,
            n_counterfactuals=req.n_counterfactuals
        )

        # Apply constraints if provided
        if req.constraints:
            filtered = []
            for cf in counterfactuals:
                feature = cf['feature']
                if feature in req.constraints:
                    constraint = req.constraints[feature]
                    min_val = constraint.get('min', -float('inf'))
                    max_val = constraint.get('max', float('inf'))
                    if min_val <= cf['counterfactual_value'] <= max_val:
                        filtered.append(cf)
                else:
                    filtered.append(cf)
            counterfactuals = filtered

        return {
            "original_prediction": req.prediction,
            "original_features": req.features,
            "counterfactuals": counterfactuals,
            "num_generated": len(counterfactuals),
            "constraints_applied": req.constraints is not None
        }

    except Exception as exc:
        logger.error(f"Counterfactual generation failed: {exc}")
        raise HTTPException(500, detail=f"Generation failed: {str(exc)}")


@router.post("/xai/strategy-rules")
async def extract_strategy_rules(
    req: StrategyRulesRequest,
    xai_service: XAIService = Depends(get_xai_service)
) -> Dict[str, Any]:
    """
    Extract human-readable trading rules from strategy code.

    Uses pattern matching and optionally LLM to identify conditions and actions.
    """
    try:
        rules = xai_service.extract_strategy_rules(
            strategy_code=req.strategy_code,
            strategy_name=req.strategy_name
        )

        return {
            "strategy_name": req.strategy_name,
            "rules": rules,
            "num_rules": len(rules),
            "extraction_method": "pattern_matching" if not req.use_llm else "pattern_matching+llm"
        }

    except Exception as exc:
        logger.error(f"Rule extraction failed: {exc}")
        raise HTTPException(500, detail=f"Extraction failed: {str(exc)}")


@router.get("/xai/visualization/feature-importance")
async def get_feature_importance_chart(
    features: str = Query(..., description="JSON string of feature importance dict"),
    title: str = Query("Feature Importance", description="Chart title"),
    xai_service: XAIService = Depends(get_xai_service)
) -> Dict[str, Any]:
    """
    Generate feature importance bar chart data.

    Accepts feature importance dict as JSON query param, returns Plotly-compatible chart data.
    """
    try:
        import json
        fi_dict = json.loads(features)

        sorted_features = sorted(
            fi_dict.items(),
            key=lambda x: x[1],
            reverse=True
        )[:15]

        chart_data = {
            "data": [{
                "x": [f[0] for f in sorted_features],
                "y": [f[1] for f in sorted_features],
                "type": "bar",
                "marker": {"color": "rgb(55, 128, 191)"}
            }],
            "layout": {
                "title": title,
                "xaxis": {"title": "Feature", "tickangle": -45},
                "yaxis": {"title": "Importance"},
                "margin": {"b": 100, "t": 50, "l": 50, "r": 50},
                "height": 400
            }
        }

        return chart_data

    except json.JSONDecodeError:
        raise HTTPException(400, detail="Invalid JSON in features parameter")
    except Exception as exc:
        logger.error(f"Visualization generation failed: {exc}")
        raise HTTPException(500, detail=f"Failed: {str(exc)}")


@router.get("/xai/health")
async def health_check(
    xai_service: XAIService = Depends(get_xai_service)
) -> Dict[str, Any]:
    """Health check for XAI service."""
    return {
        "status": "healthy",
        "shap_available": xai_service._shap_available if hasattr(xai_service, '_shap_available') else False,
        "lime_available": xai_service._lime_available if hasattr(xai_service, '_lime_available') else False,
        "llm_enabled": xai_service.deepseek_api_key is not None,
        "persistence_enabled": xai_service.enable_persistence,
        "timestamp": datetime.now().isoformat()
    }


def _get_feature_description(feature_name: str) -> str:
    """Get human-readable description for a feature."""
    descriptions = {
        'RSI': 'Relative Strength Index (momentum oscillator)',
        'MACD': 'Moving Average Convergence Divergence (trend momentum)',
        'MACD_LINE': 'MACD line value',
        'Volume': 'Trading volume',
        'Price_Change_24h': '24-hour price change percentage',
        'Sentiment': 'News sentiment score (0-1)',
        'Volatility': 'Market volatility index',
        'SPX_Correlation': 'Correlation with S&P 500',
        'VWAP': 'Volume Weighted Average Price',
        'Order_Book_Imbalance': 'Ratio of buy/sell orders in order book',
        'Funding_Rate': 'Funding rate spread between exchanges',
        'Bollinger_Upper': 'Upper Bollinger Band',
        'Bollinger_Lower': 'Lower Bollinger Band',
        'SMA_20': '20-period Simple Moving Average',
        'EMA_50': '50-period Exponential Moving Average',
        'ATR': 'Average True Range (volatility)',
    }
    return descriptions.get(feature_name, f"Trading feature: {feature_name}")
