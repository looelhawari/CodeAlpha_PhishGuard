"""Thin wrapper around the Groq SDK.

Provides:
- explicit env-var loading (so each project can use a distinct key)
- safe `is_configured` check (so the UI can degrade gracefully when no key is set)
- a `complete()` helper that joins streamed tokens for convenience
- a `stream()` helper for callers that want token-by-token output

Why not just use the SDK directly? The wrapper centralises model/temperature
defaults and keeps secret-handling consistent across all four CodeAlpha
projects.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Iterator

try:
    from groq import Groq
except ImportError:  # graceful import — caller can show a friendly error
    Groq = None  # type: ignore


class GroqError(RuntimeError):
    pass


@dataclass
class GroqClient:
    api_key: str | None
    model: str
    timeout_s: float = 30.0

    @classmethod
    def from_env(
        cls,
        api_key_env: str,
        model_env: str,
        default_model: str,
    ) -> "GroqClient":
        key = os.getenv(api_key_env) or os.getenv("GROQ_API_KEY")
        model = os.getenv(model_env, default_model)
        return cls(api_key=key, model=model)

    # ---- properties ----
    @property
    def is_configured(self) -> bool:
        return bool(self.api_key) and Groq is not None

    # ---- public api ----
    def complete(
        self,
        prompt: str,
        *,
        system: str | None = None,
        temperature: float = 0.4,
        max_tokens: int = 800,
        top_p: float = 1.0,
    ) -> str:
        """Send a single prompt, return the concatenated assistant text."""
        return "".join(self.stream(
            prompt, system=system, temperature=temperature,
            max_tokens=max_tokens, top_p=top_p,
        ))

    def stream(
        self,
        prompt: str,
        *,
        system: str | None = None,
        temperature: float = 0.4,
        max_tokens: int = 800,
        top_p: float = 1.0,
    ) -> Iterator[str]:
        if not self.is_configured:
            raise GroqError(
                "Groq client is not configured. Set the project's API key "
                "in its .env file (see .env.example)."
            )
        client = Groq(api_key=self.api_key, timeout=self.timeout_s)
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})
        try:
            stream = client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=temperature,
                max_completion_tokens=max_tokens,
                top_p=top_p,
                stream=True,
            )
        except Exception as e:
            raise GroqError(f"Groq API call failed: {e}") from e

        for chunk in stream:
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta
