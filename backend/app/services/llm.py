"""
LLM provider abstraction — supports Gemini and Groq, switchable via env var.

Design:
  - LLMProvider: abstract base class with a single generate() method.
  - GeminiProvider: uses google-genai SDK.
  - GroqProvider: uses groq SDK.
  - create_provider(): factory that reads config and returns the right provider.

Both providers strip markdown fences from responses so we always get pure code.
"""

import re
from abc import ABC, abstractmethod

from google import genai
from groq import Groq

from app.config import settings


def _strip_markdown_fences(text: str) -> str:
    """
    Remove markdown code fences from LLM output.
    Handles ```openscad, ```scad, ``` etc.
    """
    # Remove opening fence like ```openscad or ```
    text = re.sub(r'^```\w*\s*\n?', '', text.strip())
    # Remove closing fence
    text = re.sub(r'\n?```\s*$', '', text.strip())
    return text.strip()


class LLMProvider(ABC):
    """Abstract base for LLM providers."""

    @abstractmethod
    def generate(self, system_prompt: str, user_message: str) -> str:
        """
        Send a system prompt + user message to the LLM.
        Returns the raw text response (code only, fences stripped).
        """
        ...


class GeminiProvider(LLMProvider):
    """Google Gemini via the google-genai SDK."""

    def __init__(self, model: str, api_key: str):
        self.model = model
        self.client = genai.Client(api_key=api_key)

    def generate(self, system_prompt: str, user_message: str) -> str:
        response = self.client.models.generate_content(
            model=self.model,
            contents=user_message,
            config=genai.types.GenerateContentConfig(
                system_instruction=system_prompt,
                temperature=0.3,  # low temp for deterministic code
            ),
        )
        return _strip_markdown_fences(response.text)


class GroqProvider(LLMProvider):
    """Groq (Llama, Mixtral, etc.) via the groq SDK."""

    def __init__(self, model: str, api_key: str):
        self.model = model
        self.client = Groq(api_key=api_key)

    def generate(self, system_prompt: str, user_message: str) -> str:
        response = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
            temperature=0.3,
        )
        return _strip_markdown_fences(response.choices[0].message.content)


def create_provider() -> LLMProvider:
    """
    Factory — reads LLM_PROVIDER from config and returns the matching provider.
    Raises ValueError if the provider is unknown or the API key is missing.
    """
    provider = settings.llm_provider.lower()

    if provider == "gemini":
        if not settings.gemini_api_key or settings.gemini_api_key == "your-gemini-key-here":
            raise ValueError("GEMINI_API_KEY is not set in .env")
        return GeminiProvider(model=settings.llm_model, api_key=settings.gemini_api_key)

    elif provider == "groq":
        if not settings.groq_api_key or settings.groq_api_key == "your-groq-key-here":
            raise ValueError("GROQ_API_KEY is not set in .env")
        return GroqProvider(model=settings.llm_model, api_key=settings.groq_api_key)

    else:
        raise ValueError(f"Unknown LLM_PROVIDER: '{provider}'. Use 'gemini' or 'groq'.")
