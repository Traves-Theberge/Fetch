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
    const svg = this.createSVG(container, 850, 480);

    // Host Machine box
    svg.append('rect')
      .attr('x', 20)
      .attr('y', 20)
      .attr('width', 810)
      .attr('height', 380)
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
    svg.append('rect')
      .attr('x', 50)
      .attr('y', 80)
      .attr('width', 180)
      .attr('height', 200)
      .attr('rx', 12)
      .attr('fill', colors.nodeBg)
      .attr('stroke', colors.accent4)
      .attr('stroke-width', 2);
    
    svg.append('text')
      .attr('x', 140)
      .attr('y', 115)
      .attr('text-anchor', 'middle')
      .attr('font-size', '24px')
      .text('🎛️');
    
    svg.append('text')
      .attr('x', 140)
      .attr('y', 140)
      .attr('text-anchor', 'middle')
      .attr('fill', colors.text)
      .attr('font-size', '14px')
      .attr('font-weight', '600')
      .text('Go Manager');
    
    svg.append('text')
      .attr('x', 140)
      .attr('y', 160)
      .attr('text-anchor', 'middle')
      .attr('fill', colors.textMuted)
      .attr('font-size', '11px')
      .text('(TUI)');
    
    // Manager features
    const features = ['• Start/Stop', '• Configure', '• View Logs', '• Select Model'];
    features.forEach((f, i) => {
      svg.append('text')
        .attr('x', 65)
        .attr('y', 190 + i * 22)
        .attr('fill', colors.textMuted)
        .attr('font-size', '12px')
        .text(f);
    });

    // Docker Compose box
    svg.append('rect')
      .attr('x', 300)
      .attr('y', 70)
      .attr('width', 500)
      .attr('height', 250)
      .attr('rx', 12)
      .attr('fill', colors.nodeBg)
      .attr('stroke', colors.accent1)
      .attr('stroke-width', 2);

    svg.append('text')
      .attr('x', 320)
      .attr('y', 100)
      .attr('fill', colors.accent1)
      .attr('font-size', '14px')
      .attr('font-weight', '600')
      .text('🐳 Docker Compose');

    // Bridge container
    svg.append('rect')
      .attr('x', 320)
      .attr('y', 120)
      .attr('width', 220)
      .attr('height', 180)
      .attr('rx', 10)
      .attr('fill', colors.bg)
      .attr('stroke', colors.accent3)
      .attr('stroke-width', 2);

    svg.append('text')
      .attr('x', 430)
      .attr('y', 150)
      .attr('text-anchor', 'middle')
      .attr('fill', colors.accent3)
      .attr('font-size', '16px')
      .attr('font-weight', '600')
      .text('🌉 Bridge');
    
    svg.append('text')
      .attr('x', 430)
      .attr('y', 170)
      .attr('text-anchor', 'middle')
      .attr('fill', colors.textMuted)
      .attr('font-size', '11px')
      .text('(Node.js)');

    const bridgeFeatures = ['WhatsApp Client', 'Security Gate', 'Agent Core', 'Tool Registry', 'Status API :8765'];
    bridgeFeatures.forEach((f, i) => {
      svg.append('text')
        .attr('x', 430)
        .attr('y', 200 + i * 20)
        .attr('text-anchor', 'middle')
        .attr('fill', colors.text)
        .attr('font-size', '11px')
        .text(f);
    });

    // Kennel container
    svg.append('rect')
      .attr('x', 560)
      .attr('y', 120)
      .attr('width', 220)
      .attr('height', 180)
      .attr('rx', 10)
      .attr('fill', colors.bg)
      .attr('stroke', colors.accent2)
      .attr('stroke-width', 2);

    svg.append('text')
      .attr('x', 670)
      .attr('y', 150)
      .attr('text-anchor', 'middle')
      .attr('fill', colors.accent2)
      .attr('font-size', '16px')
      .attr('font-weight', '600')
      .text('🏠 Kennel');
    
    svg.append('text')
      .attr('x', 670)
      .attr('y', 170)
      .attr('text-anchor', 'middle')
      .attr('fill', colors.textMuted)
      .attr('font-size', '11px')
      .text('(Ubuntu)');

    const kennelFeatures = ['Claude Code CLI', 'Gemini CLI', 'GitHub Copilot', '/workspace mount'];
    kennelFeatures.forEach((f, i) => {
      svg.append('text')
        .attr('x', 670)
        .attr('y', 200 + i * 24)
        .attr('text-anchor', 'middle')
        .attr('fill', colors.text)
        .attr('font-size', '11px')
        .text(f);
    });

    // WhatsApp node
    svg.append('rect')
      .attr('x', 360)
      .attr('y', 350)
      .attr('width', 140)
      .attr('height', 60)
      .attr('rx', 30)
      .attr('fill', colors.nodeBg)
      .attr('stroke', colors.success)
      .attr('stroke-width', 2);
    svg.append('text')
      .attr('x', 430)
      .attr('y', 380)
      .attr('text-anchor', 'middle')
      .attr('fill', colors.text)
      .attr('font-size', '13px')
      .attr('font-weight', '600')
      .text('📱 WhatsApp');

    // Workspace node
    svg.append('rect')
      .attr('x', 600)
      .attr('y', 350)
      .attr('width', 140)
      .attr('height', 60)
      .attr('rx', 10)
      .attr('fill', colors.nodeBg)
      .attr('stroke', colors.accent4)
      .attr('stroke-width', 2);
    svg.append('text')
      .attr('x', 670)
      .attr('y', 380)
      .attr('text-anchor', 'middle')
      .attr('fill', colors.text)
      .attr('font-size', '13px')
      .attr('font-weight', '600')
      .text('📁 /workspace');

    // Arrows
    this.drawArrow(svg, 230, 180, 295, 180); // Manager -> Docker
    this.drawArrow(svg, 430, 300, 430, 345); // Bridge -> WhatsApp
    this.drawArrow(svg, 670, 300, 670, 345); // Kennel -> Workspace
    this.drawArrow(svg, 540, 210, 555, 210); // Bridge -> Kennel

    // Labels
    svg.append('text')
      .attr('x', 262)
      .attr('y', 168)
      .attr('fill', colors.textMuted)
      .attr('font-size', '10px')
      .text('docker');
    svg.append('text')
      .attr('x', 255)
      .attr('y', 180)
      .attr('fill', colors.textMuted)
      .attr('font-size', '10px')
      .text('compose');

    // Title at bottom
    svg.append('text')
      .attr('x', 425)
      .attr('y', 450)
      .attr('text-anchor', 'middle')
      .attr('fill', colors.textMuted)
      .attr('font-size', '12px')
      .text('🏗️ V3.3 Architecture: TUI → Docker → WhatsApp + AI Harnesses');
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
        name: 'Workspace', 
        icon: '📁', 
        tools: ['workspace_list', 'workspace_select', 'workspace_status', 'workspace_create', 'workspace_delete'],
        color: colors.accent1 
      },
      { 
        name: 'Task', 
        icon: '🚀', 
        tools: ['task_create', 'task_status', 'task_cancel', 'task_respond'],
        color: colors.accent2 
      },
      { 
        name: 'Interaction', 
        icon: '💬', 
        tools: ['ask_user', 'report_progress'],
        color: colors.accent3 
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
      .text('🛠️ 11 Orchestrator Tools');

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
    const svg = this.createSVG(container, 750, 380);

    // Title
    svg.append('text')
      .attr('x', 375)
      .attr('y', 40)
      .attr('text-anchor', 'middle')
      .attr('fill', colors.text)
      .attr('font-size', '20px')
      .attr('font-weight', '700')
      .text('💾 Session State (SQLite)');

    // Main session box
    svg.append('rect')
      .attr('x', 40)
      .attr('y', 70)
      .attr('width', 670)
      .attr('height', 260)
      .attr('rx', 12)
      .attr('fill', colors.nodeBg)
      .attr('stroke', colors.nodeBorder)
      .attr('stroke-width', 2);

    const sections = [
      { title: 'Identity', items: ['userId (phone)', 'sessionId'], x: 60, color: colors.accent1 },
      { title: 'Conversation', items: ['messages[]', 'threads[]'], x: 220, color: colors.accent2 },
      { title: 'Preferences', items: ['autonomyLevel', 'autoCommit', 'verboseMode'], x: 390, color: colors.accent3 },
      { title: 'Task State', items: ['activeTaskId', 'gitStartCommit'], x: 560, color: colors.accent4 },
    ];

    sections.forEach(section => {
      // Section header
      svg.append('rect')
        .attr('x', section.x)
        .attr('y', 95)
        .attr('width', 140)
        .attr('height', 35)
        .attr('rx', 6)
        .attr('fill', section.color)
        .attr('opacity', 0.2);

      svg.append('text')
        .attr('x', section.x + 70)
        .attr('y', 118)
        .attr('text-anchor', 'middle')
        .attr('fill', colors.text)
        .attr('font-size', '13px')
        .attr('font-weight', '600')
        .text(section.title);

      // Items
      section.items.forEach((item, i) => {
        svg.append('text')
          .attr('x', section.x + 12)
          .attr('y', 160 + i * 28)
          .attr('fill', colors.textMuted)
          .attr('font-size', '11px')
          .attr('font-family', 'JetBrains Mono, monospace')
          .text(item);
      });
    });

    // Why SQLite note
    svg.append('text')
      .attr('x', 375)
      .attr('y', 275)
      .attr('text-anchor', 'middle')
      .attr('fill', colors.textMuted)
      .attr('font-size', '12px')
      .text('✨ ACID compliant • WAL mode • Zero config • Crash-safe');

    svg.append('text')
      .attr('x', 375)
      .attr('y', 300)
      .attr('text-anchor', 'middle')
      .attr('fill', colors.textMuted)
      .attr('font-size', '12px')
      .text('📁 Stored at: ./data/sessions.db');
  },

  // =====================================================
  // DIAGRAM: Message Flow (Intent Classification)
  // =====================================================
  renderMessageFlow(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    
    const colors = this.getColors();
    const svg = this.createSVG(container, 700, 520);

    // Title
    svg.append('text')
      .attr('x', 350)
      .attr('y', 35)
      .attr('text-anchor', 'middle')
      .attr('fill', colors.text)
      .attr('font-size', '20px')
      .attr('font-weight', '700')
      .text('📨 Message Flow & Intent Classification');

    // Input node
    const inputY = 70;
    svg.append('rect')
      .attr('x', 250)
      .attr('y', inputY)
      .attr('width', 200)
      .attr('height', 50)
      .attr('rx', 25)
      .attr('fill', colors.accent1)
      .attr('opacity', 0.2);
    svg.append('rect')
      .attr('x', 250)
      .attr('y', inputY)
      .attr('width', 200)
      .attr('height', 50)
      .attr('rx', 25)
      .attr('fill', 'none')
      .attr('stroke', colors.accent1)
      .attr('stroke-width', 2);
    svg.append('text')
      .attr('x', 350)
      .attr('y', inputY + 30)
      .attr('text-anchor', 'middle')
      .attr('fill', colors.text)
      .attr('font-size', '14px')
      .attr('font-weight', '600')
      .text('📱 WhatsApp Message');

    // Arrow down
    svg.append('text')
      .attr('x', 350)
      .attr('y', 145)
      .attr('text-anchor', 'middle')
      .attr('fill', colors.arrow)
      .attr('font-size', '20px')
      .text('↓');

    // Intent Classifier
    const classifierY = 160;
    svg.append('rect')
      .attr('x', 225)
      .attr('y', classifierY)
      .attr('width', 250)
      .attr('height', 60)
      .attr('rx', 10)
      .attr('fill', colors.nodeBg)
      .attr('stroke', colors.accent2)
      .attr('stroke-width', 2);
    svg.append('text')
      .attr('x', 350)
      .attr('y', classifierY + 25)
      .attr('text-anchor', 'middle')
      .attr('fill', colors.text)
      .attr('font-size', '14px')
      .attr('font-weight', '600')
      .text('🧠 Intent Classifier');
    svg.append('text')
      .attr('x', 350)
      .attr('y', classifierY + 45)
      .attr('text-anchor', 'middle')
      .attr('fill', colors.textMuted)
      .attr('font-size', '11px')
      .text('Analyzes message to determine mode');

    // Branching arrows
    const branchY = 250;
    svg.append('path')
      .attr('d', `M 350 220 L 350 ${branchY} L 130 ${branchY + 30}`)
      .attr('fill', 'none')
      .attr('stroke', colors.arrow)
      .attr('stroke-width', 2);
    svg.append('path')
      .attr('d', `M 350 ${branchY} L 350 ${branchY + 30}`)
      .attr('fill', 'none')
      .attr('stroke', colors.arrow)
      .attr('stroke-width', 2);
    svg.append('path')
      .attr('d', `M 350 ${branchY} L 570 ${branchY + 30}`)
      .attr('fill', 'none')
      .attr('stroke', colors.arrow)
      .attr('stroke-width', 2);

    // Intent boxes
    const intents = [
      { icon: '💬', label: 'Conversation', desc: 'Chat, greetings', x: 70, color: colors.accent1 },
      { icon: '🔍', label: 'Inquiry', desc: 'Questions, status', x: 290, color: colors.accent2 },
      { icon: '⚡', label: 'Action', desc: 'Code tasks, tools', x: 510, color: colors.accent3 },
    ];

    const intentY = 290;
    intents.forEach(intent => {
      svg.append('rect')
        .attr('x', intent.x)
        .attr('y', intentY)
        .attr('width', 120)
        .attr('height', 80)
        .attr('rx', 10)
        .attr('fill', colors.nodeBg)
        .attr('stroke', intent.color)
        .attr('stroke-width', 2);
      svg.append('text')
        .attr('x', intent.x + 60)
        .attr('y', intentY + 30)
        .attr('text-anchor', 'middle')
        .attr('font-size', '24px')
        .text(intent.icon);
      svg.append('text')
        .attr('x', intent.x + 60)
        .attr('y', intentY + 52)
        .attr('text-anchor', 'middle')
        .attr('fill', colors.text)
        .attr('font-size', '12px')
        .attr('font-weight', '600')
        .text(intent.label);
      svg.append('text')
        .attr('x', intent.x + 60)
        .attr('y', intentY + 68)
        .attr('text-anchor', 'middle')
        .attr('fill', colors.textMuted)
        .attr('font-size', '10px')
        .text(intent.desc);
    });

    // Arrows to outcomes
    const outcomeY = 400;
    intents.forEach(intent => {
      svg.append('text')
        .attr('x', intent.x + 60)
        .attr('y', intentY + 95)
        .attr('text-anchor', 'middle')
        .attr('fill', colors.arrow)
        .attr('font-size', '16px')
        .text('↓');
    });

    // Outcome boxes
    const outcomes = [
      { label: 'Direct LLM', x: 70 },
      { label: 'Read-Only Tools', x: 290 },
      { label: 'Full ReAct Loop', x: 510 },
    ];

    outcomes.forEach((outcome, i) => {
      svg.append('rect')
        .attr('x', outcome.x)
        .attr('y', outcomeY)
        .attr('width', 120)
        .attr('height', 40)
        .attr('rx', 8)
        .attr('fill', intents[i].color)
        .attr('opacity', 0.15);
      svg.append('rect')
        .attr('x', outcome.x)
        .attr('y', outcomeY)
        .attr('width', 120)
        .attr('height', 40)
        .attr('rx', 8)
        .attr('fill', 'none')
        .attr('stroke', intents[i].color)
        .attr('stroke-width', 1);
      svg.append('text')
        .attr('x', outcome.x + 60)
        .attr('y', outcomeY + 25)
        .attr('text-anchor', 'middle')
        .attr('fill', colors.text)
        .attr('font-size', '11px')
        .text(outcome.label);
    });

    // Converge to response
    svg.append('path')
      .attr('d', `M 130 440 L 130 465 L 350 480 M 350 440 L 350 480 M 570 440 L 570 465 L 350 480`)
      .attr('fill', 'none')
      .attr('stroke', colors.arrow)
      .attr('stroke-width', 2);

    // Response node
    svg.append('rect')
      .attr('x', 275)
      .attr('y', 470)
      .attr('width', 150)
      .attr('height', 40)
      .attr('rx', 20)
      .attr('fill', colors.success)
      .attr('opacity', 0.2);
    svg.append('rect')
      .attr('x', 275)
      .attr('y', 470)
      .attr('width', 150)
      .attr('height', 40)
      .attr('rx', 20)
      .attr('fill', 'none')
      .attr('stroke', colors.success)
      .attr('stroke-width', 2);
    svg.append('text')
      .attr('x', 350)
      .attr('y', 495)
      .attr('text-anchor', 'middle')
      .attr('fill', colors.text)
      .attr('font-size', '13px')
      .attr('font-weight', '600')
      .text('✅ WhatsApp Reply');
  },

  // =====================================================
  // DIAGRAM: Harness System
  // =====================================================
  renderHarnessSystem(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    
    const colors = this.getColors();
    const svg = this.createSVG(container, 750, 380);

    // Title
    svg.append('text')
      .attr('x', 375)
      .attr('y', 35)
      .attr('text-anchor', 'middle')
      .attr('fill', colors.text)
      .attr('font-size', '20px')
      .attr('font-weight', '700')
      .text('🤖 Harness System - CLI Delegation');

    // Orchestrator box
    svg.append('rect')
      .attr('x', 275)
      .attr('y', 60)
      .attr('width', 200)
      .attr('height', 70)
      .attr('rx', 12)
      .attr('fill', colors.nodeBg)
      .attr('stroke', colors.accent1)
      .attr('stroke-width', 2);
    svg.append('text')
      .attr('x', 375)
      .attr('y', 90)
      .attr('text-anchor', 'middle')
      .attr('fill', colors.text)
      .attr('font-size', '14px')
      .attr('font-weight', '600')
      .text('🎯 Fetch Orchestrator');
    svg.append('text')
      .attr('x', 375)
      .attr('y', 115)
      .attr('text-anchor', 'middle')
      .attr('fill', colors.textMuted)
      .attr('font-size', '11px')
      .text('Intent: Task → Delegate');

    // Branching lines
    svg.append('path')
      .attr('d', 'M 375 130 L 375 160 L 125 180')
      .attr('fill', 'none')
      .attr('stroke', colors.arrow)
      .attr('stroke-width', 2);
    svg.append('path')
      .attr('d', 'M 375 160 L 375 180')
      .attr('fill', 'none')
      .attr('stroke', colors.arrow)
      .attr('stroke-width', 2);
    svg.append('path')
      .attr('d', 'M 375 160 L 625 180')
      .attr('fill', 'none')
      .attr('stroke', colors.arrow)
      .attr('stroke-width', 2);

    // Harness boxes
    const harnesses = [
      { 
        name: 'Claude Code', 
        icon: '🟣', 
        cli: 'claude', 
        bestFor: 'Complex refactoring',
        features: ['Multi-file changes', 'Code analysis', 'Architectural tasks'],
        x: 50, 
        color: colors.accent2 
      },
      { 
        name: 'Gemini CLI', 
        icon: '🔵', 
        cli: 'gemini', 
        bestFor: 'Quick edits',
        features: ['Fast responses', 'Explanations', 'Simple fixes'],
        x: 300, 
        color: colors.accent1 
      },
      { 
        name: 'GitHub Copilot', 
        icon: '⚫', 
        cli: 'gh copilot', 
        bestFor: 'Suggestions',
        features: ['Command help', 'Code completion', 'Git workflows'],
        x: 550, 
        color: colors.accent3 
      },
    ];

    harnesses.forEach(h => {
      // Harness card
      svg.append('rect')
        .attr('x', h.x)
        .attr('y', 190)
        .attr('width', 150)
        .attr('height', 150)
        .attr('rx', 10)
        .attr('fill', colors.nodeBg)
        .attr('stroke', h.color)
        .attr('stroke-width', 2);

      // Header
      svg.append('rect')
        .attr('x', h.x)
        .attr('y', 190)
        .attr('width', 150)
        .attr('height', 45)
        .attr('rx', 10)
        .attr('fill', h.color)
        .attr('opacity', 0.15);

      // Icon and name
      svg.append('text')
        .attr('x', h.x + 20)
        .attr('y', 218)
        .attr('font-size', '18px')
        .text(h.icon);
      svg.append('text')
        .attr('x', h.x + 45)
        .attr('y', 218)
        .attr('fill', colors.text)
        .attr('font-size', '13px')
        .attr('font-weight', '600')
        .text(h.name);

      // CLI command
      svg.append('text')
        .attr('x', h.x + 75)
        .attr('y', 260)
        .attr('text-anchor', 'middle')
        .attr('fill', colors.accent1)
        .attr('font-size', '11px')
        .attr('font-family', 'JetBrains Mono, monospace')
        .text(`$ ${h.cli}`);

      // Features
      h.features.forEach((f, i) => {
        svg.append('text')
          .attr('x', h.x + 12)
          .attr('y', 285 + i * 18)
          .attr('fill', colors.textMuted)
          .attr('font-size', '10px')
          .text(`• ${f}`);
      });
    });

    // Legend
    svg.append('text')
      .attr('x', 375)
      .attr('y', 365)
      .attr('text-anchor', 'middle')
      .attr('fill', colors.textMuted)
      .attr('font-size', '11px')
      .text('🔄 Tasks execute in Kennel container with /workspace mounted');
  },

  // =====================================================
  // DIAGRAM: State Flow (V3 State Machine)
  // =====================================================
  renderStateFlow(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    
    const colors = this.getColors();
    const svg = this.createSVG(container, 800, 500);

    // Draw nodes
    const alert = this.drawNode(svg.append('g'), 350, 50, 120, 80, 'ALERT', '🟢', colors.success);
    const working = this.drawNode(svg.append('g'), 350, 250, 120, 80, 'WORKING', '🔵', colors.accent1);
    const waiting = this.drawNode(svg.append('g'), 600, 250, 120, 80, 'WAITING', '🟠', colors.warning);
    const guarding = this.drawNode(svg.append('g'), 100, 250, 120, 80, 'GUARDING', '🔴', colors.error);
    const resting = this.drawNode(svg.append('g'), 350, 400, 120, 80, 'RESTING', '💤', colors.nodeBg);

    // Draw labels for transitions
    const label = (x, y, text) => {
        svg.append('text')
           .attr('x', x)
           .attr('y', y)
           .attr('text-anchor', 'middle')
           .attr('fill', colors.textMuted)
           .attr('font-size', '11px')
           .style('background', colors.bg)
           .text(text);
    };

    // Transitions
    // Alert -> Working
    this.drawArrow(svg, 410, 130, 410, 250);
    label(440, 190, 'Task Start');

    // Working -> Alert
    this.drawArrow(svg, 380, 250, 380, 130);
    label(350, 190, 'Complete/Stop');

    // Working -> Waiting
    this.drawArrow(svg, 470, 280, 600, 280);
    label(535, 275, 'Ask User');

    // Waiting -> Working
    this.drawArrow(svg, 600, 300, 470, 300);
    label(535, 315, 'Input Received');
    
    // Alert -> Guarding
    this.drawArrow(svg, 350, 90, 160, 250, true);
    label(220, 150, 'Dangerous Action');

    // Guarding -> Working
    this.drawArrow(svg, 220, 290, 350, 290);
    label(285, 305, 'Approved');

    // Guarding -> Alert
    this.drawArrow(svg, 160, 250, 350, 110, true);
    label(230, 190, 'Denied');

    // Alert -> Resting
    this.drawArrow(svg, 470, 90, 470, 400, true);
    label(500, 380, 'Timeout');

    // Resting -> Alert
    this.drawArrow(svg, 410, 400, 410, 130);
    label(430, 380, 'Wake Word');
  },

  // =====================================================
  // DIAGRAM: Docker Architecture
  // =====================================================
  renderDockerArchitecture(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    const colors = this.getColors();
    const svg = this.createSVG(container, 800, 520);

    // Title
    svg.append('text')
      .attr('x', 400)
      .attr('y', 35)
      .attr('text-anchor', 'middle')
      .attr('fill', colors.text)
      .attr('font-size', '20px')
      .attr('font-weight', '700')
      .text('🐳 Docker Architecture');

    // Host machine outline
    svg.append('rect')
      .attr('x', 20)
      .attr('y', 55)
      .attr('width', 760)
      .attr('height', 440)
      .attr('rx', 12)
      .attr('fill', 'none')
      .attr('stroke', colors.nodeBorder)
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '8,4');
    svg.append('text')
      .attr('x', 40)
      .attr('y', 78)
      .attr('fill', colors.textMuted)
      .attr('font-size', '12px')
      .text('🖥️ Host Machine');

    // Docker network outline
    svg.append('rect')
      .attr('x', 50)
      .attr('y', 95)
      .attr('width', 700)
      .attr('height', 310)
      .attr('rx', 10)
      .attr('fill', colors.accent1)
      .attr('opacity', 0.05);
    svg.append('rect')
      .attr('x', 50)
      .attr('y', 95)
      .attr('width', 700)
      .attr('height', 310)
      .attr('rx', 10)
      .attr('fill', 'none')
      .attr('stroke', colors.accent1)
      .attr('stroke-width', 1.5);
    svg.append('text')
      .attr('x', 70)
      .attr('y', 118)
      .attr('fill', colors.accent1)
      .attr('font-size', '12px')
      .attr('font-weight', '600')
      .text('fetch-network (bridge)');

    // ── Bridge Container ──
    const bx = 80, by = 135, bw = 310, bh = 250;
    svg.append('rect')
      .attr('x', bx).attr('y', by)
      .attr('width', bw).attr('height', bh)
      .attr('rx', 10)
      .attr('fill', colors.nodeBg)
      .attr('stroke', colors.accent2)
      .attr('stroke-width', 2);
    // Bridge header
    svg.append('rect')
      .attr('x', bx).attr('y', by)
      .attr('width', bw).attr('height', 40)
      .attr('rx', 10)
      .attr('fill', colors.accent2)
      .attr('opacity', 0.2);
    svg.append('text')
      .attr('x', bx + bw/2).attr('y', by + 26)
      .attr('text-anchor', 'middle')
      .attr('fill', colors.text)
      .attr('font-size', '14px')
      .attr('font-weight', '700')
      .text('🌉 fetch-bridge');

    // Bridge internals
    const bridgeParts = [
      { label: 'WhatsApp Client', icon: '📱', y: by + 55 },
      { label: 'Intent Classifier', icon: '🧠', y: by + 80 },
      { label: 'Session Manager', icon: '💾', y: by + 105 },
      { label: 'Task Manager', icon: '📋', y: by + 130 },
      { label: 'Security Gate', icon: '🔒', y: by + 155 },
      { label: 'Status API :8765', icon: '🔌', y: by + 180 },
      { label: 'Proactive System', icon: '⏰', y: by + 205 },
    ];
    bridgeParts.forEach(p => {
      svg.append('text')
        .attr('x', bx + 20).attr('y', p.y)
        .attr('fill', colors.textMuted)
        .attr('font-size', '11px')
        .text(`${p.icon} ${p.label}`);
    });

    // ── Kennel Container ──
    const kx = 430, ky = 135, kw = 300, kh = 250;
    svg.append('rect')
      .attr('x', kx).attr('y', ky)
      .attr('width', kw).attr('height', kh)
      .attr('rx', 10)
      .attr('fill', colors.nodeBg)
      .attr('stroke', colors.accent3)
      .attr('stroke-width', 2);
    // Kennel header
    svg.append('rect')
      .attr('x', kx).attr('y', ky)
      .attr('width', kw).attr('height', 40)
      .attr('rx', 10)
      .attr('fill', colors.accent3)
      .attr('opacity', 0.2);
    svg.append('text')
      .attr('x', kx + kw/2).attr('y', ky + 26)
      .attr('text-anchor', 'middle')
      .attr('fill', colors.text)
      .attr('font-size', '14px')
      .attr('font-weight', '700')
      .text('🏠 fetch-kennel');

    // Kennel internals
    const kennelParts = [
      { label: 'Claude Code CLI', icon: '🤖', y: ky + 60 },
      { label: 'GitHub Copilot CLI', icon: '🐙', y: ky + 85 },
      { label: 'Gemini CLI', icon: '♊', y: ky + 110 },
      { label: 'Node.js / npm', icon: '📦', y: ky + 140 },
      { label: 'Git', icon: '🔀', y: ky + 165 },
      { label: 'gh CLI', icon: '🐈', y: ky + 190 },
    ];
    kennelParts.forEach(p => {
      svg.append('text')
        .attr('x', kx + 20).attr('y', p.y)
        .attr('fill', colors.textMuted)
        .attr('font-size', '11px')
        .text(`${p.icon} ${p.label}`);
    });

    // Resource limits badge
    svg.append('text')
      .attr('x', kx + kw/2).attr('y', ky + kh - 15)
      .attr('text-anchor', 'middle')
      .attr('fill', colors.warning)
      .attr('font-size', '10px')
      .text('⚠️ 2 CPU / 2GB RAM limit');

    // ── docker exec arrow between containers ──
    svg.append('path')
      .attr('d', 'M 390 230 L 430 230')
      .attr('fill', 'none')
      .attr('stroke', colors.accent4)
      .attr('stroke-width', 2)
      .attr('marker-end', 'url(#arrowhead)');
    svg.append('path')
      .attr('d', 'M 430 250 L 390 250')
      .attr('fill', 'none')
      .attr('stroke', colors.accent4)
      .attr('stroke-width', 2)
      .attr('marker-end', 'url(#arrowhead)');
    svg.append('text')
      .attr('x', 410).attr('y', 220)
      .attr('text-anchor', 'middle')
      .attr('fill', colors.accent4)
      .attr('font-size', '9px')
      .attr('font-weight', '600')
      .text('docker exec');
    svg.append('text')
      .attr('x', 410).attr('y', 268)
      .attr('text-anchor', 'middle')
      .attr('fill', colors.accent4)
      .attr('font-size', '9px')
      .text('stdout/stderr');

    // Arrowhead marker
    svg.append('defs').append('marker')
      .attr('id', 'arrowhead')
      .attr('viewBox', '0 0 10 10')
      .attr('refX', 10).attr('refY', 5)
      .attr('markerWidth', 6).attr('markerHeight', 6)
      .attr('orient', 'auto-start-reverse')
      .append('path')
      .attr('d', 'M 0 0 L 10 5 L 0 10 z')
      .attr('fill', colors.accent4);

    // ── Volume mounts at bottom ──
    const vy = 420;
    const volumes = [
      { label: './data', targets: 'Bridge', icon: '💾', x: 100 },
      { label: './workspace', targets: 'Both', icon: '📂', x: 250 },
      { label: 'docker.sock', targets: 'Bridge (ro)', icon: '🔌', x: 400 },
      { label: '~/.config/*', targets: 'Kennel (ro)', icon: '🔑', x: 570 },
    ];

    svg.append('text')
      .attr('x', 400).attr('y', vy)
      .attr('text-anchor', 'middle')
      .attr('fill', colors.text)
      .attr('font-size', '13px')
      .attr('font-weight', '600')
      .text('📁 Volume Mounts');

    volumes.forEach(v => {
      // Volume box
      svg.append('rect')
        .attr('x', v.x - 55).attr('y', vy + 10)
        .attr('width', 130).attr('height', 50)
        .attr('rx', 6)
        .attr('fill', colors.nodeBg)
        .attr('stroke', colors.nodeBorder)
        .attr('stroke-width', 1);
      svg.append('text')
        .attr('x', v.x + 10).attr('y', vy + 33)
        .attr('text-anchor', 'middle')
        .attr('fill', colors.text)
        .attr('font-size', '11px')
        .attr('font-weight', '600')
        .text(`${v.icon} ${v.label}`);
      svg.append('text')
        .attr('x', v.x + 10).attr('y', vy + 49)
        .attr('text-anchor', 'middle')
        .attr('fill', colors.textMuted)
        .attr('font-size', '9px')
        .text(`→ ${v.targets}`);
    });

    // Port exposure annotation
    svg.append('text')
      .attr('x', 400).attr('y', 505)
      .attr('text-anchor', 'middle')
      .attr('fill', colors.textMuted)
      .attr('font-size', '11px')
      .text('Port 8765 exposed to host for Status API + Docs Site');
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
        case 'stateflow':
          this.renderStateFlow(container.id);
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
        case 'messageflow':
          this.renderMessageFlow(container.id);
          break;
        case 'harness':
          this.renderHarnessSystem(container.id);
          break;
        case 'docker':
          this.renderDockerArchitecture(container.id);
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
