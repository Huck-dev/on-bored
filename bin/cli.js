#!/usr/bin/env node

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// Parse args
const args = process.argv.slice(2);
const watchFlag = args.includes('--watch') || args.includes('-w');
const helpFlag = args.includes('--help') || args.includes('-h');
const intervalArg = args.find(a => a.startsWith('--interval='));
const intervalHours = intervalArg ? parseFloat(intervalArg.split('=')[1]) : 2;

// Clone flag: --clone <url>
const cloneIdx = args.indexOf('--clone');
const cloneUrl = cloneIdx !== -1 ? args[cloneIdx + 1] : null;

// AI flag: --ai <provider> (ollama, openai)
const aiIdx = args.indexOf('--ai');
const aiProvider = aiIdx !== -1 ? args[aiIdx + 1] : null;

// Get repo path (first non-flag arg that's not a value for --clone or --ai)
const flagValues = new Set([cloneUrl, aiProvider].filter(Boolean));
let repoPath = args.find(a => !a.startsWith('-') && !flagValues.has(a)) || '.';
const outputDir = path.join(__dirname, '..', 'output');

if (helpFlag) {
  console.log(`
  🚀 on-bored - Developer Onboarding Generator

  Usage: on-bored [repo-path] [options]

  Options:
    -w, --watch           Watch mode - regenerate periodically
    --interval=<hours>    Update interval in watch mode (default: 2)
    --clone <url>         Clone a repo first, then analyze it
    --ai <provider>       Use AI for enhanced analysis (ollama, openai)
    -h, --help            Show this help message

  AI Providers:
    ollama                Local models (free, private) - requires Ollama running
    openai                OpenAI API - requires OPENAI_API_KEY env var

  Examples:
    on-bored                              # Analyze current directory
    on-bored /path/to/repo                # Analyze specific repo
    on-bored --clone git@github.com:user/private-repo.git
    on-bored . --ai ollama                # Use local Ollama for AI analysis
    on-bored . --ai openai                # Use OpenAI for AI analysis
    on-bored . --watch --ai ollama        # Watch mode with AI
  `);
  process.exit(0);
}

// ============ AI HELPER FUNCTIONS ============

async function callOllama(prompt, model = 'qwen2.5-coder:7b') {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ model, prompt, stream: false });
    const req = http.request({
      hostname: 'localhost',
      port: 11434,
      path: '/api/generate',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          resolve(json.response || '');
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(120000, () => reject(new Error('Ollama timeout')));
    req.write(data);
    req.end();
  });
}

