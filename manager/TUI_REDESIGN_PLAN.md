# Fetch TUI Redesign Plan

> **Goal**: Transform the Fetch Manager TUI into a stunning, professional terminal interface using Charmbracelet's ecosystem (Lipgloss, Bubbles, and Log).

---

## � Splash & Version Screens

### Splash Screen (Startup)
Display the ASCII dog logo on application launch for 1-2 seconds:

```
  ⠀⠀⠀⠀⠀⠀⠀⢀⣠⣤⣠⣶⠚⠛⠿⠷⠶⣤⣀⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
  ⠀⠀⠀⠀⠀⢀⣴⠟⠉⠀⠀⢠⡄⠀⠀⠀⠀⠀⠉⠙⠳⣄⠀⠀⠀⠀⠀⠀⠀⠀
  ⠀⠀⠀⢀⡴⠛⠁⠀⠀⠀⠀⠘⣷⣴⠏⠀⠀⣠⡄⠀⠀⢨⡇⠀⠀⠀⠀⠀⠀⠀    ███████╗███████╗████████╗ ██████╗██╗  ██╗
  ⠀⠀⠀⠺⣇⠀⠀⠀⠀⠀⠀⠀⠘⣿⠀⠀⠘⣻⣻⡆⠀⠀⠙⠦⣄⣀⠀⠀⠀⠀    ██╔════╝██╔════╝╚══██╔══╝██╔════╝██║  ██║
  ⠀⠀⠀⢰⡟⢷⡄⠀⠀⠀⠀⠀⠀⢸⡄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠉⢻⠶⢤⡀    █████╗  █████╗     ██║   ██║     ███████║
  ⠀⠀⠀⣾⣇⠀⠻⣄⠀⠀⠀⠀⠀⢸⡇⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠸⣀⣴⣿    ██╔══╝  ██╔══╝     ██║   ██║     ██╔══██║
  ⠀⠀⢸⡟⠻⣆⠀⠈⠳⢄⡀⠀⠀⡼⠃⠀⠀⠀⠀⠀⠀⠀⠀⠀⠶⠶⢤⣬⡿⠁    ██║     ███████╗   ██║   ╚██████╗██║  ██║
  ⠀⢀⣿⠃⠀⠹⣆⠀⠀⠀⠙⠓⠿⢧⡀⠀⢠⡴⣶⣶⣒⣋⣀⣀⣤⣶⣶⠟⠁⠀    ╚═╝     ╚══════╝   ╚═╝    ╚═════╝╚═╝  ╚═╝
  ⠀⣼⡏⠀⠀⠀⠙⠀⠀⠀⠀⠀⠀⠀⠙⠳⠶⠤⠵⣶⠒⠚⠻⠿⠋⠁⠀⠀⠀⠀
  ⢰⣿⡇⠀⠀⠀⠀⠀⠀⠀⣆⠀⠀⠀⠀⠀⠀⠀⢠⣿⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀    Your Faithful Code Companion
  ⢿⡿⠁⠀⠀⠀⠀⠀⠀⠀⠘⣦⡀⠀⠀⠀⠀⠀⢸⣿⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀   
  ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠻⣷⡄⠀⠀⠀⠀⣿⣧⠀⠀⠀⠀⠀⠀⠀⠀⠀
  ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⢷⡀⠀⠀⠀⢸⣿⡄⠀⠀⠀⠀⠀⠀⠀⠀
  ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠸⣿⠇⠀⠀⠀⠀⠀⠀⠀⠀
```

### Version Screen (Linux-style `neofetch`) ✅ IMPLEMENTED
Accessible via menu option or `v` key. Displays dog art on left, info on right:

