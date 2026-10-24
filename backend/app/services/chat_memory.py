"""
Chat memory service — persists conversation history and uses FAISS
for semantic similarity search over past prompts.

Architecture:
  - Each conversation has a session_id (UUID).
  - Messages are stored in-memory and on disk as JSON.
  - FAISS index stores embeddings for similarity retrieval.
  - We use a lightweight embedding approach: TF-IDF style bag-of-words
    normalized to unit vectors (no external embedding API needed).
  - On each /generate call, the top-k most similar past prompts + their
    generated code are injected into the LLM context as few-shot examples.
"""

import json
import logging
import re
import math
import uuid
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Any

import numpy as np

try:
    import faiss
except ImportError:
    faiss = None
    logging.warning("faiss-cpu not installed — chat memory similarity search disabled")

logger = logging.getLogger(__name__)

# ── Data classes ────────────────────────────────────────────────

@dataclass
class ChatMessage:
    """A single message in the conversation."""
    role: str          # "user" | "assistant"
    content: str       # prompt text or generated code summary
    model_id: str | None = None  # file_id of generated model (if assistant)
    timestamp: str = ""


@dataclass
class ChatSession:
    """A conversation session with ordered messages."""
    session_id: str = field(default_factory=lambda: str(uuid.uuid4())[:8])
    messages: list[ChatMessage] = field(default_factory=list)


# ── Lightweight text embedder (no external API) ────────────────

class SimpleEmbedder:
    """
    Converts text to a fixed-dimension vector using a hash-based
    bag-of-words approach. No ML model or API call needed.

    This is intentionally simple — good enough for matching
    "phone stand" → past "phone holder" style similarity.
    """

    def __init__(self, dim: int = 256):
        self.dim = dim

    def _tokenize(self, text: str) -> list[str]:
        """Lowercase + split into word tokens."""
        text = text.lower()
        return re.findall(r'[a-z0-9]+', text)

    def embed(self, text: str) -> np.ndarray:
        """
        Hash each word to a position in a fixed-size vector,
        accumulate counts, then L2-normalize.
        """
        vec = np.zeros(self.dim, dtype=np.float32)
        tokens = self._tokenize(text)
        if not tokens:
            return vec

        for token in tokens:
            # Hash token to a bucket
            h = hash(token) % self.dim
            vec[h] += 1.0

        # L2 normalize
        norm = np.linalg.norm(vec)
        if norm > 0:
            vec /= norm

        return vec

    def embed_batch(self, texts: list[str]) -> np.ndarray:
        """Embed multiple texts, return (N, dim) array."""
        return np.stack([self.embed(t) for t in texts])


# ── Chat Memory Manager ────────────────────────────────────────

