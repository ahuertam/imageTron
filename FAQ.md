# FAQ — ImageTron

---

## ¿Cómo monta la escena React Three Fiber?

R3F es básicamente un reconciliador de React para Three.js. El `<Canvas>` crea un `WebGLRenderer`, una `Scene` y una `Camera` de Three.js, y luego los componentes JSX se traducen a objetos Three.js que se añaden a esa escena. `<ambientLight />` es literalmente un `THREE.AmbientLight`, `<mesh />` es un `THREE.Mesh`, etc. Es compatible 1:1 con Three.js — es el mismo Three.js por debajo.

**Flujo de render:**
1. R3F crea el renderer y hace `requestAnimationFrame` en un loop interno
2. En cada frame ejecuta todos los callbacks registrados con `useFrame`
3. Luego llama a `renderer.render(scene, camera)` de Three.js

**El objeto GLB** (`GlbObject.tsx`) es el caso más sencillo: `useGLTF` de Drei carga el archivo y devuelve una `THREE.Group`. Se inserta en la escena con `<primitive object={gltfScene} />` — un escape hatch de R3F para meter objetos Three.js ya construidos sin declaración JSX.

---

## ¿Por qué el splat no puede ser JSX?

`SparkRenderer` y `SplatMesh` son objetos Three.js propietarios de `@sparkjsdev/spark` — no tienen equivalente JSX porque necesitan acoplarse al renderer de WebGL directamente. El `SparkRenderer` intercepta el pipeline de render y necesita una referencia al `WebGLRenderer` en el constructor.

Por eso `SplatEnvironment.tsx` hace todo de forma imperativa dentro de `useEffect`:

```tsx
const { gl, scene, camera } = useThree()  // acceso a los objetos internos de R3F

useEffect(() => {
  const spark = new SparkRenderer({ renderer: gl })  // necesita el WebGLRenderer
  const splat = new SplatMesh({ url })

  scene.add(spark)
  scene.add(splat)

  return () => { scene.remove(spark); scene.remove(splat); spark.dispose() }
}, [url])

useFrame(() => {
  spark.update({ scene, camera })  // llamada manual cada frame
})

return null  // no produce JSX, solo efectos secundarios sobre la escena
```

---

## ¿Qué es el formato SPZ?

`.spz` es el formato de Gaussian Splat de Niantic/Scaniverse, comprimido con gzip. Un Gaussian Splat representa una escena como una nube de millones de "gaussianas" 3D — elipsoides semitransparentes con color y opacidad. Es radicalmente distinto de mallas poligonales.

**Estructura interna:**

```
[gzip stream]
  └── header binario
        ├── magic: "spz\0" (4 bytes)
        ├── version: uint32
        ├── numPoints: uint32       ← número de gaussianas (puede ser 1-6M)
        ├── shDegree: uint8         ← grado de spherical harmonics (0-3)
        └── flags: uint8
  └── datos por gaussiana (cuantizados, empaquetados):
        ├── position: 3 × float24   ← XYZ en espacio mundo
        ├── scale: 3 × uint8        ← escala del elipsoide en cada eje (log-space)
        ├── rotation: 4 × uint8     ← cuaternión de orientación
        ├── alpha: uint8            ← opacidad (sigmoid-space)
        ├── color (DC): 3 × uint8   ← color base RGB
        └── spherical harmonics     ← coeficientes para color view-dependent
```

**¿Por qué necesita corrección Y-flip con World Labs?**

Los splats se renderizan proyectando cada gaussiana como un quad orientado hacia la cámara. La convención de ejes de World Labs asume Y hacia abajo (convención de imagen/cámara), pero Three.js usa Y hacia arriba (convención OpenGL). La corrección:

```ts
splat.rotation.x = Math.PI  // 180° alrededor de X invierte Y y Z
```

**SPZ vs otros formatos de splat:**

| Formato | Compresión | Notas |
|---|---|---|
| `.ply` raw | Ninguna | Formato original de 3DGS, muy grande (~500 MB por escena) |
| `.splat` | Media | Formato de Luma AI, 32 bytes/gaussiana fijo |
| `.ksplat` | Alta | Formato de Mark Kellogg, con LOD |
| `.spz` | Alta (gzip) | Niantic/Scaniverse, cuantización agresiva — el que usa World Labs |

---

## ¿Por qué `@sparkjsdev/spark` está en `optimizeDeps.exclude`?

La librería lanza un Web Worker internamente usando blob URLs generadas en tiempo de carga. Si Vite pre-bundlea el paquete, esas blob URLs se rompen porque el código del worker queda incrustado en un módulo diferente. Excluyéndolo de `optimizeDeps`, Vite lo sirve tal cual y los workers funcionan correctamente.

```ts
// vite.config.ts
optimizeDeps: {
  exclude: ['@sparkjsdev/spark'],
}
```