```
  ⠀⠀⠀⠀⠀⠀⠀⢀⣠⣤⣠⣶⠚⠛⠿⠷⠶⣤⣀⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀    FETCH
  ⠀⠀⠀⠀⠀⢀⣴⠟⠉⠀⠀⢠⡄⠀⠀⠀⠀⠀⠉⠙⠳⣄⠀⠀⠀⠀⠀⠀⠀⠀    ────────────────────────────────────────
  ⠀⠀⠀⢀⡴⠛⠁⠀⠀⠀⠀⠘⣷⣴⠏⠀⠀⣠⡄⠀⠀⢨⡇⠀⠀⠀⠀⠀⠀⠀    
  ⠀⠀⠀⠺⣇⠀⠀⠀⠀⠀⠀⠀⠘⣿⠀⠀⠘⣻⣻⡆⠀⠀⠙⠦⣄⣀⠀⠀⠀⠀    Version  v1.0.0-dev
  ⠀⠀⠀⢰⡟⢷⡄⠀⠀⠀⠀⠀⠀⢸⡄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠉⢻⠶⢤⡀    Build    development
  ⠀⠀⠀⣾⣇⠀⠻⣄⠀⠀⠀⠀⠀⢸⡇⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠸⣀⣴⣿    Go       go1.23.0
  ⠀⠀⢸⡟⠻⣆⠀⠈⠳⢄⡀⠀⠀⡼⠃⠀⠀⠀⠀⠀⠀⠀⠀⠀⠶⠶⢤⣬⡿⠁    Commit   local
  ⠀⢀⣿⠃⠀⠹⣆⠀⠀⠀⠙⠓⠿⢧⡀⠀⢠⡴⣶⣶⣒⣋⣀⣀⣤⣶⣶⠟⠁⠀    
  ⠀⣼⡏⠀⠀⠀⠙⠀⠀⠀⠀⠀⠀⠀⠙⠳⠶⠤⠵⣶⠒⠚⠻⠿⠋⠁⠀⠀⠀⠀    Components
  ⢰⣿⡇⠀⠀⠀⠀⠀⠀⠀⣆⠀⠀⠀⠀⠀⠀⠀⢠⣿⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀    ├─ Bridge  WhatsApp ↔ AI Gateway
  ⢿⡿⠁⠀⠀⠀⠀⠀⠀⠀⠘⣦⡀⠀⠀⠀⠀⠀⢸⣿⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀    ├─ Kennel  Multi-Model AI Orchestrator
  ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠻⣷⡄⠀⠀⠀⠀⣿⣧⠀⠀⠀⠀⠀⠀⠀⠀⠀    └─ Manager Terminal UI
  ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⢷⡀⠀⠀⠀⢸⣿⡄⠀⠀⠀⠀⠀⠀⠀⠀    
  ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠸⣿⠇⠀⠀⠀⠀⠀⠀⠀⠀    github.com/Traves-Theberge/Fetch
```

**Implementation Notes:**
- Dog art exactly 14 lines, info panel padded to match
- Horizontal join with `lipgloss.Top` alignment
- Shows "development"/"local" for dev builds instead of "unknown"
- Build info can be injected via ldflags: `-X main.BuildDate=... -X main.GitCommit=...`

---

## 📚 Library Reference (Updated from Docs Review)

### Lipgloss (Styling) - Key APIs

**Borders** - Use for framing panels and sections:
```go
lipgloss.NormalBorder()   // Standard box │─┐└┘┌
lipgloss.RoundedBorder()  // Soft corners ╭╮╯╰
lipgloss.ThickBorder()    // Heavy lines ┃━┓┗┛┏
lipgloss.DoubleBorder()   // Double lines ║═╗╚╝╔
lipgloss.BlockBorder()    // Block chars █
lipgloss.HiddenBorder()   // Invisible (for alignment)
```