class ChatMemory:
    """
    Manages chat history + FAISS similarity index.

    Storage layout (under output_dir/chat_memory/):
      - sessions/{session_id}.json — per-session message history
      - faiss_index.bin — FAISS flat L2 index
      - index_metadata.json — maps FAISS row → {session_id, prompt, code_snippet}
    """

    def __init__(self, storage_dir: str, top_k: int = 3):
        self.storage_dir = Path(storage_dir) / "chat_memory"
        self.sessions_dir = self.storage_dir / "sessions"
        self.sessions_dir.mkdir(parents=True, exist_ok=True)
        self.top_k = top_k

        self.embedder = SimpleEmbedder(dim=256)
        self._sessions: dict[str, ChatSession] = {}

        # FAISS index + metadata
        self._index: Any = None  # faiss.IndexFlatL2
        self._metadata: list[dict] = []  # [{session_id, prompt, code_snippet, model_id}]

        self._load_index()

    # ── Session Management ──────────────────────────────────────

    def get_or_create_session(self, session_id: str | None = None) -> ChatSession:
        """Get existing session or create a new one."""
        if session_id and session_id in self._sessions:
            return self._sessions[session_id]

        if session_id:
            # Try loading from disk
            path = self.sessions_dir / f"{session_id}.json"
            if path.exists():
                data = json.loads(path.read_text(encoding="utf-8"))
                session = ChatSession(
                    session_id=data["session_id"],
                    messages=[ChatMessage(**m) for m in data["messages"]],
                )
                self._sessions[session_id] = session
                return session

        # Create new session
        session = ChatSession(session_id=session_id or str(uuid.uuid4())[:8])
        self._sessions[session.session_id] = session
        return session

    def add_user_message(self, session_id: str, content: str) -> None:
        """Add a user message to the session."""
        session = self.get_or_create_session(session_id)
        session.messages.append(ChatMessage(role="user", content=content))
        self._save_session(session)

    def add_assistant_message(
        self, session_id: str, content: str, model_id: str | None = None
    ) -> None:
        """Add an assistant response to the session."""
        session = self.get_or_create_session(session_id)
        session.messages.append(
            ChatMessage(role="assistant", content=content, model_id=model_id)
        )
        self._save_session(session)

    def get_history(self, session_id: str) -> list[dict]:
        """Get all messages for a session as dicts."""
        session = self.get_or_create_session(session_id)
        return [asdict(m) for m in session.messages]

    # ── FAISS Similarity Search ─────────────────────────────────

    def index_prompt(
        self, session_id: str, prompt: str, code_snippet: str, model_id: str
    ) -> None:
        """Add a successful prompt+code pair to the FAISS index."""
        if faiss is None:
            return

        vec = self.embedder.embed(prompt).reshape(1, -1)

        if self._index is None:
            self._index = faiss.IndexFlatL2(self.embedder.dim)

        self._index.add(vec)
        self._metadata.append({
            "session_id": session_id,
            "prompt": prompt,
            "code_snippet": code_snippet[:500],  # store first 500 chars
            "model_id": model_id,
        })
        self._save_index()

    def search_similar(self, prompt: str) -> list[dict]:
        """
        Find top-k similar past prompts.
        Returns list of {prompt, code_snippet, model_id, distance}.
        """
        if faiss is None or self._index is None or self._index.ntotal == 0:
            return []

        vec = self.embedder.embed(prompt).reshape(1, -1)
        k = min(self.top_k, self._index.ntotal)

        distances, indices = self._index.search(vec, k)

        results = []
        for i, idx in enumerate(indices[0]):
            if idx < 0 or idx >= len(self._metadata):
                continue
            meta = self._metadata[idx]
            results.append({
                **meta,
                "distance": float(distances[0][i]),
            })

        return results

    def build_context_from_history(
        self, session_id: str, current_prompt: str
    ) -> str:
        """
        Build enriched context for the LLM by combining:
        1. Current session's recent messages
        2. Similar past prompts from FAISS search

        Returns a string to prepend to the user prompt.
        """
        parts = []

        # 1. Similar past designs from FAISS
        similar = self.search_similar(current_prompt)
        if similar:
            parts.append("=== SIMILAR PAST DESIGNS (for reference) ===")
            for s in similar:
                parts.append(
                    f"User asked: \"{s['prompt']}\"\n"
                    f"Generated code (excerpt):\n{s['code_snippet']}\n"
                )

        # 2. Recent conversation history (last 6 messages)
        session = self.get_or_create_session(session_id)
        recent = session.messages[-6:]  # last 3 turns
        if recent:
            parts.append("=== CURRENT CONVERSATION HISTORY ===")
            for msg in recent:
                role = "User" if msg.role == "user" else "Assistant"
                content = msg.content[:200]
                parts.append(f"{role}: {content}")

        # 3. Current prompt
        parts.append(f"\n=== CURRENT REQUEST ===\n{current_prompt}")

        return "\n\n".join(parts) if len(parts) > 1 else current_prompt

    # ── Persistence ─────────────────────────────────────────────

    def _save_session(self, session: ChatSession) -> None:
        """Save session to disk."""
        path = self.sessions_dir / f"{session.session_id}.json"
        data = {
            "session_id": session.session_id,
            "messages": [asdict(m) for m in session.messages],
        }
        path.write_text(json.dumps(data, indent=2), encoding="utf-8")

    def _load_index(self) -> None:
        """Load FAISS index and metadata from disk."""
        if faiss is None:
            return

        index_path = self.storage_dir / "faiss_index.bin"
        meta_path = self.storage_dir / "index_metadata.json"

        if index_path.exists() and meta_path.exists():
            try:
                self._index = faiss.read_index(str(index_path))
                self._metadata = json.loads(meta_path.read_text(encoding="utf-8"))
                logger.info(
                    f"Loaded FAISS index with {self._index.ntotal} vectors"
                )
            except Exception as e:
                logger.error(f"Failed to load FAISS index: {e}")
                self._index = None
                self._metadata = []

    def _save_index(self) -> None:
        """Save FAISS index and metadata to disk."""
        if faiss is None or self._index is None:
            return

        try:
            index_path = self.storage_dir / "faiss_index.bin"
            meta_path = self.storage_dir / "index_metadata.json"

            faiss.write_index(self._index, str(index_path))
            meta_path.write_text(
                json.dumps(self._metadata, indent=2), encoding="utf-8"
            )
        except Exception as e:
            logger.error(f"Failed to save FAISS index: {e}")


# ── Singleton instance ──────────────────────────────────────────

_memory_instance: ChatMemory | None = None


def get_chat_memory() -> ChatMemory:
    """Get the singleton ChatMemory instance."""
    global _memory_instance
    if _memory_instance is None:
        from app.config import settings
        _memory_instance = ChatMemory(storage_dir=settings.output_dir)
    return _memory_instance
