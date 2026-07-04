import { useRef, useMemo, useEffect } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import * as THREE from 'three'

const PAUSE_PALETTE = [
  '#22D3EE', // cyan
  '#2DD4BF', // teal
  '#38BDF8', // sky
  '#A78BFA', // violet
  '#F472B6', // pink
  '#34D399', // emerald
  '#67E8F9', // aqua
  '#818CF8', // indigo
  '#FB7185', // rose
  '#FBBF24', // amber
  '#4ADE80', // green
  '#C084FC', // purple
]

function samplePaletteColor(
  target: THREE.Color,
  time: number,
  speed: number,
  offset: number
): THREE.Color {
  const len = PAUSE_PALETTE.length
  const cycleT = time * speed + offset
  const wrapped = ((cycleT % len) + len) % len
  const i0 = Math.floor(wrapped)
  const i1 = (i0 + 1) % len
  const frac = wrapped - i0
  return target.set(PAUSE_PALETTE[i0]).lerp(new THREE.Color(PAUSE_PALETTE[i1]), frac)
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
  const innerGlow2Ref = useRef<THREE.MeshBasicMaterial>(null)
  const outerShellRef = useRef<THREE.MeshBasicMaterial>(null)
  const pointsMatRef = useRef<THREE.PointsMaterial>(null)
  const linesMatRef = useRef<THREE.LineBasicMaterial>(null)
  const frameCount = useRef(0)
  const cycleColorA = useRef(new THREE.Color())
  const cycleColorB = useRef(new THREE.Color())

  const { positions, colors, pausedColors, connections, lineColors, particlePhases } =
    useMemo(() => {
      const count = 4000
      const pos = new Float32Array(count * 3)
      const col = new Float32Array(count * 3)
      const pauseCol = new Float32Array(count * 3)
      const phases = new Float32Array(count)
      const conns: number[] = []
      const radius = 3.5

      const goldenColor = new THREE.Color('#E5A93D')
      const whiteColor = new THREE.Color('#FFF8E7')
      const amberColor = new THREE.Color('#D4941E')
      const scratch = new THREE.Color()

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
          mixFactor < 0.5
            ? goldenColor
            : mixFactor < 0.8
              ? amberColor
              : whiteColor

        const brightness = 0.5 + Math.random() * 0.5
        col[i * 3] = chosenColor.r * brightness
        col[i * 3 + 1] = chosenColor.g * brightness
        col[i * 3 + 2] = chosenColor.b * brightness

        scratch.set(PAUSE_PALETTE[Math.floor(Math.random() * PAUSE_PALETTE.length)])
        const pauseBrightness = 0.6 + Math.random() * 0.4
        pauseCol[i * 3] = scratch.r * pauseBrightness
        pauseCol[i * 3 + 1] = scratch.g * pauseBrightness
        pauseCol[i * 3 + 2] = scratch.b * pauseBrightness

        if (i < count - 1 && Math.random() < 0.025) {
          const neighbor = Math.floor(Math.random() * Math.min(8, count - i - 1)) + i + 1
          if (neighbor < count) conns.push(i, neighbor)
        }
      }

      const lCol = new Float32Array(conns.length * 3)
      for (let i = 0; i < conns.length; i++) {
        const particleIdx = conns[i]
        const endpointIdx = conns[Math.min(i + 1, conns.length - 1)]
        const pickA = particleIdx
        const pickB = i % 2 === 0 ? particleIdx : endpointIdx
        scratch.set(PAUSE_PALETTE[Math.floor(Math.random() * PAUSE_PALETTE.length)])
        lCol[i * 3] = pauseCol[pickA * 3] * 0.9 + scratch.r * 0.1
        lCol[i * 3 + 1] = pauseCol[pickA * 3 + 1] * 0.9 + scratch.g * 0.1
        lCol[i * 3 + 2] = pauseCol[pickA * 3 + 2] * 0.9 + scratch.b * 0.1
        if (i % 2 === 1) {
          scratch.set(PAUSE_PALETTE[Math.floor(Math.random() * PAUSE_PALETTE.length)])
          lCol[i * 3] = pauseCol[pickB * 3] * 0.5 + scratch.r * 0.5
          lCol[i * 3 + 1] = pauseCol[pickB * 3 + 1] * 0.5 + scratch.g * 0.5
          lCol[i * 3 + 2] = pauseCol[pickB * 3 + 2] * 0.5 + scratch.b * 0.5
        }
      }

      return {
        positions: pos,
        colors: col,
        pausedColors: pauseCol,
        connections: conns,
        lineColors: lCol,
        particlePhases: phases,
      }
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
  const livePauseColors = useRef<Float32Array>(pausedColors.slice())

  useEffect(() => {
    livePauseColors.current = pausedColors.slice()
  }, [pausedColors])

  useEffect(() => {
    const geom = pointsGeometryRef.current
    if (!geom) return
    const attr = geom.getAttribute('color') as THREE.BufferAttribute
    attr.array.set(isPaused ? livePauseColors.current : colors)
    attr.needsUpdate = true
  }, [isPaused, colors])

  useEffect(() => {
    const geom = linesGeometryRef.current
    if (!geom || !isPaused) return
    if (lineColors.length === 0) return
    geom.setAttribute('color', new THREE.BufferAttribute(lineColors.slice(), 3))
  }, [isPaused, lineColors])

  useFrame((state) => {
    frameCount.current++
    if (frameCount.current % 2 !== 0) return

    const t = state.clock.elapsedTime
    const rotSpeed = isPaused ? 0.00025 : 0.0008
    const sway = isPaused ? 0.02 : 0.05
    const swaySpeed = isPaused ? 0.15 : 0.1

    if (meshRef.current) {
      meshRef.current.rotation.y += rotSpeed
      meshRef.current.rotation.x = Math.sin(t * swaySpeed) * sway
    }
    if (linesRef.current) {
      linesRef.current.rotation.y += rotSpeed
      linesRef.current.rotation.x = Math.sin(t * swaySpeed) * sway
    }

    if (isPaused) {
      const pulse = 0.5 + 0.5 * Math.sin(t * 0.75)
      const glow = 0.05 + pulse * 0.08
      const glow2 = 0.03 + pulse * 0.05
      const lineOpacity = 0.12 + pulse * 0.28
      const pointSize = 0.03 + pulse * 0.018

      samplePaletteColor(cycleColorA.current, t, 0.11, 0)
      samplePaletteColor(cycleColorB.current, t, 0.09, 2.4)

      if (innerGlowRef.current) {
        innerGlowRef.current.color.copy(cycleColorA.current)
        innerGlowRef.current.opacity = glow
      }
      if (innerGlow2Ref.current) {
        innerGlow2Ref.current.color.copy(cycleColorB.current)
        innerGlow2Ref.current.opacity = glow2
      }
      if (outerShellRef.current) {
        samplePaletteColor(cycleColorA.current, t, 0.07, 4.2)
        outerShellRef.current.color.copy(cycleColorA.current)
        outerShellRef.current.opacity = 0.012 + pulse * 0.012
      }
      if (linesMatRef.current) {
        linesMatRef.current.opacity = lineOpacity
      }
      if (pointsMatRef.current) {
        pointsMatRef.current.size = pointSize
        pointsMatRef.current.opacity = 0.78 + pulse * 0.22
      }

      if (frameCount.current % 4 === 0) {
        const geom = pointsGeometryRef.current
        const attr = geom?.getAttribute('color') as THREE.BufferAttribute | undefined
        if (attr) {
          const arr = livePauseColors.current
          const scratch = cycleColorA.current
          for (let i = 0; i < particlePhases.length; i++) {
            const twinkle = 0.65 + 0.35 * Math.sin(t * 0.55 + particlePhases[i])
            const hueShift = 0.85 + 0.15 * Math.sin(t * 0.2 + particlePhases[i] * 0.5)
            scratch.setRGB(
              pausedColors[i * 3] * twinkle * hueShift,
              pausedColors[i * 3 + 1] * twinkle * hueShift,
              pausedColors[i * 3 + 2] * twinkle * hueShift
            )
            samplePaletteColor(scratch, t + particlePhases[i], 0.04, i * 0.01)
            arr[i * 3] = scratch.r
            arr[i * 3 + 1] = scratch.g
            arr[i * 3 + 2] = scratch.b
          }
          attr.array.set(arr)
          attr.needsUpdate = true
        }
      }
    }
  })

  const activeColor = useMemo(() => {
    if (isPaused) return '#22D3EE'
    if (!isSpeaking) return '#E5A93D'
    const hue = 30 + volume * 30
    return `hsl(${hue}, 90%, ${50 + volume * 20}%)`
  }, [isPaused, isSpeaking, volume])

  return (
    <>
      <points ref={meshRef}>
        <bufferGeometry ref={pointsGeometryRef}>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
          <bufferAttribute
            attach="attributes-color"
            args={[isPaused ? livePauseColors.current : colors, 3]}
          />
        </bufferGeometry>
        <pointsMaterial
          ref={pointsMatRef}
          size={isPaused ? 0.034 : isSpeaking ? 0.04 + volume * 0.03 : 0.025}
          vertexColors
          transparent
          opacity={isPaused ? 0.88 : 0.9}
          sizeAttenuation
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          color={isPaused ? '#ffffff' : activeColor}
        />
      </points>

      <lineSegments ref={linesRef}>
        <bufferGeometry ref={linesGeometryRef}>
          <bufferAttribute attach="attributes-position" args={[linePositions, 3]} />
          {isPaused && lineColors.length > 0 && (
            <bufferAttribute attach="attributes-color" args={[lineColors, 3]} />
          )}
        </bufferGeometry>
        <lineBasicMaterial
          ref={linesMatRef}
          color={isPaused ? '#ffffff' : activeColor}
          vertexColors={isPaused}
          transparent
          opacity={isPaused ? 0.22 : isSpeaking ? 0.15 + volume * 0.15 : 0.08}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </lineSegments>

      {/* Inner glow — dual layers cycle different palette colors */}
      <mesh>
        <sphereGeometry args={[2.5, 32, 32]} />
        <meshBasicMaterial
          ref={innerGlowRef}
          color={isPaused ? PAUSE_PALETTE[0] : activeColor}
          transparent
          opacity={isPaused ? 0.07 : isSpeaking ? 0.03 + volume * 0.04 : 0.02}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.BackSide}
        />
      </mesh>
      {isPaused && (
        <mesh>
          <sphereGeometry args={[2.15, 28, 28]} />
          <meshBasicMaterial
            ref={innerGlow2Ref}
            color={PAUSE_PALETTE[4]}
            transparent
            opacity={0.05}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            side={THREE.BackSide}
          />
        </mesh>
      )}

      <mesh>
        <sphereGeometry args={[3.8, 32, 32]} />
        <meshBasicMaterial
          ref={outerShellRef}
          color={isPaused ? PAUSE_PALETTE[2] : activeColor}
          transparent
          opacity={isPaused ? 0.018 : 0.01}
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
  const containerRef = useRef<HTMLDivElement>(null)
  const bloomIntensity = isPaused ? 2.0 : isSpeaking ? 1.5 + volume : 1.2

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-0 transition-[background] duration-1000"
      style={{
        background: isPaused
          ? 'radial-gradient(ellipse at 30% 40%, rgba(34,211,238,0.12) 0%, transparent 45%), radial-gradient(ellipse at 70% 55%, rgba(167,139,250,0.1) 0%, transparent 40%), radial-gradient(ellipse at center, rgba(8,32,40,0.35) 0%, #050505 72%)'
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
        <ambientLight intensity={isPaused ? 0.18 : 0.1} />
        <ParticleSphere
          isSpeaking={isSpeaking}
          isPaused={isPaused}
          volume={volume}
        />
        <EffectComposer>
          <Bloom
            intensity={bloomIntensity}
            luminanceThreshold={isPaused ? 0.06 : 0.1}
            luminanceSmoothing={0.9}
            mipmapBlur
          />
        </EffectComposer>
      </Canvas>
    </div>
  )
}