async function callOpenAI(prompt) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY environment variable not set');

  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 2000
    });
    const req = https.request({
      hostname: 'api.openai.com',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          resolve(json.choices?.[0]?.message?.content || '');
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function callAI(prompt) {
  if (!aiProvider) return null;

  try {
    switch (aiProvider.toLowerCase()) {
      case 'ollama': return await callOllama(prompt);
      case 'openai': return await callOpenAI(prompt);
      default:
        console.error(`  ⚠️  Unknown AI provider: ${aiProvider}`);
        return null;
    }
  } catch (e) {
    console.error(`  ⚠️  AI error: ${e.message}`);
    return null;
  }
}

async function enhanceWithAI(data, sampleCode) {
  if (!aiProvider) return data;

  console.log(`  🤖 Enhancing with AI (${aiProvider})...`);

  const prompt = `You are analyzing a codebase for developer onboarding. Based on this information, provide:
1. A clear 2-3 sentence project summary explaining what this project does
2. The top 3 things a new developer should understand first
3. Any potential gotchas or complex areas to be aware of

Project: ${data.repoName}
Language: ${data.primaryLanguage || 'Mixed'}
Tech Stack: ${data.techStack.map(t => t.name).join(', ')}
Entry Points: ${data.entryPoints?.slice(0, 5).map(e => e.file).join(', ') || 'None detected'}
Modules: ${data.modules?.slice(0, 10).map(m => m.name).join(', ') || 'None detected'}
Top Changed Files: ${data.topFiles.slice(0, 5).map(f => f.file).join(', ')}

Sample code from main files:
${sampleCode.slice(0, 3000)}

Respond in this exact JSON format:
{
  "summary": "...",
  "keyThings": ["...", "...", "..."],
  "gotchas": ["...", "..."]
}`;

  const response = await callAI(prompt);
  if (response) {
    try {
      // Extract JSON from response (handle markdown code blocks)
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const aiData = JSON.parse(jsonMatch[0]);
        data.aiSummary = aiData.summary;
        data.aiKeyThings = aiData.keyThings;
        data.aiGotchas = aiData.gotchas;
        console.log('  ✅ AI analysis complete');
      }
    } catch (e) {
      console.error('  ⚠️  Could not parse AI response');
    }
  }

  return data;
}

// ============ CLONE HANDLER ============

if (cloneUrl) {
  const repoName = cloneUrl.split('/').pop().replace('.git', '');
  const clonePath = path.join('/tmp', `on-bored-${repoName}-${Date.now()}`);

  console.log(`\n  🚀 on-bored - Developer Onboarding Generator\n`);
  console.log(`  📥 Cloning: ${cloneUrl}`);
  console.log(`  📂 To: ${clonePath}\n`);

  try {
    execSync(`git clone --depth=100 "${cloneUrl}" "${clonePath}"`, { stdio: 'inherit' });
    repoPath = clonePath;
    console.log('');
  } catch (e) {
    console.error('\n  ❌ Clone failed. Check your credentials or URL.');
    console.error('  💡 For private repos, ensure SSH keys are configured or use HTTPS with credentials.\n');
    process.exit(1);
  }
}

// Main analysis function
function runAnalysis() {
console.log(`\n  🚀 on-bored - Developer Onboarding Generator\n`);
console.log(`  Analyzing: ${path.resolve(repoPath)}\n`);

// Ensure we're in a git repo
try {
  execSync('git rev-parse --git-dir', { cwd: repoPath, stdio: 'pipe' });
} catch (e) {
  console.error('  ❌ Error: Not a git repository');
  process.exit(1);
}

// Helper to run git commands
function git(cmd) {
  try {
    return execSync(`git ${cmd}`, { cwd: repoPath, encoding: 'utf8', stdio: 'pipe' }).trim();
  } catch (e) {
    return '';
  }
}

// Helper to count lines
function countLines(output) {
  if (!output) return 0;
  return output.split('\n').filter(l => l.trim()).length;
}

console.log('  📊 Collecting git statistics...');

// ============ BASIC INFO ============
const repoName = path.basename(path.resolve(repoPath));
const remoteUrl = git('remote get-url origin') || 'No remote';
const currentBranch = git('branch --show-current') || 'unknown';
const firstCommitDate = git('log --reverse --format=%ci | head -1') || '';
const latestCommitDate = git('log -1 --format=%ci') || '';

// ============ COMMIT STATS ============
const totalCommits = countLines(git('log --oneline'));
const totalFixCommits = countLines(git('log --oneline --grep=fix'));
const fixRatio = totalCommits > 0 ? Math.round((totalFixCommits / totalCommits) * 100) : 0;

// Contributors with expertise detection
const contributorsRaw = git('shortlog -sn --all').split('\n').filter(l => l.trim()).slice(0, 10).map(line => {
  const match = line.trim().match(/^\s*(\d+)\s+(.+)$/);
  return match ? { commits: parseInt(match[1]), name: match[2] } : null;
}).filter(Boolean);

// Category definitions for radar chart
const commitCategories = {
  frontend: { patterns: ['component', 'ui', 'style', 'css', 'layout', 'modal', 'button', 'form', 'page'], color: '#3b82f6' },
  backend: { patterns: ['api', 'server', 'handler', 'controller', 'route', 'endpoint', 'service'], color: '#22c55e' },
  database: { patterns: ['database', 'db', 'schema', 'model', 'migration', 'query', 'prisma'], color: '#f97316' },
  auth: { patterns: ['auth', 'login', 'signup', 'session', 'jwt', 'oauth', 'password', 'security'], color: '#ec4899' },
  devops: { patterns: ['ci', 'cd', 'docker', 'deploy', 'build', 'workflow', 'pipeline', 'config'], color: '#06b6d4' },
  testing: { patterns: ['test', 'spec', 'jest', 'vitest', 'cypress', 'e2e'], color: '#8b5cf6' },
  docs: { patterns: ['doc', 'readme', 'changelog', 'comment', 'md'], color: '#fbbf24' },
};

// Analyze what each contributor worked on most + category breakdown
const contributors = contributorsRaw.map(c => {
  const filesTouched = {};
  const areasTouched = {};

  // Category counts for radar chart
  const categoryBreakdown = {
    frontend: 0, backend: 0, database: 0, auth: 0, devops: 0, testing: 0, docs: 0
  };

  try {
    // Get commit messages and files for category analysis
    const commitData = git(`log --author="${c.name}" --oneline --name-only | head -500`).split('\n').filter(l => l.trim());

    let currentCommitMsg = '';
    commitData.forEach(line => {
      if (line.match(/^[a-f0-9]+\s/)) {
        // This is a commit message line
        currentCommitMsg = line.toLowerCase();

        // Categorize by commit message
        Object.entries(commitCategories).forEach(([cat, { patterns }]) => {
          if (patterns.some(p => currentCommitMsg.includes(p))) {
            categoryBreakdown[cat]++;
          }
        });
      } else if (line.trim()) {
        // This is a file path
        const file = line.toLowerCase();
        const ext = path.extname(file).toLowerCase();

        // Track file extensions
        if (ext) {
          filesTouched[ext] = (filesTouched[ext] || 0) + 1;
        }

        // Categorize by file path
        if (file.includes('component') || file.includes('/ui/') || ['.vue', '.tsx', '.jsx', '.svelte', '.css', '.scss'].includes(ext)) {
          categoryBreakdown.frontend++;
        }
        if (file.includes('/api/') || file.includes('server') || file.includes('handler')) {
          categoryBreakdown.backend++;
        }
        if (file.includes('schema') || file.includes('model') || file.includes('migration') || file.includes('prisma')) {
          categoryBreakdown.database++;
        }
        if (file.includes('auth') || file.includes('login') || file.includes('security')) {
          categoryBreakdown.auth++;
        }
        if (file.includes('docker') || file.includes('ci') || file.includes('workflow') || ['.yml', '.yaml'].includes(ext)) {
          categoryBreakdown.devops++;
        }
        if (file.includes('test') || file.includes('spec') || file.includes('.test.') || file.includes('.spec.')) {
          categoryBreakdown.testing++;
        }
        if (['.md', '.mdx', '.txt'].includes(ext) || file.includes('readme') || file.includes('doc')) {
          categoryBreakdown.docs++;
        }

        // Track areas (directories)
        const parts = line.split('/');
        if (parts.length > 1) {
          const area = parts.find(p => !['src', 'app', 'lib', '.'].includes(p) && p.length > 1);
          if (area) {
            areasTouched[area] = (areasTouched[area] || 0) + 1;
          }
        }
      }
    });

  } catch (e) {}

  // Find top expertise area
  const topAreas = Object.entries(areasTouched)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([area]) => area);

  // Determine primary focus based on file types
  const extCounts = Object.entries(filesTouched).sort((a, b) => b[1] - a[1]);
  let focus = 'general';
  if (extCounts.length > 0) {
    const topExt = extCounts[0][0];
    if (['.vue', '.tsx', '.jsx', '.svelte', '.css', '.scss'].includes(topExt)) focus = 'frontend';
    else if (['.py', '.go', '.rs', '.java'].includes(topExt)) focus = 'backend';
    else if (['.ts', '.js'].includes(topExt)) focus = filesTouched['.vue'] || filesTouched['.tsx'] ? 'frontend' : 'fullstack';
    else if (['.md', '.mdx', '.txt'].includes(topExt)) focus = 'docs';
    else if (['.yml', '.yaml', '.json'].includes(topExt)) focus = 'config/devops';
  }

  // Normalize category breakdown to percentages
  const totalCatHits = Object.values(categoryBreakdown).reduce((a, b) => a + b, 0) || 1;
  const radarData = {};
  Object.keys(categoryBreakdown).forEach(cat => {
    radarData[cat] = Math.round((categoryBreakdown[cat] / totalCatHits) * 100);
  });

  return {
    ...c,
    focus,
    topAreas: topAreas.slice(0, 2),
    expertise: topAreas[0] || focus,
    categoryBreakdown,
    radarData
  };
});

// ============ MONTHLY BREAKDOWN ============
console.log('  📅 Analyzing monthly activity...');
const months = [];
for (let i = 5; i >= 0; i--) {
  const date = new Date();
  date.setMonth(date.getMonth() - i);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const nextDate = new Date(date);
  nextDate.setMonth(nextDate.getMonth() + 1);
  const nextYear = nextDate.getFullYear();
  const nextMonth = String(nextDate.getMonth() + 1).padStart(2, '0');

  const total = countLines(git(`log --oneline --after="${year}-${month}-01" --before="${nextYear}-${nextMonth}-01"`));
  const fixes = countLines(git(`log --oneline --after="${year}-${month}-01" --before="${nextYear}-${nextMonth}-01" --grep=fix`));

  months.push({
    label: date.toLocaleString('default', { month: 'short' }),
    year,
    total,
    fixes
  });
}

// ============ FILE CHURN ============
console.log('  🔥 Finding high-churn files...');
const fileChurnRaw = git('log --name-only --pretty=format: --diff-filter=M');
const fileChurnMap = {};
fileChurnRaw.split('\n').forEach(file => {
  if (file.trim() && (file.endsWith('.js') || file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.vue') || file.endsWith('.py') || file.endsWith('.go') || file.endsWith('.rs') || file.endsWith('.java'))) {
    fileChurnMap[file] = (fileChurnMap[file] || 0) + 1;
  }
});
const topFiles = Object.entries(fileChurnMap)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 15)
  .map(([file, count]) => ({ file: path.basename(file), fullPath: file, changes: count }));

// ============ CATEGORY ANALYSIS ============
console.log('  🏷️  Categorizing commits...');
const categories = [
  { name: 'Authentication', patterns: ['auth', 'login', 'signup', 'session', 'oauth', 'jwt', 'password'] },
  { name: 'UI / Frontend', patterns: ['ui', 'modal', 'style', 'css', 'component', 'layout', 'button', 'form'] },
  { name: 'API / Backend', patterns: ['api', 'endpoint', 'route', 'server', 'handler', 'controller'] },
  { name: 'Database', patterns: ['database', 'db', 'migration', 'schema', 'model', 'query', 'sql'] },
  { name: 'Testing', patterns: ['test', 'spec', 'jest', 'vitest', 'cypress', 'playwright'] },
  { name: 'DevOps / CI', patterns: ['ci', 'cd', 'docker', 'deploy', 'build', 'pipeline', 'workflow'] },
  { name: 'Documentation', patterns: ['doc', 'readme', 'comment', 'changelog'] },
  { name: 'Dependencies', patterns: ['dependency', 'package', 'upgrade', 'bump', 'npm', 'yarn', 'pnpm'] },
];

const categoryStats = categories.map(cat => {
  const pattern = cat.patterns.join('|');
  const count = countLines(git(`log --oneline -E --grep="${pattern}" -i`));
  return { name: cat.name, count };
}).sort((a, b) => b.count - a.count);

// ============ TECH STACK DETECTION ============
console.log('  🛠️  Detecting tech stack...');
const techStack = [];
const foundTech = new Set(); // Track what we've already added

// Check for common files/patterns
const checkFile = (file) => fs.existsSync(path.join(repoPath, file));
const checkGlob = (pattern) => {
  try {
    const result = execSync(`find ${repoPath} -name "${pattern}" -type f 2>/dev/null | head -1`, { encoding: 'utf8' });
    return result.trim().length > 0;
  } catch { return false; }
};

// Helper to add tech only once
const addTech = (name, type) => {
  if (!foundTech.has(name)) {
    foundTech.add(name);
    techStack.push({ name, type });
  }
};

// Helper to scan a package.json for dependencies
const scanPackageJson = (pkgPath) => {
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (deps.react) addTech('React', 'frontend');
    if (deps.vue) addTech('Vue.js', 'frontend');
    if (deps.svelte) addTech('Svelte', 'frontend');
    if (deps.next) addTech('Next.js', 'framework');
    if (deps.nuxt) addTech('Nuxt', 'framework');
    if (deps.astro) addTech('Astro', 'framework');
    if (deps.express) addTech('Express', 'backend');
    if (deps.fastify) addTech('Fastify', 'backend');
    if (deps.prisma) addTech('Prisma', 'database');
    if (deps.mongoose) addTech('MongoDB', 'database');
    if (deps.typescript) addTech('TypeScript', 'language');
    if (deps.tailwindcss) addTech('Tailwind CSS', 'styling');
    if (deps.stripe) addTech('Stripe', 'payments');
    if (deps['node-appwrite'] || deps.appwrite) addTech('Appwrite', 'backend');
    if (deps.firebase) addTech('Firebase', 'backend');
    if (deps.supabase || deps['@supabase/supabase-js']) addTech('Supabase', 'backend');
    if (deps.pinia) addTech('Pinia', 'state');
    if (deps.zod) addTech('Zod', 'validation');
    if (deps['@tanstack/vue-query'] || deps['@tanstack/react-query']) addTech('TanStack Query', 'data');
  } catch (e) {}
};

