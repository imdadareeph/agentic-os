# Agentic OS — Design System

Version: 1.0  
Status: Draft

---

## Philosophy

Agentic OS is not a CRUD application. It should feel like operating a futuristic AI command center where humans collaborate with intelligent agents.

The interface communicates: **intelligence, confidence, clarity, calmness, activity, depth.**

Avoid unnecessary decoration. Every animation and visual element must convey information.

**Reference aesthetics:** Mission Control, Bloomberg Terminal, Linear, Raycast, Arc Browser, Notion AI, Palantir — not consumer SaaS dashboards.

---

## Design Principles

### Information First

Data is always more important than decoration. Large visualizations communicate state. No decorative gradients without meaning.

### Dark by Default

Primary experience is dark mode.

### Layered Depth

Visual hierarchy (back to front):

Background → Panels → Cards → Interactive Controls → Floating Elements → Notifications → Dialogs

### Motion with Purpose

Everything animates — slowly. Nothing feels game-like. Motion indicates state, not decoration.

---

## Color System

### Backgrounds

| Token | Value | Usage |
|-------|-------|-------|
| `--bg-primary` | `#090909` | App background |
| `--bg-secondary` | `#111111` | Panel background |
| `--bg-elevated` | `#181818` | Raised surfaces |
| `--bg-surface` | `#202020` | Cards |
| `--bg-hover` | `#2A2A2A` | Hover states |

### Borders

| Token | Value |
|-------|-------|
| `--border-primary` | `rgba(255,255,255,0.06)` |
| `--border-secondary` | `rgba(255,255,255,0.12)` |
| `--border-focus` | `#4D9EFF` |

### Typography Colors

| Token | Value |
|-------|-------|
| `--text-primary` | `#F5F5F5` |
| `--text-secondary` | `#C5C5C5` |
| `--text-muted` | `#8A8A8A` |
| `--text-disabled` | `#666666` |

### Semantic

| Token | Value |
|-------|-------|
| `--success` | `#22C55E` |
| `--warning` | `#FACC15` |
| `--danger` | `#EF4444` |
| `--info` | `#3B82F6` |

### Accent (use sparingly)

| Token | Value |
|-------|-------|
| `--accent-primary` | `#5B8CFF` |
| `--accent-purple` | `#8B5CF6` |
| `--accent-cyan` | `#22D3EE` |
| `--accent-orange` | `#F97316` |
| `--accent-gold` | `#FFD166` |

---

## Typography

| Role | Font | Weight | Notes |
|------|------|--------|-------|
| UI | Inter | 400–700 | System UI fallback |
| Code | IBM Plex Mono / JetBrains Mono | 400 | Technical content only |
| KPI numbers | Space Grotesk | 700 | 72px for hero metrics |

**Headings:** weight 700, letter-spacing `-0.03em`  
**Body:** weight 400, line-height 1.7

---

## Spacing Scale

Use only: `4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 96` px. Never invent arbitrary values.

Base unit for layout: `12px` (`--padding`).

---

## Border Radius

| Element | Radius |
|---------|--------|
| Buttons | 12px |
| Cards | 16px |
| Dialogs | 20px |
| Floating panels | 24px |
| Graph containers | 32px |

---

## Shadows & Glow

Avoid traditional drop shadows. Use:

- Background blur
- Subtle bloom
- Ambient glow

```css
box-shadow: 0 0 40px rgba(91, 140, 255, 0.08);
```

---

## Glassmorphism

```css
background: rgba(255, 255, 255, 0.04);
backdrop-filter: blur(18px);
border: 1px solid rgba(255, 255, 255, 0.06);
```

Never exceed 12% background opacity.

---

## Layout — Mission Control

### Desktop Grid

| Zone | Width |
|------|-------|
| Sidebar | 280px (collapsed: 80px) |
| Center (Living Universe) | ~40% viewport, flexible |
| Right panel (Command Deck) | 320px |
| Max content width | 1600px |
| Max viewport | 1920px |

### Dashboard Structure