**Layout Functions** - Essential for composition:
```go
// Join elements horizontally (side by side)
lipgloss.JoinHorizontal(lipgloss.Top, blockA, blockB)
lipgloss.JoinHorizontal(lipgloss.Center, blockA, blockB)
lipgloss.JoinHorizontal(lipgloss.Bottom, blockA, blockB)

// Join elements vertically (stacked)
lipgloss.JoinVertical(lipgloss.Left, blockA, blockB)
lipgloss.JoinVertical(lipgloss.Center, blockA, blockB)
lipgloss.JoinVertical(lipgloss.Right, blockA, blockB)

// Place content in whitespace
lipgloss.PlaceHorizontal(width, lipgloss.Center, content)
lipgloss.PlaceVertical(height, lipgloss.Center, content)
lipgloss.Place(width, height, lipgloss.Center, lipgloss.Center, content)
```

**Sizing & Frame Helpers**:
```go
style.Width(80)                    // Fixed width
style.Height(24)                   // Fixed height  
style.MaxWidth(100)                // Maximum width
style.MaxHeight(50)                // Maximum height
style.GetHorizontalFrameSize()     // Border + padding width
style.GetVerticalFrameSize()       // Border + padding height
lipgloss.Width(rendered)           // Measure rendered width
lipgloss.Height(rendered)          // Measure rendered height
```

**Table Rendering** (`lipgloss/table` package):
```go
import "github.com/charmbracelet/lipgloss/table"

t := table.New().
    Border(lipgloss.RoundedBorder()).
    BorderStyle(lipgloss.NewStyle().Foreground(Primary)).
    Headers("Name", "Status", "Price").
    Rows(data...).
    StyleFunc(func(row, col int) lipgloss.Style {
        if row == table.HeaderRow {
            return headerStyle
        }
        return cellStyle
    }).
    Width(80)
```

### Bubbles (Components) - Key APIs

**Viewport** - For scrollable content (logs, long text):
```go
import "github.com/charmbracelet/bubbles/viewport"

vp := viewport.New(width, height)
vp.SetContent(longText)
vp.GotoBottom()         // Scroll to end
vp.ScrollDown(n)        // Scroll down n lines
vp.ScrollUp(n)          // Scroll up n lines
vp.PageDown()           // Page down
vp.PageUp()             // Page up
vp.AtBottom()           // Check if at bottom
vp.ScrollPercent()      // Get scroll position (0.0-1.0)
vp.MouseWheelEnabled = true
vp.MouseWheelDelta = 3
```

**List** - For selectable item lists:
```go
import "github.com/charmbracelet/bubbles/list"

items := []list.Item{...}
l := list.New(items, delegate, width, height)
l.SetShowTitle(true)
l.SetShowStatusBar(true)
l.SetFilteringEnabled(true)
l.InfiniteScrolling = true
```

**Table** (Bubbles version) - For interactive tables:
```go
import "github.com/charmbracelet/bubbles/table"

t := table.New(
    table.WithColumns(columns),
    table.WithRows(rows),
    table.WithHeight(10),
)
t.Focus()
t.MoveUp(1) / t.MoveDown(1)
t.GotoTop() / t.GotoBottom()
```

**Spinner** - For loading states:
```go
import "github.com/charmbracelet/bubbles/spinner"

s := spinner.New()
s.Spinner = spinner.Dot      // .oO / Dot / Line / etc.
s.Style = lipgloss.NewStyle().Foreground(Primary)
```

**Progress** - For progress bars:
```go
import "github.com/charmbracelet/bubbles/progress"

p := progress.New(progress.WithDefaultGradient())
p.SetPercent(0.5)
p.ViewAs(0.75)  // Render at specific percent
```

**Help** - For keyboard shortcuts display:
```go
import "github.com/charmbracelet/bubbles/help"

h := help.New()
h.ShortHelpView(bindings)
h.FullHelpView(groups)
```

**TextInput/TextArea** - For user input:
```go
import "github.com/charmbracelet/bubbles/textinput"
import "github.com/charmbracelet/bubbles/textarea"

ti := textinput.New()
ti.Placeholder = "Enter text..."
ti.Focus()
ti.EchoMode = textinput.EchoPassword  // For secrets

ta := textarea.New()
ta.SetWidth(60)
ta.SetHeight(10)
```

### Log (Structured Logging) - Key APIs