// Check root package.json
if (checkFile('package.json')) {
  scanPackageJson(path.join(repoPath, 'package.json'));
}

// Also check common subdirectory package.json files (for monorepos)
const subDirs = ['website', 'app', 'frontend', 'backend', 'web', 'client', 'server', 'packages/web', 'packages/app'];
subDirs.forEach(subDir => {
  const pkgPath = path.join(repoPath, subDir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    scanPackageJson(pkgPath);
  }
});

// Check for Python
if (checkFile('requirements.txt') || checkFile('pyproject.toml')) addTech('Python', 'language');
try {
  const pyFiles = execSync(`find ${repoPath} -name "requirements.txt" -type f 2>/dev/null | grep -v node_modules | head -3`, { encoding: 'utf8' });
  if (pyFiles.trim()) addTech('Python', 'language');
} catch (e) {}

// Check for other languages
if (checkFile('Cargo.toml')) addTech('Rust', 'language');
if (checkFile('go.mod')) addTech('Go', 'language');

// Check for DevOps
if (checkFile('Dockerfile')) addTech('Docker', 'devops');
try {
  const dockerFiles = execSync(`find ${repoPath} -name "Dockerfile" -type f 2>/dev/null | grep -v node_modules | head -1`, { encoding: 'utf8' });
  if (dockerFiles.trim()) addTech('Docker', 'devops');
} catch (e) {}

if (checkFile('.github/workflows')) addTech('GitHub Actions', 'ci');
if (checkFile('.gitlab-ci.yml')) addTech('GitLab CI', 'ci');

// Check for Flutter/Dart
if (checkFile('pubspec.yaml')) addTech('Flutter', 'mobile');
try {
  const flutterFiles = execSync(`find ${repoPath} -name "pubspec.yaml" -type f 2>/dev/null | head -1`, { encoding: 'utf8' });
  if (flutterFiles.trim()) addTech('Flutter', 'mobile');
} catch (e) {}

// ============ README PARSING ============
console.log('  📖 Extracting project description...');
let projectDescription = '';
let projectTitle = repoName;