```
┌────────────────────────────────────────────────────────────────────┐
│ Header                                     Search        Profile   │
├──────────────┬─────────────────────────────┬────────────────────────┤
│ Navigation   │   Living Knowledge Universe │     Command Deck       │
│ System       │                             │   Morning Brief        │
│ Vitals       │                             │   Deep Research        │
│              │                             │   Run Agent            │
├──────────────┴─────────────────────────────┴────────────────────────┤
│  KPI: Views · Tasks · Reports · Memory · Nodes · Executions        │
├──────────────────────────────────────────────────────────────────────┤
│ Status Bar • Claude Code • Event Bus • Vault • CPU • Memory         │
└──────────────────────────────────────────────────────────────────────┘
```

Center area always dominates. The universe is the visual heart — not a widget.

---

## Component Style

### Buttons

Rounded, minimal, small shadow, animated hover. Primary actions use accent; destructive use danger.

### Inputs

Dark, filled, minimal borders, generous padding.

### Cards

Rounded, glass, subtle borders, hover lift (`translateY(-2px)` over 200ms).

### Tables

Compact, hover highlight, no zebra stripes.

### Charts

Minimal, no heavy gridlines, accent colors sparingly. Sparklines for vitals.

---

## Motion

| Duration | Use |
|----------|-----|
| 100ms | Tiny interactions |
| 200ms | Hover |
| 300ms | Cards |
| 500ms | Dialogs |
| 700ms | Page transitions |
| Continuous | Knowledge universe |

**Easing:** `ease-out` or spring. Never linear for UI motion.

**Reduced motion:** respect `prefers-reduced-motion` — disable continuous universe rotation, use static graph fallback.

---

## Knowledge Universe — Visual Identity

Not a force-directed 2D graph. A **living intelligence visualization**.

| Property | Specification |
|----------|---------------|
| Dimension | 3D |
| Motion | Slow continuous rotation |
| Particles | Thousands, instanced |
| Effects | Bloom, depth of field |
| Interaction | Hover, select, search highlight |

### Node Colors (Domain Entities)

| Entity | Color |
|--------|-------|
| Knowledge | Gold `#FFD86B` |
| Memory | Purple `#A76BFF` |
| Agent | Green `#59F28D` |
| Skill | Green variant |
| Project | Blue `#5DA9FF` |
| Workflow | Orange `#FFB357` |
| Prompt | Pink |
| Artifact | Cyan |
| Automation | Yellow |
| Selected | Gold glow |
| Error | Red `#FF5C6C` |

### Connections

Thin, animated, 25% opacity. Active edges pulse. Energy particles flow along edges during execution.

### Center Core

Dense particle core representing current intelligence, context, focus, and health. Breathes on a 3-second cycle. Brightens when agents are thinking.

---

## Dashboard Metrics

- Large typography for values
- Small muted labels
- Animated counters (count-up on load)
- Tiny sparkline charts
- Examples: Tasks, Memory, Agents, Executions, Knowledge, Documents, Loops, Automations

---

## Panel Anatomy

Every panel includes: **title**, **actions**, **content**, **status indicator**.

### Status Colors

| Color | State |
|-------|-------|
| Green | Running |
| Blue | Queued |
| Yellow | Waiting |
| Red | Failed |
| Gray | Disabled |

---

## Notifications

Top-right, stacked, glass, auto-dismiss (5s), progress indicator for long operations.

---

## Loading

Skeleton shimmer — never blocking spinners unless absolutely necessary.

---

## Icons

Lucide React. Consistent sizes: 18, 20, 24px.

---

## Accessibility

- WCAG 2.2 AA contrast (4.5:1 text, 3:1 focus)
- Keyboard navigation throughout
- Focus ring: 2px accent, 2px offset
- Screen reader labels on all interactive elements
- Reduced motion and high contrast theme support

---

## Responsive

| Breakpoint | Experience |
|------------|------------|
| Desktop | Full Mission Control |
| Tablet | Collapsed sidebars, universe remains |
| Mobile | Monitoring only; editing reduced |

---

## Themes

| Theme | Status |
|-------|--------|
| Dark | Primary (default) |
| Light | Optional |
| Cyber | Future |
| Terminal | Future |

All values via design tokens — **never hardcode colors in components**.

---

## Overall Experience

Users should feel they are **commanding a living network** of knowledge and autonomous agents — not browsing documents. The dashboard always communicates that the system is thinking, remembering, learning, executing, and improving in the background.
