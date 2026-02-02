/**
 * Fetch Documentation - D3.js Diagram System
 * Beautiful, interactive diagrams with dark/light theme support
 */

const FetchDiagrams = {
  // Color schemes for dark and light modes
  colors: {
    dark: {
      bg: '#0d1117',
      nodeBg: '#161b22',
      nodeBorder: '#30363d',
      nodeHighlight: '#238636',
      text: '#e6edf3',
      textMuted: '#8b949e',
      link: '#58a6ff',
      arrow: '#8b949e',
      success: '#238636',
      warning: '#d29922',
      error: '#f85149',
      accent1: '#58a6ff', // Blue
      accent2: '#a371f7', // Purple
      accent3: '#3fb950', // Green
      accent4: '#f0883e', // Orange
      accent5: '#db61a2', // Pink
    },
    light: {
      bg: '#ffffff',
      nodeBg: '#f6f8fa',
      nodeBorder: '#d0d7de',
      nodeHighlight: '#1a7f37',
      text: '#1f2328',
      textMuted: '#656d76',
      link: '#0969da',
      arrow: '#656d76',
      success: '#1a7f37',
      warning: '#9a6700',
      error: '#cf222e',
      accent1: '#0969da', // Blue
      accent2: '#8250df', // Purple
      accent3: '#1a7f37', // Green
      accent4: '#bc4c00', // Orange
      accent5: '#bf3989', // Pink
    }
  },

  // Get current theme colors
  getColors() {
    const isDark = document.body.classList.contains('dark');
    return this.colors[isDark ? 'dark' : 'light'];
  },

  // Create SVG with proper sizing
  createSVG(container, width, height) {
    const svg = d3.select(container)
      .append('svg')
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('preserveAspectRatio', 'xMidYMid meet')
      .style('width', '100%')
      .style('max-width', `${width}px`)
      .style('height', 'auto')
      .style('display', 'block')
      .style('margin', '0 auto');
    
    // Add arrow marker definition
    const defs = svg.append('defs');
    
    const colors = this.getColors();
    defs.append('marker')
      .attr('id', 'arrowhead')
      .attr('viewBox', '-0 -5 10 10')
      .attr('refX', 8)
      .attr('refY', 0)
      .attr('orient', 'auto')
      .attr('markerWidth', 8)
      .attr('markerHeight', 8)
      .append('path')
      .attr('d', 'M 0,-5 L 10,0 L 0,5')
      .attr('fill', colors.arrow);

    return svg;
  },

  // Draw a rounded rectangle node
  drawNode(group, x, y, width, height, label, icon, color) {
    const colors = this.getColors();
    const nodeColor = color || colors.nodeBg;
    
    // Node background
    group.append('rect')
      .attr('x', x)
      .attr('y', y)
      .attr('width', width)
      .attr('height', height)
      .attr('rx', 12)
      .attr('ry', 12)
      .attr('fill', nodeColor)
      .attr('stroke', colors.nodeBorder)
      .attr('stroke-width', 2)
      .style('filter', 'drop-shadow(0 4px 6px rgba(0, 0, 0, 0.1))');

    // Icon
    if (icon) {
      group.append('text')
        .attr('x', x + width / 2)
        .attr('y', y + 28)
        .attr('text-anchor', 'middle')
        .attr('font-size', '24px')
        .text(icon);
    }

    // Label
    group.append('text')
      .attr('x', x + width / 2)
      .attr('y', y + (icon ? 52 : height / 2 + 6))
      .attr('text-anchor', 'middle')
      .attr('fill', colors.text)
      .attr('font-size', '14px')
      .attr('font-weight', '600')
      .text(label);

    return group;
  },

  // Draw an arrow between points
  drawArrow(svg, x1, y1, x2, y2, curved = false) {
    const colors = this.getColors();
    
    if (curved) {
      const midX = (x1 + x2) / 2;
      const midY = (y1 + y2) / 2 - 30;
      svg.append('path')
        .attr('d', `M ${x1} ${y1} Q ${midX} ${midY} ${x2} ${y2}`)
        .attr('fill', 'none')
        .attr('stroke', colors.arrow)
        .attr('stroke-width', 2)
        .attr('marker-end', 'url(#arrowhead)');
    } else {
      svg.append('line')
        .attr('x1', x1)
        .attr('y1', y1)
        .attr('x2', x2)
        .attr('y2', y2)
        .attr('stroke', colors.arrow)
        .attr('stroke-width', 2)
        .attr('marker-end', 'url(#arrowhead)');
    }
  },

  // =====================================================
  // DIAGRAM: Architecture Overview
  // =====================================================
  renderArchitecture(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    
    const colors = this.getColors();
    const svg = this.createSVG(container, 800, 500);

    // Host Machine box
    svg.append('rect')
      .attr('x', 20)
      .attr('y', 20)
      .attr('width', 760)
      .attr('height', 400)
      .attr('rx', 16)
      .attr('fill', 'none')
      .attr('stroke', colors.nodeBorder)
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '8,4');

    svg.append('text')
      .attr('x', 40)
      .attr('y', 50)
      .attr('fill', colors.textMuted)
      .attr('font-size', '14px')
      .attr('font-weight', '600')
      .text('HOST MACHINE');

    // Go Manager
    const manager = svg.append('g');
    this.drawNode(manager, 50, 80, 160, 180, 'Go Manager', '🎛️', colors.nodeBg);
    
    // Manager features
    const features = ['Start/Stop', 'Configure', 'View Logs', 'Docs'];
    features.forEach((f, i) => {
      svg.append('text')
        .attr('x', 130)
        .attr('y', 145 + i * 24)
        .attr('text-anchor', 'middle')
        .attr('fill', colors.textMuted)
        .attr('font-size', '12px')
        .text(`• ${f}`);
    });

    // Docker Compose box
    svg.append('rect')
      .attr('x', 280)
      .attr('y', 70)
      .attr('width', 480)
      .attr('height', 260)
      .attr('rx', 12)
      .attr('fill', colors.nodeBg)
      .attr('stroke', colors.accent1)
      .attr('stroke-width', 2);

    svg.append('text')
      .attr('x', 300)
      .attr('y', 100)
      .attr('fill', colors.accent1)
      .attr('font-size', '14px')
      .attr('font-weight', '600')
      .text('🐳 Docker Compose');

    // Bridge container
    const bridge = svg.append('g');
    svg.append('rect')
      .attr('x', 310)
      .attr('y', 120)
      .attr('width', 200)
      .attr('height', 190)
      .attr('rx', 10)
      .attr('fill', colors.bg)
      .attr('stroke', colors.accent3)
      .attr('stroke-width', 2);

    svg.append('text')
      .attr('x', 410)
      .attr('y', 150)
      .attr('text-anchor', 'middle')
      .attr('fill', colors.accent3)
      .attr('font-size', '16px')
      .attr('font-weight', '600')
      .text('🌉 Bridge');
    
    svg.append('text')
      .attr('x', 410)
      .attr('y', 172)
      .attr('text-anchor', 'middle')
      .attr('fill', colors.textMuted)
      .attr('font-size', '12px')
      .text('(Node.js)');

    const bridgeFeatures = ['WhatsApp Client', 'Security Gate', 'Agent Core', 'Tool Registry', 'Status API :8765'];
    bridgeFeatures.forEach((f, i) => {
      svg.append('text')
        .attr('x', 410)
        .attr('y', 200 + i * 22)
        .attr('text-anchor', 'middle')
        .attr('fill', colors.text)
        .attr('font-size', '11px')
        .text(f);
    });

    // Kennel container
    svg.append('rect')
      .attr('x', 540)
      .attr('y', 120)
      .attr('width', 200)
      .attr('height', 190)
      .attr('rx', 10)
      .attr('fill', colors.bg)
      .attr('stroke', colors.accent2)
      .attr('stroke-width', 2);

    svg.append('text')
      .attr('x', 640)
      .attr('y', 150)
      .attr('text-anchor', 'middle')
      .attr('fill', colors.accent2)
      .attr('font-size', '16px')
      .attr('font-weight', '600')
      .text('🏠 Kennel');
    
    svg.append('text')
      .attr('x', 640)
      .attr('y', 172)
      .attr('text-anchor', 'middle')
      .attr('fill', colors.textMuted)
      .attr('font-size', '12px')
      .text('(Ubuntu)');

    const kennelFeatures = ['Claude Code CLI', 'Gemini CLI', 'GitHub Copilot', '/workspace mount'];
    kennelFeatures.forEach((f, i) => {
      svg.append('text')
        .attr('x', 640)
        .attr('y', 200 + i * 26)
        .attr('text-anchor', 'middle')
        .attr('fill', colors.text)
        .attr('font-size', '11px')
        .text(f);
    });

    // WhatsApp node
    const whatsapp = svg.append('g');
    this.drawNode(whatsapp, 340, 370, 140, 70, 'WhatsApp', '📱');

    // Workspace node
    const workspace = svg.append('g');
    this.drawNode(workspace, 560, 370, 140, 70, '/workspace', '📁');

    // Arrows
    this.drawArrow(svg, 210, 170, 280, 170); // Manager -> Docker
    this.drawArrow(svg, 410, 310, 410, 365); // Bridge -> WhatsApp
    this.drawArrow(svg, 640, 310, 640, 365); // Kennel -> Workspace
    this.drawArrow(svg, 510, 215, 540, 215); // Bridge -> Kennel

    // Labels
    svg.append('text')
      .attr('x', 245)
      .attr('y', 158)
      .attr('fill', colors.textMuted)
      .attr('font-size', '10px')
      .text('docker');
    svg.append('text')
      .attr('x', 245)
      .attr('y', 170)
      .attr('fill', colors.textMuted)
      .attr('font-size', '10px')
      .text('compose');
  },

  // =====================================================
  // DIAGRAM: Security Flow
  // =====================================================
  renderSecurityFlow(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    
    const colors = this.getColors();
    const svg = this.createSVG(container, 800, 400);

    const layers = [
      { label: '@fetch Trigger', icon: '🏷️', desc: 'Message must start with @fetch', color: colors.accent1 },
      { label: 'Whitelist Auth', icon: '🔐', desc: 'Only OWNER_PHONE_NUMBER', color: colors.accent2 },
      { label: 'Rate Limiter', icon: '⏱️', desc: '30 requests/minute', color: colors.accent3 },
      { label: 'Input Validator', icon: '🛡️', desc: 'Block injection patterns', color: colors.accent4 },
      { label: 'Agent Core', icon: '🤖', desc: 'Process safe request', color: colors.accent5 },
    ];

    const boxWidth = 140;
    const boxHeight = 100;
    const spacing = 20;
    const startX = (800 - (layers.length * boxWidth + (layers.length - 1) * spacing)) / 2;

    layers.forEach((layer, i) => {
      const x = startX + i * (boxWidth + spacing);
      const y = 150;

      // Layer box
      svg.append('rect')
        .attr('x', x)
        .attr('y', y)
        .attr('width', boxWidth)
        .attr('height', boxHeight)
        .attr('rx', 10)
        .attr('fill', colors.nodeBg)
        .attr('stroke', layer.color)
        .attr('stroke-width', 3);

      // Icon
      svg.append('text')
        .attr('x', x + boxWidth / 2)
        .attr('y', y + 35)
        .attr('text-anchor', 'middle')
        .attr('font-size', '24px')
        .text(layer.icon);

      // Label
      svg.append('text')
        .attr('x', x + boxWidth / 2)
        .attr('y', y + 62)
        .attr('text-anchor', 'middle')
        .attr('fill', colors.text)
        .attr('font-size', '12px')
        .attr('font-weight', '600')
        .text(layer.label);

      // Description
      svg.append('text')
        .attr('x', x + boxWidth / 2)
        .attr('y', y + boxHeight + 25)
        .attr('text-anchor', 'middle')
        .attr('fill', colors.textMuted)
        .attr('font-size', '10px')
        .text(layer.desc);

      // Arrow to next
      if (i < layers.length - 1) {
        this.drawArrow(svg, x + boxWidth + 5, y + boxHeight / 2, x + boxWidth + spacing - 5, y + boxHeight / 2);
      }
    });

    // Title
    svg.append('text')
      .attr('x', 400)
      .attr('y', 50)
      .attr('text-anchor', 'middle')
      .attr('fill', colors.text)
      .attr('font-size', '20px')
      .attr('font-weight', '700')
      .text('🔒 Security Pipeline');

    svg.append('text')
      .attr('x', 400)
      .attr('y', 80)
      .attr('text-anchor', 'middle')
      .attr('fill', colors.textMuted)
      .attr('font-size', '14px')
      .text('Defense in Depth - 5 Layers of Protection');

    // Rejected path
    svg.append('text')
      .attr('x', 400)
      .attr('y', 340)
      .attr('text-anchor', 'middle')
      .attr('fill', colors.error)
      .attr('font-size', '12px')
      .text('❌ Rejected messages are silently dropped (no acknowledgment)');
  },

  // =====================================================
  // DIAGRAM: ReAct Loop
  // =====================================================
  renderReActLoop(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    
    const colors = this.getColors();
    const svg = this.createSVG(container, 600, 500);

    const centerX = 300;
    const centerY = 250;
    const radius = 150;

    const steps = [
      { label: 'DECIDE', icon: '🧠', desc: 'What action?', angle: -90 },
      { label: 'EXECUTE', icon: '⚡', desc: 'Run tool', angle: 0 },
      { label: 'OBSERVE', icon: '👁️', desc: 'Check result', angle: 90 },
      { label: 'REFLECT', icon: '💭', desc: 'Update plan', angle: 180 },
    ];

    // Draw circular path
    svg.append('circle')
      .attr('cx', centerX)
      .attr('cy', centerY)
      .attr('r', radius)
      .attr('fill', 'none')
      .attr('stroke', colors.nodeBorder)
      .attr('stroke-width', 3)
      .attr('stroke-dasharray', '10,5');

    // Draw each step
    steps.forEach((step, i) => {
      const angleRad = (step.angle * Math.PI) / 180;
      const x = centerX + radius * Math.cos(angleRad);
      const y = centerY + radius * Math.sin(angleRad);

      // Node circle
      svg.append('circle')
        .attr('cx', x)
        .attr('cy', y)
        .attr('r', 50)
        .attr('fill', colors.nodeBg)
        .attr('stroke', [colors.accent1, colors.accent3, colors.accent4, colors.accent2][i])
        .attr('stroke-width', 3);

      // Icon
      svg.append('text')
        .attr('x', x)
        .attr('y', y - 8)
        .attr('text-anchor', 'middle')
        .attr('font-size', '24px')
        .text(step.icon);

      // Label
      svg.append('text')
        .attr('x', x)
        .attr('y', y + 18)
        .attr('text-anchor', 'middle')
        .attr('fill', colors.text)
        .attr('font-size', '12px')
        .attr('font-weight', '700')
        .text(step.label);

      // Description (outside circle)
      const descRadius = radius + 80;
      const descX = centerX + descRadius * Math.cos(angleRad);
      const descY = centerY + descRadius * Math.sin(angleRad);
      
      svg.append('text')
        .attr('x', descX)
        .attr('y', descY)
        .attr('text-anchor', 'middle')
        .attr('fill', colors.textMuted)
        .attr('font-size', '12px')
        .text(step.desc);

      // Arrow to next step
      const nextAngle = steps[(i + 1) % steps.length].angle;
      const midAngle = ((step.angle + nextAngle + (nextAngle < step.angle ? 360 : 0)) / 2) * Math.PI / 180;
      const arrowX = centerX + (radius - 5) * Math.cos(midAngle);
      const arrowY = centerY + (radius - 5) * Math.sin(midAngle);

      // Draw small arrow indicator on the path
      svg.append('text')
        .attr('x', arrowX)
        .attr('y', arrowY + 5)
        .attr('text-anchor', 'middle')
        .attr('fill', colors.arrow)
        .attr('font-size', '16px')
        .text('→')
        .attr('transform', `rotate(${step.angle + 45}, ${arrowX}, ${arrowY})`);
    });

    // Center label
    svg.append('text')
      .attr('x', centerX)
      .attr('y', centerY - 10)
      .attr('text-anchor', 'middle')
      .attr('fill', colors.text)
      .attr('font-size', '16px')
      .attr('font-weight', '700')
      .text('ReAct');

    svg.append('text')
      .attr('x', centerX)
      .attr('y', centerY + 12)
      .attr('text-anchor', 'middle')
      .attr('fill', colors.textMuted)
      .attr('font-size', '12px')
      .text('Loop');

    // Title
    svg.append('text')
      .attr('x', 300)
      .attr('y', 40)
      .attr('text-anchor', 'middle')
      .attr('fill', colors.text)
      .attr('font-size', '20px')
      .attr('font-weight', '700')
      .text('🤖 Agentic ReAct Loop');
  },

  // =====================================================
  // DIAGRAM: Tool Categories
  // =====================================================
  renderToolCategories(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    
    const colors = this.getColors();
    const svg = this.createSVG(container, 800, 380);

    const categories = [
      { 
        name: 'File', 
        icon: '📁', 
        tools: ['read_file', 'write_file', 'edit_file', 'search_files', 'list_directory'],
        color: colors.accent1 
      },
      { 
        name: 'Code', 
        icon: '🔍', 
        tools: ['repo_map', 'find_definition', 'find_references', 'get_diagnostics'],
        color: colors.accent2 
      },
      { 
        name: 'Shell', 
        icon: '💻', 
        tools: ['run_command', 'run_tests', 'run_lint'],
        color: colors.accent3 
      },
      { 
        name: 'Git', 
        icon: '🔀', 
        tools: ['git_status', 'git_diff', 'git_commit', 'git_undo', 'git_branch', 'git_log', 'git_stash'],
        color: colors.accent4 
      },
      { 
        name: 'Control', 
        icon: '🎮', 
        tools: ['ask_user', 'report_progress', 'task_complete', 'task_blocked', 'think'],
        color: colors.accent5 
      },
    ];

    const boxWidth = 140;
    const boxHeight = 280;
    const spacing = 16;
    const startX = (800 - (categories.length * boxWidth + (categories.length - 1) * spacing)) / 2;

    // Title
    svg.append('text')
      .attr('x', 400)
      .attr('y', 35)
      .attr('text-anchor', 'middle')
      .attr('fill', colors.text)
      .attr('font-size', '20px')
      .attr('font-weight', '700')
      .text('🛠️ 24 Built-in Tools');

    categories.forEach((cat, i) => {
      const x = startX + i * (boxWidth + spacing);
      const y = 60;

      // Category box
      svg.append('rect')
        .attr('x', x)
        .attr('y', y)
        .attr('width', boxWidth)
        .attr('height', boxHeight)
        .attr('rx', 10)
        .attr('fill', colors.nodeBg)
        .attr('stroke', cat.color)
        .attr('stroke-width', 2);

      // Header
      svg.append('rect')
        .attr('x', x)
        .attr('y', y)
        .attr('width', boxWidth)
        .attr('height', 50)
        .attr('rx', 10)
        .attr('fill', cat.color)
        .attr('opacity', 0.2);

      // Icon
      svg.append('text')
        .attr('x', x + 25)
        .attr('y', y + 35)
        .attr('font-size', '20px')
        .text(cat.icon);

      // Category name
      svg.append('text')
        .attr('x', x + 50)
        .attr('y', y + 35)
        .attr('fill', colors.text)
        .attr('font-size', '14px')
        .attr('font-weight', '700')
        .text(cat.name);

      // Tools list
      cat.tools.forEach((tool, j) => {
        svg.append('text')
          .attr('x', x + 12)
          .attr('y', y + 75 + j * 22)
          .attr('fill', colors.textMuted)
          .attr('font-size', '10px')
          .attr('font-family', 'JetBrains Mono, monospace')
          .text(tool);
      });
    });
  },

  // =====================================================
  // DIAGRAM: Data Flow (Vertical)
  // =====================================================
  renderDataFlow(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    
    const colors = this.getColors();
    const svg = this.createSVG(container, 500, 600);

    const steps = [
      { label: 'WhatsApp Message', icon: '📱', desc: '@fetch fix the bug in auth.ts' },
      { label: 'Security Gate', icon: '🔐', desc: 'Verify @fetch + owner phone' },
      { label: 'Rate Limiter', icon: '⏱️', desc: 'Check 30 req/min limit' },
      { label: 'Input Validator', icon: '🛡️', desc: 'Sanitize dangerous patterns' },
      { label: 'Agent Core', icon: '🤖', desc: 'GPT-4.1-nano ReAct loop' },
      { label: 'Tool Registry', icon: '🛠️', desc: 'Execute file/code/git tools' },
      { label: 'Response', icon: '✅', desc: 'Send result via WhatsApp' },
    ];

    const boxWidth = 300;
    const boxHeight = 60;
    const spacing = 20;
    const startX = (500 - boxWidth) / 2;
    const startY = 30;

    steps.forEach((step, i) => {
      const x = startX;
      const y = startY + i * (boxHeight + spacing);

      // Step box
      svg.append('rect')
        .attr('x', x)
        .attr('y', y)
        .attr('width', boxWidth)
        .attr('height', boxHeight)
        .attr('rx', 10)
        .attr('fill', colors.nodeBg)
        .attr('stroke', colors.nodeBorder)
        .attr('stroke-width', 2);

      // Icon circle
      svg.append('circle')
        .attr('cx', x + 35)
        .attr('cy', y + boxHeight / 2)
        .attr('r', 20)
        .attr('fill', [colors.accent1, colors.accent2, colors.accent3, colors.accent4, colors.accent5, colors.accent1, colors.success][i])
        .attr('opacity', 0.2);

      // Icon
      svg.append('text')
        .attr('x', x + 35)
        .attr('y', y + boxHeight / 2 + 7)
        .attr('text-anchor', 'middle')
        .attr('font-size', '20px')
        .text(step.icon);

      // Label
      svg.append('text')
        .attr('x', x + 70)
        .attr('y', y + 25)
        .attr('fill', colors.text)
        .attr('font-size', '14px')
        .attr('font-weight', '600')
        .text(step.label);

      // Description
      svg.append('text')
        .attr('x', x + 70)
        .attr('y', y + 45)
        .attr('fill', colors.textMuted)
        .attr('font-size', '11px')
        .text(step.desc);

      // Arrow to next step
      if (i < steps.length - 1) {
        const arrowY = y + boxHeight + spacing / 2;
        svg.append('text')
          .attr('x', 250)
          .attr('y', arrowY + 5)
          .attr('text-anchor', 'middle')
          .attr('fill', colors.arrow)
          .attr('font-size', '16px')
          .text('↓');
      }
    });
  },

  // =====================================================
  // DIAGRAM: Session State
  // =====================================================
  renderSessionState(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    
    const colors = this.getColors();
    const svg = this.createSVG(container, 700, 350);

    // Title
    svg.append('text')
      .attr('x', 350)
      .attr('y', 35)
      .attr('text-anchor', 'middle')
      .attr('fill', colors.text)
      .attr('font-size', '20px')
      .attr('font-weight', '700')
      .text('💾 Session State (lowdb)');

    // Main session box
    svg.append('rect')
      .attr('x', 50)
      .attr('y', 60)
      .attr('width', 600)
      .attr('height', 260)
      .attr('rx', 12)
      .attr('fill', colors.nodeBg)
      .attr('stroke', colors.nodeBorder)
      .attr('stroke-width', 2);

    const sections = [
      { title: 'Identity', items: ['userId (phone)', 'sessionId'], x: 70, color: colors.accent1 },
      { title: 'Conversation', items: ['messages[]', '(last 30 in context)'], x: 220, color: colors.accent2 },
      { title: 'Preferences', items: ['autonomyLevel', 'autoCommit', 'verboseMode'], x: 370, color: colors.accent3 },
      { title: 'Task State', items: ['currentTask', 'plan[]', 'iterations'], x: 520, color: colors.accent4 },
    ];

    sections.forEach(section => {
      // Section header
      svg.append('rect')
        .attr('x', section.x)
        .attr('y', 80)
        .attr('width', 130)
        .attr('height', 30)
        .attr('rx', 6)
        .attr('fill', section.color)
        .attr('opacity', 0.2);

      svg.append('text')
        .attr('x', section.x + 65)
        .attr('y', 100)
        .attr('text-anchor', 'middle')
        .attr('fill', colors.text)
        .attr('font-size', '12px')
        .attr('font-weight', '600')
        .text(section.title);

      // Items
      section.items.forEach((item, i) => {
        svg.append('text')
          .attr('x', section.x + 10)
          .attr('y', 135 + i * 24)
          .attr('fill', colors.textMuted)
          .attr('font-size', '11px')
          .attr('font-family', 'JetBrains Mono, monospace')
          .text(item);
      });
    });

    // Why lowdb note
    svg.append('text')
      .attr('x', 350)
      .attr('y', 250)
      .attr('text-anchor', 'middle')
      .attr('fill', colors.textMuted)
      .attr('font-size', '12px')
      .text('✨ Human-readable JSON • Single user optimized • Zero config');

    svg.append('text')
      .attr('x', 350)
      .attr('y', 275)
      .attr('text-anchor', 'middle')
      .attr('fill', colors.textMuted)
      .attr('font-size', '12px')
      .text('📁 Stored at: ./data/sessions.json');
  },

  // =====================================================
  // Initialize all diagrams on page
  // =====================================================
  initAll() {
    // Find all diagram containers and render them
    document.querySelectorAll('[data-diagram]').forEach(container => {
      const type = container.getAttribute('data-diagram');
      switch (type) {
        case 'architecture':
          this.renderArchitecture(container.id);
          break;
        case 'security':
          this.renderSecurityFlow(container.id);
          break;
        case 'react':
          this.renderReActLoop(container.id);
          break;
        case 'tools':
          this.renderToolCategories(container.id);
          break;
        case 'dataflow':
          this.renderDataFlow(container.id);
          break;
        case 'session':
          this.renderSessionState(container.id);
          break;
      }
    });
  },

  // Re-render all on theme change
  refresh() {
    this.initAll();
  }
};

// Export for use
window.FetchDiagrams = FetchDiagrams;
