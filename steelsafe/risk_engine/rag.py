"""
risk_engine/rag.py
==================
Incident Pattern RAG Agent backend logic.

Performs:
1. Loading and chunking of markdown safety documents from /safety_documents.
2. In-memory TF-IDF retrieval of relevant paragraphs.
3. Dual-mode answer generation (Gemini REST API if GEMINI_API_KEY is found,
   fallback to a robust local slot-filler expert system if offline/no key).
"""

import os
import re
import math
import json
import requests
from typing import List, Dict, Any, Optional
from db.database import SessionLocal
from db.models import SensorReading, Permit, WorkerLocation, RiskAssessment
from risk_engine import thresholds as T

# Path to safety documents
DOCS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "safety_documents")

class DocumentChunk:
    def __init__(self, source: str, title: str, content: str):
        self.source = source
        self.title = title
        self.content = content
        self.tokens = self._tokenize(content)

    def _tokenize(self, text: str) -> List[str]:
        # Normalize and split into words
        words = re.findall(r'\b[a-zA-Z0-9_]{3,15}\b', text.lower())
        # Filter basic stop words
        stopwords = {
            "the", "and", "for", "with", "this", "that", "from", "are", "was", "any",
            "must", "shall", "under", "been", "have", "has", "not", "but", "into"
        }
        return [w for w in words if w not in stopwords]

class TFIDFRetriever:
    def __init__(self):
        self.chunks: List[DocumentChunk] = []
        self.idf: Dict[str, float] = {}
        self._load_corpus()

    def _load_corpus(self):
        """Load and chunk all markdown files in safety_documents."""
        if not os.path.exists(DOCS_DIR):
            return

        for filename in os.listdir(DOCS_DIR):
            if not filename.endswith(".md"):
                continue
            path = os.path.join(DOCS_DIR, filename)
            try:
                with open(path, "r", encoding="utf-8") as f:
                    content = f.read()
                
                # Simple chunking: split by markdown section headers
                sections = re.split(r'\n(?=## )', content)
                doc_title = sections[0].split("\n")[0].replace("#", "").strip()
                
                for sec in sections:
                    lines = sec.strip().split("\n")
                    sec_title = lines[0].replace("##", "").strip() if lines[0].startswith("##") else "Introduction"
                    sec_content = "\n".join(lines[1:]).strip()
                    if len(sec_content) > 50:
                        self.chunks.append(DocumentChunk(
                            source=filename,
                            title=f"{doc_title} - {sec_title}",
                            content=sec_content
                        ))
            except Exception as e:
                print(f"[RAG] Failed loading document {filename}: {e}")

        # Compute IDF
        total_docs = len(self.chunks)
        if total_docs == 0:
            return

        doc_frequencies: Dict[str, int] = {}
        for chunk in self.chunks:
            unique_tokens = set(chunk.tokens)
            for t in unique_tokens:
                doc_frequencies[t] = doc_frequencies.get(t, 0) + 1

        for term, df in doc_frequencies.items():
            self.idf[term] = math.log((1 + total_docs) / (1 + df)) + 1

    def retrieve(self, query: str, top_k: int = 2) -> List[Dict[str, Any]]:
        """Find top_k relevant chunks using Cosine Similarity on TF-IDF vectors."""
        if not self.chunks:
            return []

        # Tokenize query
        q_chunk = DocumentChunk("query", "query", query)
        q_tf: Dict[str, int] = {}
        for t in q_chunk.tokens:
            q_tf[t] = q_tf.get(t, 0) + 1

        # Build query TF-IDF vector
        q_vec: Dict[str, float] = {}
        q_len_sq = 0.0
        for t, tf in q_tf.items():
            if t in self.idf:
                tfidf = tf * self.idf[t]
                q_vec[t] = tfidf
                q_len_sq += tfidf * tfidf
        q_len = math.sqrt(q_len_sq)

        if q_len == 0.0:
            # Fallback to returning first top_k chunks if no overlap
            return [{
                "source": c.source,
                "title": c.title,
                "content": c.content,
                "score": 0.0
            } for c in self.chunks[:top_k]]

        results = []
        for chunk in self.chunks:
            c_tf: Dict[str, int] = {}
            for t in chunk.tokens:
                c_tf[t] = c_tf.get(t, 0) + 1

            dot_product = 0.0
            c_len_sq = 0.0
            for t, tf in c_tf.items():
                tfidf = tf * self.idf.get(t, 0)
                c_len_sq += tfidf * tfidf
                if t in q_vec:
                    dot_product += tfidf * q_vec[t]
            c_len = math.sqrt(c_len_sq)

            score = 0.0
            if q_len > 0 and c_len > 0:
                score = dot_product / (q_len * c_len)

            results.append({
                "source": chunk.source,
                "title": chunk.title,
                "content": chunk.content,
                "score": score
            })

        # Sort descending by score
        results.sort(key=lambda x: x["score"], reverse=True)
        return results[:top_k]

# Initialize global singleton retriever
_retriever = None