**Logger Creation**:
```go
import "github.com/charmbracelet/log"

// Default logger with timestamp
logger := log.Default()

// New logger to specific output
logger := log.New(os.Stderr)

// Logger with options
logger := log.NewWithOptions(os.Stderr, log.Options{
    ReportCaller:    true,
    ReportTimestamp: true,
    TimeFormat:      time.Kitchen,
    Prefix:          "🍪 Baking",
    Level:           log.DebugLevel,
})
```

**Log Levels**:
```go
log.DebugLevel  // DEBU - Development info
log.InfoLevel   // INFO - Normal operation
log.WarnLevel   // WARN - Warning conditions
log.ErrorLevel  // ERRO - Error conditions
log.FatalLevel  // FATA - Fatal (calls os.Exit)

logger.Debug("message", "key", value)
logger.Info("message", "key", value)
logger.Warn("message", "key", value)
logger.Error("message", "key", value)
logger.Fatal("message", "key", value)  // exits!
```

**Custom Styles** (matches Fetch theme):
```go
styles := log.DefaultStyles()
styles.Levels[log.ErrorLevel] = lipgloss.NewStyle().
    SetString("ERROR").
    Bold(true).
    Foreground(lipgloss.Color("204"))
styles.Keys["err"] = lipgloss.NewStyle().Foreground(lipgloss.Color("204"))
styles.Values["err"] = lipgloss.NewStyle().Bold(true)
logger.SetStyles(styles)
```

**Formatters**:
```go
log.TextFormatter    // Human readable (default)
log.JSONFormatter    // Machine parseable
log.LogfmtFormatter  // Logfmt format
```

**Sub-loggers with Context**:
```go
bridgeLogger := logger.WithPrefix("bridge").With("component", "whatsapp")
kennelLogger := logger.WithPrefix("kennel").With("component", "agents")
```

---

## 🎨 Design System

### Color Palette

```go
var (
    // Brand Colors
    Primary      = lipgloss.Color("#FF6B35")  // Fetch Orange
    Secondary    = lipgloss.Color("#00BFA5")  // Teal Accent
    
    // Status Colors
    Success      = lipgloss.Color("#00E676")  // Green
    Warning      = lipgloss.Color("#FFD600")  // Yellow  
    Error        = lipgloss.Color("#FF5252")  // Red
    Info         = lipgloss.Color("#448AFF")  // Blue
    
    // Neutral Colors
    Background   = lipgloss.Color("#0D1117")  // Dark background
    Surface      = lipgloss.Color("#161B22")  // Card/panel background
    Border       = lipgloss.Color("#30363D")  // Border color
    TextPrimary  = lipgloss.Color("#E6EDF3")  // Primary text
    TextSecondary= lipgloss.Color("#8B949E")  // Secondary/muted text
    TextMuted    = lipgloss.Color("#484F58")  // Very muted text
)
```

### Border Styles

```go
// Main application frame - Double border for prominence
AppFrame = lipgloss.NewStyle().
    Border(lipgloss.DoubleBorder()).
    BorderForeground(Primary).
    Padding(1, 2)

// Panel/Card frame - Rounded for softer look
PanelFrame = lipgloss.NewStyle().
    Border(lipgloss.RoundedBorder()).
    BorderForeground(Border).
    Padding(1, 2)

// Active/Selected panel - Highlighted border
ActivePanel = lipgloss.NewStyle().
    Border(lipgloss.RoundedBorder()).
    BorderForeground(Primary).
    Padding(1, 2)

// Log/Terminal frame - Normal border for code-like feel
TerminalFrame = lipgloss.NewStyle().
    Border(lipgloss.NormalBorder()).
    BorderForeground(TextMuted).
    Padding(0, 1)
```

---

## 📐 Layout Architecture

### Dynamic Terminal Sizing

