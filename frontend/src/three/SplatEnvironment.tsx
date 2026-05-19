import { useEffect, useRef } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import { SparkRenderer, SplatMesh } from '@sparkjsdev/spark'
import * as THREE from 'three'
import type { Scene, Camera, WebGLRenderer } from 'three'

interface Props {
  url: string
}

export function SplatEnvironment({ url }: Props) {
  const { gl, scene, camera } = useThree()
  const sparkRef = useRef<SparkRenderer | null>(null)
  const splatRef = useRef<SplatMesh | null>(null)

  useEffect(() => {
    const spark = new SparkRenderer({ renderer: gl as WebGLRenderer })
    const splat = new SplatMesh({ url })

    // World Labs splats come Y-flipped — rotate 180° around X to correct orientation
    ;(splat as unknown as THREE.Object3D).rotation.x = Math.PI

    sparkRef.current = spark
    splatRef.current = splat

    scene.add(spark as unknown as THREE.Object3D)
    scene.add(splat as unknown as THREE.Object3D)

    return () => {
      scene.remove(spark as unknown as THREE.Object3D)
      scene.remove(splat as unknown as THREE.Object3D)
      spark.dispose?.()
      splat.dispose?.()
    }
  }, [url, gl, scene])

  useFrame(() => {
    sparkRef.current?.update({ scene: scene as Scene, camera: camera as Camera })
  })

  return null
}