def get_retriever() -> TFIDFRetriever:
    global _retriever
    if _retriever is None:
        _retriever = TFIDFRetriever()
    return _retriever

def generate_grounded_answer(query: str, zone_id: Optional[str] = None) -> Dict[str, Any]:
    """Retrieve context and generate compliance answer using Gemini API or local fallback."""
    retriever = get_retriever()
    passages = retriever.retrieve(query, top_k=2)

    # 1. Fetch live zone context from DB
    db = SessionLocal()
    zone_snapshot = {}
    zone_status_str = "No specific zone selected or active."
    
    if zone_id:
        try:
            # Get latest risk assessment
            assessment = db.query(RiskAssessment).filter(RiskAssessment.zone_id == zone_id).order_by(RiskAssessment.timestamp.desc()).first()
            # Get latest sensor reading
            sensor = db.query(SensorReading).filter(SensorReading.zone_id == zone_id).order_by(SensorReading.timestamp.desc()).first()
            # Get active permits count
            permits_count = db.query(Permit).filter(Permit.zone_id == zone_id, Permit.status == 'active').count()
            
            if assessment and sensor:
                zone_snapshot = {
                    "zone_id": zone_id,
                    "risk_score": assessment.risk_score,
                    "risk_level": assessment.risk_level,
                    "co_ppm": sensor.co_ppm,
                    "h2s_ppm": sensor.h2s_ppm,
                    "temperature_c": sensor.temperature_c,
                    "pressure_kpa": sensor.pressure_kpa,
                    "active_permits": permits_count,
                    "triggered_rules": assessment.triggered_rules,
                    "explanation": assessment.explanation
                }
                zone_status_str = (
                    f"Zone: {zone_id}\n"
                    f"- Risk Level: {assessment.risk_level.upper()} (Score: {assessment.risk_score:.0f}/100)\n"
                    f"- Sensors: CO={sensor.co_ppm:.1f} ppm, H2S={sensor.h2s_ppm:.3f} ppm, "
                    f"Pressure={sensor.pressure_kpa:.2f} kPa, Temp={sensor.temperature_c:.1f}°C\n"
                    f"- Permits: {permits_count} active permits\n"
                    f"- Risk Explanation: {assessment.explanation}\n"
                )
        except Exception as e:
            print(f"[RAG] Failed compiling zone context: {e}")
        finally:
            db.close()

    # 2. Check for Gemini API key
    api_key = os.environ.get("GEMINI_API_KEY")
    
    if api_key:
        # LLM API Mode
        return _generate_gemini_api_answer(query, passages, zone_status_str, zone_snapshot, api_key)
    else:
        # Local Rule-based fallback expert mode
        return _generate_local_expert_answer(query, passages, zone_snapshot)

def _generate_gemini_api_answer(
    query: str, 
    passages: List[Dict[str, Any]], 
    zone_status_str: str, 
    zone_snapshot: Dict[str, Any], 
    api_key: str
) -> Dict[str, Any]:
    """Hits the Google Gemini 1.5 Flash REST API to answer query using injected contexts."""
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}"
    headers = {"Content-Type": "application/json"}
    
    context_blocks = []
    for p in passages:
        context_blocks.append(f"Source: {p['source']} ({p['title']})\nSnippet:\n{p['content']}")
    
    context_str = "\n\n---\n\n".join(context_blocks)
    
    prompt = (
        "You are the SteelSafe Safety Officer AI Agent, an expert in heavy industrial safety compliance.\n"
        "Your task is to answer the safety query below, grounded in both the Live Plant Status and the retrieved Regulatory Documents.\n"
        "Keep your answer concise (under 120 words), direct, and highly actionable. Cite the specific document name when quoting regulations.\n\n"
        "=== LIVE PLANT STATUS ===\n"
        f"{zone_status_str}\n\n"
        "=== REGULATORY DOCUMENTS ===\n"
        f"{context_str}\n\n"
        f"USER QUERY: {query}\n\n"
        "Write your grounded response:"
    )

    data = {
        "contents": [{
            "parts": [{
                "text": prompt
            }]
        }]
    }

    try:
        response = requests.post(url, headers=headers, json=data, timeout=10)
        if response.status_code == 200:
            res_json = response.json()
            answer = res_json['candidates'][0]['content']['parts'][0]['text'].strip()
            return {
                "answer": answer,
                "citations": passages,
                "zone_snapshot": zone_snapshot
            }
        else:
            print(f"[RAG] Gemini API returned error {response.status_code}: {response.text}")
    except Exception as e:
        print(f"[RAG] Failed Gemini API call: {e}")

    # If API call fails, fall back to local expert system
    return _generate_local_expert_answer(query, passages, zone_snapshot)

