# on-bored

Developer onboarding documentation generator. Point it at any git repo and get instant, interactive documentation to help new developers get up to speed.

## Features

- **Zero config** - Works on any git repo, any language (Python, Rust, Go, JavaScript, etc.)
- **Instant analysis** - No API keys needed for static analysis
- **Optional AI enhancement** - Add `--ai ollama` for smarter summaries (local, free, private)
- **Private repos** - Clone and analyze with `--clone` using your existing git credentials
- **Interactive dashboard** - Browse architecture, contributors, tech stack, security issues
- **New Dev Flow** - Curated guide showing what files to read first and what to work on

## Quick Start

```bash
git clone https://github.com/Huck-dev/on-bored.git
cd on-bored

# Analyze any repo
node bin/cli.js /path/to/any/repo

# Start the viewer
npm start
# Open http://localhost:3333
```

## Usage

```bash
# Basic analysis (static, instant)
node bin/cli.js /path/to/repo

# Clone and analyze a repo (works with private repos)
node bin/cli.js --clone git@github.com:user/repo.git

# With AI enhancement (requires Ollama running locally)
node bin/cli.js /path/to/repo --ai ollama

# With cloud AI (requires API key)
OPENAI_API_KEY=xxx node bin/cli.js /path/to/repo --ai openai

# Watch mode - auto-regenerate periodically
node bin/cli.js /path/to/repo --watch
node bin/cli.js /path/to/repo --watch --interval=4  # every 4 hours
```

## What It Generates

| Section | Description |
|---------|-------------|
| **Overview** | Project summary, stats, tech stack |
| **Architecture** | Component relationships, data flow diagram |
| **Health Report** | Code quality, hotspots, dead code detection |
| **Security** | Vulnerability scanning, compliance indicators |
| **New Dev Flow** | Curated onboarding guide with suggested tasks |

## What It Detects

**Languages:** JavaScript, TypeScript, Python, Rust, Go, and more

**Tech Stack:**
- Frameworks: React, Vue, Svelte, Angular, Next.js, Nuxt, Astro
- Backend: Express, Fastify, FastAPI, Flask, Actix, Gin
- Databases: Prisma, MongoDB, PostgreSQL
- Services: Stripe, Firebase, Supabase, Appwrite
- DevOps: Docker, GitHub Actions

**Code Analysis:**
- Entry points and core modules
- API endpoints (REST routes)
- Unused code / dead exports
- High-churn files (refactoring candidates)
- Security vulnerabilities (hardcoded secrets, SQL injection patterns)

## AI Providers

| Provider | Setup | Cost |
|----------|-------|------|
| `ollama` | Install [Ollama](https://ollama.ai), run `ollama pull qwen2.5-coder:7b` | Free |
| `openai` | Set `OPENAI_API_KEY` env var | ~$0.01/analysis |

AI enhancement adds:
- Intelligent project summaries
- Key things new developers should understand
- Potential gotchas and complex areas to watch out for

## Requirements

- Node.js 18+
- Git
- (Optional) GitHub CLI (`gh`) for open issues count
- (Optional) Ollama for local AI enhancement

## License

MIT
