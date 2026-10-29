# ImageTron — Arquitectura

## Qué hace este proyecto

App web que convierte una imagen en un mundo 3D interactivo:
- **Entorno** (`.spz` Gaussian Splat) generado por World Labs API — siempre se lanza
- **Objeto 3D** (`.glb`) generado por el proveedor que elige el usuario en la UI

Ambos jobs corren en paralelo. En cuanto cada asset está listo aparece en la escena, sin esperar al otro. Cuando los dos están listos la escena ocupa pantalla completa con OrbitControls.

---

## Stack

| Capa | Tecnología |
|---|---|
| Backend | Express 5 + TypeScript, tsx watch |
| Frontend | Vite + React 19 + TypeScript + Tailwind CSS |
| 3D scene | React Three Fiber (@react-three/fiber) + @react-three/drei |
| Gaussian Splat | @sparkjsdev/spark (integración imperativa, NO como JSX) |
| Imagen resize | sharp — máx 1024×1024 antes de enviar a cualquier API |

---

## Arquitectura de datos

```
POST /api/generate (FormData: image, provider, localTrellisUrl?)
  → devuelve { jobId }          // jobId = <hash de imagen>-<provider>

GET /api/status/:jobId          // SSE stream con SubJobState para worldLabs y model
GET /api/assets/:jobId/spz      // proxy del .spz desde buffer en memoria
GET /api/assets/:jobId/glb      // proxy del .glb desde buffer en memoria
```

El jobId es el hash de la imagen **más el provider**: la misma imagen con otro provider es otro job (comparte el `.spz` en disco pero regenera su `.glb`). Misma imagen + mismo provider = mismo jobId = caché hit automático.

---

## Caché en disco

```
backend/outputs/<imageHash>/
  source.jpeg         ← imagen original (la extensión sale del mimeType)
  environment.spz     ← se reutiliza siempre que exista (independiente del provider)
  model.<provider>.glb← un .glb por provider (no se pisan entre sí)
  metadata.json       ← assets y providers que han generado cada asset
```

La raíz por defecto es `backend/outputs/` y se puede cambiar con la env `OUTPUTS_DIR`.

Lógica en `generate.ts`: comprueba caché antes de llamar a cualquier API externa.

---

## Límites y protección de la cuota

Cada job llama a World Labs y a un proveedor de pago, así que hay tres guardas:

| Guarda | Dónde | Qué evita |
|---|---|---|
| Rate limit por IP | `services/rateLimit.ts` | que una racha de peticiones vacíe la cuota (429) |
| Tope de jobs activos | `services/jobStore.ts` (`countActiveJobs`) | demasiadas generaciones simultáneas (503) y que la RAM crezca |
| TTL + topes de tamaño | `services/jobStore.ts` | que `jobs`, `assetBuffers` y `sseClients` crezcan sin límite (los `.spz` pesan ~7 MB) |
| Validación de URL | `services/safeUrl.ts` | SSRF: la URL del TRELLIS local y la del `.glb` se validan (esquema + rangos link-local/metadata) y cada redirección se revalida |
| Límite de píxeles | `services/imageResize.ts` | que una imagen de 20 MB pida GB de RAM al decodificarse (`limitInputPixels`) |

La API **no tiene autenticación propia**: una SPA de navegador no puede guardar un secreto, así que un token en el bundle no protegería nada. Para exponerla a internet hay que ponerla detrás de algo que autentique (Cloudflare Access, proxy con Basic Auth…).

El body de los errores que devuelve un proveedor se acorta antes de mandarse al cliente, para no filtrar cabeceras ni credenciales del proveedor en la respuesta.

---

## Tipos clave (compartidos backend/frontend)

