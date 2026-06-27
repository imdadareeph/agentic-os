import { useRef, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import * as THREE from 'three'

interface ParticleSphereProps {
  isSpeaking: boolean
  volume: number
}

function ParticleSphere({ isSpeaking, volume }: ParticleSphereProps) {
  const meshRef = useRef<THREE.Points>(null)
  const linesRef = useRef<THREE.LineSegments>(null)
  const frameCount = useRef(0)

  const { positions, colors, connections } = useMemo(() => {
    const count = 4000
    const pos = new Float32Array(count * 3)
    const col = new Float32Array(count * 3)
    const conns: number[] = []
    const radius = 3.5

    const goldenColor = new THREE.Color('#E5A93D')
    const whiteColor = new THREE.Color('#FFF8E7')
    const amberColor = new THREE.Color('#D4941E')

    for (let i = 0; i < count; i++) {
      const phi = Math.acos(2 * Math.random() - 1)
      const theta = 2 * Math.PI * Math.random()
      const r = radius * Math.cbrt(Math.random())

      const x = r * Math.sin(phi) * Math.cos(theta)
      const y = r * Math.sin(phi) * Math.sin(theta)
      const z = r * Math.cos(phi)

      pos[i * 3] = x
      pos[i * 3 + 1] = y
      pos[i * 3 + 2] = z

      const mixFactor = Math.random()
      const chosenColor = mixFactor < 0.5
        ? goldenColor.clone()
        : mixFactor < 0.8
          ? amberColor.clone()
          : whiteColor.clone()

      const brightness = 0.5 + Math.random() * 0.5
      col[i * 3] = chosenColor.r * brightness
      col[i * 3 + 1] = chosenColor.g * brightness
      col[i * 3 + 2] = chosenColor.b * brightness

      // Create connections to nearby particles
      if (i < count - 1 && Math.random() < 0.02) {
        const neighbor = Math.floor(Math.random() * Math.min(8, count - i - 1)) + i + 1
        if (neighbor < count) {
          conns.push(i, neighbor)
        }
      }
    }

    return { positions: pos, colors: col, connections: conns }
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

  useFrame((state) => {
    frameCount.current++
    // Skip frames for performance
    if (frameCount.current % 2 !== 0) return

    if (meshRef.current) {
      meshRef.current.rotation.y += 0.0008
      meshRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.1) * 0.05
    }
    if (linesRef.current) {
      linesRef.current.rotation.y += 0.0008
      linesRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.1) * 0.05
    }
  })

  // Speaking color effect
  const activeColor = useMemo(() => {
    if (!isSpeaking) return '#E5A93D'
    const hue = 30 + volume * 30 // Shift between amber (30) and golden (60)
    return `hsl(${hue}, 90%, ${50 + volume * 20}%)`
  }, [isSpeaking, volume])

  return (
    <>
      <points ref={meshRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[positions, 3]}
          />
          <bufferAttribute
            attach="attributes-color"
            args={[colors, 3]}
          />
        </bufferGeometry>
        <pointsMaterial
          size={isSpeaking ? 0.04 + volume * 0.03 : 0.025}
          vertexColors
          transparent
          opacity={0.9}
          sizeAttenuation
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          color={activeColor}
        />
      </points>

      <lineSegments ref={linesRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[linePositions, 3]}
          />
        </bufferGeometry>
        <lineBasicMaterial
          color={activeColor}
          transparent
          opacity={isSpeaking ? 0.15 + volume * 0.15 : 0.08}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </lineSegments>

      {/* Inner glow sphere */}
      <mesh>
        <sphereGeometry args={[2.5, 32, 32]} />
        <meshBasicMaterial
          color={activeColor}
          transparent
          opacity={isSpeaking ? 0.03 + volume * 0.04 : 0.02}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.BackSide}
        />
      </mesh>

      {/* Outer shell */}
      <mesh>
        <sphereGeometry args={[3.8, 32, 32]} />
        <meshBasicMaterial
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
  volume?: number
}

export default function NeuralSphere({
  isSpeaking = false,
  volume = 0,
}: NeuralSphereContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-0"
      style={{ background: 'radial-gradient(ellipse at center, rgba(20,15,5,0.3) 0%, #050505 70%)' }}
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
        <ParticleSphere isSpeaking={isSpeaking} volume={volume} />
        <EffectComposer>
          <Bloom
            intensity={isSpeaking ? 1.5 + volume : 1.2}
            luminanceThreshold={0.1}
            luminanceSmoothing={0.9}
            mipmapBlur
          />
        </EffectComposer>
      </Canvas>
    </div>
  )
}