```
┌─────────────────────────────────────────────────────────────────┐
│                        FETCH MANAGER                             │  <- Title Bar (3 rows)
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────┐  ┌─────────────────────────────────┐  │
│  │                      │  │                                  │  │
│  │     MENU / NAV       │  │         CONTENT AREA            │  │
│  │                      │  │                                  │  │  <- Main Content
│  │     (30% width)      │  │         (70% width)             │  │     (height - 8)
│  │                      │  │                                  │  │
│  │                      │  │                                  │  │
│  └──────────────────────┘  └─────────────────────────────────┘  │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│  Status: ● Running │ ↑/↓ Navigate │ Enter Select │ q Quit       │  <- Status Bar (2 rows)
└─────────────────────────────────────────────────────────────────┘
```

### Responsive Breakpoints

| Width | Layout |
|-------|--------|
| < 60  | Compact - Single column |
| 60-100| Standard - Logo beside menu |
| > 100 | Wide - Split panes |

---

## 🧩 Component Design

### 1. Main Menu ✅ IMPLEMENTED

**Layout**: Horizontal - ASCII dog on left, FETCH title + menu on right, bottom-aligned

```
  ⠀⠀⠀⠀⠀⠀⠀⢀⣠⣤⣠⣶⠚⠛⠿⠷⠶⣤⣀⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀    ███████╗███████╗████████╗ ██████╗██╗  ██╗
  ⠀⠀⠀⠀⠀⢀⣴⠟⠉⠀⠀⢠⡄⠀⠀⠀⠀⠀⠉⠙⠳⣄⠀⠀⠀⠀⠀⠀⠀⠀    ██╔════╝██╔════╝╚══██╔══╝██╔════╝██║  ██║
  ⠀⠀⠀⢀⡴⠛⠁⠀⠀⠀⠀⠘⣷⣴⠏⠀⠀⣠⡄⠀⠀⢨⡇⠀⠀⠀⠀⠀⠀⠀    █████╗  █████╗     ██║   ██║     ███████║
  ⠀⠀⠀⠺⣇⠀⠀⠀⠀⠀⠀⠀⠘⣿⠀⠀⠘⣻⣻⡆⠀⠀⠙⠦⣄⣀⠀⠀⠀⠀    ██╔══╝  ██╔══╝     ██║   ██║     ██╔══██║
  ...                                               ...
                                                    
                                                    🔧 Setup
                                                  ▸ ▶️  Start         <- Selected
                                                    ⏹️  Stop
                                                    ⚙️  Configure
                                                    🤖 Select Model
                                                    📜 Logs
                                                    📚 Documentation
                                                    ℹ️  Version
                                                    🚪 Exit
```

**Implementation Notes:**
- Removed "Status" menu item (info now in header indicator)
- Removed "Update" menu item (use git manually for better control)
- Bottom-aligned: spacer at top pushes content to bottom
- Dog dynamically sized based on terminal height
- Menu items aligned with status bar padding (2 spaces)

### 2. Log Viewer (Real-time)

**Current State**: Static log dump  
**New Design**: Scrollable viewport with live updates

```
┌─────────────────────── Logs ───────────────────────┐
│                                                     │
│ 12:34:56 INFO  [bridge] WhatsApp connected         │
│ 12:34:57 INFO  [bridge] Listening for messages...  │
│ 12:35:02 DEBUG [agent]  Processing message         │
│ 12:35:03 INFO  [agent]  Response generated         │
│ ▼ (scroll for more)                                │
│                                                     │
├─────────────────────────────────────────────────────┤
│ Auto-refresh: ON │ r: Refresh │ f: Filter │ q: Back │
└─────────────────────────────────────────────────────┘
```

### 3. Config Editor

**Current State**: Simple field list  
**New Design**: Form with focused field highlighting

