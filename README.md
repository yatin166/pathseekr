# Pathseekr

**Local-first code search and navigation for AI assistants.**

Index your codebase once. Search it instantly. Connect it to Claude, Cursor, or any MCP-compatible AI assistant so it can navigate your code without reading every file.

> **Beta** — core functionality is stable but some rough edges remain. See [Known Limitations](#known-limitations).

---

## What it does

Pathseekr builds a local search index from your source code and exposes it through:

- A **CLI** (`seek`) for manual search and context management
- An **MCP server** that gives AI assistants direct access to your codebase structure

It supports **BM25 keyword search**, **graph-based structural search** (class → method relationships, call references), and optional **vector/semantic search** via Ollama.

Works on TypeScript, JavaScript, Python, and Java codebases.

---

## Installation

```bash
npm install -g @pathseekr/cli
```

Verify the installation:

```bash
seek --version
```

---

## Quickstart

**1. Create a context for your project**

```bash
seek context create myproject
```

**2. Index your codebase**

```bash
seek index /path/to/your/project --context myproject
```

**3. Set it as the active context**

```bash
seek context use myproject
```

**4. Search**

```bash
seek search "authentication logic"
seek search "class that handles payments"
seek search "parseResult" --strategy bm25
```

That's it. Your codebase is indexed and searchable.

---

## CLI Reference

### Indexing

```bash
# Index a path into a context
seek index /path/to/project --context myproject

# Force re-index all files
seek index /path/to/project --context myproject --force

# Index the active context's registered paths
seek index
```

### Search

```bash
# Graph search (default) — uses structural relationships
seek search "query"

# BM25 keyword search
seek search "query" --strategy bm25

# Limit results
seek search "query" --limit 5

# Search in a specific context
seek search "query" --context myproject
```

**Available strategies:**

| Strategy | Description |
|---|---|
| `graph` | Structural search — uses class/method/call relationships |
| `bm25` | Keyword search — fast, no setup required |
| `vector` | Semantic search — requires embeddings (see below) |
| `hybrid` | Combines BM25 and vector — requires embeddings |

### Context management

```bash
# Create a context
seek context create myproject
seek context create myproject --description "Main backend services"

# List all contexts
seek context list

# Show context details
seek context info myproject

# Set active context
seek context use myproject

# Add a path to a context
seek context add myproject /path/to/project

# Remove a path from a context
seek context remove myproject /path/to/project

# Delete a context and all its data
seek context delete myproject --confirm
```

### Status

```bash
# Show indexing stats for the active context
seek status

# Show stats for a specific context
seek status --context myproject
```

### Embeddings (optional)

Embeddings enable semantic and hybrid search. Requires [Ollama](https://ollama.ai) running locally.

```bash
# Pull an embedding model in Ollama first
ollama pull nomic-embed-text

# Generate embeddings for the active context
seek embed

# Generate for a specific context
seek embed --context myproject
```

---

## MCP Server

The MCP server exposes Pathseekr's search capabilities to AI assistants via the [Model Context Protocol](https://modelcontextprotocol.io).

### Installation

```bash
npm install -g @pathseekr/mcp
```

### Connect to Claude Code

```bash
claude mcp add pathseekr -s user -- node $(which pathseekr-mcp)
```

Verify the connection:

```
/mcp
```

You should see `pathseekr: connected`.

### Connect to Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
    "mcpServers": {
        "pathseekr": {
            "command": "node",
            "args": ["/absolute/path/to/node_modules/.bin/pathseekr-mcp"]
        }
    }
}
```

Restart Claude Desktop.

### Available tools

| Tool | Description |
|---|---|
| `get_project_map` | Returns the full structural overview of the indexed codebase |
| `search_codebase` | Searches by concept, class name, or description |
| `find_symbol` | Finds a specific class, function, method, or type by name |
| `get_file_context` | Returns all symbols from a specific file |

### Usage with an active context

Set your active context before starting your AI session:

```bash
seek context use myproject
```

All MCP tool calls will use the active context automatically. You can override per call by passing `context_name` as a tool argument.

---

## Multi-project setup

Pathseekr supports multiple projects through named contexts. Each context has its own isolated database.

```bash
# Create contexts for each project
seek context create backend --description "Node.js API"
seek context create frontend --description "React application"
seek context create ml_pipeline --description "Python data pipeline"

# Index each one
seek index /projects/backend --context backend
seek index /projects/frontend --context frontend
seek index /projects/ml_pipeline --context ml_pipeline

# Switch between them
seek context use backend
seek search "rate limiting"

seek context use frontend
seek search "authentication state"
```

---

## Configuration

Pathseekr reads configuration from environment variables. Create a `.env` file in your project root or at `~/.pathseekr/.env`:

```bash
# Storage
PATHSEEKR_DATA_DIR=~/.pathseekr

# Indexing
INDEXING_CONCURRENCY=10
MAX_FILE_SIZE_BYTES=1048576

# Ollama (for embeddings and vector search)
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_EMBEDDING_MODEL=nomic-embed-text
OLLAMA_EMBEDDING_DIMENSIONS=768
EMBEDDING_BATCH_SIZE=20

# Search defaults
DEFAULT_SEARCH_LIMIT=10
BM25_WEIGHT=0.5

# Ports (if running the API server)
API_PORT=3001
MCP_PORT=3002
```

---

## Supported languages

| Language | Extensions |
|---|---|
| TypeScript | `.ts`, `.tsx` |
| JavaScript | `.js`, `.jsx`, `.mjs`, `.cjs` |
| Python | `.py`, `.pyw` |
| Java | `.java` |

Files with unsupported extensions are scanned but not parsed. Run `seek status` to see what was and wasn't indexed.

---

## How indexing works

Indexing runs in three phases:

**Phase 1 — Scan and parse**
Files are scanned, filtered (hidden files, ignored directories, files over the size limit are skipped), and parsed. Each file produces chunks — one per class, method, function, interface, or type.

**Phase 2 — Graph**
Edges are built between chunks:
- `contains` — class → its methods
- `extends` — child class → parent class
- `implements` — class → interface
- `calls` — function/method → functions it references

**Phase 3 — Embeddings** (optional)
If Ollama is running and you run `seek embed`, each chunk is embedded for semantic search.

---

## Requirements

- Node.js 22 or later
- macOS, Linux, or Windows
- Ollama (optional — only for vector/semantic search)

---

## Known Limitations

- **Project map size** — for large multi-project setups the project map file can be very large. Future versions will expose this as queryable layers rather than a single file.
- **MCP result verbosity** — search results returned to AI assistants include content previews which can be token-heavy on large codebases. This will be addressed in a future release.
- **Embeddings require Ollama** — there is no cloud embedding provider option in this release. Ollama must be running locally.
- **No incremental edge updates** — graph edges are rebuilt in full on every index run when changes are detected.
- **English-optimised tokenisation** — BM25 tokenisation is tuned for English identifiers and may produce lower quality results on codebases with non-English naming conventions.

---

## Roadmap

- [ ] Layered project map for large codebases
- [ ] Reduced MCP result verbosity with location-only mode
- [ ] Support parsing and indexing of more languages

---

## License

MIT