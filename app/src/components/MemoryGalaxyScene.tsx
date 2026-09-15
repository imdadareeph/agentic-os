import { useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Instances, Instance } from '@react-three/drei'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import * as THREE from 'three'
import type { GraphLink, GraphNode } from '@/services/memory'

export interface PositionedNode extends GraphNode {
  position: [number, number, number]
  /** 0 = stalest node in the graph, 1 = most recently touched. */
  brightness: number
}

// Deterministic per-id layout — same graph fetch always renders the same
// scattered positions instead of reshuffling on every re-render.
function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return h
}

function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function layout(nodes: GraphNode[]): PositionedNode[] {
  if (nodes.length === 0) return []
  const times = nodes
    .map(n => new Date(n.touchedAt).getTime())
    .filter(t => Number.isFinite(t))
  const minT = times.length ? Math.min(...times) : 0
  const maxT = times.length ? Math.max(...times) : 1
  const span = Math.max(1, maxT - minT)
  const radiusBase = 6 + Math.cbrt(nodes.length) * 1.6

  return nodes.map(n => {
    const rand = mulberry32(hashString(n.id))
    const phi = Math.acos(2 * rand() - 1)
    const theta = 2 * Math.PI * rand()
    const r = radiusBase * (0.35 + 0.65 * Math.cbrt(rand()))
    const t = new Date(n.touchedAt).getTime()
    const brightness = Number.isFinite(t) ? (t - minT) / span : 0.25
    return {
      ...n,
      position: [
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.sin(phi) * Math.sin(theta),
        r * Math.cos(phi),
      ] as [number, number, number],
      brightness,
    }
  })
}

const STALE_COLOR = new THREE.Color('#4C3A8A')
const RECENT_COLOR = new THREE.Color('#FFFFFF')
const scratchColor = new THREE.Color()

function nodeColor(brightness: number): THREE.Color {
  return scratchColor.copy(STALE_COLOR).lerp(RECENT_COLOR, brightness).clone()
}

interface GalaxyContentProps {
  nodes: GraphNode[]
  links: GraphLink[]
  paused: boolean
  selectedId: string | null
  onSelect: (node: PositionedNode) => void
  onHover: (node: PositionedNode | null) => void
}

function GalaxyContent({ nodes, links, paused, selectedId, onSelect, onHover }: GalaxyContentProps) {
  const positioned = useMemo(() => layout(nodes), [nodes])
  const byId = useMemo(() => new Map(positioned.map(n => [n.id, n])), [positioned])

  const linePositions = useMemo(() => {
    const arr: number[] = []
    for (const link of links) {
      const s = byId.get(link.source)
      const t = byId.get(link.target)
      if (!s || !t) continue
      arr.push(...s.position, ...t.position)
    }
    return new Float32Array(arr)
  }, [links, byId])

  const lineOpacity = nodes.length > 300 ? 0.06 : 0.12

  const groupRef = useRef<THREE.Group>(null)
  useFrame((_, delta) => {
    if (!paused && groupRef.current) {
      groupRef.current.rotation.y += delta * 0.025
    }
  })

  return (
    <group ref={groupRef}>
      {linePositions.length > 0 && (
        <lineSegments>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[linePositions, 3]} />
          </bufferGeometry>
          <lineBasicMaterial
            color="#8B7BD8"
            transparent
            opacity={lineOpacity}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </lineSegments>
      )}

      <Instances limit={Math.max(positioned.length, 1)}>
        <sphereGeometry args={[1, 10, 10]} />
        <meshBasicMaterial transparent depthWrite={false} blending={THREE.AdditiveBlending} />
        {positioned.map(n => {
          const scale = 0.07 + Math.min(n.linkDegree, 12) * 0.014
          const isSelected = n.id === selectedId
          return (
            <Instance
              key={n.id}
              position={n.position}
              scale={isSelected ? scale * 2 : scale}
              color={nodeColor(n.brightness)}
              onClick={e => {
                e.stopPropagation()
                onSelect(n)
              }}
              onPointerOver={e => {
                e.stopPropagation()
                onHover(n)
                document.body.style.cursor = 'pointer'
              }}
              onPointerOut={() => {
                onHover(null)
                document.body.style.cursor = 'auto'
              }}
            />
          )
        })}
      </Instances>
    </group>
  )
}

interface MemoryGalaxySceneProps {
  nodes: GraphNode[]
  links: GraphLink[]
  paused: boolean
  onTogglePaused: () => void
  selectedId: string | null
  onSelect: (node: PositionedNode) => void
  onHover: (node: PositionedNode | null) => void
}

export default function MemoryGalaxyScene({
  nodes,
  links,
  paused,
  onTogglePaused,
  selectedId,
  onSelect,
  onHover,
}: MemoryGalaxySceneProps) {
  const [dragging, setDragging] = useState(false)

  return (
    <div
      className="absolute inset-0"
      onDoubleClick={onTogglePaused}
      onPointerDown={() => setDragging(true)}
      onPointerUp={() => setDragging(false)}
      style={{ cursor: dragging ? 'grabbing' : 'grab' }}
    >
      <Canvas
        camera={{ position: [0, 0, 16], fov: 55 }}
        dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        style={{ background: 'transparent' }}
      >
        <ambientLight intensity={0.15} />
        <GalaxyContent
          nodes={nodes}
          links={links}
          paused={paused}
          selectedId={selectedId}
          onSelect={onSelect}
          onHover={onHover}
        />
        <OrbitControls
          enablePan={false}
          enableDamping
          dampingFactor={0.08}
          autoRotate={false}
          minDistance={4}
          maxDistance={40}
        />
        <EffectComposer>
          <Bloom intensity={1.1} luminanceThreshold={0.15} luminanceSmoothing={0.9} mipmapBlur />
        </EffectComposer>
      </Canvas>
    </div>
  )
}