```
╭─────────────────── Configuration ───────────────────╮
│                                                      │
│  Owner Phone         │ 15551234567                   │
│  ─────────────────────────────────────────────────── │
│  OpenRouter Key      │ ••••••••••••••••••••         │
│  ─────────────────────────────────────────────────── │
│  Anthropic Key       │ (not set)                    │ <- Focused
│  ─────────────────────────────────────────────────── │
│  Gemini Key          │ (not set)                    │
│  ─────────────────────────────────────────────────── │
│  Log Level           │ info                         │
│                                                      │
│  💡 Press Enter to edit, 's' to save                │
╰──────────────────────────────────────────────────────╯
```

### 4. Model Selector

**Current State**: Grouped list  
**New Design**: Categorized table with details

```
╭────────────────── AI Model Selection ──────────────────╮
│                                                         │
│  Current: openai/gpt-4o-mini ★                         │
│  ───────────────────────────────────────────────────── │
│                                                         │
│  ── OpenAI ──────────────────────────────────────────  │
│    ▸ gpt-4o-mini ★              $0.15/1M tokens        │
│      gpt-4o                      $2.50/1M tokens        │
│      gpt-4-turbo                 $10.00/1M tokens       │
│                                                         │
│  ── Anthropic ───────────────────────────────────────  │
│      claude-3.5-sonnet           $3.00/1M tokens        │
│      claude-3-haiku              $0.25/1M tokens        │
│                                                         │
│  [Tab] Toggle All/Recommended                          │
╰─────────────────────────────────────────────────────────╯
```

### 5. Setup Screen (QR Code)

**Current State**: QR in box  
**New Design**: Centered card with status

```
╭───────────────── WhatsApp Setup ─────────────────╮
│                                                   │
│              Status: 📱 Waiting for scan          │
│                                                   │
│           ┌───────────────────────┐              │
│           │                       │              │
│           │    ▄▄▄▄▄▄▄▄▄▄▄▄▄     │              │
│           │    █ QR CODE    █     │              │
│           │    █ DISPLAY    █     │              │
│           │    ▀▀▀▀▀▀▀▀▀▀▀▀▀     │              │
│           │                       │              │
│           └───────────────────────┘              │
│                                                   │
│   Scan with WhatsApp > Linked Devices > Link     │
│                                                   │
├───────────────────────────────────────────────────┤
│   o: Open in Browser │ r: Refresh │ Esc: Back    │
╰───────────────────────────────────────────────────╯
```

### 6. Status Bar (Global) ✅ IMPLEMENTED

Always visible at bottom, shows service status and keyboard shortcuts:

```
┌─────────────────────────────────────────────────────────────┐
│ ● Bridge: Running │ ● Kennel: Stopped │ Press ? for help    │
├─────────────────────────────────────────────────────────────┤
│ ↑/↓ Navigate │ Enter Select │ q Quit │ v Version           │
└─────────────────────────────────────────────────────────────┘
```

**Implementation Notes:**
- Service indicators: green ● Running, red ● Stopped
- Contextual help hints at right
- Consistent 2-space padding on all sides

---

## 📁 New File Structure

```
manager/
├── internal/
│   ├── theme/           # NEW - Design system
│   │   ├── colors.go    # Color palette
│   │   ├── borders.go   # Border styles  
│   │   └── styles.go    # Component styles
│   │
│   ├── layout/          # NEW - Layout helpers
│   │   ├── frame.go     # Frame/panel wrappers
│   │   ├── responsive.go# Breakpoint logic
│   │   └── grid.go      # Grid system
│   │
│   ├── components/      # NEW - Reusable UI components
│   │   ├── header.go    # App header/title bar
│   │   ├── statusbar.go # Bottom status bar
│   │   ├── panel.go     # Generic framed panel
│   │   └── logviewer.go # Real-time log viewer
│   │
│   ├── config/          # REFACTOR
│   │   └── editor.go    # Use new theme
│   │
│   ├── models/          # REFACTOR
│   │   ├── openrouter.go
│   │   └── selector.go  # Use new theme
│   │
│   ├── logs/            # ENHANCE
│   │   └── viewer.go    # Real-time with viewport
│   │
│   └── status/          # KEEP
│       └── client.go
│
└── main.go              # REFACTOR - Use new components
```

