# Agentic OS — Living Knowledge Universe

Version: 1.0  
Status: Draft

---

## Vision

The Living Knowledge Universe is the **visual heart** of Agentic OS.

It is not decoration. It is a real-time visualization of the operating system's intelligence — a miniature digital cosmos where users watch the OS think, remember, connect, and execute.

> Many AI apps have sidebars, cards, and charts. Very few have a central visualization that communicates the live state of the entire system. This is the signature experience of Agentic OS.

---

## Concept Evolution

### v0 — Neural Sphere (Current Prototype)

`app/src/components/NeuralSphere.tsx`

- 4000 particles in spherical distribution
- Golden/amber color palette
- Line connections between nearby points
- Bloom post-processing via `@react-three/postprocessing`
- Voice-reactive animation (scale pulse on volume)
- Continuous slow rotation

### v1 — Living Universe (Target)

Not a single sphere — a **cosmos**:

```
                  Agent ●

        ● Memory           Workflow ●

              \          /

        Knowledge Galaxy

              /          \

      Skill ●             ● Prompt

            \            /

         AI Core (Sun)

              |

         Event Streams

              |

      Millions of particles
```

- Camera slowly orbits the universe
- Projects form **constellations**
- Workflows appear as **orbital paths**
- Memory grows like **nebulae**
- Agent execution creates new **stars** and illuminates **connections**

---

## Inspiration

| Source | Element Borrowed |
|--------|------------------|
| Galaxy simulation | Scale, depth, particle density |
| Neural networks | Node-edge topology |
| Brain connectomes | Clustered connectivity |
| Knowledge graphs | Semantic relationships |
| Claude Code V.A.U.L.T | Command center aesthetic |
| Minority Report / Palantir | Immersive data presence |
| Solar systems | Orbital motion, hierarchy |

---

## Design Goals

Beautiful · Calm · Alive · Interactive · Meaningful · Responsive · Scalable · GPU Accelerated

---

## Screen Placement

| Property | Value |
|----------|-------|
| Width | ~40% of viewport (flexible center column) |
| Height | 50%+ of main content area |
| Position | Center of Mission Control layout |
| Z-index | Below panels, above background |

---

## Rendering Stack

| Library | Role |
|---------|------|
| React Three Fiber | React renderer for Three.js |
| Three.js | WebGL scene |
| @react-three/drei | OrbitControls, Environment, helpers |
| @react-three/postprocessing | Bloom, DOF, FXAA, Noise |

### Post-Processing Pipeline

1. Render scene
2. Bloom (adaptive intensity based on activity)
3. Optional depth of field
4. FXAA anti-aliasing

---

## Camera

| Property | Value |
|----------|-------|
| Type | PerspectiveCamera |
| FOV | 35° |
| Default distance | 8 units |
| Motion | Very slow continuous orbit |
| Mouse influence | Subtle parallax (±0.3 units) |
| Rules | Never abrupt; ease all transitions |

---

## Lighting

- Ambient (low, `#111`)
- Directional (key light, soft shadows)
- Point lights at active nodes
- Environment map (subtle)
- Bloom on emissive materials

---

## Background

- Deep black `#080808`
- Subtle volumetric fog
- Sparse distant particles
- Faint grid floor (opacity < 5%)

---

## Universe Composition

| Layer | Description |
|-------|-------------|
| **Core (Sun)** | Current AI focus, health, active context |
| **Knowledge Nodes** | Documents, entities, instanced meshes |
| **Relationship Edges** | References, dependencies, similarity |
| **Particle Field** | Ambient cosmic dust |
| **Orbit Rings** | Workflow paths, automation trails |
| **Pulse Effects** | Event-driven ripples and waves |
| **Selection Layer** | Highlight, focus, inspector anchor |
| **Labels** | LOD text sprites |

---

## Core (AI Sun)

Represents: current intelligence, context, focus, system health.

Behaviors:

- Continuous slow **breathing** (scale 0.98 ↔ 1.02, 3s cycle)
- **Glow intensity** scales with active agent count
- **Color temperature** shifts warm when learning, cool when idle
- **Pulse flash** on skill completion

Implementation: emissive sphere + point light + particle corona shader.

---

## Nodes

Every domain entity becomes a node in 3D space.

### Entity Types

Project · Knowledge · Memory · Skill · Workflow · Prompt · Agent · Artifact · Automation · Dataset · Session

### Visual Encoding

| Property | Encoding |
|----------|----------|
| Size | Importance, usage frequency, connection count |
| Color | Entity type (see palette below) |
| Brightness | Recency of activity |
| Position | Cluster by project/topic (force layout) |

### Color Palette

| Entity | Color |
|--------|-------|
| Knowledge | Gold `#FFD86B` |
| Memory | Purple `#A76BFF` |
| Agent | Green `#59F28D` |
| Skill | Green `#4ADE80` |
| Project | Blue `#5DA9FF` |
| Workflow | Orange `#FFB357` |
| Prompt | Pink `#F472B6` |
| Artifact | Cyan `#22D3EE` |
| Automation | Yellow `#FACC15` |
| Selected | Gold + bloom boost |
| Error | Red `#FF5C6C` |
| Archived | 30% opacity, desaturated |

### Node Behaviors

| State | Animation |
|-------|-----------|
| Idle | Slow organic drift |
| Hover | Scale 1.2×, brighten |
| Selected | Gold glow ring, camera ease-in |
| Searching | Pulse match highlight |
| Executing | Strobe flash (green) |
| Learning | Ripple outward |
| Error | Red pulse 2Hz |
| Archived | Fade to 30% |

---

## Relationships (Edges)

Edge types: references, dependencies, execution flow, ownership, similarity, events.

| Property | Encoding |
|----------|----------|
| Thickness | Relationship strength |
| Opacity | 25% default, 80% when active |
| Animation | Energy particles flow along edge |
| Direction | Arrow via particle flow direction |

Implementation: `THREE.LineSegments` or custom shader lines with instanced flow particles.

---

## Event Visualization

Every backend event mutates the universe in real time.

| Event | Visual Response |
|-------|-----------------|
| Document created | New node fades in at cluster edge |
| Knowledge indexed | Blue ripple from node |
| Skill executed | Green pulse from node to core |
| Workflow running | Orange energy along orbit path |
| Agent thinking | Core glow intensifies |
| Embedding generated | Connections animate briefly |
| Search query | Matching nodes highlight, paths shown |
| Automation triggered | Orbit trail appears |
| Loop completed | Golden wave across cluster |
| Error | Red pulse on affected node |

Event source: WebSocket `graph` channel → `useGraphStore` → R3F animation queue.

---

## Interaction Model

| Input | Action |
|-------|--------|
| Hover | Highlight node + tooltip |
| Click | Select → open Inspector panel |
| Double-click | Focus camera on node |
| Scroll | Zoom (clamped 4–20 units) |
| Drag | Orbit camera |
| Search (⌘K) | Focus and highlight matching nodes |
| Keyboard arrows | Cycle selected nodes |

### Inspector (on select)

Summary, metadata, tags, relationships, event timeline, AI assistant actions:

- "Explain this skill"
- "Summarize this project"
- "Improve this prompt"

---

## Animation System

| Animation | Parameters |
|-----------|------------|
| Node drift | Perlin noise offset, speed 0.001–0.003 |
| Universe rotation | 0.002 rad/frame (disable on reduced motion) |
| Core breath | 3s sine cycle |
| Bloom intensity | 0.3 idle → 1.0 peak activity |
| Edge flow | Randomized particle speed 0.5–2.0 |
| Event ripples | 500ms expand + fade |

**Rule:** Nothing is ever fully static. Reduced motion provides a slower, subtler version — not a frozen screenshot.

---

## Performance

