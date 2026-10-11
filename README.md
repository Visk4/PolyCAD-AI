# PolyCAD AI 🧊

> **Text-to-Parametric 3D CAD with an Agentic Auto-Healing Compiler Loop & Real-time Parametric Editing.**

[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688.svg?style=flat&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18+-61DAFB.svg?style=flat&logo=react&logoColor=black)](https://react.dev/)
[![Three.js](https://img.shields.io/badge/Three.js-r186-black.svg?style=flat&logo=threedotjs&logoColor=white)](https://threejs.org/)
[![OpenSCAD](https://img.shields.io/badge/OpenSCAD-Manifold_Engine-blue.svg?style=flat&logo=openscad&logoColor=white)](https://openscad.org/)
[![Tailwind CSS](https://img.shields.io/badge/TailwindCSS-v4-38B2AC.svg?style=flat&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6.svg?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

---

## 🌟 Overview

Most generative 3D tools rely on non-deterministic diffusion models that output noisy point clouds or non-watertight meshes. **PolyCAD AI** takes a fundamentally different engineering approach:

1. **Deterministic Domain-Constrained Generation**: The LLM (*Gemini 3.5 Flash / Groq LLaMA 3.3*) outputs clean, declarative **OpenSCAD code**, not raw polygons.
2. **Agentic Auto-Healing Compiler Loop**: If compilation fails, compiler stderr is fed back to the model with an automated fix prompt (up to 3 retries), self-correcting syntax or geometry errors.
3. **Dynamic Parametric Sliders (Zero-LLM Recompilation)**: Top-level dimensions are extracted via regex and mapped into dynamic UI sliders. Changing dimensions re-compiles the binary mesh in milliseconds on the backend **without any additional LLM API calls**.
4. **Interactive 3D WebGL Viewport**: Renders watertight STL models in real time with OrbitControls, bounding-box auto-fit, and direct download for STL and SCAD formats.

---

## 🏗️ System Architecture

```mermaid
flowchart TD
    subgraph Frontend["Frontend (React + Vite + TypeScript, :5173)"]
        UI["ChatPanel<br/>Prompt Input & Real-Time Heal Log"]
        VP["Viewport (R3F)<br/>Three.js STL Mesh + Auto-Fit Camera"]
        PP["ParamPanel<br/>Dynamic Parametric Sliders & Code Inspector"]
        Hook["useGenerate Hook<br/>State Machine & Debounced Dispatch"]
        AC["api/client.ts<br/>Type-Safe Fetch Client"]
    end

    subgraph Backend["Backend (FastAPI, :8000)"]
        Router["cad.py Router<br/>/api/generate • /api/recompile • /api/stl • /api/scad"]
        Pipeline["pipeline.py<br/>Agentic Auto-Healing Pipeline"]
        LLM["llm.py<br/>Provider Abstraction (Gemini / Groq)"]
        OSCAD["openscad.py<br/>Sandboxed CLI Subprocess Engine"]
        Params["params.py<br/>Regex Extraction & AST Substitution"]
        Config["config.py<br/>Pydantic Settings (.env)"]
        Output[("output/<br/>*.stl & *.scad")]
    end

    subgraph External["External Services & Native Binaries"]
        GeminiAPI["Gemini API<br/>gemini-3.5-flash"]
        OpenSCAD["OpenSCAD CLI<br/>Nightly + Manifold CSG Engine"]
    end

    UI -->|"Natural Language Prompt"| Hook
    Hook -->|"apiGenerate()"| AC
    Hook -->|"apiRecompile() (debounced 400ms)"| AC
    AC -->|"POST /api/generate"| Router
    AC -->|"POST /api/recompile"| Router
    Router -->|"generate_with_heal_loop()"| Pipeline
    Pipeline -->|"generate()"| LLM
    LLM -->|"HTTPS"| GeminiAPI
    GeminiAPI -->|"OpenSCAD Source"| LLM
    Pipeline -->|"compile_scad()"| OSCAD
    OSCAD -->|"Subprocess (30s timeout)"| OpenSCAD
    OpenSCAD -->|"Watertight STL Binary"| OSCAD
    OSCAD -->|"CompileResult"| Pipeline
    Pipeline -->|"parse_params()"| Params
    Router -->|"Persist Artifacts"| Output
    Router -->|"JSON Response"| AC
    AC -->|"Update State (stlRevision)"| Hook
    Hook -->|"stlUrl + revision cache-buster"| VP
    Hook -->|"params"| PP
    PP -->|"onParamChange()"| Hook
    VP -->|"GET /api/stl/:id?rev=N"| Router
    Router -->|"Raw Binary Stream"| VP
```

---

## 🔄 Core Workflows

### 1. Generation & Agentic Auto-Healing Loop
```mermaid
sequenceDiagram
    actor User
    participant Frontend as React Frontend (ChatPanel)
    participant Backend as FastAPI Backend
    participant LLM as Gemini 3.5 Flash
    participant CAD as OpenSCAD (Manifold)

    User->>Frontend: "phone stand with 65mm slot and angled back"
    Frontend->>Backend: POST /api/generate { prompt }
    
    loop Auto-Heal Loop (Max 3 Attempts)
        alt Attempt 1: Initial Generation
            Backend->>LLM: System Prompt (Few-Shot CAD) + User Prompt
            LLM-->>Backend: OpenSCAD Code
        else Attempt 2+: Automated Fix
            Backend->>LLM: Fix Prompt + Broken Code + Compiler stderr
            LLM-->>Backend: Self-Corrected Code
        end

        Backend->>CAD: Run compile with --backend=Manifold
        alt Compilation Succeeded
            CAD-->>Backend: Watertight STL Binary
            Backend->>Backend: Extract Dynamic Parameters (Regex)
            Note over Backend: Break Loop (Success)
        else Compilation Failed
            CAD-->>Backend: Non-zero exit / syntax stderr
            Backend->>Backend: Log attempt failure details
        end
    end

    Backend-->>Frontend: JSON { id, code, params, stl_url, attempts }
    Frontend->>Backend: GET /api/stl/:id?rev=1
    Backend-->>Frontend: STL Binary
    Frontend->>User: Interactive 3D Viewport + Dynamic Sliders
```

### 2. Instant Parametric Editing (Zero LLM Overhead)
```mermaid
sequenceDiagram
    actor User
    participant Sliders as ParamPanel (Sliders)
    participant Hook as useGenerate Hook
    participant Backend as FastAPI Backend
    participant CAD as OpenSCAD Engine
    participant Viewport as Three.js Viewport

    User->>Sliders: Adjusts slot_width from 60mm to 75mm
    Sliders->>Hook: updateParam("slot_width", 75)
    Note over Hook: Debounce Timer (400ms)
    Hook->>Backend: POST /api/recompile { id, params: { slot_width: 75 } }
    
    Backend->>Backend: Regex substitute value in existing .scad (preserving comments)
    Backend->>CAD: Recompile modified source
    CAD-->>Backend: Updated STL Binary
    Backend-->>Hook: { status: "success", stl_url }
    
    Hook->>Viewport: stlRevision++ (Triggers Fresh Loader Fetch)
    Viewport->>Backend: GET /api/stl/:id?rev=2
    Backend-->>Viewport: Updated Binary STL
    Viewport->>User: Re-renders 3D Mesh Seamlessly
```

---

## ✨ Key Features

- **Domain-Specific Few-Shot Prompting**: Enforces strict OpenSCAD practices, `$fn` facet limits (default 64), Customizer-compatible range comments (`// [min:max]`), and modular geometry.
- **Fast Geometry Engine**: Utilizes OpenSCAD's **Manifold** backend, achieving sub-10ms Boolean operations compared to legacy CGAL.
- **Multi-Attempt Self-Healing**: Automatically parses OpenSCAD compiler diagnostics and feeds line errors back into the model to heal broken CAD syntax.
- **Parametric Extraction**: Dynamic extraction of numeric parameters and Customizer comment ranges without needing full AST grammars.
- **Interactive Three.js Studio**:
  - Orbit, pan, zoom, and auto-centering on loaded bounds.
  - Collapsible code inspector.
  - Direct STL and SCAD export.
  - Real-time compiler attempt logs.
- **Security & Sandboxing**:
  - Rejection of malicious directives (`include`, `use`, `import`).
  - Isolated temporary directory execution per compilation.
  - Strict subprocess timeout limits (30s) to prevent infinite CSG recursion.

---

## 📂 Project Structure

```
PolyCAD-AI/
├── .env.example              # Environment variables template
├── .gitignore                # Git ignore rules (secrets, venvs, builds, artifacts)
├── README.md                 # Project documentation
│
├── backend/                  # Python FastAPI Backend
│   ├── requirements.txt      # Python dependencies
│   ├── app/
│   │   ├── main.py           # FastAPI entrypoint & CORS middleware
│   │   ├── config.py         # Pydantic Settings & configuration
│   │   ├── prompts/
│   │   │   └── __init__.py   # System prompts, few-shot examples & fix templates
│   │   ├── routers/
│   │   │   └── cad.py        # REST API endpoints (/generate, /recompile, /stl, /scad)
│   │   └── services/
│   │       ├── llm.py        # LLM Provider abstraction (Gemini / Groq)
│   │       ├── openscad.py   # CLI subprocess wrapper & validation sandbox
│   │       ├── params.py     # Regex parameter parser & in-place substitutor
│   │       └── pipeline.py   # Self-healing compilation pipeline
│   └── output/               # Generated STL & SCAD cache (.gitkeep tracked)
│
└── frontend/                 # React + Vite + TypeScript Frontend
    ├── package.json          # Node dependencies
    ├── vite.config.ts        # Vite configuration (React + Tailwind v4)
    ├── tsconfig.json         # TypeScript compiler configuration
    └── src/
        ├── App.tsx           # Main application layout
        ├── types.ts          # Shared TypeScript interfaces
        ├── index.css         # Tailwind CSS entrypoint
        ├── api/
        │   └── client.ts     # Type-safe API client wrappers
        ├── hooks/
        │   └── useGenerate.ts# State machine hook & debounced recompilation
        └── components/
            ├── ChatPanel.tsx # Prompt input, submission & heal log display
            ├── ParamPanel.tsx# Dynamic range sliders & code viewer
            └── Viewport.tsx  # Three.js / React Three Fiber STL viewer
```

---

## 🚀 Getting Started

### Prerequisites

- **Python** 3.10+
- **Node.js** 18+ & npm
- **OpenSCAD** (Nightly recommended for Manifold CSG engine) — [Download OpenSCAD](https://openscad.org/downloads.html#snapshots)
- **API Key**: Google Gemini API Key or Groq API Key

---

### 1. Clone & Configure

```bash
git clone https://github.com/Visk4/PolyCAD-AI.git
cd PolyCAD-AI
```

Create a `.env` file in the `backend/` folder:

```bash
cp .env.example backend/.env
```

Edit `backend/.env` with your system paths and API credentials:

```ini
# OpenSCAD binary path (use openscad.com on Windows)
OPENSCAD_PATH="D:/OpenSCAD (Nightly)/openscad.com"

# LLM Configuration
LLM_PROVIDER=gemini
LLM_MODEL=gemini-3.5-flash
GEMINI_API_KEY=your_actual_gemini_api_key_here

# Alternative: Groq
# LLM_PROVIDER=groq
# LLM_MODEL=llama-3.3-70b-versatile
# GROQ_API_KEY=your_groq_api_key_here
```

---

### 2. Backend Setup

```bash
cd backend
python -m venv .venv

# Windows (PowerShell)
.venv\Scripts\activate

# macOS / Linux
source .venv/bin/activate

pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8000
```

Verify backend health at: `http://localhost:8000/health`

---

### 3. Frontend Setup

In a new terminal:

```bash
cd frontend
npm install
npm run dev
```

Open your browser at **`http://localhost:5173`**.

---

## 📡 API Reference

| Method | Endpoint | Description | Request Body | Response |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/generate` | Generates CAD code via LLM, auto-heals errors, and compiles STL. | `{ "prompt": string }` | `{ id, status, code, params, stl_url, scad_url, attempts }` |
| `POST` | `/api/recompile` | Re-compiles existing CAD model with updated numeric parameters. | `{ "id": string, "params": { [name]: number } }` | `{ status, code, stl_url, error }` |
| `GET` | `/api/stl/{id}` | Serves the generated binary STL file. | *None* | `application/octet-stream` |
| `GET` | `/api/scad/{id}`| Serves the generated OpenSCAD source file. | *None* | `text/plain` |
| `GET` | `/health` | Service health check and OpenSCAD engine configuration. | *None* | `{ status, openscad_path }` |

---

## 🧪 Sample Prompts for Testing

- **Desk Phone Stand**: `phone stand with 65mm slot and angled back support`
- **Parametric Hex Organizer**: `hex pencil holder with 7 slots arranged in a honeycomb pattern`
- **Mechanical Gear**: `spur gear with 16 teeth, 30mm pitch radius and a center mounting hole`
- **Cable Clip**: `desk cable organizer with 4 rounded channels and screw holes`
- **Stackable Box**: `stackable storage box with interlocking rim and finger slots`

---

## 🛡️ Security Considerations

- **Directive Blacklisting**: Code containing `include <...>`, `use <...>`, or `import(...)` is rejected immediately to prevent arbitrary local filesystem reads.
- **Subprocess Isolation**: Every compilation runs in a freshly created temporary directory (`tempfile.mkdtemp()`) and cleans up after execution.
- **Process Deadlock Prevention**: Subprocess calls are enforced with a strict 30-second execution timeout.

---

## 📜 License

This project is licensed under the MIT License.
