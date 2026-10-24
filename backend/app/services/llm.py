"""
LLM provider abstraction — supports Gemini and Groq, switchable via env var.

Design:
  - LLMProvider: abstract base class with generate() and describe_image().
  - GeminiProvider: uses google-genai SDK (supports multimodal image input).
  - GroqProvider: uses groq SDK (text only).
  - create_provider(): factory that reads config and returns the right provider.

Both providers strip markdown fences from responses so we always get pure code.
"""

import re
from abc import ABC, abstractmethod

from google import genai
from google.genai import types as genai_types
from groq import Groq

from app.config import settings


# ── Prompt for image → text description ─────────────────────────
IMAGE_DESCRIBE_PROMPT = """Analyze this image and describe the 3D object shown as a CAD model specification.

Your description MUST include:
1. The overall shape and type of object (e.g. "phone stand", "gear", "box with lid")
2. Key features (holes, slots, curves, chamfers, fillets, etc.)
3. Estimated dimensions in millimeters (approximate from visual proportions)
4. Any notable geometric relationships (e.g. "centered hole", "angled back at ~75°")

Output a single concise paragraph that could be used as a prompt to generate this object in OpenSCAD.
Do NOT include any code. Just describe the object clearly."""


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

    def describe_image(self, image_bytes: bytes, mime_type: str) -> str:
        """
        Send an image to the LLM and get a text description of the 3D object.
        Default implementation raises NotImplementedError for text-only providers.
        """
        raise NotImplementedError(
            f"{self.__class__.__name__} does not support image input"
        )


class GeminiProvider(LLMProvider):
    """Google Gemini via the google-genai SDK (supports multimodal)."""

    def __init__(self, model: str, api_key: str):
        self.model = model
        self.client = genai.Client(api_key=api_key)

    def generate(self, system_prompt: str, user_message: str) -> str:
        response = self.client.models.generate_content(
            model=self.model,
            contents=user_message,
            config=genai_types.GenerateContentConfig(
                system_instruction=system_prompt,
                temperature=0.3,  # low temp for deterministic code
            ),
        )
        return _strip_markdown_fences(response.text)

    def describe_image(self, image_bytes: bytes, mime_type: str) -> str:
        """
        Send an image to Gemini and get a text description of the 3D object.
        Uses Gemini's multimodal input: image bytes + text prompt.
        """
        response = self.client.models.generate_content(
            model=self.model,
            contents=[
                genai_types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
                IMAGE_DESCRIBE_PROMPT,
            ],
            config=genai_types.GenerateContentConfig(
                temperature=0.3,
            ),
        )
        return response.text.strip()


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
