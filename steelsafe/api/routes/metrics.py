"""
api/routes/metrics.py
======================
Phase 7A: Detector comparison metrics endpoint.

GET /api/v1/metrics/comparison
    Runs both the compound risk engine and the naive single-sensor baseline
    against all scripted scenarios and safe periods for the active plant.
    Returns a structured comparison table with lead times, false positive rates,
    and the near-miss discipline check result.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from db.database import get_db
from risk_engine.comparison import run_comparison
from plants.registry import DEFAULT_PLANT_ID

router = APIRouter(prefix="/metrics", tags=["Performance Metrics"])


@router.get(
    "/comparison",
    summary="Compound engine vs. baseline detector: lead time & false positive comparison",
)
def get_comparison_metrics(
    plant_id: str = Query(DEFAULT_PLANT_ID, description="Filter comparison metrics by plant ID"),
    db: Session = Depends(get_db)
):
    """
    Run the full detector comparison across all scripted scenarios of the specified plant.

    This endpoint:
    1. Queries stored RiskAssessment rows for compound engine results
    2. Re-evaluates baseline detector against the same timestamps
    3. Returns per-scenario lead times, aggregate stats, and false positive rates

    **Requires**: POST /admin/regenerate must have been run first to populate
    the risk_assessments table with compound engine results.
    """
    try:
        result = run_comparison(db, plant_id=plant_id)
        if "error" in result:
            raise HTTPException(status_code=422, detail=result["error"])
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Comparison engine failed: {str(e)}"
        )
