from fastapi import APIRouter
from data_generator.generator import run_generation
from api.schemas import RegenerateResponse

router = APIRouter(prefix="/admin", tags=["Admin"])


@router.post(
    "/regenerate",
    response_model=RegenerateResponse,
    summary="Drop all data and regenerate a fresh simulated dataset",
)
def regenerate():
    """
    Wipes the SQLite database and re-seeds it with a fresh 8-hour shift of
    synthetic data. Useful for demo resets between hackathon presentations.
    The random seed is fixed (42) so output is reproducible.
    """
    summary = run_generation()
    return RegenerateResponse(**summary)
