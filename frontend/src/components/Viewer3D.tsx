import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Environment } from '@react-three/drei'
import { SplatEnvironment } from '../three/SplatEnvironment.tsx'
import { GlbObject } from '../three/GlbObject.tsx'

interface Props {
  spzUrl?: string
  glbUrl?: string
}

export function Viewer3D({ spzUrl, glbUrl }: Props) {
  return (
    <Canvas
      gl={{ antialias: false }}
      camera={{ position: [0, 1.5, 5], fov: 60 }}
      style={{ width: '100%', height: '100%' }}
    >
      <Suspense fallback={null}>
        {spzUrl && <SplatEnvironment url={spzUrl} />}
        {!spzUrl && <Environment preset="city" />}
        {glbUrl && <GlbObject url={glbUrl} />}
      </Suspense>

      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 10, 5]} intensity={1} />

      <OrbitControls
        makeDefault
        minDistance={1}
        maxDistance={50}
        target={[0, 0, 0]}
      />
    </Canvas>
  )
}
