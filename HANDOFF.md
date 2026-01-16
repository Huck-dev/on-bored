# on-bored - Developer Onboarding Tool

## What It Does
Generates comprehensive documentation for any git repository to help onboard new developers quickly. Analyzes codebase structure, git history, tech stack, security vulnerabilities, NCOSE compliance, and contributor statistics.

## Quick Start
```bash
cd /home/huck/on-bored
npm install
node bin/cli.js /path/to/repo   # Analyze a repo
npm start                        # View at http://localhost:3333
```

## Output Pages
- **index.html** - Main docs: overview, architecture, API endpoints, components, functions, activity, hotspots, dead code, team
- **flow.html** - Clean layered architecture diagram (Pages → Components → API → Functions → Services) with JSON view
- **health-report.html** - Commit activity charts, file churn analysis, open issues
- **security.html** - Security vulnerabilities + NCOSE compliance checklist with score

## Features

### Tech Stack Detection
Scans `package.json` (including monorepo subdirs like `website/`, `app/`) for:
- Frameworks: React, Vue, Svelte, Next.js, Nuxt, Astro
- Backend: Express, Fastify, Appwrite, Firebase, Supabase
- Database: Prisma, MongoDB
- Styling: Tailwind CSS
- Languages: TypeScript, Python, Rust, Go, Flutter
- DevOps: Docker, GitHub Actions, GitLab CI
- Other: Stripe, Pinia, Zod, TanStack Query

### Dead Code / Tech Debt Detection
- **Unused Components**: Vue/React components never imported
- **Orphaned Files**: Source files with no imports
- **Unused Exports**: Exported functions/classes not used anywhere

### Security Scanning
- Hardcoded secrets (API keys, passwords, tokens)
- Injection vulnerabilities (SQL, eval, innerHTML, v-html)
- Exposed sensitive files (.env not gitignored)

### NCOSE Compliance (Creator Economy Platforms)
Detects implementation of:
1. Age Verification (SumSub, Onfido, Jumio, DOB checks)
2. Content Moderation (NSFW detection, flagging)
3. Identity Verification / KYC
4. Reporting Mechanisms (report user/content, abuse)
5. Record Keeping (2257 compliance)
6. User Safety (block, mute, 2FA, privacy settings)
7. Payment Compliance (Stripe Connect, chargebacks, disputes)

### Contributor Analysis (Team Page)
- **Radar Charts**: SVG spider/radar charts showing each contributor's work breakdown by category
- **Contribution Heatmap**: Stacked bar visualization showing category distribution per contributor
- **Focus Areas**: Identifies frontend, backend, fullstack, devops, docs roles
- **Category Breakdown**: Tracks commits by category (frontend, backend, database, auth, devops, testing, docs)
- **Category Colors**: Frontend (blue), Backend (green), Database (orange), Auth (pink), DevOps (cyan), Testing (purple), Docs (yellow)

### Watch Mode (Auto-Updates)
- `--watch` flag enables periodic regeneration
- `--interval=N` sets custom interval in hours (default: 2)
- Useful for keeping docs fresh on active projects

## Recent Updates
- **Radar Charts**: Added SVG spider charts for each contributor showing work breakdown
- **Contribution Heatmap**: Added stacked bar visualization showing category distribution
- **Removed Time Estimates**: Removed dev hour calculations per user request

## Data Structure

### Contributor Object
```json
{
  "name": "Zach Handley",
  "commits": 390,
  "focus": "frontend",
  "expertise": "website",
  "categoryBreakdown": {
    "frontend": 245,
    "backend": 89,
    "database": 12,
    "auth": 34,
    "devops": 8,
    "testing": 15,
    "docs": 5
  },
  "radarData": {
    "frontend": 60,
    "backend": 22,
    "database": 3,
    "auth": 8,
    "devops": 2,
    "testing": 4,
    "docs": 1
  }
}
```

## File Structure
```
on-bored/
├── bin/cli.js          # Main analyzer script (~1000 lines)
├── lib/generateHTML.js # HTML page generators (~900 lines)
├── server.js           # Local HTTP server (port 3333)
├── output/             # Generated docs (gitignored)
│   ├── data.json
│   ├── index.html
│   ├── flow.html
│   ├── health-report.html
│   └── security.html
├── package.json
└── HANDOFF.md
```

## Usage as CLI Tool
```bash
npm link                         # Install globally
on-bored /path/to/any/repo       # Run on any repo
on-bored . --watch               # Watch mode - regenerate every 2 hours
on-bored . -w --interval=4       # Watch mode with custom interval (hours)
on-bored --help                  # Show all options
```

## Key Dependencies
- Node.js (uses child_process for git/grep commands)
- `gh` CLI (optional, for fetching GitHub issues)

## Notes
- Grep syntax warnings during scan are harmless (edge cases in regex)
- Compliance detection uses pattern matching - review results manually
- Dead code detection is heuristic - verify before deleting files

## Next Steps
1. Make charts interactive (click to expand details)
2. Add timeline view showing category activity over time
3. Add export options (PDF, PNG)
