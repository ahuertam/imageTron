# ImageTron

Sube una imagen y conviértela automáticamente en un mundo 3D interactivo: un entorno navegable como Gaussian Splat (`.spz`) generado por World Labs, más un modelo 3D del objeto (`.glb`) generado por el proveedor que elijas.

---

## Cómo funciona

1. Subes una imagen desde el navegador
2. El backend lanza **dos jobs en paralelo**:
   - **World Labs** → genera el entorno 3D completo como Gaussian Splat (`.spz`)
   - **Proveedor de modelo** → genera el objeto 3D (`.glb`) con el proveedor que hayas elegido
3. El frontend muestra el progreso en tiempo real vía **Server-Sent Events**
4. En cuanto cada asset está listo, aparece en la escena 3D — sin esperar al otro
5. Cuando ambos terminan, la escena ocupa toda la pantalla con OrbitControls para rotar y explorar

---

## Proveedores de modelo 3D

Puedes elegir el proveedor antes de subir la imagen:

| Proveedor | Créditos gratis | Velocidad | Registro |
|---|---|---|---|
| **Tripo3D** | 2.000 créditos al registrarse | ~30 s | platform.tripo3d.ai |
| **Stable Fast 3D** (Stability AI) | 25 créditos al registrarse | < 1 s | platform.stability.ai |
| **FAL Hunyuan3D** | De pago | ~2 min | fal.ai |

El entorno World Labs siempre se genera independientemente del proveedor elegido.

---

## Requisitos

- Node.js 18+
- API keys en `backend/.env`

---

## Instalación y arranque

Un solo comando instala todo y levanta ambos servidores:

```bash
./start.sh
```

- Frontend: http://localhost:5173
- Backend: http://localhost:3001

---

## Configuración de API keys

Edita `backend/.env` con tus credenciales:

```env
WORLD_LABS_API_KEY=   # worldlabs.ai → API settings
FAL_KEY=              # fal.ai/dashboard → API keys
TRIPO_API_KEY=        # platform.tripo3d.ai → API keys
STABILITY_API_KEY=    # platform.stability.ai → API keys
PORT=3001
```

Solo necesitas las keys de los proveedores que vayas a usar. Si una key está vacía, ese proveedor fallará con un error claro en la UI.

> **Importante:** después de editar `.env` reinicia el servidor — `tsx watch` recarga el código pero no las variables de entorno.

---

## Stack técnico

**Backend** — Express 5 + TypeScript
- `POST /api/generate` — recibe la imagen (multipart), lanza los dos jobs en paralelo
- `GET /api/status/:jobId` — Server-Sent Events con progreso de ambos jobs
- `GET /api/assets/:jobId/spz|glb` — sirve los assets descargados (sin CORS)
- Los assets se guardan en memoria (Buffer) — no hay escritura a disco

**Frontend** — Vite + React 19 + TypeScript + Tailwind CSS
- `useJobSSE` — hook que abre un `EventSource` y actualiza el estado en tiempo real
- `SplatEnvironment` — renderiza el `.spz` con `@sparkjsdev/spark` (integración imperativa en R3F)
- `GlbObject` — carga el `.glb` con `useGLTF` y lo auto-centra/escala en la escena
- `Viewer3D` — Canvas de React Three Fiber con OrbitControls

---

## Estructura del proyecto

```
imageTron/
├── start.sh                  ← instala todo y arranca ambos servidores
├── backend/
│   ├── .env                  ← tus API keys (no en git)
│   ├── .env.example          ← plantilla
│   └── src/
│       ├── index.ts
│       ├── types.ts
│       ├── routes/
│       │   ├── generate.ts   ← POST /api/generate
│       │   ├── status.ts     ← GET  /api/status/:jobId (SSE)
│       │   └── assets.ts     ← GET  /api/assets/:jobId/:type
│       └── services/
│           ├── jobStore.ts   ← estado en memoria + broadcast SSE
│           ├── worldLabs.ts  ← World Labs API + polling 15s
│           ├── falApi.ts     ← FAL queue API + polling 10s
│           ├── tripoApi.ts   ← Tripo3D API + polling 10s
│           └── stabilityApi.ts ← Stability AI (respuesta directa, sin polling)
└── frontend/
    └── src/
        ├── App.tsx
        ├── hooks/
        │   ├── useJobSSE.ts
        │   └── useImageUpload.ts
        ├── components/
        │   ├── UploadZone.tsx    ← drag-drop + selector de provider
        │   ├── ProgressPanel.tsx ← barras de progreso en tiempo real
        │   └── Viewer3D.tsx      ← canvas 3D
        └── three/
            ├── SplatEnvironment.tsx
            └── GlbObject.tsx
```