const readmePaths = ['README.md', 'readme.md', 'README.MD', 'Readme.md'];
for (const readmePath of readmePaths) {
  if (checkFile(readmePath)) {
    const readme = fs.readFileSync(path.join(repoPath, readmePath), 'utf8');

    // Extract first heading (clean it up)
    const titleMatch = readme.match(/^#\s+(.+)$/m);
    if (titleMatch) {
      projectTitle = titleMatch[1]
        .replace(/\[!\[.*?\]\(.*?\)\]\(.*?\)/g, '') // Remove badge links
        .replace(/!\[.*?\]\(.*?\)/g, '') // Remove images
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Convert links to text
        .replace(/[^\w\s-]/g, '')
        .trim();
    }

    // Find actual description paragraph (skip badges, empty lines, links-only lines)
    const lines = readme.split('\n');
    let foundHeading = false;
    for (const line of lines) {
      if (line.startsWith('#')) {
        foundHeading = true;
        continue;
      }
      if (!foundHeading) continue;

      // Skip empty lines, badge lines, link-only lines
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (trimmed.startsWith('[![')) continue; // Badge
      if (trimmed.startsWith('![')) continue; // Image
      if (trimmed.match(/^\[.*\]\(.*\)$/)) continue; // Link-only line
      if (trimmed.startsWith('|')) continue; // Table
      if (trimmed.startsWith('-') && trimmed.length < 5) continue; // Separator
      if (trimmed.startsWith('```')) continue; // Code block

      // Found a real paragraph
      projectDescription = trimmed
        .replace(/\*\*/g, '') // Remove bold
        .replace(/\*/g, '') // Remove italic
        .replace(/`/g, '') // Remove inline code
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Convert links to text
        .slice(0, 500);
      break;
    }
    break;
  }
}

// ============ CODEBASE STRUCTURE ANALYSIS ============
console.log('  🗂️  Analyzing codebase structure...');

// Detect primary language
let primaryLanguage = 'unknown';
if (checkFile('package.json')) primaryLanguage = 'javascript';
if (checkFile('pyproject.toml') || checkFile('setup.py') || checkFile('requirements.txt')) primaryLanguage = 'python';
if (checkFile('Cargo.toml')) primaryLanguage = 'rust';
if (checkFile('go.mod')) primaryLanguage = 'go';
if (checkFile('pubspec.yaml')) primaryLanguage = 'dart';

// Find API endpoints / routes (language-agnostic)
let apiEndpoints = [];
try {
  // JavaScript/TypeScript API routes
  const jsApiFiles = execSync(`find ${repoPath} -type f \\( -name "*.ts" -o -name "*.js" \\) -path "*/api/*" 2>/dev/null | grep -v node_modules | grep -v ".d.ts" | head -20`, { encoding: 'utf8' });
  jsApiFiles.split('\n').filter(f => f.trim()).forEach(f => {
    const relative = path.relative(repoPath, f);
    const match = relative.match(/api\/(.+?)\.(ts|js)$/);
    if (match) apiEndpoints.push({ path: relative, name: match[1], type: 'file' });
  });

  // Python FastAPI/Flask routes
  const pyRoutes = execSync(`grep -r -n -E "@(app|router)\\.(get|post|put|delete|patch|route)\\(|@api_view" ${repoPath} 2>/dev/null | grep -v node_modules | grep "\\.py:" | head -30`, { encoding: 'utf8' });
  pyRoutes.split('\n').filter(l => l.trim()).forEach(line => {
    const match = line.match(/^(.+?\.py):(\d+):.+["']([^"']+)["']/);
    if (match) apiEndpoints.push({ path: path.relative(repoPath, match[1]), name: match[3], type: 'route', line: match[2] });
  });

  // Rust Actix/Axum routes
  const rsRoutes = execSync(`grep -r -n -E "#\\[(get|post|put|delete|patch)\\(|web::(get|post|resource)" ${repoPath} 2>/dev/null | grep "\\.rs:" | head -20`, { encoding: 'utf8' });
  rsRoutes.split('\n').filter(l => l.trim()).forEach(line => {
    const match = line.match(/^(.+?\.rs):(\d+):.+["']([^"']+)["']/);
    if (match) apiEndpoints.push({ path: path.relative(repoPath, match[1]), name: match[3], type: 'route', line: match[2] });
  });

  // Go Gin/Echo routes
  const goRoutes = execSync(`grep -r -n -E "\\.(GET|POST|PUT|DELETE|PATCH)\\(" ${repoPath} 2>/dev/null | grep "\\.go:" | head -20`, { encoding: 'utf8' });
  goRoutes.split('\n').filter(l => l.trim()).forEach(line => {
    const match = line.match(/^(.+?\.go):(\d+):.+["']([^"']+)["']/);
    if (match) apiEndpoints.push({ path: path.relative(repoPath, match[1]), name: match[3], type: 'route', line: match[2] });
  });
} catch (e) {}
apiEndpoints = apiEndpoints.slice(0, 25);

// Find database/schema files
let dbSchemas = [];
try {
  const schemaFiles = execSync(`find ${repoPath} -type f \\( -name "*.prisma" -o -name "*schema*" -o -name "*model*" -o -name "*collection*" \\) 2>/dev/null | grep -v node_modules | head -20`, { encoding: 'utf8' });
  dbSchemas = schemaFiles.split('\n').filter(f => f.trim()).map(f => path.relative(repoPath, f));
} catch (e) {}

// Find main pages/routes/entry points
let pages = [];
try {
  // Web pages (Astro, Vue, React, Svelte)
  const pageFiles = execSync(`find ${repoPath} -type f \\( -name "*.astro" -o -name "*.vue" -o -name "*.tsx" -o -name "*.svelte" \\) -path "*/pages/*" 2>/dev/null | grep -v node_modules | head -20`, { encoding: 'utf8' });
  pageFiles.split('\n').filter(f => f.trim()).forEach(f => {
    const relative = path.relative(repoPath, f);
    const name = path.basename(f, path.extname(f));
    pages.push({ path: relative, name: name === 'index' ? '/' : `/${name}`, type: 'page' });
  });

  // Entry points (main.py, main.rs, main.go, cli.py, __main__.py, etc.)
  const entryPoints = execSync(`find ${repoPath} -type f \\( -name "main.py" -o -name "main.rs" -o -name "main.go" -o -name "cli.py" -o -name "__main__.py" -o -name "app.py" -o -name "index.ts" -o -name "index.js" -o -name "mod.rs" \\) 2>/dev/null | grep -v node_modules | grep -v test | head -15`, { encoding: 'utf8' });
  entryPoints.split('\n').filter(f => f.trim()).forEach(f => {
    const relative = path.relative(repoPath, f);
    pages.push({ path: relative, name: path.basename(f), type: 'entry' });
  });
} catch (e) {}

// Find modules/packages (language-agnostic)
let modules = [];
try {
  // Python packages (directories with __init__.py)
  const pyPackages = execSync(`find ${repoPath} -name "__init__.py" -type f 2>/dev/null | grep -v node_modules | grep -v ".venv" | grep -v test | head -30`, { encoding: 'utf8' });
  pyPackages.split('\n').filter(f => f.trim()).forEach(f => {
    const dir = path.dirname(f);
    const name = path.basename(dir);
    if (name && name !== '__pycache__' && !name.startsWith('.')) {
      modules.push({ name, path: path.relative(repoPath, dir), type: 'python-package' });
    }
  });

  // Rust modules (mod.rs or lib.rs directories)
  const rsModules = execSync(`find ${repoPath} -type f \\( -name "mod.rs" -o -name "lib.rs" \\) 2>/dev/null | grep -v target | head -20`, { encoding: 'utf8' });
  rsModules.split('\n').filter(f => f.trim()).forEach(f => {
    const dir = path.dirname(f);
    const name = path.basename(dir);
    if (name && name !== 'src') modules.push({ name, path: path.relative(repoPath, dir), type: 'rust-module' });
  });

  // Go packages
  const goPackages = execSync(`find ${repoPath} -name "*.go" -type f 2>/dev/null | grep -v vendor | xargs -I{} dirname {} 2>/dev/null | sort -u | head -20`, { encoding: 'utf8' });
  goPackages.split('\n').filter(f => f.trim()).forEach(f => {
    const name = path.basename(f);
    if (name && !name.startsWith('.')) modules.push({ name, path: path.relative(repoPath, f), type: 'go-package' });
  });
} catch (e) {}
// Dedupe modules by name
modules = [...new Map(modules.map(m => [m.name, m])).values()].slice(0, 20);

// Find components/classes/structs (language-agnostic)
let components = [];
try {
  // Vue/React/Svelte components
  const compFiles = execSync(`find ${repoPath} -type f \\( -name "*.vue" -o -name "*.tsx" -o -name "*.svelte" \\) -path "*/components/*" 2>/dev/null | grep -v node_modules | head -50`, { encoding: 'utf8' });
  const compList = compFiles.split('\n').filter(f => f.trim());
  const skipFolders = ['vue', 'react', 'svelte', 'angular', 'src', 'lib'];
  const folders = {};
  compList.forEach(f => {
    const relative = path.relative(repoPath, f);
    const parts = relative.split('/');
    const compIdx = parts.indexOf('components');
    if (compIdx >= 0) {
      let folder = null;
      for (let i = compIdx + 1; i < parts.length - 1; i++) {
        if (!skipFolders.includes(parts[i].toLowerCase())) { folder = parts[i]; break; }
      }
      if (!folder) folder = path.basename(f, path.extname(f));
      folders[folder] = (folders[folder] || 0) + 1;
    }
  });
  Object.entries(folders).forEach(([name, count]) => components.push({ name, count, type: 'component' }));

  // Python classes
  const pyClasses = execSync(`grep -r -h "^class " ${repoPath} 2>/dev/null | grep -v node_modules | grep -v ".venv" | grep -v test | head -40`, { encoding: 'utf8' });
  const classNames = {};
  pyClasses.split('\n').filter(l => l.trim()).forEach(line => {
    const match = line.match(/^class\s+(\w+)/);
    if (match && match[1] !== 'Meta') classNames[match[1]] = (classNames[match[1]] || 0) + 1;
  });
  Object.entries(classNames).slice(0, 15).forEach(([name, count]) => components.push({ name, count, type: 'class' }));

  // Rust structs/enums
  const rsStructs = execSync(`grep -r -h "^pub struct\\|^pub enum\\|^struct\\|^enum" ${repoPath} 2>/dev/null | grep -v target | head -40`, { encoding: 'utf8' });
  const structNames = {};
  rsStructs.split('\n').filter(l => l.trim()).forEach(line => {
    const match = line.match(/(?:pub\s+)?(?:struct|enum)\s+(\w+)/);
    if (match) structNames[match[1]] = (structNames[match[1]] || 0) + 1;
  });
  Object.entries(structNames).slice(0, 15).forEach(([name, count]) => components.push({ name, count, type: 'struct' }));
} catch (e) {}
components = components.sort((a, b) => b.count - a.count).slice(0, 20);

// Find serverless functions AND key functions/methods
let functions = [];
try {
  // Serverless function directories
  const funcDirs = execSync(`find ${repoPath} -type d -name "functions" 2>/dev/null | head -5`, { encoding: 'utf8' });
  funcDirs.split('\n').filter(d => d.trim()).forEach(funcDir => {
    try {
      const subDirs = fs.readdirSync(funcDir, { withFileTypes: true });
      subDirs.forEach(d => {
        if (d.isDirectory() && !d.name.startsWith('.')) {
          let runtime = 'unknown';
          const funcPath = path.join(funcDir, d.name);
          if (fs.existsSync(path.join(funcPath, 'package.json'))) runtime = 'Node.js';
          else if (fs.existsSync(path.join(funcPath, 'requirements.txt'))) runtime = 'Python';
          else if (fs.existsSync(path.join(funcPath, 'Cargo.toml'))) runtime = 'Rust';
          else if (fs.existsSync(path.join(funcPath, 'go.mod'))) runtime = 'Go';
          functions.push({ name: d.name, runtime, type: 'serverless' });
        }
      });
    } catch (e) {}
  });

  // Python functions (def statements in main modules)
  const pyFuncs = execSync(`grep -r -h "^def \\|^async def " ${repoPath} 2>/dev/null | grep -v node_modules | grep -v ".venv" | grep -v test | grep -v "def __" | head -50`, { encoding: 'utf8' });
  const pyFuncNames = {};
  pyFuncs.split('\n').filter(l => l.trim()).forEach(line => {
    const match = line.match(/^(?:async )?def\s+(\w+)/);
    if (match && !match[1].startsWith('_')) pyFuncNames[match[1]] = (pyFuncNames[match[1]] || 0) + 1;
  });
  Object.entries(pyFuncNames).sort((a, b) => b[1] - a[1]).slice(0, 15).forEach(([name, count]) => {
    functions.push({ name, runtime: 'Python', type: 'function', count });
  });

  // Rust functions
  const rsFuncs = execSync(`grep -r -h "^pub fn\\|^pub async fn\\|^fn " ${repoPath} 2>/dev/null | grep -v target | grep -v test | head -50`, { encoding: 'utf8' });
  const rsFuncNames = {};
  rsFuncs.split('\n').filter(l => l.trim()).forEach(line => {
    const match = line.match(/(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/);
    if (match && !match[1].startsWith('_')) rsFuncNames[match[1]] = (rsFuncNames[match[1]] || 0) + 1;
  });
  Object.entries(rsFuncNames).sort((a, b) => b[1] - a[1]).slice(0, 15).forEach(([name, count]) => {
    functions.push({ name, runtime: 'Rust', type: 'function', count });
  });

  // Go functions
  const goFuncs = execSync(`grep -r -h "^func " ${repoPath} 2>/dev/null | grep -v vendor | grep -v test | head -50`, { encoding: 'utf8' });
  const goFuncNames = {};
  goFuncs.split('\n').filter(l => l.trim()).forEach(line => {
    const match = line.match(/^func\s+(?:\([^)]+\)\s+)?(\w+)/);
    if (match) goFuncNames[match[1]] = (goFuncNames[match[1]] || 0) + 1;
  });
  Object.entries(goFuncNames).sort((a, b) => b[1] - a[1]).slice(0, 15).forEach(([name, count]) => {
    functions.push({ name, runtime: 'Go', type: 'function', count });
  });

  // TypeScript/JavaScript exported functions
  const jsFuncs = execSync(`grep -r -h "^export function\\|^export async function\\|^export const .* = " ${repoPath} 2>/dev/null | grep -v node_modules | grep -v dist | head -50`, { encoding: 'utf8' });
  const jsFuncNames = {};
  jsFuncs.split('\n').filter(l => l.trim()).forEach(line => {
    const match = line.match(/export\s+(?:async\s+)?(?:function|const)\s+(\w+)/);
    if (match) jsFuncNames[match[1]] = (jsFuncNames[match[1]] || 0) + 1;
  });
  Object.entries(jsFuncNames).sort((a, b) => b[1] - a[1]).slice(0, 15).forEach(([name, count]) => {
    functions.push({ name, runtime: 'Node.js', type: 'function', count });
  });
} catch (e) {}
functions = functions.slice(0, 30);

// Find environment variables used
let envVars = [];
try {
  const envFiles = execSync(`find ${repoPath} -name ".env.example" -o -name ".env.sample" -o -name "env.ts" 2>/dev/null | grep -v node_modules | head -3`, { encoding: 'utf8' });
  envFiles.split('\n').filter(f => f.trim()).forEach(envFile => {
    try {
      const content = fs.readFileSync(envFile, 'utf8');
      const matches = content.match(/^[A-Z][A-Z0-9_]+(?==)/gm) || [];
      envVars = [...new Set([...envVars, ...matches])].slice(0, 20);
    } catch (e) {}
  });
} catch (e) {}

// ============ DEAD CODE DETECTION ============
console.log('  💀 Detecting potentially dead code (tech debt)...');
let deadCode = { unusedComponents: [], unusedFiles: [], unusedExports: [] };

// Find Vue/React components that are never imported (optimized)
try {
  console.log('    - Scanning for unused components...');

  // Get all component files
  const componentFiles = execSync(
    `find ${repoPath} -type f -name "*.vue" -path "*/components/*" 2>/dev/null | grep -v node_modules | grep -v dist | head -100`,
    { encoding: 'utf8' }
  ).split('\n').filter(f => f.trim());

  // Build index of all component usages (one grep call)
  let allUsages = '';
  try {
    allUsages = execSync(
      `grep -r -h -E "(import.*from|<[A-Z])" ${repoPath} 2>/dev/null | grep -v node_modules | head -1000`,
      { encoding: 'utf8' }
    );
  } catch (e) {}

  const unusedComponents = [];
  componentFiles.forEach(f => {
    const relative = path.relative(repoPath, f);
    const filename = path.basename(f);
    const componentName = path.basename(f, path.extname(f));

    // Skip index, layouts, pages
    if (componentName.toLowerCase() === 'index') return;
    if (relative.includes('/pages/')) return;
    if (relative.includes('/layouts/')) return;

    // Quick check: is component name anywhere in usages?
    const kebabName = componentName.replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, '');

    if (!allUsages.includes(componentName) && !allUsages.includes(kebabName)) {
      unusedComponents.push({
        path: relative,
        file: filename,
        component: componentName
      });
    }
  });
  deadCode.unusedComponents = unusedComponents.slice(0, 25);
} catch (e) {}

// Find TypeScript/JS files with exports that might not be used (optimized - check whole files, not individual exports)
try {
  console.log('    - Scanning for unused exports...');

  // Only scan files in specific directories, limit scope
  const tsFiles = execSync(
    `find ${repoPath} -type f -name "*.ts" -path "*/src/*" 2>/dev/null | grep -v node_modules | grep -v dist | grep -v ".d.ts" | grep -v ".test." | grep -v ".spec." | grep -v "/pages/" | grep -v "/api/" | head -50`,
    { encoding: 'utf8' }
  ).split('\n').filter(f => f.trim());

  const unusedExports = [];

  // Build a quick index of all imports in the codebase (one grep call)
  let allImports = '';
  try {
    allImports = execSync(
      `grep -r -h "^import\\|from ['\"]" ${repoPath} 2>/dev/null | grep -v node_modules | head -500`,
      { encoding: 'utf8' }
    );
  } catch (e) {}

  tsFiles.slice(0, 30).forEach(f => {
    const relative = path.relative(repoPath, f);
    const filename = path.basename(f);
    const basename = path.basename(f, path.extname(f));

    // Skip common entry points
    if (['index', 'main', 'app', 'server', 'cli', 'config', 'env', 'types', 'constants'].includes(basename.toLowerCase())) return;

    try {
      const content = fs.readFileSync(f, 'utf8');
      const exportMatches = content.match(/export\s+(const|function|class)\s+(\w+)/g) || [];

      exportMatches.slice(0, 5).forEach(exp => {
        const match = exp.match(/export\s+(?:const|function|class)\s+(\w+)/);
        if (match) {
          const exportName = match[1];
          if (exportName.startsWith('use')) return; // composables
          if (exportName.length < 4) return; // too short

          // Quick check against our import index
          if (!allImports.includes(exportName) && !allImports.includes(basename)) {
            unusedExports.push({ path: relative, file: filename, export: exportName });
          }
        }
      });
    } catch (e) {}
  });

  deadCode.unusedExports = unusedExports.slice(0, 20);
} catch (e) {}

// Find files that are never imported anywhere (orphaned modules) - optimized
try {
  console.log('    - Scanning for orphaned files...');

  // Get source files (limited scope)
  const srcFiles = execSync(
    `find ${repoPath} -type f \\( -name "*.ts" -o -name "*.js" \\) -path "*/src/*" 2>/dev/null | grep -v node_modules | grep -v dist | grep -v ".d.ts" | grep -v ".test." | grep -v "/pages/" | grep -v "/api/" | head -80`,
    { encoding: 'utf8' }
  ).split('\n').filter(f => f.trim());

  // Build index of all imports (reuse if already built, or make one call)
  let allRefs = '';
  try {
    allRefs = execSync(
      `grep -r -h -E "(from ['\"]|import |require\\()" ${repoPath} 2>/dev/null | grep -v node_modules | head -800`,
      { encoding: 'utf8' }
    );
  } catch (e) {}

  const orphaned = [];
  srcFiles.forEach(f => {
    const relative = path.relative(repoPath, f);
    const basename = path.basename(f, path.extname(f));
    const filename = path.basename(f);

    // Skip entry points
    if (['index', 'main', 'app', 'server', 'env', 'config', 'types', 'utils'].includes(basename.toLowerCase())) return;
    if (basename.startsWith('_')) return;

    // Quick check against our refs index
    if (!allRefs.includes(basename)) {
      orphaned.push({ path: relative, file: filename });
    }
  });
  deadCode.unusedFiles = orphaned.slice(0, 20);
} catch (e) {}

// ============ SECURITY & COMPLIANCE SCANNING ============
console.log('  🔒 Scanning for security vulnerabilities...');
const security = { vulnerabilities: [], warnings: [] };

// Check for hardcoded secrets
try {
  const secretPatterns = [
    { pattern: 'api[_-]?key\\s*[=:]\\s*["\'][^"\']{20,}', name: 'Hardcoded API Key' },
    { pattern: 'secret[_-]?key\\s*[=:]\\s*["\'][^"\']{20,}', name: 'Hardcoded Secret' },
    { pattern: 'password\\s*[=:]\\s*["\'][^"\']{6,}', name: 'Hardcoded Password' },
    { pattern: 'private[_-]?key\\s*[=:]\\s*["\']', name: 'Hardcoded Private Key' },
    { pattern: 'Bearer\\s+[A-Za-z0-9\\-_]{20,}', name: 'Hardcoded Bearer Token' },
  ];

  secretPatterns.forEach(({ pattern, name }) => {
    try {
      const matches = execSync(
        `grep -r -l -E "${pattern}" ${repoPath} 2>/dev/null | grep -v node_modules | grep -v ".env" | grep -v dist | head -3`,
        { encoding: 'utf8' }
      ).trim();
      if (matches) {
        matches.split('\n').forEach(file => {
          if (file) security.vulnerabilities.push({ type: 'secret', severity: 'critical', name, file: path.relative(repoPath, file) });
        });
      }
    } catch (e) {}
  });
} catch (e) {}

// Check for injection vulnerabilities
try {
  const injectionPatterns = [
    { pattern: '\\$\\{.*req\\.(body|query|params)', name: 'Potential SQL/NoSQL Injection', severity: 'high' },
    { pattern: 'eval\\s*\\(', name: 'Eval Usage (Code Injection Risk)', severity: 'high' },
    { pattern: 'innerHTML\\s*=', name: 'innerHTML Assignment (XSS Risk)', severity: 'medium' },
    { pattern: 'dangerouslySetInnerHTML', name: 'Dangerous HTML Injection', severity: 'medium' },
    { pattern: 'v-html\\s*=', name: 'Vue v-html (XSS Risk)', severity: 'medium' },
  ];

  injectionPatterns.forEach(({ pattern, name, severity }) => {
    try {
      const matches = execSync(
        `grep -r -l -E "${pattern}" ${repoPath} 2>/dev/null | grep -v node_modules | grep -v dist | head -3`,
        { encoding: 'utf8' }
      ).trim();
      if (matches) {
        matches.split('\n').forEach(file => {
          if (file) security.vulnerabilities.push({ type: 'injection', severity, name, file: path.relative(repoPath, file) });
        });
      }
    } catch (e) {}
  });
} catch (e) {}

// Check for exposed sensitive files
try {
  const sensitiveFiles = ['.env', '.env.local', '.env.production', 'credentials.json', 'serviceAccount.json', 'private.key'];
  sensitiveFiles.forEach(file => {
    try {
      const found = execSync(`find ${repoPath} -name "${file}" -type f 2>/dev/null | grep -v node_modules | head -1`, { encoding: 'utf8' }).trim();
      if (found) {
        // Check if it's gitignored
        const gitignored = git(`check-ignore "${path.relative(repoPath, found)}"`);
        if (!gitignored) {
          security.warnings.push({ type: 'exposure', name: `${file} may be committed to repo`, file: path.relative(repoPath, found) });
        }
      }
    } catch (e) {}
  });
} catch (e) {}

// ============ NCOSE COMPLIANCE SCANNING (Optimized) ============
console.log('  📋 Checking NCOSE compliance indicators...');
const compliance = {
  ageVerification: { found: false, files: [], notes: [] },
  contentModeration: { found: false, files: [], notes: [] },
  identityVerification: { found: false, files: [], notes: [] },
  reportingMechanism: { found: false, files: [], notes: [] },
  recordKeeping: { found: false, files: [], notes: [] },
  userSafety: { found: false, files: [], notes: [] },
  paymentCompliance: { found: false, files: [], notes: [] }
};

// Single grep to find all compliance-related content (much faster)
try {
  const allComplianceMatches = execSync(
    `grep -r -i -l -E "(ageverif|verifyage|sumsub|onfido|birthdate|kyc|moderat|nsfw|reportuser|reportcontent|blockuser|2257|stripe.*connect|payout|chargeback|2fa|otp|mfa)" ${repoPath} 2>/dev/null | grep -v node_modules | grep -v dist | grep -v ".git" | head -100`,
    { encoding: 'utf8', timeout: 15000 }
  ).trim();

  if (allComplianceMatches) {
    const files = allComplianceMatches.split('\n').filter(f => f.trim());

    files.forEach(file => {
      const relFile = path.relative(repoPath, file);
      const lowerFile = file.toLowerCase();
      const lowerRelFile = relFile.toLowerCase();

      // Age verification
      if (lowerFile.includes('age') || lowerFile.includes('sumsub') || lowerFile.includes('onfido') || lowerFile.includes('birth')) {
        compliance.ageVerification.found = true;
        if (!compliance.ageVerification.files.includes(relFile)) compliance.ageVerification.files.push(relFile);
      }

      // Content moderation
      if (lowerFile.includes('moderat') || lowerFile.includes('nsfw') || lowerFile.includes('safety')) {
        compliance.contentModeration.found = true;
        if (!compliance.contentModeration.files.includes(relFile)) compliance.contentModeration.files.push(relFile);
      }

      // Identity verification
      if (lowerFile.includes('kyc') || lowerFile.includes('identity') || lowerFile.includes('verif')) {
        compliance.identityVerification.found = true;
        if (!compliance.identityVerification.files.includes(relFile)) compliance.identityVerification.files.push(relFile);
      }

      // Reporting
      if (lowerFile.includes('report') || lowerFile.includes('flag') || lowerFile.includes('abuse')) {
        compliance.reportingMechanism.found = true;
        if (!compliance.reportingMechanism.files.includes(relFile)) compliance.reportingMechanism.files.push(relFile);
      }

      // Record keeping
      if (lowerFile.includes('2257') || lowerFile.includes('record')) {
        compliance.recordKeeping.found = true;
        if (!compliance.recordKeeping.files.includes(relFile)) compliance.recordKeeping.files.push(relFile);
      }

      // User safety
      if (lowerFile.includes('block') || lowerFile.includes('mute') || lowerFile.includes('2fa') || lowerFile.includes('otp') || lowerFile.includes('security')) {
        compliance.userSafety.found = true;
        if (!compliance.userSafety.files.includes(relFile)) compliance.userSafety.files.push(relFile);
      }

      // Payment
      if (lowerFile.includes('stripe') || lowerFile.includes('payout') || lowerFile.includes('payment') || lowerFile.includes('chargeback')) {
        compliance.paymentCompliance.found = true;
        if (!compliance.paymentCompliance.files.includes(relFile)) compliance.paymentCompliance.files.push(relFile);
      }
    });
  }

  // Add notes for specific integrations
  if (compliance.ageVerification.files.some(f => f.toLowerCase().includes('sumsub'))) {
    compliance.ageVerification.notes.push('SumSub integration detected (industry-standard KYC)');
  }
} catch (e) {}

// Limit file lists
Object.keys(compliance).forEach(key => {
  compliance[key].files = compliance[key].files.slice(0, 8);
});

// ============ OPEN ISSUES (if gh cli available) ============
console.log('  🐛 Checking for open issues...');
let openIssues = [];
try {
  const issuesRaw = execSync('gh issue list --limit 10 --json number,title 2>/dev/null', { cwd: repoPath, encoding: 'utf8' });
  openIssues = JSON.parse(issuesRaw);
} catch (e) {
  // gh cli not available or not in a gh repo
}

// ============ ARCHITECTURE FLOW DATA ============
console.log('  🔀 Building architecture flow...');
const flowData = {
  layers: []
};

// Build layers based on what we found
if (pages.length > 0) {
  flowData.layers.push({
    name: 'Pages',
    type: 'pages',
    color: '#8b5cf6',
    items: pages.slice(0, 8).map(p => ({ name: p.name, path: p.path }))
  });
}

if (components.length > 0) {
  flowData.layers.push({
    name: 'Components',
    type: 'components',
    color: '#06b6d4',
    items: components.slice(0, 8).map(c => ({ name: c.name, count: c.count }))
  });
}

if (apiEndpoints.length > 0) {
  flowData.layers.push({
    name: 'API Routes',
    type: 'api',
    color: '#22c55e',
    items: apiEndpoints.slice(0, 8).map(e => ({ name: e.name }))
  });
}

if (functions.length > 0) {
  flowData.layers.push({
    name: 'Functions',
    type: 'functions',
    color: '#f97316',
    items: functions.slice(0, 8).map(f => ({ name: f.name, runtime: f.runtime }))
  });
}

// Add backend services from tech stack
const backendTech = techStack.filter(t => ['backend', 'database'].includes(t.type));
if (backendTech.length > 0) {
  flowData.layers.push({
    name: 'Services',
    type: 'services',
    color: '#ec4899',
    items: backendTech.map(t => ({ name: t.name }))
  });
}

// ============ GENERATE INTELLIGENT PROJECT SUMMARY ============
console.log('  🧠 Generating project summary...');

let generatedSummary = '';
try {
  const langName = primaryLanguage === 'python' ? 'Python' :
                   primaryLanguage === 'rust' ? 'Rust' :
                   primaryLanguage === 'go' ? 'Go' :
                   primaryLanguage === 'javascript' ? 'JavaScript/TypeScript' :
                   primaryLanguage === 'dart' ? 'Flutter/Dart' : 'mixed';

  // Determine project type based on detected patterns
  const projectTypes = [];

  // CLI tool detection
  if (pages.some(p => p.name.includes('cli') || p.name.includes('main'))) {
    if (functions.some(f => f.name === 'main' || f.name.includes('cli'))) {
      projectTypes.push('command-line tool');
    }
  }

  // Web API detection
  if (apiEndpoints.length > 0) {
    projectTypes.push('web API');
  }

  // Web app detection
  if (pages.some(p => p.type === 'page') || components.some(c => c.type === 'component')) {
    projectTypes.push('web application');
  }

  // Library detection
  if (modules.length > 3 && projectTypes.length === 0) {
    projectTypes.push('library/framework');
  }

  // Build summary parts
  const parts = [];

  // What it is
  const typeStr = projectTypes.length > 0 ? projectTypes.join(' and ') : 'software project';
  parts.push(`This is a **${langName} ${typeStr}**`);

  // Tech stack
  if (techStack.length > 0) {
    const keyTech = techStack.slice(0, 5).map(t => t.name).join(', ');
    parts.push(`built with ${keyTech}`);
  }

  // Core modules
  if (modules.length > 0) {
    const coreModules = modules.slice(0, 4).map(m => `\`${m.name}\``).join(', ');
    parts.push(`The codebase is organized into ${modules.length} modules including ${coreModules}`);
  }

  // Key functionality
  if (components.length > 0) {
    const classCount = components.filter(c => c.type === 'class').length;
    const structCount = components.filter(c => c.type === 'struct').length;
    const compCount = components.filter(c => c.type === 'component').length;

    const typeParts = [];
    if (classCount > 0) typeParts.push(`${classCount} classes`);
    if (structCount > 0) typeParts.push(`${structCount} structs`);
    if (compCount > 0) typeParts.push(`${compCount} UI components`);

    if (typeParts.length > 0) {
      parts.push(`It contains ${typeParts.join(', ')}`);
    }
  }

  // Key functions hint
  if (functions.length > 0) {
    const keyFuncs = functions.slice(0, 5).map(f => `\`${f.name}\``).join(', ');
    parts.push(`Key functions include ${keyFuncs}`);
  }

  // Entry points
  if (pages.filter(p => p.type === 'entry').length > 0) {
    const entries = pages.filter(p => p.type === 'entry').map(p => `\`${p.name}\``).join(', ');
    parts.push(`Entry points: ${entries}`);
  }

  // API endpoints
  if (apiEndpoints.length > 0) {
    parts.push(`Exposes ${apiEndpoints.length} API endpoints`);
  }

  generatedSummary = parts.join('. ') + '.';

  // Add README description as context if available
  if (projectDescription && projectDescription.length > 20) {
    generatedSummary += `\n\n**From README:** ${projectDescription}`;
  }
} catch (e) {
  generatedSummary = projectDescription || 'No description available.';
}

// ============ BUILD OUTPUT ============
console.log('  📝 Generating documentation...\n');

const data = {
  repoName,
  projectTitle,
  projectDescription,
  generatedSummary,
  remoteUrl,
  currentBranch,
  firstCommitDate,
  latestCommitDate,
  totalCommits,
  totalFixCommits,
  fixRatio,
  contributors,
  months,
  topFiles,
  categoryStats: categoryStats.filter(c => c.count > 0),
  techStack,
  openIssues,
  // Codebase analysis
  primaryLanguage,
  apiEndpoints,
  dbSchemas,
  pages,
  modules,
  components,
  functions,
  envVars,
  // Analysis
  deadCode,
  flowData,
  security,
  compliance,
  generatedAt: new Date().toISOString()
};

// Gather sample code for AI analysis
let sampleCode = '';
if (aiProvider) {
  const entryFiles = pages.filter(p => p.type === 'entry').slice(0, 3);
  for (const entry of entryFiles) {
    try {
      const fullPath = path.join(repoPath, entry.path);
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, 'utf8');
        sampleCode += `\n--- ${entry.path} ---\n${content.slice(0, 1000)}\n`;
      }
    } catch (e) { /* ignore */ }
  }
}

