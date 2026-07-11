"""
api/routes/chat.py
==================
FastAPI route for the Incident Pattern RAG Agent.
"""

from fastapi import APIRouter, HTTPException
from api.schemas import ChatRequest, ChatResponse
from risk_engine.rag import generate_grounded_answer

router = APIRouter(prefix="/chat", tags=["Incident Pattern RAG"])

@router.post(
    "/query",
    response_model=ChatResponse,
    summary="Query the RAG safety officer regarding zone risks and safety compliance guidelines",
)
def query_rag(req: ChatRequest):
    try:
        res = generate_grounded_answer(req.query, req.zone_id)
        return ChatResponse(**res)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"RAG Agent execution failed: {str(e)}"
        )
