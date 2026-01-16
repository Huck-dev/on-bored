const fs = require('fs');
const path = require('path');

function generateHTML(data, outputDir) {
  const viewerHTML = generateViewer(data);
  fs.writeFileSync(path.join(outputDir, 'index.html'), viewerHTML);

  const healthHTML = generateHealthReport(data);
  fs.writeFileSync(path.join(outputDir, 'health-report.html'), healthHTML);

  const flowHTML = generateFlowDiagram(data);
  fs.writeFileSync(path.join(outputDir, 'flow.html'), flowHTML);

  const securityHTML = generateSecurityCompliance(data);
  fs.writeFileSync(path.join(outputDir, 'security.html'), securityHTML);

  const newDevHTML = generateNewDevFlow(data);
  fs.writeFileSync(path.join(outputDir, 'new-dev.html'), newDevHTML);
}

function generateViewer(data) {
  // Helper to format summary with basic markdown
  function formatSummary(text) {
    if (!text) return '';
    return text
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')  // **bold**
      .replace(/`([^`]+)`/g, '<code style="background:rgba(139,92,246,0.2);padding:2px 6px;border-radius:4px;font-size:13px;">$1</code>')  // `code`
      .replace(/\n\n/g, '</p><p style="margin-top:12px;">')  // paragraphs
      .replace(/\n/g, '<br>');  // line breaks
  }

  // Tech stack table
  const techStackHTML = data.techStack.length > 0
    ? data.techStack.map(t => `<tr><td><strong>${t.name}</strong></td><td style="color:var(--text-muted)">${t.type}</td></tr>`).join('\n')
    : '<tr><td colspan="2" style="color:var(--text-muted)">No tech stack detected</td></tr>';

  // Top files table
  const topFilesHTML = data.topFiles.slice(0, 15).map((f, i) => {
    const rankClass = i < 3 ? 'top' : i < 6 ? 'high' : 'med';
    return `<tr><td><span class="rank-badge ${rankClass}">${i + 1}</span></td><td class="file-path">${f.file}</td><td class="change-count">${f.changes}</td></tr>`;
  }).join('\n');

  // Category bars
  const maxCat = data.categoryStats[0]?.count || 1;
  const categoryBarsHTML = data.categoryStats.slice(0, 8).map((c, i) => {
    const width = Math.round((c.count / maxCat) * 100);
    const colorClass = i < 2 ? 'critical' : i < 4 ? 'high' : i < 6 ? 'medium' : 'low';
    return `<div class="bar-row"><div class="bar-label">${c.name}</div><div class="bar-container"><div class="bar ${colorClass}" style="width: ${width}%;">${c.count}</div></div><div class="bar-count">commits</div></div>`;
  }).join('\n');

  // Contributors with expertise
  const contributorsHTML = data.contributors.slice(0, 10).map(c => {
    const focusBadge = c.focus ? `<span class="focus-badge focus-${c.focus.replace(/\//g, '-')}">${c.focus}</span>` : '';
    return `<tr>
      <td><strong>${c.name}</strong>${focusBadge}</td>
      <td style="color:var(--text-muted)">${c.commits} commits</td>
      <td style="color:var(--text-muted);font-size:12px;">${c.expertise || ''}</td>
    </tr>`;
  }).join('\n');

  // Radar chart helper - generates SVG radar for a contributor
  const categoryColors = {
    frontend: '#3b82f6',
    backend: '#22c55e',
    database: '#f97316',
    auth: '#ec4899',
    devops: '#06b6d4',
    testing: '#8b5cf6',
    docs: '#fbbf24'
  };
  const categoryLabels = ['frontend', 'backend', 'database', 'auth', 'devops', 'testing', 'docs'];

  function generateRadarChart(radarData, size = 120) {
    const cx = size / 2;
    const cy = size / 2;
    const maxR = size / 2 - 15;
    const numAxes = categoryLabels.length;
    const angleStep = (2 * Math.PI) / numAxes;

    // Generate grid circles
    let gridCircles = '';
    [0.25, 0.5, 0.75, 1].forEach(pct => {
      const r = maxR * pct;
      gridCircles += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#3f3f46" stroke-width="0.5"/>`;
    });

    // Generate axis lines and labels
    let axisLines = '';
    let labels = '';
    categoryLabels.forEach((label, i) => {
      const angle = -Math.PI / 2 + i * angleStep;
      const x = cx + maxR * Math.cos(angle);
      const y = cy + maxR * Math.sin(angle);
      axisLines += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#3f3f46" stroke-width="0.5"/>`;

      const labelX = cx + (maxR + 10) * Math.cos(angle);
      const labelY = cy + (maxR + 10) * Math.sin(angle);
      labels += `<text x="${labelX}" y="${labelY}" fill="${categoryColors[label]}" font-size="7" text-anchor="middle" dominant-baseline="middle">${label.slice(0,3)}</text>`;
    });

    // Generate data polygon
    let points = '';
    categoryLabels.forEach((label, i) => {
      const value = (radarData[label] || 0) / 100;
      const angle = -Math.PI / 2 + i * angleStep;
      const r = maxR * Math.max(value, 0.05);
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      points += `${x},${y} `;
    });

    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      ${gridCircles}
      ${axisLines}
      <polygon points="${points.trim()}" fill="rgba(139, 92, 246, 0.3)" stroke="#8b5cf6" stroke-width="1.5"/>
      ${labels}
    </svg>`;
  }

  // Generate radar charts for top contributors
  const radarChartsHTML = data.contributors.slice(0, 6).map(c => {
    const radar = c.radarData ? generateRadarChart(c.radarData) : '';
    return `<div class="radar-card">
      <div class="radar-chart">${radar}</div>
      <div class="radar-name">${c.name.split(' ')[0]}</div>
      <div class="radar-commits">${c.commits} commits</div>
    </div>`;
  }).join('\n');

  // Generate contribution heatmap (stacked bar visualization)
  function generateContributionBar(radarData) {
    if (!radarData) return '';
    const categories = ['frontend', 'backend', 'database', 'auth', 'devops', 'testing', 'docs'];
    let segments = '';
    let offset = 0;
    categories.forEach(cat => {
      const pct = radarData[cat] || 0;
      if (pct > 0) {
        segments += `<div class="heatbar-segment" style="width:${pct}%;background:${categoryColors[cat]}" title="${cat}: ${pct}%"></div>`;
      }
      offset += pct;
    });
    return `<div class="heatbar">${segments}</div>`;
  }

  const heatmapHTML = data.contributors.slice(0, 8).map(c => {
    const bar = generateContributionBar(c.radarData);
    return `<div class="heatmap-row">
      <div class="heatmap-name">${c.name.split(' ')[0]}</div>
      ${bar}
      <div class="heatmap-commits">${c.commits}</div>
    </div>`;
  }).join('\n');

  // API endpoints table
  const apiEndpointsHTML = data.apiEndpoints.length > 0
    ? data.apiEndpoints.map(e => `<tr><td class="file-path">${e.name}</td><td style="color:var(--text-muted);font-size:12px;">${e.path}</td></tr>`).join('\n')
    : '<tr><td colspan="2" style="color:var(--text-muted)">No API endpoints found</td></tr>';

  // Functions table
  const functionsHTML = data.functions.length > 0
    ? data.functions.map(f => `<tr><td><strong>${f.name}</strong></td><td><span class="badge badge-${f.runtime.toLowerCase().replace('.', '')}">${f.runtime}</span></td></tr>`).join('\n')
    : '<tr><td colspan="2" style="color:var(--text-muted)">No serverless functions found</td></tr>';

  // Components/Classes/Structs grouped
  const componentsHTML = data.components.length > 0
    ? data.components.map(c => {
        const typeIcon = c.type === 'class' ? '🐍' : c.type === 'struct' ? '🦀' : '🧩';
        return `<div class="component-tag"><span style="margin-right:4px">${typeIcon}</span><strong>${c.name}</strong> <span style="color:var(--text-muted)">${c.count || ''}</span></div>`;
      }).join('')
    : '<span style="color:var(--text-muted)">No components/classes found</span>';

  // Pages/Entry Points list
  const pagesHTML = data.pages.length > 0
    ? data.pages.slice(0, 15).map(p => {
        const typeIcon = p.type === 'entry' ? '🚀' : '📄';
        return `<div class="page-item"><span style="margin-right:4px">${typeIcon}</span><span class="page-route">${p.name}</span></div>`;
      }).join('')
    : '<span style="color:var(--text-muted)">No pages/entry points found</span>';

  // Modules/Packages
  const modulesHTML = (data.modules || []).length > 0
    ? data.modules.map(m => {
        const typeIcon = m.type === 'python-package' ? '🐍' : m.type === 'rust-module' ? '🦀' : m.type === 'go-package' ? '🐹' : '📦';
        return `<div class="component-tag"><span style="margin-right:4px">${typeIcon}</span><strong>${m.name}</strong></div>`;
      }).join('')
    : '<span style="color:var(--text-muted)">No modules found</span>';

  // Dead code - unused components
  const unusedComponentsHTML = (data.deadCode?.unusedComponents || []).length > 0
    ? data.deadCode.unusedComponents.map(c => `<div class="dead-item component"><span class="dead-icon">🧩</span><span class="file-path">${c.component}</span><span class="dead-path">${c.path}</span></div>`).join('')
    : '<span style="color:var(--text-muted)">All components are in use!</span>';

  // Dead code - unused files
  const unusedFilesHTML = (data.deadCode?.unusedFiles || []).length > 0
    ? data.deadCode.unusedFiles.map(f => `<div class="dead-item file"><span class="dead-icon">📄</span><span class="file-path">${f.file}</span><span class="dead-path">${f.path}</span></div>`).join('')
    : '<span style="color:var(--text-muted)">No orphaned files detected</span>';

  // Dead code - unused exports
  const unusedExportsHTML = (data.deadCode?.unusedExports || []).length > 0
    ? data.deadCode.unusedExports.map(e => `<tr><td class="file-path">${e.export}</td><td style="color:var(--text-muted);font-size:12px">${e.file}</td></tr>`).join('')
    : '<tr><td colspan="2" style="color:var(--text-muted)">No unused exports detected</td></tr>';

  // Monthly chart
  const maxMonth = Math.max(...data.months.map(m => m.total)) || 1;
  const monthlyChartHTML = data.months.map(m => {
    const height = Math.max(20, (m.total / maxMonth) * 140);
    const fixHeight = m.total > 0 ? (m.fixes / m.total) * height : 0;
    return `<div class="month-col">
      <div class="month-bars" style="height: 150px;">
        <div class="month-bar-total" style="height: ${height - fixHeight}px;"></div>
        <div class="month-bar-fix" style="height: ${fixHeight}px;"></div>
      </div>
      <div class="month-label">${m.label}</div>
      <div class="month-value">${m.total}</div>
    </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${data.projectTitle} - on-bored</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        :root {
            --bg: #09090b; --bg-card: #18181b; --bg-hover: #27272a; --border: #3f3f46;
            --text: #fafafa; --text-muted: #a1a1aa; --accent: #8b5cf6; --accent-dim: rgba(139, 92, 246, 0.15);
            --green: #22c55e; --blue: #3b82f6; --orange: #f97316; --red: #ef4444; --cyan: #06b6d4; --pink: #ec4899;
        }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: var(--bg); color: var(--text); line-height: 1.6; }
        .layout { display: grid; grid-template-columns: 240px 1fr; min-height: 100vh; }
        .sidebar { background: var(--bg-card); border-right: 1px solid var(--border); padding: 24px 16px; position: sticky; top: 0; height: 100vh; overflow-y: auto; }
        .logo { font-size: 20px; font-weight: 700; padding: 0 8px; margin-bottom: 4px; }
        .subtitle { font-size: 12px; color: var(--text-muted); padding: 0 8px; margin-bottom: 24px; }
        .nav-section { font-size: 11px; color: var(--text-muted); padding: 16px 8px 8px; text-transform: uppercase; letter-spacing: 0.5px; }
        .nav-item { display: block; width: 100%; text-align: left; padding: 10px 12px; border: none; background: none; color: var(--text-muted); font-size: 14px; cursor: pointer; border-radius: 8px; margin-bottom: 2px; text-decoration: none; transition: all 0.15s; }
        .nav-item:hover { background: var(--bg-hover); color: var(--text); }
        .nav-item.active { background: var(--accent-dim); color: var(--accent); }
        .nav-item.health { color: var(--red); }
        .main { padding: 48px; overflow-y: auto; max-width: 1200px; }
        .section { display: none; } .section.active { display: block; }
        h1 { font-size: 32px; margin-bottom: 8px; font-weight: 700; }
        h2 { font-size: 18px; margin-bottom: 16px; font-weight: 600; }
        .desc { color: var(--text-muted); margin-bottom: 32px; font-size: 15px; max-width: 700px; line-height: 1.7; }
        .card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; margin-bottom: 24px; overflow: hidden; }
        .card-header { padding: 16px 20px; border-bottom: 1px solid var(--border); font-weight: 600; font-size: 14px; }
        .card-body { padding: 20px; }
        .hero-box { background: linear-gradient(135deg, rgba(139,92,246,0.12), rgba(236,72,153,0.08)); border: 1px solid rgba(139,92,246,0.25); border-radius: 16px; padding: 28px; margin-bottom: 32px; }
        .hero-box h2 { color: var(--accent); margin-bottom: 16px; font-size: 20px; }
        .hero-box p { line-height: 1.8; font-size: 15px; }
        .summary-text { line-height: 1.8; font-size: 15px; }
        .summary-text p { margin-top: 12px; }
        .summary-text strong { color: var(--accent); }
        .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 16px; margin-bottom: 32px; }
        .stat { background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; padding: 24px 20px; }
        .stat-num { font-size: 32px; font-weight: 700; color: var(--accent); margin-bottom: 4px; }
        .stat-label { font-size: 13px; color: var(--text-muted); }
        .two-col { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 24px; }
        .three-col { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 24px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 12px 16px; text-align: left; border-bottom: 1px solid var(--border); }
        th { color: var(--text-muted); font-weight: 500; font-size: 12px; text-transform: uppercase; letter-spacing: 0.3px; }
        .bar-chart { display: flex; flex-direction: column; gap: 10px; }
        .bar-row { display: grid; grid-template-columns: 120px 1fr 55px; align-items: center; gap: 12px; }
        .bar-label { font-size: 13px; color: var(--text-muted); text-align: right; }
        .bar-container { height: 24px; background: rgba(255,255,255,0.05); border-radius: 4px; overflow: hidden; }
        .bar { height: 100%; border-radius: 4px; display: flex; align-items: center; justify-content: flex-end; padding-right: 8px; font-size: 11px; font-weight: 600; color: white; min-width: 30px; }
        .bar.critical { background: linear-gradient(90deg, #dc2626, #ef4444); }
        .bar.high { background: linear-gradient(90deg, #ea580c, #f97316); }
        .bar.medium { background: linear-gradient(90deg, #d97706, #fbbf24); }
        .bar.low { background: linear-gradient(90deg, #2563eb, #3b82f6); }
        .bar-count { font-size: 12px; color: var(--text-muted); }
        .rank-badge { display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; border-radius: 50%; font-weight: 700; font-size: 12px; }
        .rank-badge.top { background: var(--red); color: white; }
        .rank-badge.high { background: var(--orange); color: white; }
        .rank-badge.med { background: #fbbf24; color: #1a1a2e; }
        .file-path { font-family: 'SF Mono', Monaco, monospace; font-size: 13px; color: #a5b4fc; }
        .change-count { font-weight: 600; color: var(--text); }
        .badge { display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: 600; }
        .badge-nodejs { background: #22c55e22; color: #22c55e; }
        .badge-python { background: #fbbf2422; color: #fbbf24; }
        .badge-rust { background: #f9731622; color: #f97316; }
        .badge-go { background: #06b6d422; color: #06b6d4; }
        .badge-dart { background: #3b82f622; color: #3b82f6; }
        .badge-unknown { background: #71717a22; color: #71717a; }
        .component-tag { display: inline-block; padding: 6px 12px; background: var(--bg-hover); border-radius: 8px; margin: 4px; font-size: 13px; }
        .page-item { display: inline-block; padding: 6px 14px; background: var(--accent-dim); border-radius: 8px; margin: 4px; font-size: 13px; }
        .page-route { color: var(--accent); font-family: 'SF Mono', Monaco, monospace; }
        .monthly-chart { display: flex; gap: 8px; align-items: flex-end; padding: 16px 0; }
        .month-col { flex: 1; display: flex; flex-direction: column; align-items: center; }
        .month-bars { display: flex; flex-direction: column; justify-content: flex-end; width: 100%; }
        .month-bar-total { background: linear-gradient(180deg, #3b82f6, #1d4ed8); border-radius: 4px 4px 0 0; width: 100%; }
        .month-bar-fix { background: linear-gradient(180deg, #ef4444, #b91c1c); border-radius: 0 0 4px 4px; width: 100%; }
        .month-label { font-size: 12px; color: var(--text-muted); margin-top: 8px; }
        .month-value { font-size: 11px; color: var(--text-muted); }
        .legend { display: flex; justify-content: center; gap: 24px; margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border); }
        .legend-item { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text-muted); }
        .legend-dot { width: 12px; height: 12px; border-radius: 3px; }
        .legend-dot.total { background: #3b82f6; }
        .legend-dot.fixes { background: #ef4444; }
        .dead-item { display: flex; align-items: center; gap: 10px; padding: 12px 16px; background: var(--bg-hover); border: 1px solid var(--border); border-radius: 10px; margin-bottom: 8px; }
        .dead-item.component { border-left: 3px solid #f97316; }
        .dead-item.file { border-left: 3px solid #ef4444; }
        .dead-icon { font-size: 16px; }
        .dead-path { margin-left: auto; font-size: 11px; color: var(--text-muted); max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .nav-item.flow { color: var(--cyan); }
        .nav-item.dead { color: var(--orange); }
        .nav-item.security { color: var(--green); }
        .nav-item.newdev { color: var(--accent); font-weight: 600; }
        .focus-badge { display: inline-block; margin-left: 8px; padding: 2px 8px; border-radius: 10px; font-size: 10px; font-weight: 600; text-transform: uppercase; }
        .focus-frontend { background: #3b82f622; color: #3b82f6; }
        .focus-backend { background: #22c55e22; color: #22c55e; }
        .focus-fullstack { background: #8b5cf622; color: #8b5cf6; }
        .focus-docs { background: #f9731622; color: #f97316; }
        .focus-config-devops { background: #06b6d422; color: #06b6d4; }
        .focus-general { background: #71717a22; color: #71717a; }
        .radar-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 16px; margin-bottom: 20px; }
        .radar-card { background: var(--bg-hover); border: 1px solid var(--border); border-radius: 12px; padding: 16px; text-align: center; }
        .radar-chart { display: flex; justify-content: center; margin-bottom: 8px; }
        .radar-name { font-weight: 600; font-size: 14px; margin-bottom: 2px; }
        .radar-commits { font-size: 12px; color: var(--text-muted); }
        .category-legend { display: flex; flex-wrap: wrap; gap: 16px; justify-content: center; padding-top: 16px; border-top: 1px solid var(--border); }
        .category-legend .legend-item { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-muted); }
        .category-legend .dot { width: 10px; height: 10px; border-radius: 50%; }
        .heatmap-container { display: flex; flex-direction: column; gap: 8px; }
        .heatmap-row { display: grid; grid-template-columns: 100px 1fr 60px; align-items: center; gap: 12px; }
        .heatmap-name { font-size: 13px; font-weight: 500; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .heatbar { display: flex; height: 20px; border-radius: 4px; overflow: hidden; background: var(--bg); }
        .heatbar-segment { height: 100%; min-width: 2px; transition: opacity 0.2s; }
        .heatbar-segment:hover { opacity: 0.8; }
        .heatmap-commits { font-size: 12px; color: var(--text-muted); text-align: right; }
    </style>
</head>
<body>
    <div class="layout">
        <aside class="sidebar">
            <div class="logo">${data.projectTitle.split(' - ')[0]}</div>
            <div class="subtitle">Developer Onboarding</div>
            <div class="nav-section">Overview</div>
            <button class="nav-item active" onclick="nav('overview', this)">Project Info</button>
            <a href="flow.html" class="nav-item flow">Flow Diagram</a>
            <button class="nav-item" onclick="nav('architecture', this)">Architecture</button>
            <div class="nav-section">Codebase</div>
            <button class="nav-item" onclick="nav('api', this)">API Endpoints</button>
            <button class="nav-item" onclick="nav('components', this)">Components</button>
            <button class="nav-item" onclick="nav('functions', this)">Functions</button>
            <div class="nav-section">Health</div>
            <button class="nav-item" onclick="nav('activity', this)">Activity</button>
            <button class="nav-item" onclick="nav('hotspots', this)">Hotspots</button>
            <button class="nav-item dead" onclick="nav('deadcode', this)">Dead Code</button>
            <a href="health-report.html" class="nav-item health">Full Health Report</a>
            <div class="nav-section">Security</div>
            <a href="security.html" class="nav-item security">Security & Compliance</a>
            <div class="nav-section">Team</div>
            <button class="nav-item" onclick="nav('team', this)">Contributors</button>
            <div class="nav-section">Getting Started</div>
            <a href="new-dev.html" class="nav-item newdev">🚀 New Dev Flow</a>
        </aside>

        <main class="main">
            <!-- OVERVIEW -->
            <div id="overview" class="section active">
                <h1>${data.projectTitle}</h1>
                <div class="hero-box">
                    <h2>What is this project?</h2>
                    <div class="summary-text">${formatSummary(data.aiSummary || data.generatedSummary || data.projectDescription || 'No description available.')}</div>
                    ${data.aiKeyThings ? `
                    <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border);">
                      <h3 style="font-size: 14px; color: var(--accent); margin-bottom: 8px;">🎯 Key Things to Understand</h3>
                      <ul style="margin: 0; padding-left: 20px; color: var(--text-muted); font-size: 14px;">
                        ${data.aiKeyThings.map(t => `<li>${t}</li>`).join('')}
                      </ul>
                    </div>` : ''}
                    ${data.aiGotchas ? `
                    <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border);">
                      <h3 style="font-size: 14px; color: var(--orange); margin-bottom: 8px;">⚠️ Watch Out For</h3>
                      <ul style="margin: 0; padding-left: 20px; color: var(--text-muted); font-size: 14px;">
                        ${data.aiGotchas.map(g => `<li>${g}</li>`).join('')}
                      </ul>
                    </div>` : ''}
                </div>

                <div class="stats">
                    <div class="stat"><div class="stat-num">${data.totalCommits}</div><div class="stat-label">Total Commits</div></div>
                    <div class="stat"><div class="stat-num">${data.fixRatio}%</div><div class="stat-label">Fix Ratio</div></div>
                    <div class="stat"><div class="stat-num">${data.contributors.length}</div><div class="stat-label">Contributors</div></div>
                    <div class="stat"><div class="stat-num">${data.apiEndpoints.length}</div><div class="stat-label">API Endpoints</div></div>
                    <div class="stat"><div class="stat-num">${data.functions.length}</div><div class="stat-label">Functions</div></div>
                    <div class="stat"><div class="stat-num">${data.techStack.length}</div><div class="stat-label">Technologies</div></div>
                </div>

                <div class="two-col">
                    <div class="card">
                        <div class="card-header">Tech Stack</div>
                        <div class="card-body" style="padding: 0;"><table>${techStackHTML}</table></div>
                    </div>
                    <div class="card">
                        <div class="card-header">Repository</div>
                        <div class="card-body" style="padding: 0;">
                            <table>
                                <tr><td><strong>Branch</strong></td><td style="color:var(--text-muted)">${data.currentBranch}</td></tr>
                                <tr><td><strong>First Commit</strong></td><td style="color:var(--text-muted)">${data.firstCommitDate ? new Date(data.firstCommitDate).toLocaleDateString() : 'Unknown'}</td></tr>
                                <tr><td><strong>Latest Commit</strong></td><td style="color:var(--text-muted)">${data.latestCommitDate ? new Date(data.latestCommitDate).toLocaleDateString() : 'Unknown'}</td></tr>
                                <tr><td><strong>Total Fixes</strong></td><td style="color:var(--text-muted)">${data.totalFixCommits} commits</td></tr>
                            </table>
                        </div>
                    </div>
                </div>

                <div class="card">
                    <div class="card-header">Commit Categories</div>
                    <div class="card-body"><div class="bar-chart">${categoryBarsHTML || '<p style="color:var(--text-muted)">No categorized commits found</p>'}</div></div>
                </div>
            </div>

            <!-- ARCHITECTURE -->
            <div id="architecture" class="section">
                <h1>Architecture</h1>
                <p class="desc">High-level overview of the codebase structure. Primary language: <strong>${data.primaryLanguage || 'unknown'}</strong></p>

                <div class="two-col">
                    <div class="card">
                        <div class="card-header">📦 Modules / Packages</div>
                        <div class="card-body">
                            <div style="display: flex; flex-wrap: wrap; gap: 4px;">${modulesHTML}</div>
                        </div>
                    </div>
                    <div class="card">
                        <div class="card-header">🚀 Entry Points / Pages</div>
                        <div class="card-body">
                            <div style="display: flex; flex-wrap: wrap; gap: 4px;">${pagesHTML}</div>
                        </div>
                    </div>
                </div>

                <div class="card">
                    <div class="card-header">🧩 Classes / Components / Structs</div>
                    <div class="card-body">
                        <div style="display: flex; flex-wrap: wrap; gap: 4px;">${componentsHTML}</div>
                    </div>
                </div>

                ${data.functions.length > 0 ? `<div class="card">
                    <div class="card-header">⚡ Key Functions</div>
                    <div class="card-body" style="padding: 0;"><table><thead><tr><th>Function</th><th>Runtime</th></tr></thead><tbody>${functionsHTML}</tbody></table></div>
                </div>` : ''}
            </div>

            <!-- API -->
            <div id="api" class="section">
                <h1>API Endpoints</h1>
                <p class="desc">Discovered API routes in the codebase.</p>
                <div class="card">
                    <div class="card-header">Endpoints (${data.apiEndpoints.length} found)</div>
                    <div class="card-body" style="padding: 0;">
                        <table><thead><tr><th>Endpoint</th><th>Path</th></tr></thead><tbody>${apiEndpointsHTML}</tbody></table>
                    </div>
                </div>
            </div>

            <!-- COMPONENTS -->
            <div id="components" class="section">
                <h1>Components</h1>
                <p class="desc">UI components organized by folder.</p>
                <div class="card">
                    <div class="card-header">Component Groups</div>
                    <div class="card-body">
                        <div style="display: flex; flex-wrap: wrap; gap: 8px;">${componentsHTML}</div>
                    </div>
                </div>
            </div>

            <!-- FUNCTIONS -->
            <div id="functions" class="section">
                <h1>Serverless Functions</h1>
                <p class="desc">Backend functions and their runtimes.</p>
                <div class="card">
                    <div class="card-header">Functions (${data.functions.length} found)</div>
                    <div class="card-body" style="padding: 0;">
                        <table><thead><tr><th>Function</th><th>Runtime</th></tr></thead><tbody>${functionsHTML}</tbody></table>
                    </div>
                </div>
            </div>

            <!-- ACTIVITY -->
            <div id="activity" class="section">
                <h1>Activity</h1>
                <p class="desc">Commit activity over the last 6 months.</p>
                <div class="card">
                    <div class="card-header">Monthly Commits</div>
                    <div class="card-body">
                        <div class="monthly-chart">${monthlyChartHTML}</div>
                        <div class="legend">
                            <div class="legend-item"><div class="legend-dot total"></div> Total Commits</div>
                            <div class="legend-item"><div class="legend-dot fixes"></div> Fix Commits</div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- HOTSPOTS -->
            <div id="hotspots" class="section">
                <h1>Hotspots</h1>
                <p class="desc">Files with the most changes - potential areas needing attention.</p>
                <div class="card">
                    <div class="card-header">High-Churn Files</div>
                    <div class="card-body" style="padding: 0;">
                        <table><thead><tr><th style="width:50px">Rank</th><th>File</th><th style="width:80px">Changes</th></tr></thead><tbody>${topFilesHTML}</tbody></table>
                    </div>
                </div>
            </div>

            <!-- TEAM -->
            <div id="team" class="section">
                <h1>Team</h1>
                <p class="desc">Contributors to this repository and their areas of expertise.</p>

                <div class="stats" style="margin-bottom: 24px;">
                    <div class="stat"><div class="stat-num">${data.contributors.length}</div><div class="stat-label">Contributors</div></div>
                    <div class="stat"><div class="stat-num">${data.totalCommits}</div><div class="stat-label">Total Commits</div></div>
                </div>

                <div class="card">
                    <div class="card-header">Contributor Breakdown by Category</div>
                    <div class="card-body">
                        <div class="radar-grid">${radarChartsHTML}</div>
                        <div class="category-legend">
                            <span class="legend-item"><span class="dot" style="background:#3b82f6"></span>Frontend</span>
                            <span class="legend-item"><span class="dot" style="background:#22c55e"></span>Backend</span>
                            <span class="legend-item"><span class="dot" style="background:#f97316"></span>Database</span>
                            <span class="legend-item"><span class="dot" style="background:#ec4899"></span>Auth</span>
                            <span class="legend-item"><span class="dot" style="background:#06b6d4"></span>DevOps</span>
                            <span class="legend-item"><span class="dot" style="background:#8b5cf6"></span>Testing</span>
                            <span class="legend-item"><span class="dot" style="background:#fbbf24"></span>Docs</span>
                        </div>
                    </div>
                </div>

                <div class="card">
                    <div class="card-header">Contribution Breakdown</div>
                    <div class="card-body">
                        <div class="heatmap-container">
                            ${heatmapHTML}
                        </div>
                    </div>
                </div>

                <div class="card">
                    <div class="card-header">Contributors</div>
                    <div class="card-body" style="padding: 0;">
                        <table>
                            <thead><tr><th>Contributor</th><th>Commits</th><th>Primary Area</th></tr></thead>
                            <tbody>${contributorsHTML}</tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- DEAD CODE -->
            <div id="deadcode" class="section">
                <h1>Tech Debt Analysis</h1>
                <p class="desc">Code that may no longer be needed - components, files, and exports that aren't imported anywhere.</p>

                <div class="stats" style="margin-bottom: 24px;">
                    <div class="stat"><div class="stat-num" style="color: #f97316">${(data.deadCode?.unusedComponents || []).length}</div><div class="stat-label">Unused Components</div></div>
                    <div class="stat"><div class="stat-num" style="color: #ef4444">${(data.deadCode?.unusedFiles || []).length}</div><div class="stat-label">Orphaned Files</div></div>
                    <div class="stat"><div class="stat-num" style="color: #fbbf24">${(data.deadCode?.unusedExports || []).length}</div><div class="stat-label">Unused Exports</div></div>
                </div>

                <div class="card">
                    <div class="card-header">Unused Components (never imported)</div>
                    <div class="card-body">
                        ${unusedComponentsHTML}
                        <p style="margin-top: 16px; font-size: 12px; color: var(--text-muted);">Components that aren't imported or used anywhere in the codebase.</p>
                    </div>
                </div>

                <div class="card">
                    <div class="card-header">Orphaned Files (no references found)</div>
                    <div class="card-body">
                        ${unusedFilesHTML}
                        <p style="margin-top: 16px; font-size: 12px; color: var(--text-muted);">Files that aren't imported by any other module.</p>
                    </div>
                </div>

                <div class="card">
                    <div class="card-header">Unused Exports</div>
                    <div class="card-body" style="padding: 0;">
                        <table>
                            <thead><tr><th>Export Name</th><th>File</th></tr></thead>
                            <tbody>${unusedExportsHTML}</tbody>
                        </table>
                    </div>
                </div>
            </div>
        </main>
    </div>

    <script>
        function nav(id, btn) {
            document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
            document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
            document.getElementById(id).classList.add('active');
            if (btn) btn.classList.add('active');
        }
    </script>
</body>
</html>`;
}

function generateHealthReport(data) {
  const maxChanges = data.topFiles[0]?.changes || 1;

  const fileRowsHTML = data.topFiles.slice(0, 15).map((f, i) => {
    const rankClass = i < 3 ? 'top' : i < 6 ? 'high' : 'med';
    const severity = Math.round((f.changes / maxChanges) * 100);
    const severityClass = severity > 70 ? 'critical' : severity > 40 ? 'high' : 'medium';
    return `<tr><td><span class="rank-badge ${rankClass}">${i + 1}</span></td><td class="file-path">${f.file}</td><td class="change-count">${f.changes}</td><td><div class="severity-indicator"><div class="severity-fill ${severityClass}" style="width: ${severity}%;"></div></div></td></tr>`;
  }).join('\n');

  const issuesHTML = data.openIssues.length > 0
    ? data.openIssues.map(i => `<div class="issue-item"><div class="issue-badge">#${i.number}</div><div class="issue-title">${i.title}</div></div>`).join('\n')
    : '<p style="color: var(--text-muted);">No open issues found (or gh cli not available)</p>';

  const maxMonth = Math.max(...data.months.map(m => m.total)) || 1;
  const monthBarsHTML = data.months.map(m => {
    const totalHeight = Math.max(15, (m.total / maxMonth) * 120);
    const fixHeight = m.total > 0 ? (m.fixes / m.total) * totalHeight : 0;
    return `<div class="month-bar"><div class="bars"><div class="total-bar" style="height: ${totalHeight - fixHeight}px;"></div><div class="fix-bar" style="height: ${fixHeight}px;"></div></div><div class="label">${m.label}</div><div class="value">${m.total}/${m.fixes}</div></div>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${data.projectTitle} - Health Report</title>
  <style>
    ${getSharedStyles()}
    .stats-overview { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 16px; margin-bottom: 32px; }
    .stat-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; text-align: center; }
    .stat-card .number { font-size: 1.8rem; font-weight: 700; margin-bottom: 4px; }
    .stat-card .label { color: var(--text-muted); font-size: 12px; }
    .stat-card.critical .number { color: var(--red); }
    .stat-card.warning .number { color: var(--orange); }
    .stat-card.info .number { color: var(--blue); }
    .stat-card.good .number { color: var(--green); }
    .section { background: var(--bg-card); border: 1px solid var(--border); border-radius: 16px; padding: 24px; margin-bottom: 24px; }
    .section h2 { font-size: 1.1rem; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid var(--border); }
    th { color: var(--text-muted); font-size: 11px; font-weight: 500; text-transform: uppercase; }
    .rank-badge { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 50%; font-weight: 700; font-size: 11px; }
    .rank-badge.top { background: var(--red); color: white; }
    .rank-badge.high { background: var(--orange); color: white; }
    .rank-badge.med { background: #fbbf24; color: #1a1a2e; }
    .file-path { font-family: 'SF Mono', Monaco, monospace; font-size: 12px; color: #a5b4fc; }
    .change-count { font-weight: 600; }
    .severity-indicator { width: 60px; height: 6px; background: var(--bg-hover); border-radius: 3px; overflow: hidden; }
    .severity-fill { height: 100%; border-radius: 3px; }
    .severity-fill.critical { background: var(--red); }
    .severity-fill.high { background: var(--orange); }
    .severity-fill.medium { background: #fbbf24; }
    .timeline-chart { display: flex; gap: 8px; align-items: flex-end; height: 160px; padding: 16px 0; border-bottom: 1px solid var(--border); }
    .month-bar { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 6px; }
    .month-bar .bars { flex: 1; width: 100%; display: flex; flex-direction: column; justify-content: flex-end; gap: 2px; }
    .month-bar .total-bar { background: linear-gradient(180deg, #3b82f6, #1d4ed8); border-radius: 3px 3px 0 0; width: 100%; }
    .month-bar .fix-bar { background: linear-gradient(180deg, #ef4444, #b91c1c); border-radius: 0 0 3px 3px; width: 100%; }
    .month-bar .label { font-size: 11px; color: var(--text-muted); }
    .month-bar .value { font-size: 10px; color: #71717a; }
    .issue-item { display: flex; align-items: center; gap: 12px; padding: 12px; background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); border-radius: 8px; margin-bottom: 8px; }
    .issue-badge { padding: 3px 8px; background: var(--red); color: white; font-size: 11px; font-weight: 600; border-radius: 10px; }
    .issue-title { color: #fca5a5; font-size: 13px; }
    .insights-box { background: linear-gradient(135deg, rgba(99,102,241,0.15), rgba(139,92,246,0.15)); border: 1px solid rgba(139,92,246,0.3); border-radius: 16px; padding: 24px; margin-top: 24px; }
    .insights-box h2 { color: #c4b5fd; margin-bottom: 16px; }
    .insight-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; }
    .insight-item { background: rgba(0,0,0,0.2); border-radius: 8px; padding: 16px; }
    .insight-item .metric { font-size: 1.3rem; font-weight: 700; color: var(--accent); margin-bottom: 4px; }
    .insight-item h4 { font-size: 13px; margin-bottom: 6px; }
    .insight-item p { color: var(--text-muted); font-size: 12px; line-height: 1.4; }
  </style>
</head>
<body>
  <div class="layout">
    ${getSidebar(data, 'health')}
    <main class="main">
      <h1>Health Report</h1>
      <p class="desc">Codebase stability analysis - commit patterns, file churn, and open issues.</p>

      <div class="stats-overview">
        <div class="stat-card info"><div class="number">${data.totalCommits}</div><div class="label">Total Commits</div></div>
        <div class="stat-card ${data.fixRatio > 50 ? 'critical' : data.fixRatio > 30 ? 'warning' : 'good'}"><div class="number">${data.fixRatio}%</div><div class="label">Fix Ratio</div></div>
        <div class="stat-card warning"><div class="number">${data.topFiles[0]?.changes || 0}</div><div class="label">Max File Churn</div></div>
        <div class="stat-card info"><div class="number">${data.openIssues.length}</div><div class="label">Open Issues</div></div>
      </div>

      <div class="section"><h2>Commit Activity (6 months)</h2><div class="timeline-chart">${monthBarsHTML}</div></div>
      <div class="section"><h2>High-Churn Files</h2><table><thead><tr><th style="width:50px">Rank</th><th>File</th><th style="width:80px">Changes</th><th style="width:80px">Severity</th></tr></thead><tbody>${fileRowsHTML}</tbody></table></div>
      <div class="section"><h2>Open Issues</h2>${issuesHTML}</div>

      <div class="insights-box">
        <h2>Key Insights</h2>
        <div class="insight-grid">
          <div class="insight-item"><div class="metric">${data.fixRatio}%</div><h4>Fix Ratio</h4><p>${data.fixRatio > 50 ? 'High - indicates reactive development' : data.fixRatio > 30 ? 'Moderate - room for improvement' : 'Healthy - good job!'}</p></div>
          <div class="insight-item"><div class="metric">${data.topFiles[0]?.changes || 0}</div><h4>Max Churn</h4><p>${data.topFiles[0] ? data.topFiles[0].file + ' needs attention' : 'No high-churn files'}</p></div>
          <div class="insight-item"><div class="metric">${data.contributors.length}</div><h4>Contributors</h4><p>${data.contributors.length > 5 ? 'Good coverage' : 'Small team - share knowledge'}</p></div>
        </div>
      </div>

      <p style="text-align: center; margin-top: 32px; color: #71717a; font-size: 12px;">Generated by on-bored &bull; ${new Date().toLocaleDateString()}</p>
    </main>
  </div>
</body>
</html>`;
}

function generateFlowDiagram(data) {
  const flowData = data.flowData || { layers: [] };

  // Generate layer HTML
  const layersHTML = flowData.layers.map((layer, idx) => {
    const itemsHTML = layer.items.map(item => {
      const label = item.name || item.path || 'Unknown';
      const sublabel = item.runtime || item.count || '';
      return `<div class="flow-item" style="--item-color: ${layer.color}">
        <div class="item-name">${label}</div>
        ${sublabel ? `<div class="item-sub">${sublabel}</div>` : ''}
      </div>`;
    }).join('');

    return `<div class="flow-layer" style="--layer-color: ${layer.color}">
      <div class="layer-header">
        <div class="layer-icon">${getLayerIcon(layer.type)}</div>
        <div class="layer-name">${layer.name}</div>
        <div class="layer-count">${layer.items.length}</div>
      </div>
      <div class="layer-items">${itemsHTML}</div>
    </div>
    ${idx < flowData.layers.length - 1 ? '<div class="flow-connector"><svg width="40" height="40" viewBox="0 0 40 40"><path d="M20 5 L20 35 M12 27 L20 35 L28 27" stroke="#3f3f46" stroke-width="2" fill="none"/></svg></div>' : ''}`;
  }).join('');

  // Generate JSON view
  const jsonView = JSON.stringify(flowData, null, 2);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${data.projectTitle} - Architecture Flow</title>
  <style>
    ${getSharedStyles()}
    .tabs { display: flex; gap: 8px; margin-bottom: 24px; }
    .tab { padding: 8px 16px; border-radius: 8px; background: transparent; border: 1px solid #3f3f46; color: #a1a1aa; font-size: 13px; cursor: pointer; }
    .tab.active { background: #8b5cf6; border-color: #8b5cf6; color: white; }
    .view { display: none; }
    .view.active { display: block; }
    .flow-diagram { display: flex; flex-direction: column; align-items: center; gap: 0; }
    .flow-layer { background: #18181b; border: 1px solid #3f3f46; border-radius: 16px; padding: 20px; width: 100%; max-width: 800px; }
    .layer-header { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid #27272a; }
    .layer-icon { width: 36px; height: 36px; border-radius: 10px; background: var(--layer-color); display: flex; align-items: center; justify-content: center; font-size: 18px; }
    .layer-name { font-size: 16px; font-weight: 600; flex: 1; }
    .layer-count { background: #27272a; padding: 4px 12px; border-radius: 12px; font-size: 12px; color: #a1a1aa; }
    .layer-items { display: flex; flex-wrap: wrap; gap: 8px; }
    .flow-item { background: #27272a; border: 1px solid #3f3f46; border-radius: 8px; padding: 10px 14px; border-left: 3px solid var(--item-color); }
    .item-name { font-size: 13px; font-weight: 500; font-family: 'SF Mono', Monaco, monospace; }
    .item-sub { font-size: 11px; color: #71717a; margin-top: 2px; }
    .flow-connector { padding: 8px 0; display: flex; justify-content: center; }
    .flow-connector svg { opacity: 0.5; }
    .json-view { background: #18181b; border: 1px solid #3f3f46; border-radius: 12px; padding: 24px; font-family: 'SF Mono', Monaco, monospace; font-size: 13px; line-height: 1.6; white-space: pre-wrap; overflow-x: auto; color: #a5b4fc; }
    .empty-state { text-align: center; padding: 60px 20px; color: #71717a; }
    .empty-state h2 { font-size: 18px; margin-bottom: 8px; color: #a1a1aa; }
    .legend { display: flex; justify-content: center; gap: 24px; margin-top: 32px; padding-top: 24px; border-top: 1px solid #27272a; }
    .legend-item { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #a1a1aa; }
    .legend-dot { width: 12px; height: 12px; border-radius: 4px; }
  </style>
</head>
<body>
  <div class="layout">
    ${getSidebar(data, 'flow')}
    <main class="main">
      <h1>Architecture Flow</h1>
      <p class="desc">Visual representation of how data flows through the application layers.</p>

      <div class="tabs">
        <button class="tab active" onclick="switchView('visual', this)">Visual</button>
        <button class="tab" onclick="switchView('json', this)">JSON</button>
      </div>

      <div id="visual" class="view active">
        ${flowData.layers.length > 0 ? `
          <div class="flow-diagram">
            ${layersHTML}
          </div>
          <div class="legend">
            ${flowData.layers.map(l => `<div class="legend-item"><div class="legend-dot" style="background: ${l.color}"></div>${l.name}</div>`).join('')}
          </div>
        ` : `
          <div class="empty-state">
            <h2>No architecture data detected</h2>
            <p>The analyzer couldn't find pages, components, API routes, or functions.</p>
          </div>
        `}
      </div>

      <div id="json" class="view">
        <div class="json-view">${escapeHtml(jsonView)}</div>
      </div>
    </main>
  </div>

  <script>
    function switchView(viewId, btn) {
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.getElementById(viewId).classList.add('active');
      btn.classList.add('active');
    }
  </script>
</body>
</html>`;
}

function getLayerIcon(type) {
  const icons = {
    pages: '📄',
    components: '🧩',
    api: '🔌',
    functions: '⚡',
    services: '☁️',
    stores: '📦'
  };
  return icons[type] || '📁';
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function getSharedStyles() {
  return `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg: #09090b; --bg-card: #18181b; --bg-hover: #27272a; --border: #3f3f46;
      --text: #fafafa; --text-muted: #a1a1aa; --accent: #8b5cf6; --accent-dim: rgba(139, 92, 246, 0.15);
      --green: #22c55e; --blue: #3b82f6; --orange: #f97316; --red: #ef4444; --cyan: #06b6d4; --pink: #ec4899;
    }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: var(--bg); color: var(--text); line-height: 1.6; }
    .layout { display: grid; grid-template-columns: 240px 1fr; min-height: 100vh; }
    .sidebar { background: var(--bg-card); border-right: 1px solid var(--border); padding: 24px 16px; position: sticky; top: 0; height: 100vh; overflow-y: auto; }
    .logo { font-size: 20px; font-weight: 700; padding: 0 8px; margin-bottom: 4px; }
    .subtitle { font-size: 12px; color: var(--text-muted); padding: 0 8px; margin-bottom: 24px; }
    .nav-section { font-size: 11px; color: var(--text-muted); padding: 16px 8px 8px; text-transform: uppercase; letter-spacing: 0.5px; }
    .nav-item { display: block; width: 100%; text-align: left; padding: 10px 12px; border: none; background: none; color: var(--text-muted); font-size: 14px; cursor: pointer; border-radius: 8px; margin-bottom: 2px; text-decoration: none; transition: all 0.15s; }
    .nav-item:hover { background: var(--bg-hover); color: var(--text); }
    .nav-item.active { background: var(--accent-dim); color: var(--accent); }
    .nav-item.health { color: var(--red); }
    .nav-item.flow { color: var(--cyan); }
    .nav-item.dead { color: var(--orange); }
    .nav-item.security { color: var(--green); }
    .nav-item.newdev { color: var(--accent); font-weight: 600; }
    .main { padding: 48px; overflow-y: auto; max-width: 1200px; }
    h1 { font-size: 32px; margin-bottom: 8px; font-weight: 700; }
    .desc { color: var(--text-muted); margin-bottom: 32px; font-size: 15px; max-width: 700px; line-height: 1.7; }
    .card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; margin-bottom: 24px; overflow: hidden; }
    .card-header { padding: 16px 20px; border-bottom: 1px solid var(--border); font-weight: 600; font-size: 14px; }
    .card-body { padding: 20px; }
  `;
}

function getSidebar(data, activePage) {
  const projectName = data.projectTitle.split(' - ')[0];

  const navItems = [
    { section: 'Overview' },
    { id: 'overview', label: 'Project Info', href: 'index.html' },
    { id: 'flow', label: 'Flow Diagram', href: 'flow.html', class: 'flow' },
    { id: 'architecture', label: 'Architecture', href: 'index.html#architecture' },
    { section: 'Codebase' },
    { id: 'api', label: 'API Endpoints', href: 'index.html#api' },
    { id: 'components', label: 'Components', href: 'index.html#components' },
    { id: 'functions', label: 'Functions', href: 'index.html#functions' },
    { section: 'Health' },
    { id: 'activity', label: 'Activity', href: 'index.html#activity' },
    { id: 'hotspots', label: 'Hotspots', href: 'index.html#hotspots' },
    { id: 'deadcode', label: 'Dead Code', href: 'index.html#deadcode', class: 'dead' },
    { id: 'health', label: 'Full Health Report', href: 'health-report.html', class: 'health' },
    { section: 'Security' },
    { id: 'security', label: 'Security & Compliance', href: 'security.html', class: 'security' },
    { section: 'Team' },
    { id: 'team', label: 'Contributors', href: 'index.html#team' },
    { section: 'Getting Started' },
    { id: 'newdev', label: '🚀 New Dev Flow', href: 'new-dev.html', class: 'newdev' },
  ];

  const navHTML = navItems.map(item => {
    if (item.section) {
      return `<div class="nav-section">${item.section}</div>`;
    }
    const isActive = item.id === activePage;
    const classAttr = `nav-item ${item.class || ''} ${isActive ? 'active' : ''}`.trim();
    return `<a href="${item.href}" class="${classAttr}">${item.label}</a>`;
  }).join('\n');

  return `
    <aside class="sidebar">
      <div class="logo">${projectName}</div>
      <div class="subtitle">Developer Onboarding</div>
      ${navHTML}
    </aside>
  `;
}

function generateSecurityCompliance(data) {
  const security = data.security || { vulnerabilities: [], warnings: [] };
  const compliance = data.compliance || {};

  // Security vulnerabilities
  const vulnsHTML = security.vulnerabilities.length > 0
    ? security.vulnerabilities.map(v => {
        const severityClass = v.severity === 'critical' ? 'critical' : v.severity === 'high' ? 'high' : 'medium';
        return `<div class="vuln-item ${severityClass}">
          <div class="vuln-severity">${v.severity.toUpperCase()}</div>
          <div class="vuln-details">
            <div class="vuln-name">${v.name}</div>
            <div class="vuln-file">${v.file}</div>
          </div>
        </div>`;
      }).join('')
    : '<div class="empty-state">No security vulnerabilities detected</div>';

  const warningsHTML = security.warnings.length > 0
    ? security.warnings.map(w => `<div class="warning-item"><span class="warning-icon">⚠️</span><span>${w.name}</span><span class="warning-file">${w.file}</span></div>`).join('')
    : '';

  // Compliance checklist
  const complianceItems = [
    { key: 'ageVerification', name: 'Age Verification', icon: '🔞', desc: 'Verify users meet minimum age requirements' },
    { key: 'contentModeration', name: 'Content Moderation', icon: '🛡️', desc: 'Systems to detect and remove harmful content' },
    { key: 'identityVerification', name: 'Identity Verification (KYC)', icon: '🪪', desc: 'Verify creator identity with documents' },
    { key: 'reportingMechanism', name: 'Reporting Mechanism', icon: '🚨', desc: 'Allow users to report abuse/illegal content' },
    { key: 'recordKeeping', name: 'Record Keeping (2257)', icon: '📋', desc: 'Maintain records of creator verification' },
    { key: 'userSafety', name: 'User Safety Features', icon: '🔒', desc: 'Block, mute, privacy controls, 2FA' },
    { key: 'paymentCompliance', name: 'Payment Compliance', icon: '💳', desc: 'Stripe Connect, chargebacks, disputes' },
  ];

  const complianceHTML = complianceItems.map(item => {
    const itemData = compliance[item.key] || { found: false, files: [], notes: [] };
    const statusClass = itemData.found ? 'found' : 'missing';
    const statusIcon = itemData.found ? '✓' : '✗';

    const filesHTML = itemData.files.length > 0
      ? `<div class="compliance-files">${itemData.files.slice(0, 5).map(f => `<span class="compliance-file">${f.split('/').pop()}</span>`).join('')}</div>`
      : '';

    const notesHTML = itemData.notes.length > 0
      ? `<div class="compliance-notes">${itemData.notes.map(n => `<div class="compliance-note">${n}</div>`).join('')}</div>`
      : '';

    return `<div class="compliance-item ${statusClass}">
      <div class="compliance-header">
        <span class="compliance-icon">${item.icon}</span>
        <span class="compliance-name">${item.name}</span>
        <span class="compliance-status ${statusClass}">${statusIcon}</span>
      </div>
      <div class="compliance-desc">${item.desc}</div>
      ${filesHTML}
      ${notesHTML}
    </div>`;
  }).join('');

  // Calculate compliance score
  const totalChecks = complianceItems.length;
  const passedChecks = complianceItems.filter(item => (compliance[item.key] || {}).found).length;
  const complianceScore = Math.round((passedChecks / totalChecks) * 100);
  const scoreClass = complianceScore >= 80 ? 'good' : complianceScore >= 50 ? 'moderate' : 'poor';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${data.projectTitle} - Security & NCOSE Compliance</title>
  <style>
    ${getSharedStyles()}
    .score-banner { background: linear-gradient(135deg, rgba(34,197,94,0.15), rgba(34,197,94,0.05)); border: 1px solid rgba(34,197,94,0.3); border-radius: 16px; padding: 24px; margin-bottom: 32px; display: flex; align-items: center; gap: 24px; }
    .score-banner.moderate { background: linear-gradient(135deg, rgba(251,191,36,0.15), rgba(251,191,36,0.05)); border-color: rgba(251,191,36,0.3); }
    .score-banner.poor { background: linear-gradient(135deg, rgba(239,68,68,0.15), rgba(239,68,68,0.05)); border-color: rgba(239,68,68,0.3); }
    .score-circle { width: 80px; height: 80px; border-radius: 50%; background: var(--bg-card); border: 4px solid var(--green); display: flex; align-items: center; justify-content: center; font-size: 24px; font-weight: 700; }
    .score-banner.moderate .score-circle { border-color: #fbbf24; }
    .score-banner.poor .score-circle { border-color: var(--red); }
    .score-info h2 { font-size: 18px; margin-bottom: 4px; }
    .score-info p { color: var(--text-muted); font-size: 14px; }

    .section { margin-bottom: 32px; }
    .section h2 { font-size: 18px; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }
    .section-icon { font-size: 20px; }

    .vuln-item { display: flex; align-items: center; gap: 16px; padding: 16px; background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; margin-bottom: 8px; border-left: 4px solid #fbbf24; }
    .vuln-item.critical { border-left-color: var(--red); background: rgba(239,68,68,0.05); }
    .vuln-item.high { border-left-color: var(--orange); background: rgba(249,115,22,0.05); }
    .vuln-item.medium { border-left-color: #fbbf24; }
    .vuln-severity { padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 700; background: #ef444433; color: var(--red); }
    .vuln-item.high .vuln-severity { background: #f9731633; color: var(--orange); }
    .vuln-item.medium .vuln-severity { background: #fbbf2433; color: #fbbf24; }
    .vuln-details { flex: 1; }
    .vuln-name { font-weight: 500; margin-bottom: 2px; }
    .vuln-file { font-size: 12px; color: var(--text-muted); font-family: monospace; }

    .warning-item { display: flex; align-items: center; gap: 12px; padding: 12px 16px; background: rgba(251,191,36,0.1); border: 1px solid rgba(251,191,36,0.2); border-radius: 8px; margin-bottom: 8px; font-size: 14px; }
    .warning-icon { font-size: 16px; }
    .warning-file { margin-left: auto; font-size: 12px; color: var(--text-muted); font-family: monospace; }

    .compliance-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; }
    .compliance-item { background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; }
    .compliance-item.found { border-color: rgba(34,197,94,0.3); }
    .compliance-item.missing { border-color: rgba(239,68,68,0.2); opacity: 0.7; }
    .compliance-header { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
    .compliance-icon { font-size: 20px; }
    .compliance-name { font-weight: 600; flex: 1; }
    .compliance-status { width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 700; }
    .compliance-status.found { background: #22c55e33; color: var(--green); }
    .compliance-status.missing { background: #ef444433; color: var(--red); }
    .compliance-desc { font-size: 13px; color: var(--text-muted); margin-bottom: 12px; }
    .compliance-files { display: flex; flex-wrap: wrap; gap: 6px; }
    .compliance-file { padding: 4px 10px; background: var(--bg-hover); border-radius: 6px; font-size: 11px; font-family: monospace; color: #a5b4fc; }
    .compliance-notes { margin-top: 8px; }
    .compliance-note { font-size: 12px; color: var(--green); padding: 6px 10px; background: rgba(34,197,94,0.1); border-radius: 6px; margin-top: 4px; }

    .empty-state { padding: 24px; text-align: center; color: var(--green); background: rgba(34,197,94,0.1); border-radius: 12px; }

    .ncose-info { background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; margin-top: 24px; }
    .ncose-info h3 { font-size: 14px; margin-bottom: 8px; color: var(--text-muted); }
    .ncose-info p { font-size: 13px; color: #71717a; line-height: 1.6; }
    .ncose-info a { color: var(--accent); }
  </style>
</head>
<body>
  <div class="layout">
    ${getSidebar(data, 'security')}
    <main class="main">
      <h1>Security & NCOSE Compliance</h1>
      <p class="desc">Security vulnerabilities and platform safety compliance indicators.</p>

      <div class="score-banner ${scoreClass}">
        <div class="score-circle">${complianceScore}%</div>
        <div class="score-info">
          <h2>NCOSE Compliance Score</h2>
          <p>${passedChecks} of ${totalChecks} compliance indicators detected in codebase</p>
        </div>
      </div>

      <div class="section">
        <h2><span class="section-icon">🔐</span> Security Vulnerabilities</h2>
        ${vulnsHTML}
        ${warningsHTML}
      </div>

      <div class="section">
        <h2><span class="section-icon">📋</span> NCOSE Compliance Checklist</h2>
        <div class="compliance-grid">
          ${complianceHTML}
        </div>
      </div>

      <div class="ncose-info">
        <h3>About NCOSE Compliance</h3>
        <p>The National Center on Sexual Exploitation (NCOSE) advocates for platform safety in the creator economy. Key requirements include robust age verification, content moderation, identity verification (KYC), reporting mechanisms, record keeping (2257 compliance), user safety features, and payment processor compliance (Visa/Mastercard requirements). This scan detects code patterns that indicate these systems are implemented.</p>
      </div>
    </main>
  </div>
</body>
</html>`;
}

function generateNewDevFlow(data) {
  // Determine key files to read first
  const keyFiles = [];

  // Entry points are crucial
  data.pages.filter(p => p.type === 'entry').slice(0, 3).forEach(p => {
    keyFiles.push({ file: p.name, path: p.path, reason: 'Entry point - start here to understand how the app boots' });
  });

  // Main modules
  (data.modules || []).slice(0, 3).forEach(m => {
    keyFiles.push({ file: m.name, path: m.path, reason: `Core ${m.type.replace('-', ' ')} - contains main logic` });
  });

  const keyFilesHTML = keyFiles.length > 0
    ? keyFiles.map((f, i) => `
        <div class="step-card">
          <div class="step-number">${i + 1}</div>
          <div class="step-content">
            <div class="step-title">${f.file}</div>
            <div class="step-path">${f.path}</div>
            <div class="step-reason">${f.reason}</div>
          </div>
        </div>
      `).join('')
    : '<p style="color:var(--text-muted)">No key files detected</p>';

  // Suggest areas to work on based on tech debt
  const workSuggestions = [];

  // Dead code cleanup
  const unusedCount = (data.deadCode?.unusedComponents?.length || 0) +
                      (data.deadCode?.unusedExports?.length || 0) +
                      (data.deadCode?.unusedFiles?.length || 0);
  if (unusedCount > 0) {
    workSuggestions.push({
      icon: '🧹',
      title: 'Clean up dead code',
      desc: `${unusedCount} unused components/files detected. Good first task to learn the codebase while cleaning up.`,
      priority: 'low'
    });
  }

  // High churn files need attention
  if (data.topFiles.length > 0 && data.topFiles[0].changes > 20) {
    workSuggestions.push({
      icon: '🔥',
      title: 'Stabilize hot files',
      desc: `${data.topFiles[0].file} has ${data.topFiles[0].changes} changes. High-churn files often need refactoring.`,
      priority: 'medium'
    });
  }

  // Security issues
  if (data.security?.vulnerabilities?.length > 0) {
    workSuggestions.push({
      icon: '🔐',
      title: 'Fix security issues',
      desc: `${data.security.vulnerabilities.length} potential security vulnerabilities detected.`,
      priority: 'high'
    });
  }

  // Testing
  const hasTests = data.categoryStats?.find(c => c.name === 'Testing');
  if (!hasTests || hasTests.count < 10) {
    workSuggestions.push({
      icon: '🧪',
      title: 'Add tests',
      desc: 'Limited test coverage detected. Adding tests is a great way to learn the codebase.',
      priority: 'medium'
    });
  }

  // Documentation
  const hasDocs = data.categoryStats?.find(c => c.name === 'Documentation');
  if (!hasDocs || hasDocs.count < 5) {
    workSuggestions.push({
      icon: '📝',
      title: 'Improve documentation',
      desc: 'Limited documentation commits. Document what you learn as you go.',
      priority: 'low'
    });
  }

  const suggestionsHTML = workSuggestions.length > 0
    ? workSuggestions.map(s => `
        <div class="suggestion-card priority-${s.priority}">
          <div class="suggestion-icon">${s.icon}</div>
          <div class="suggestion-content">
            <div class="suggestion-title">${s.title}</div>
            <div class="suggestion-desc">${s.desc}</div>
          </div>
          <div class="suggestion-priority">${s.priority}</div>
        </div>
      `).join('')
    : '<p style="color:var(--text-muted)">No specific suggestions - codebase looks healthy!</p>';

  // Tech stack quick reference
  const techStackHTML = data.techStack.slice(0, 8).map(t =>
    `<div class="tech-chip"><strong>${t.name}</strong><span>${t.type}</span></div>`
  ).join('');

  // Key people to ask
  const keyPeopleHTML = data.contributors.slice(0, 5).map(c => `
    <div class="person-card">
      <div class="person-name">${c.name}</div>
      <div class="person-focus">${c.focus || 'general'}</div>
      <div class="person-area">Expert in: ${c.expertise || 'various areas'}</div>
    </div>
  `).join('');

  // Quick setup commands
  const setupCommands = [];
  if (data.primaryLanguage === 'python') {
    setupCommands.push({ cmd: 'pip install -e .', desc: 'Install in development mode' });
    setupCommands.push({ cmd: 'python -m pytest', desc: 'Run tests' });
  } else if (data.primaryLanguage === 'javascript') {
    setupCommands.push({ cmd: 'npm install', desc: 'Install dependencies' });
    setupCommands.push({ cmd: 'npm run dev', desc: 'Start development server' });
    setupCommands.push({ cmd: 'npm test', desc: 'Run tests' });
  } else if (data.primaryLanguage === 'rust') {
    setupCommands.push({ cmd: 'cargo build', desc: 'Build the project' });
    setupCommands.push({ cmd: 'cargo test', desc: 'Run tests' });
    setupCommands.push({ cmd: 'cargo run', desc: 'Run the application' });
  } else if (data.primaryLanguage === 'go') {
    setupCommands.push({ cmd: 'go build', desc: 'Build the project' });
    setupCommands.push({ cmd: 'go test ./...', desc: 'Run tests' });
  }

  const setupHTML = setupCommands.length > 0
    ? setupCommands.map(c => `<div class="cmd-row"><code>${c.cmd}</code><span>${c.desc}</span></div>`).join('')
    : '<p style="color:var(--text-muted)">Check README for setup instructions</p>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${data.projectTitle} - New Dev Flow</title>
  <style>
    ${getSharedStyles()}
    .welcome-banner { background: linear-gradient(135deg, rgba(139,92,246,0.2), rgba(236,72,153,0.1)); border: 1px solid rgba(139,92,246,0.3); border-radius: 16px; padding: 32px; margin-bottom: 32px; }
    .welcome-banner h1 { font-size: 28px; margin-bottom: 8px; }
    .welcome-banner p { color: var(--text-muted); font-size: 16px; line-height: 1.6; }

    .section-title { font-size: 18px; font-weight: 600; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }
    .section-title span { font-size: 24px; }

    .step-card { display: flex; gap: 16px; padding: 16px; background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; margin-bottom: 12px; }
    .step-number { width: 32px; height: 32px; background: var(--accent); color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; flex-shrink: 0; }
    .step-title { font-weight: 600; margin-bottom: 4px; }
    .step-path { font-family: monospace; font-size: 12px; color: #a5b4fc; margin-bottom: 4px; }
    .step-reason { font-size: 13px; color: var(--text-muted); }

    .suggestion-card { display: flex; align-items: center; gap: 16px; padding: 16px; background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; margin-bottom: 12px; }
    .suggestion-card.priority-high { border-left: 4px solid var(--red); }
    .suggestion-card.priority-medium { border-left: 4px solid var(--orange); }
    .suggestion-card.priority-low { border-left: 4px solid var(--green); }
    .suggestion-icon { font-size: 24px; }
    .suggestion-content { flex: 1; }
    .suggestion-title { font-weight: 600; margin-bottom: 4px; }
    .suggestion-desc { font-size: 13px; color: var(--text-muted); }
    .suggestion-priority { padding: 4px 12px; border-radius: 12px; font-size: 11px; font-weight: 600; text-transform: uppercase; }
    .priority-high .suggestion-priority { background: rgba(239,68,68,0.2); color: var(--red); }
    .priority-medium .suggestion-priority { background: rgba(249,115,22,0.2); color: var(--orange); }
    .priority-low .suggestion-priority { background: rgba(34,197,94,0.2); color: var(--green); }

    .tech-chips { display: flex; flex-wrap: wrap; gap: 8px; }
    .tech-chip { padding: 8px 14px; background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px; display: flex; gap: 8px; align-items: center; }
    .tech-chip span { font-size: 12px; color: var(--text-muted); }

    .person-card { padding: 12px 16px; background: var(--bg-card); border: 1px solid var(--border); border-radius: 10px; margin-bottom: 8px; }
    .person-name { font-weight: 600; margin-bottom: 2px; }
    .person-focus { display: inline-block; padding: 2px 8px; background: var(--accent-dim); color: var(--accent); border-radius: 8px; font-size: 11px; margin-bottom: 4px; }
    .person-area { font-size: 12px; color: var(--text-muted); }

    .cmd-row { display: flex; align-items: center; gap: 16px; padding: 12px; background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px; margin-bottom: 8px; }
    .cmd-row code { background: #1e1e2e; padding: 6px 12px; border-radius: 6px; font-size: 13px; color: #a5b4fc; }
    .cmd-row span { font-size: 13px; color: var(--text-muted); }

    .two-col { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 24px; }
    .card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; }
  </style>
</head>
<body>
  <div class="layout">
    ${getSidebar(data, 'newdev')}
    <main class="main">
      <div class="welcome-banner">
        <h1>Welcome to ${data.projectTitle.split(' - ')[0]}! 👋</h1>
        <p>${data.aiSummary || 'This guide will help you get up to speed quickly. Start by reading the key files, then pick something to work on.'}</p>
      </div>

      ${data.aiKeyThings ? `
      <div class="section-title"><span>🎯</span> Key Things to Understand</div>
      <div style="margin-bottom: 32px;">
        ${data.aiKeyThings.map((t, i) => `
          <div class="step-card">
            <div class="step-number">${i + 1}</div>
            <div class="step-content">
              <div class="step-reason" style="font-size: 14px; color: var(--text);">${t}</div>
            </div>
          </div>
        `).join('')}
      </div>` : ''}

      ${data.aiGotchas ? `
      <div class="section-title"><span>⚠️</span> Watch Out For</div>
      <div style="margin-bottom: 32px;">
        ${data.aiGotchas.map(g => `
          <div class="suggestion-card priority-medium">
            <div class="suggestion-icon">⚠️</div>
            <div class="suggestion-content">
              <div class="suggestion-desc" style="font-size: 14px; color: var(--text);">${g}</div>
            </div>
          </div>
        `).join('')}
      </div>` : ''}

      <div class="section-title"><span>📚</span> Start Here - Key Files to Read</div>
      <div style="margin-bottom: 32px;">
        ${keyFilesHTML}
      </div>

      <div class="section-title"><span>🛠️</span> Quick Setup</div>
      <div style="margin-bottom: 32px;">
        ${setupHTML}
      </div>

      <div class="section-title"><span>💡</span> Suggested Work</div>
      <div style="margin-bottom: 32px;">
        ${suggestionsHTML}
      </div>

      <div class="two-col">
        <div>
          <div class="section-title"><span>🧰</span> Tech Stack</div>
          <div class="tech-chips" style="margin-bottom: 24px;">
            ${techStackHTML || '<p style="color:var(--text-muted)">No tech stack detected</p>'}
          </div>
        </div>

        <div>
          <div class="section-title"><span>👥</span> Key People to Ask</div>
          ${keyPeopleHTML}
        </div>
      </div>

      <p style="text-align: center; margin-top: 48px; color: #71717a; font-size: 12px;">Generated by on-bored &bull; ${new Date().toLocaleDateString()}</p>
    </main>
  </div>
</body>
</html>`;
}

module.exports = generateHTML;