// AI enhancement (async)
return { data, sampleCode };
}

async function runWithAI() {
  const { data, sampleCode } = runAnalysis();

  // Enhance with AI if enabled
  const enhancedData = await enhanceWithAI(data, sampleCode);

  // Save JSON data
  fs.writeFileSync(path.join(outputDir, 'data.json'), JSON.stringify(enhancedData, null, 2));

  // Generate HTML
  const generateHTML = require('../lib/generateHTML');
  generateHTML(enhancedData, outputDir);

  console.log(`  ✅ Documentation generated in: ${outputDir}`);
  console.log(`  🌐 Run 'npm start' to view at http://localhost:3333\n`);
}

// Run initial analysis
runWithAI().catch(e => {
  console.error(`  ❌ Error: ${e.message}`);
  process.exit(1);
});

// Watch mode
if (watchFlag) {
  const intervalMs = intervalHours * 60 * 60 * 1000;
  console.log(`  👀 Watch mode enabled - will regenerate every ${intervalHours} hour(s)`);
  console.log(`  Press Ctrl+C to stop\n`);

  setInterval(async () => {
    console.log(`\n  ⏰ Auto-refresh triggered at ${new Date().toLocaleTimeString()}\n`);
    try {
      await runWithAI();
    } catch (e) {
      console.error(`  ❌ Error during refresh: ${e.message}`);
    }
  }, intervalMs);
}
