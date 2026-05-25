"""PhishGuard AI tutor backend.

Optional companion service for the static SPA in /public. Provides:

  POST /api/explain   - in-context tutoring on a specific email + flagged set
  POST /api/generate  - generate a brand-new phishing email at a given tier
  GET  /healthz       - liveness probe

The static frontend works standalone. Run this backend when you want
adaptive AI-assisted learning.

Run:
    python -m src.app  # serves on http://localhost:5057
"""
from __future__ import annotations

import json
import os
from typing import Any

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

from src.groq_client import GroqClient, GroqError

PUBLIC_DIR = os.path.join(os.path.dirname(__file__), "..", "public")
TUTOR_SYSTEM = """You are PhishGuard's tutor, a friendly senior security analyst
helping employees recognize phishing. You are concise, never condescending,
and ground every explanation in the specific email shown. When the learner
misses an indicator, explain HOW you'd spot it next time. Refuse any request
to generate phishing content for real targeting; only synthetic training
examples are permitted."""

GEN_SYSTEM = """You generate SYNTHETIC training emails for phishing-awareness
education. Always include at least three concrete indicators (sender,
urgency, link, attachment, grammar). Output strict JSON matching the schema
provided. Never reference real victims, real campaigns, or include any
working malicious payload. Use placeholder URLs (e.g. '#' or example.com).
You must refuse if asked to target a real person or company by name."""


def _make_app() -> Flask:
    app = Flask(__name__, static_folder=None)
    CORS(app)

    client = GroqClient.from_env(
        api_key_env="PHISHGUARD_GROQ_API_KEY",
        model_env="PHISHGUARD_GROQ_MODEL",
        default_model="openai/gpt-oss-20b",
    )

    # --- API ----------
    @app.post("/api/explain")
    def explain():
        data = request.get_json(force=True, silent=True) or {}
        email = data.get("email") or {}
        flagged_ids = data.get("flagged", [])
        question = (data.get("question") or "").strip()

        user_block = _format_email_for_prompt(email, flagged_ids)
        prompt = (
            f"{user_block}\n\n"
            f"Learner question: {question or 'Walk me through what I should have spotted.'}\n\n"
            "Reply in 4-7 sentences. End with one actionable tip."
        )
        try:
            text = client.complete(prompt, system=TUTOR_SYSTEM, temperature=0.4, max_tokens=600)
        except GroqError as e:
            return jsonify({"error": str(e)}), 502
        return jsonify({"reply": text})

    @app.post("/api/generate")
    def generate():
        data = request.get_json(force=True, silent=True) or {}
        difficulty = data.get("difficulty", "medium")
        theme = (data.get("theme") or "").strip() or "generic"

        if difficulty not in ("easy", "medium", "hard", "apt"):
            return jsonify({"error": "invalid difficulty"}), 400

        schema_hint = _schema_hint()
        prompt = (
            f"Generate ONE synthetic training email at the '{difficulty}' difficulty tier.\n"
            f"Theme: {theme}\n\n"
            f"Return STRICT JSON matching this schema (no prose, no markdown fences):\n{schema_hint}\n"
            "Use realistic display names but fictitious domains. Include 3-5 indicators with explanations."
        )
        try:
            raw = client.complete(prompt, system=GEN_SYSTEM, temperature=0.7, max_tokens=1400)
            parsed = _extract_json(raw)
        except GroqError as e:
            return jsonify({"error": str(e)}), 502
        except ValueError as e:
            return jsonify({"error": f"model returned invalid JSON: {e}", "raw": raw[:400]}), 502
        return jsonify(parsed)

    @app.get("/healthz")
    def healthz():
        return jsonify({"status": "ok", "ai_enabled": client.is_configured})

    # --- Serve the SPA when run all-in-one ----------
    @app.route("/", defaults={"path": "index.html"})
    @app.route("/<path:path>")
    def static_proxy(path: str):
        return send_from_directory(PUBLIC_DIR, path)

    return app


def _format_email_for_prompt(email: dict[str, Any], flagged_ids: list[str]) -> str:
    indicators = email.get("indicators") or []
    ind_lines = "\n".join(
        f"  - id={i.get('id')} type={i.get('type')} hint={i.get('explanation')}"
        for i in indicators
    )
    flagged = ", ".join(flagged_ids) or "(none)"
    return (
        f"EMAIL SUBJECT: {email.get('subject')}\n"
        f"FROM: {email.get('from', {}).get('name')} <{email.get('from', {}).get('address')}>\n"
        f"DIFFICULTY: {email.get('difficulty')}\n"
        f"IS_PHISHING (ground truth): {email.get('isPhishing')}\n"
        f"INDICATORS:\n{ind_lines}\n"
        f"LEARNER FLAGGED: {flagged}\n"
        f"BODY (HTML stripped to text): {_html_to_text(email.get('bodyHtml', ''))}"
    )


def _html_to_text(s: str) -> str:
    import re
    return re.sub(r"<[^>]+>", " ", s).strip()


def _schema_hint() -> str:
    return json.dumps({
        "id": "<unique slug>",
        "difficulty": "easy|medium|hard|apt",
        "isPhishing": True,
        "from": {"name": "string", "address": "string"},
        "to": "you@example.com",
        "subject": "string",
        "date": "ISO-8601 string",
        "headerIndicators": {"from": "indicator-id"},
        "indicators": [{"id": "string", "type": "string", "explanation": "string"}],
        "bodyHtml": "<p>...with data-indicator='id' on suspicious spans</p>",
    }, indent=2)


def _extract_json(text: str) -> dict:
    text = text.strip()
    if text.startswith("```"):
        # strip ```json ... ``` fences if model added them despite instructions
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:].lstrip()
    # Find the first '{' and matching last '}'
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("no JSON object found")
    return json.loads(text[start : end + 1])


app = _make_app()


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5057, debug=True)
