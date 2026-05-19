import { useEffect } from 'react'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'

interface Props {
  url: string
}

export function GlbObject({ url }: Props) {
  const { scene: gltfScene } = useGLTF(url)

  useEffect(() => {
    const box = new THREE.Box3().setFromObject(gltfScene)
    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z)
    const scale = 2.0 / maxDim
    gltfScene.scale.setScalar(scale)
    gltfScene.position.sub(center.multiplyScalar(scale))
    gltfScene.position.y = 0
  }, [gltfScene])

  return <primitive object={gltfScene} />
}