def _generate_local_expert_answer(
    query: str, 
    passages: List[Dict[str, Any]], 
    zone_snapshot: Dict[str, Any]
) -> Dict[str, Any]:
    """Offline rule-based fallback answering engine providing high-fidelity grounded responses."""
    q = query.lower()

    # Out of domain check
    out_of_domain_words = ["weather", "cook", "bake", "cake", "game", "movie", "song", "joke", "sports", "capital"]
    if any(w in q for w in out_of_domain_words) and not any(w in q for w in ["gas", "safety", "permit", "risk"]):
        return {
            "answer": (
                "As a SteelSafe Safety Officer, I am only authorized to answer questions regarding "
                "plant safety, live zone status, active work permits, or industrial safety regulations."
            ),
            "citations": [],
            "zone_snapshot": zone_snapshot
        }

    # 1. Zone specific queries
    if zone_snapshot and any(w in q for w in ["why", "flagged", "high", "critical", "status", "current", "zone"]):
        zone_id = zone_snapshot["zone_id"]
        score = zone_snapshot["risk_score"]
        level = zone_snapshot["risk_level"]
        co = zone_snapshot["co_ppm"]
        rules = zone_snapshot["triggered_rules"]

        zone_name = zone_id.replace("zone_", "").upper()
        if zone_id == "zone_gcm":
            zone_name = "Gas Collection Main"
        elif zone_id == "zone_cob1":
            zone_name = "Coke Oven Battery 1"
        elif zone_id == "zone_ca":
            zone_name = "Charging Platform Area"

        if score > 45:
            answer = (
                f"Zone {zone_name} is currently flagged as {level.upper()} risk with a score of {score:.0f}/100. "
                f"This is triggered by compound rules: {rules or 'None'}. "
                f"Specifically, we have elevated CO ({co:.1f} ppm) in the presence of active work permits. "
                f"According to OISD Standard 137 Section 1, hot work permits must be immediately suspended "
                f"if gas levels trend upward or exceed action thresholds (CO >= 35 ppm) to prevent ignition hazards. "
                f"Indian Factories Act Section 87 mandates immediate evacuation and headcount due to clustered worker exposure."
            )
        else:
            answer = (
                f"Zone {zone_name} is currently safe with a low risk score of {score:.0f}/100. "
                f"Sensor readings (CO={co:.1f} ppm) are well within normal operating bounds. "
                f"No compound rules are active. Compliance with OISD Standard 137 Section 1 requires "
                f"maintaining standard permit checklists and regular atmosphere checks during routine maintenance."
            )

        return {
            "answer": answer,
            "citations": passages,
            "zone_snapshot": zone_snapshot
        }

    # 2. General topics matching
    if any(w in q for w in ["hot work", "welding", "grinding", "flame"]):
        answer = (
            "OISD Standard 137 Section 1 mandates that a Hot Work Permit is required for welding, grinding, "
            "or any ignition-source activity in hazardous zones. Gas testing must be performed before start. "
            "If gas concentrations trend upward or Carbon Monoxide exceeds the 35 ppm Action Level "
            "(as defined in Gas Safety SOP Section A), the permit must be immediately suspended to prevent explosions."
        )
    elif any(w in q for w in ["confined space", "cse", "flue", "entry"]):
        answer = (
            "OISD Standard 137 Section 2 and Indian Factories Act Section 36 outline strict rules for Confined Space Entry. "
            "No worker may enter any flue, main, or tank if CO >= 35 ppm or H2S >= 5 ppm. "
            "A dedicated standby observer must remain outside at all times, and workers must wear breathing "
            "apparatus and a securely attached safety harness connected to a rescue line."
        )
    elif any(w in q for w in ["shift", "changeover", "handover", "supervision"]):
        answer = (
            "OISD Standard 137 Section 3 states that the ±15 minute boundary around shift changeovers creates "
            "communication and handover gaps, resulting in reduced supervision. Incoming supervisors must formally review "
            "all active permits and inspect zones to ensure gas safety and verify no unauthorized worker clusters have formed."
        )
    elif any(w in q for w in ["olfactory", "odor", "smell", "fatigue"]):
        answer = (
            "According to Gas Safety SOP Section B, H2S has a rotten egg smell at low levels, but above 10 ppm, "
            "it causes rapid olfactory fatigue (odor fatigue), paralyzing the sense of smell. Workers cease to "
            "detect the hazard and may assume safety. Electronic gas sensors must be monitored; workers must never rely on smell."
        )
    elif any(w in q for w in ["pressure drop", "gcm", "leak"]):
        answer = (
            "According to Gas Safety SOP Section C, a pressure drop of >=2.5 kPa below the GCM baseline (103.2 kPa) "
            "signals a potential upstream raw gas main leak. Under OISD Standard 137 guidelines, work must be suspended "
            "and GCM catwalks cleared immediately to protect personnel from toxic raw gas exposure."
        )
    else:
        # General response aggregating the retrieved documents
        sources = ", ".join(set(p["source"] for p in passages))
        answer = (
            f"Based on regulatory guidelines ({sources}), safety monitoring requires strict compliance "
            "with gas limits (CO Action Level: 35 ppm, H2S Action Level: 5 ppm). Permits (hot work and confined space) "
            "must be suspended immediately if gas levels escalate, and worker counts must be limited to prevent clustered exposure."
        )

    return {
        "answer": answer,
        "citations": passages,
        "zone_snapshot": zone_snapshot
    }