### Targets

| Hardware | FPS |
|----------|-----|
| Discrete GPU | 60 |
| Integrated GPU | 30 |

### Scale Targets

- 100,000 nodes (with LOD)
- Millions of edges (aggregated at distance)

### Techniques

| Technique | Application |
|-----------|-------------|
| InstancedMesh | Nodes (single draw call per type) |
| GPU buffers | Particle positions |
| LOD | Distant nodes → points, hide labels |
| Frustum culling | Standard Three.js |
| Spatial hash | Edge culling, hover pick |
| Web Worker | Layout computation off main thread |
| `useFrame` throttle | Reduce updates when tab hidden |

---

## Search Integration

On search:

1. Dim all nodes to 20% opacity
2. Highlight matches at full brightness
3. Show shortest paths between matches
4. Camera ease to cluster centroid
5. Suggest related nodes (graph neighbors)

---

## AI Integration

| AI State | Universe Response |
|----------|-------------------|
| Agent planning | Temporary dashed paths appear |
| Reasoning | Core corona brightens |
| Tool call | Pulse at agent node → tool node |
| Reflection | Ripple from core outward |
| Streaming output | Edge flow accelerates |

---

## Implementation Phases

### Phase A — Enhance Sphere (Current)

- [x] Points + connections
- [x] Bloom
- [x] Voice reactivity
- [ ] Design token colors from DESIGN.md
- [ ] WebSocket activity hooks (stub)

### Phase B — Typed Nodes

- [ ] InstancedMesh per entity type
- [ ] Color/size from graph API data
- [ ] Click → selection store

### Phase C — Edges & Events

- [ ] Relationship lines from Neo4j data
- [ ] Event animation queue
- [ ] Inspector panel binding

### Phase D — Universe Layout

- [ ] Force-directed 3D layout (worker)
- [ ] Cluster by project
- [ ] Orbital workflow paths
- [ ] Camera orbit controls

### Phase E — Scale

- [ ] LOD system
- [ ] 10k+ node benchmark
- [ ] Reduced motion fallback

---

## File Structure (Target)

```
components/graph/
├── LivingKnowledgeUniverse.tsx   # Canvas wrapper
├── UniverseScene.tsx             # R3F scene composition
├── CoreSun.tsx                   # Center AI core
├── NodeInstances.tsx             # Instanced entity nodes
├── EdgeField.tsx                 # Relationship lines
├── ParticleField.tsx             # Ambient particles
├── OrbitPaths.tsx                # Workflow trails
├── EventRipple.tsx               # Transient effects
├── UniverseControls.tsx          # Orbit, zoom
├── shaders/
│   ├── corona.glsl
│   └── flowLine.glsl
├── hooks/
│   ├── useGraphData.ts
│   ├── useUniverseEvents.ts
│   └── useNodeInteraction.ts
└── utils/
    ├── layout.worker.ts
    └── pick.ts
```

---

## Prototype Reference

Current implementation (`NeuralSphere.tsx`):

```typescript
// Key techniques already in use:
// - THREE.Points with custom colors
// - THREE.LineSegments for connections
// - useFrame for rotation + voice scale
// - EffectComposer + Bloom from postprocessing
// - Golden palette: #E5A93D, #FFF8E7, #D4941E
```

Upgrade path: extract scene layers from monolithic component into graph/ module per structure above.

---

## Future Modes

| Mode | Description |
|------|-------------|
| Galaxy | Default cosmos view |
| Timeline | Nodes on temporal axis |
| Dependency | DAG layout emphasis |
| Organization | Team/project hierarchy |
| Force | Classic force-directed |
| Universe | Multi-cluster fly-through |
| VR | WebXR spatial view |

---

## Success Criteria

A new user glances at the center of Mission Control and immediately understands:

- How much knowledge exists
- What agents are doing right now
- Where activity is concentrated
- That the system is alive and working

The universe is the operating system — the panels are merely controls and context.
