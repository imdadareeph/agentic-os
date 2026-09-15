import { useRef, useMemo, useEffect } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import * as THREE from 'three'

const GLOW_PALETTE = [
  '#E5A93D',
  '#F59E0B',
  '#FB923C',
  '#22D3EE',
  '#A78BFA',
  '#F472B6',
  '#34D399',
  '#67E8F9',
  '#FBBF24',
  '#818CF8',
]

function samplePaletteColor(
  target: THREE.Color,
  time: number,
  speed: number,
  offset: number
): THREE.Color {
  const len = GLOW_PALETTE.length
  const cycleT = time * speed + offset
  const wrapped = ((cycleT % len) + len) % len
  const i0 = Math.floor(wrapped)
  const i1 = (i0 + 1) % len
  const frac = wrapped - i0
  return target.set(GLOW_PALETTE[i0]).lerp(new THREE.Color(GLOW_PALETTE[i1]), frac)
}

interface ParticleSphereProps {
  isSpeaking: boolean
  isPaused: boolean
  volume: number
}

function ParticleSphere({ isSpeaking, isPaused, volume }: ParticleSphereProps) {
  const meshRef = useRef<THREE.Points>(null)
  const linesRef = useRef<THREE.LineSegments>(null)
  const innerGlowRef = useRef<THREE.MeshBasicMaterial>(null)
  const outerShellRef = useRef<THREE.MeshBasicMaterial>(null)
  const pointsMatRef = useRef<THREE.PointsMaterial>(null)
  const linesMatRef = useRef<THREE.LineBasicMaterial>(null)
  const frameCount = useRef(0)
  const cycleColorA = useRef(new THREE.Color())
  const cycleColorB = useRef(new THREE.Color())
  const goldBase = useRef(new THREE.Color('#E5A93D'))

  const { positions, colors, connections, particlePhases } = useMemo(() => {
    const count = 4000
    const pos = new Float32Array(count * 3)
    const col = new Float32Array(count * 3)
    const phases = new Float32Array(count)
    const conns: number[] = []
    const radius = 3.5

    const goldenColor = new THREE.Color('#E5A93D')
    const whiteColor = new THREE.Color('#FFF8E7')
    const amberColor = new THREE.Color('#D4941E')

    for (let i = 0; i < count; i++) {
      const phi = Math.acos(2 * Math.random() - 1)
      const theta = 2 * Math.PI * Math.random()
      const r = radius * Math.cbrt(Math.random())

      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
      pos[i * 3 + 2] = r * Math.cos(phi)

      phases[i] = Math.random() * Math.PI * 2

      const mixFactor = Math.random()
      const chosenColor =
        mixFactor < 0.5 ? goldenColor : mixFactor < 0.8 ? amberColor : whiteColor

      const brightness = 0.5 + Math.random() * 0.5
      col[i * 3] = chosenColor.r * brightness
      col[i * 3 + 1] = chosenColor.g * brightness
      col[i * 3 + 2] = chosenColor.b * brightness

      if (i < count - 1 && Math.random() < 0.025) {
        const neighbor = Math.floor(Math.random() * Math.min(8, count - i - 1)) + i + 1
        if (neighbor < count) conns.push(i, neighbor)
      }
    }

    return { positions: pos, colors: col, connections: conns, particlePhases: phases }
  }, [])

  const linePositions = useMemo(() => {
    const pos = new Float32Array(connections.length * 3)
    for (let i = 0; i < connections.length; i++) {
      const idx = connections[i]
      pos[i * 3] = positions[idx * 3]
      pos[i * 3 + 1] = positions[idx * 3 + 1]
      pos[i * 3 + 2] = positions[idx * 3 + 2]
    }
    return pos
  }, [connections, positions])

  const pointsGeometryRef = useRef<THREE.BufferGeometry>(null)
  const linesGeometryRef = useRef<THREE.BufferGeometry>(null)
  const liveColors = useRef<Float32Array>(colors.slice())
  const liveLineColors = useRef<Float32Array>(new Float32Array(connections.length * 3))

  useEffect(() => {
    liveColors.current = colors.slice()
  }, [colors])

  useFrame((state) => {
    frameCount.current++
    if (frameCount.current % 2 !== 0) return

    const t = state.clock.elapsedTime
    const rotSpeed = isPaused ? 0.00055 : 0.0008
    const sway = isPaused ? 0.035 : 0.05
    const swaySpeed = isPaused ? 0.18 : 0.1

    if (meshRef.current) {
      meshRef.current.rotation.y += rotSpeed
      meshRef.current.rotation.x = Math.sin(t * swaySpeed) * sway
    }
    if (linesRef.current) {
      linesRef.current.rotation.y += rotSpeed
      linesRef.current.rotation.x = Math.sin(t * swaySpeed) * sway
    }

    if (isPaused) {
      // Speech-like rhythm — faster pulse as if someone is always talking
      const talkA = 0.5 + 0.5 * Math.sin(t * 3.4)
      const talkB = 0.5 + 0.5 * Math.sin(t * 5.1 + 1.2)
      const talkPulse = talkA * 0.6 + talkB * 0.4
      const glow = 0.025 + talkPulse * 0.055
      const lineOpacity = 0.1 + talkPulse * 0.22
      const pointSize = 0.028 + talkPulse * 0.022

      samplePaletteColor(cycleColorA.current, t, 0.22, 0)
      samplePaletteColor(cycleColorB.current, t, 0.18, 1.7)

      if (innerGlowRef.current) {
        innerGlowRef.current.color
          .copy(goldBase.current)
          .lerp(cycleColorA.current, 0.35 + talkPulse * 0.45)
        innerGlowRef.current.opacity = glow
      }
      if (outerShellRef.current) {
        outerShellRef.current.color
          .copy(goldBase.current)
          .lerp(cycleColorB.current, 0.25 + talkPulse * 0.35)
        outerShellRef.current.opacity = 0.008 + talkPulse * 0.014
      }
      if (linesMatRef.current) {
        linesMatRef.current.color
          .copy(goldBase.current)
          .lerp(cycleColorA.current, 0.4 + talkPulse * 0.4)
        linesMatRef.current.opacity = lineOpacity
      }
      if (pointsMatRef.current) {
        pointsMatRef.current.size = pointSize
        pointsMatRef.current.opacity = 0.82 + talkPulse * 0.15
      }

      if (frameCount.current % 3 === 0) {
        const scratch = cycleColorA.current
        const tint = cycleColorB.current
        const geom = pointsGeometryRef.current
        const attr = geom?.getAttribute('color') as THREE.BufferAttribute | undefined
        if (attr) {
          const arr = liveColors.current
          for (let i = 0; i < particlePhases.length; i++) {
            const phase = particlePhases[i]
            const wave = 0.5 + 0.5 * Math.sin(t * 3.8 + phase)
            const wave2 = 0.5 + 0.5 * Math.sin(t * 2.6 + phase * 1.3)
            const mix = wave * 0.55 + wave2 * 0.45

            scratch.setRGB(colors[i * 3], colors[i * 3 + 1], colors[i * 3 + 2])
            samplePaletteColor(tint, t + phase * 0.15, 0.2, i * 0.004)
            scratch.lerp(tint, 0.2 + mix * 0.55)

            const bright = 0.75 + mix * 0.35
            arr[i * 3] = scratch.r * bright
            arr[i * 3 + 1] = scratch.g * bright
            arr[i * 3 + 2] = scratch.b * bright
          }
          attr.array.set(arr)
          attr.needsUpdate = true
        }

        const lineGeom = linesGeometryRef.current
        const lineAttr = lineGeom?.getAttribute('color') as THREE.BufferAttribute | undefined
        if (lineAttr) {
          const lArr = liveLineColors.current
          for (let i = 0; i < connections.length; i++) {
            const idx = connections[i]
            const wave = 0.5 + 0.5 * Math.sin(t * 4.2 + i * 0.08)
            scratch.setRGB(colors[idx * 3], colors[idx * 3 + 1], colors[idx * 3 + 2])
            samplePaletteColor(tint, t + i * 0.02, 0.25, i * 0.01)
            scratch.lerp(tint, 0.15 + wave * 0.5)
            lArr[i * 3] = scratch.r
            lArr[i * 3 + 1] = scratch.g
            lArr[i * 3 + 2] = scratch.b
          }
          lineAttr.array.set(lArr)
          lineAttr.needsUpdate = true
        }
      }
    } else if (isSpeaking) {
      const pulse = 0.5 + 0.5 * Math.sin(t * 1.2)
      if (pointsMatRef.current) {
        pointsMatRef.current.size = 0.04 + volume * 0.03 + pulse * 0.006
      }
      if (linesMatRef.current) {
        linesMatRef.current.opacity = 0.15 + volume * 0.15 + pulse * 0.04
      }
      if (innerGlowRef.current) {
        innerGlowRef.current.opacity = 0.03 + volume * 0.04 + pulse * 0.02
      }
    }
  })

  const activeColor = useMemo(() => {
    if (!isSpeaking) return '#E5A93D'
    const hue = 30 + volume * 30
    return `hsl(${hue}, 90%, ${50 + volume * 20}%)`
  }, [isSpeaking, volume])

  useEffect(() => {
    const geom = pointsGeometryRef.current
    if (!geom || isPaused) return
    const attr = geom.getAttribute('color') as THREE.BufferAttribute
    attr.array.set(colors)
    attr.needsUpdate = true
  }, [isPaused, colors])

  useEffect(() => {
    const geom = linesGeometryRef.current
    if (!geom) return
    if (isPaused && connections.length > 0) {
      const lCol = liveLineColors.current
      for (let i = 0; i < connections.length; i++) {
        const idx = connections[i]
        lCol[i * 3] = colors[idx * 3]
        lCol[i * 3 + 1] = colors[idx * 3 + 1]
        lCol[i * 3 + 2] = colors[idx * 3 + 2]
      }
      geom.setAttribute('color', new THREE.BufferAttribute(lCol.slice(), 3))
    } else {
      geom.deleteAttribute('color')
    }
  }, [isPaused, connections, colors])

  return (
    <>
      <points ref={meshRef}>
        <bufferGeometry ref={pointsGeometryRef}>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
          <bufferAttribute attach="attributes-color" args={[colors, 3]} />
        </bufferGeometry>
        <pointsMaterial
          ref={pointsMatRef}
          size={isPaused ? 0.032 : isSpeaking ? 0.04 + volume * 0.03 : 0.025}
          vertexColors
          transparent
          opacity={0.9}
          sizeAttenuation
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          color={isPaused ? '#ffffff' : activeColor}
        />
      </points>

      <lineSegments ref={linesRef}>
        <bufferGeometry ref={linesGeometryRef}>
          <bufferAttribute attach="attributes-position" args={[linePositions, 3]} />
        </bufferGeometry>
        <lineBasicMaterial
          ref={linesMatRef}
          color={activeColor}
          vertexColors={isPaused}
          transparent
          opacity={isPaused ? 0.16 : isSpeaking ? 0.15 + volume * 0.15 : 0.08}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </lineSegments>

      <mesh>
        <sphereGeometry args={[2.5, 32, 32]} />
        <meshBasicMaterial
          ref={innerGlowRef}
          color={activeColor}
          transparent
          opacity={isSpeaking ? 0.03 + volume * 0.04 : 0.02}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.BackSide}
        />
      </mesh>

      <mesh>
        <sphereGeometry args={[3.8, 32, 32]} />
        <meshBasicMaterial
          ref={outerShellRef}
          color={activeColor}
          transparent
          opacity={0.01}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.FrontSide}
          wireframe
        />
      </mesh>
    </>
  )
}