```typescript
type ModelProvider = 'fal' | 'tripo' | 'stability' | 'replicate' | 'meshy' | 'local'

interface SubJobState {
  status: 'pending' | 'processing' | 'done' | 'error'
  progress: number      // 0-100
  message: string
  assetUrl?: string     // /api/assets/:jobId/spz o /api/assets/:jobId/glb
  error?: string
  externalOperationId?: string
}

interface Job {
  id: string            // SHA-256 hash (16 chars)
  imageBase64: string
  imageMimeType: string
  provider: ModelProvider
  worldLabs: SubJobState
  model: SubJobState
}
```

---

## Proveedores de modelo 3D

Cada provider tiene su propio servicio en `backend/src/services/`:

| Provider ID | Archivo | Estado actual |
|---|---|---|
| `local` | `localTrellisApi.ts` | ✅ Gratis — self-hosted |
| `replicate` | `replicateApi.ts` | ⚠️ Requiere billing |
| `meshy` | `meshyApi.ts` | ❌ API de pago |
| `tripo` | `tripoApi.ts` | ❌ Free wallet ≠ API |
| `stability` | `stabilityApi.ts` | ❌ Créditos agotados |
| `fal` | `falApi.ts` | ❌ De pago |

World Labs siempre se llama desde `worldLabs.ts` independientemente del provider elegido.

---

## Provider local TRELLIS

Cuando el provider es `local`, el backend llama a un servidor FastAPI custom:

```
POST {localTrellisUrl}/predictions
Body: { "image": "data:image/jpeg;base64,..." }

Respuesta síncrona:  { "output": "http://.../model.glb" }
                  o  { "glb_url": "http://.../model.glb" }

Respuesta asíncrona: { "id": "abc123", "status": "processing" }
  → polling GET {localTrellisUrl}/predictions/abc123 cada 3s
  → hasta { "status": "succeeded", "output": "..." }
```

La URL del servidor se envía en cada FormData como `localTrellisUrl` (default `http://localhost:8000`). El usuario la puede cambiar en la UI sin reiniciar nada.

---

## SparkRenderer (Gaussian Splat) — particularidades importantes

- `SparkRenderer` y `SplatMesh` son objetos Three.js, **no componentes React**. Se añaden a la escena con `useEffect`.
- `SparkRenderer.update({ scene, camera })` se llama cada frame con `useFrame`.
- El Canvas de R3F debe tener `antialias: false` (requerimiento de Spark).
- `@sparkjsdev/spark` debe estar en `optimizeDeps.exclude` en `vite.config.ts` para preservar sus worker blob URLs.
- Los splats de World Labs necesitan corrección Y-flip: `splat.rotation.x = Math.PI`.

---

## Flujo SSE

`jobStore.ts` mantiene:
- `Map<jobId, Job>` — estado de todos los jobs activos
- `Map<jobId, Set<Response>>` — clientes SSE conectados
- `Map<string, Buffer>` (`assetBuffers`) — buffers de assets en memoria

`sseEventFor(job)` es el único sitio que construye el SSEEvent (`type: 'done'` cuando los dos sub-jobs están resueltos, `update` si no).

`broadcast(jobId)` lo envía a todos los clientes y cierra la conexión cuando ambos sub-jobs están en estado `done` o `error`.

`GET /api/status/:jobId` manda el estado actual nada más conectar, para que un cliente que llega tarde se sincronice. Si el job ya está resuelto ese evento llega como `done`, la respuesta se cierra y el cliente no se registra (no va a recibir nada más).

---

## Convenciones de código

- Sin comentarios salvo que el WHY sea no obvio
- Sin manejo de errores para casos imposibles
- Los imports del backend usan extensión `.js` (TypeScript ESM)
- Los imports del frontend usan extensión `.ts` / `.tsx`
- Tailwind para todo el estilo — no hay CSS custom salvo `index.css` para el reset

---

## Arranque

```bash
./start.sh          # instala deps e inicia ambos servidores
```

- Frontend: http://localhost:5173
- Backend:  http://localhost:3001

Después de editar `backend/.env` hay que reiniciar el backend manualmente — `tsx watch` no recarga variables de entorno.