---

## ✅ Implementation Checklist

### Phase 1: Foundation ✅ COMPLETE
- [x] Create `internal/theme/colors.go`
- [x] Create `internal/theme/borders.go`
- [x] Create `internal/theme/styles.go`
- [x] Create `internal/layout/frame.go`
- [x] Create `internal/layout/responsive.go`

### Phase 2: Components ✅ COMPLETE
- [x] Create `internal/components/header.go`
- [x] Create `internal/components/statusbar.go`
- [x] Create `internal/components/menu.go` (panel.go became menu.go)
- [x] Create `internal/components/logviewer.go` (viewport-based)
- [x] Create `internal/components/splash.go` (NEW - splash screen)
- [x] Create `internal/components/version.go` (NEW - neofetch-style version)

### Phase 3: Refactor Screens ✅ COMPLETE
- [x] Add splash screen to startup (shows for 2s, skippable)
- [x] Add version screen with menu option
- [x] Style aliases in main.go (maps old styles to theme package)
- [x] Refactor `viewMenu()` with new layout/panels
- [x] Refactor `viewConfig()` with frame styling
- [x] Refactor `viewModels()` with frame styling
- [x] Refactor `viewSetup()` with frame and proper styling
- [x] Refactor `viewLogs()` with frame styling
- [x] Refactor `viewStatus()` with status cards

### Phase 4: Polish ✅ COMPLETE
- [x] Add spinner for loading states (`components/spinner.go`)
- [x] Add progress bars (`components/progress.go`)
- [x] Implement responsive breakpoints (`layout/responsive.go` - already complete)
- [ ] Add animations/transitions (optional - requires bubbletea model changes)
- [x] Test all screen sizes (responsive logic implemented)

---

## 🔧 Technical Notes

### Dynamic Sizing Pattern

```go
func (m model) View() string {
    // Get available content area
    contentWidth := m.width - 4   // Account for borders
    contentHeight := m.height - 6 // Header + Status bar
    
    // Build layout
    header := theme.Header("Fetch Manager", m.width)
    content := m.renderCurrentScreen(contentWidth, contentHeight)
    statusBar := theme.StatusBar(m.bridgeRunning, m.kennelRunning, m.width)
    
    return lipgloss.JoinVertical(lipgloss.Left,
        header,
        content,
        statusBar,
    )
}
```

### Responsive Panel Widths

```go
func calculatePanelWidth(termWidth int) (menuWidth, contentWidth int) {
    if termWidth < 60 {
        // Compact: full width for both
        return termWidth - 4, termWidth - 4
    }
    if termWidth < 100 {
        // Standard: 30% menu, 70% content
        menuWidth = (termWidth * 30) / 100
        contentWidth = termWidth - menuWidth - 4
        return
    }
    // Wide: fixed menu, flexible content
    menuWidth = 30
    contentWidth = termWidth - menuWidth - 6
    return
}
```

### Real-time Log Streaming

```go
type LogViewer struct {
    viewport viewport.Model
    logs     []LogEntry
    filter   string
    autoRefresh bool
}

func (l *LogViewer) AppendLog(entry LogEntry) {
    l.logs = append(l.logs, entry)
    l.viewport.SetContent(l.renderLogs())
    l.viewport.GotoBottom()
}
```

---

## 🚀 Expected Outcome

After implementation, the TUI will have:

1. **Consistent Visual Language**: All screens use the same color palette, border styles, and typography
2. **Dynamic Layouts**: UI adapts gracefully to terminal size
3. **Professional Framing**: Every section is clearly delineated with styled borders
4. **Real-time Logs**: Live updating log viewer with scroll and filter
5. **Enhanced UX**: Loading spinners, progress indicators, smooth navigation
6. **Accessibility**: Clear focus states, high contrast text

---

*Plan created: February 2026*  
*Target completion: Incremental implementation*