interface NeuralSphereContainerProps {
  isSpeaking?: boolean
  isPaused?: boolean
  volume?: number
}

export default function NeuralSphere({
  isSpeaking = false,
  isPaused = false,
  volume = 0,
}: NeuralSphereContainerProps) {
  const bloomIntensity = isPaused
    ? 1.75
    : isSpeaking
      ? 1.5 + volume
      : 1.2

  return (
    <div
      className="absolute inset-0 z-0 transition-[background] duration-1000"
      style={{
        background: isPaused
          ? 'radial-gradient(ellipse at center, rgba(229,169,61,0.14) 0%, rgba(20,15,5,0.35) 40%, #050505 72%)'
          : 'radial-gradient(ellipse at center, rgba(20,15,5,0.3) 0%, #050505 70%)',
      }}
    >
      <Canvas
        camera={{ position: [0, 0, 10], fov: 50 }}
        dpr={[1, 1.5]}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: 'high-performance',
        }}
        style={{ background: 'transparent' }}
      >
        <ambientLight intensity={0.1} />
        <ParticleSphere
          isSpeaking={isSpeaking}
          isPaused={isPaused}
          volume={volume}
        />
        <EffectComposer>
          <Bloom
            intensity={bloomIntensity}
            luminanceThreshold={isPaused ? 0.07 : 0.1}
            luminanceSmoothing={0.9}
            mipmapBlur
          />
        </EffectComposer>
      </Canvas>
    </div>
  )
}
