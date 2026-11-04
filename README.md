# ♻️ EcoMapa — Mapa de Puntos de Recolección de Basura

Aplicación web desplegada en AWS que muestra un mapa interactivo con todos los puntos de recolección y centros de reciclaje. Los usuarios pueden encontrar dónde llevar su basura (metal, plástico, vidrio, unicel, cartón, papel, electrónicos, baterías y más), ver si los centros cobran o pagan, trazar su ruta, y registrar nuevos centros de recolección.

![Architecture](https://img.shields.io/badge/architecture-serverless-green) ![AWS](https://img.shields.io/badge/cloud-AWS-orange) ![License](https://img.shields.io/badge/license-MIT-blue)

---

## 📋 Tabla de Contenidos

- [Características](#-características)
- [Tecnologías](#-tecnologías)
- [Arquitectura](#-arquitectura)
- [Estructura del Proyecto](#-estructura-del-proyecto)
- [API Endpoints](#-api-endpoints)
- [Modelo de Datos](#-modelo-de-datos)
- [Tipos de Residuo Soportados](#-tipos-de-residuo-soportados)
- [Fuentes de Datos](#-fuentes-de-datos)
- [Despliegue](#-despliegue)
- [Desarrollo Local](#-desarrollo-local)
- [Seguridad](#-seguridad)
- [Costo](#-costo)

---

## ✨ Características

- **Mapa interactivo** con marcadores codificados por color según el tipo de residuo (13 tipos)
- **Filtros** por tipo de residuo, modelo de pago (cobran / pagan / gratis) y origen de datos
- **Información detallada** de cada centro: dirección, horario, teléfono, sitio web
- **Indicación de pago**: si cobran o pagan, con monto y unidad ($/kg, $/pieza, $/carga)
- **Trazado de ruta** desde la ubicación del usuario hasta el punto seleccionado (vía OSRM)
- **Importación desde OpenStreetMap** — consulta la API de Overpass para importar centros de reciclaje reales a la base de datos
- **Datos en tiempo real de OpenStreetMap** — muestra centros directamente del mapa sin guardarlos en DB
- **Registro de nuevos centros** — cualquier negocio no registrado puede agregar su punto de recolección
- **Geolocalización** — detecta automáticamente la ubicación del usuario para centrar el mapa
- **Diseño responsivo** — funciona en escritorio y móvil
- **207 puntos reales** precargados (centros de reciclaje de CDMX geocodificados vía Nominatim + sedes del Reciclatrón SEDEMA)

---

## 🛠️ Tecnologías

### Frontend

| Tecnología | Versión | Uso |
|---|---|---|
| **React** | 18.3 | Framework de UI por componentes |
| **Vite** | 5.4 | Bundler y servidor de desarrollo |
| **Leaflet** | 1.9 | Librería de mapas interactivos (OpenStreetMap) |
| **JavaScript (JSX)** | ES2022 | Lenguaje del frontend |
| **CSS3** | — | Estilos personalizados, responsivo, animaciones |

### Backend

| Tecnología | Versión | Uso |
|---|---|---|
| **Node.js** | 22.x | Runtime de las funciones Lambda |
| **TypeScript** | 5.7 | Lenguaje del backend y CDK |
| **AWS SDK v3** | 3.700 | Cliente DynamoDB (@aws-sdk/client-dynamodb, @aws-sdk/lib-dynamodb) |
| **esbuild** | 0.24 | Bundler de funciones Lambda (integrado en CDK) |

### Infraestructura (AWS)

| Servicio | Uso |
|---|---|
| **AWS CDK** (TypeScript) | Infraestructura como código — define todos los recursos |
| **AWS Lambda** | 7 funciones serverless (Node.js 22.x, ARM64) |
| **Amazon API Gateway** | API REST con CORS, rate limiting y métricas |
| **Amazon DynamoDB** | Base de datos NoSQL con 2 GSI (por tipo y por fuente) |
| **Amazon S3** | Hosting del frontend estático (privado, acceso vía CloudFront) |
| **Amazon CloudFront** | CDN con HTTPS, OAC para S3, manejo de errores SPA |
| **AWS IAM** | Roles con permisos de mínimo privilegio por función |
| **AWS CloudFormation** | Despliegue declarativo (generado por CDK) |
| **Amazon X-Ray** | Tracing activo en todas las funciones Lambda |

### APIs Externas

| API | Uso | Costo |
|---|---|---|
| **OpenStreetMap Overpass API** | Importación de centros de reciclaje desde OSM | Gratuito |
| **OpenStreetMap Nominatim** | Geocodificación de direcciones a coordenadas | Gratuito |
| **OSRM (router.project-osrm.org)** | Cálculo de rutas en automóvil | Gratuito |
| **OpenStreetMap Tiles** | Mapa base (tiles renderizados) | Gratuito |

### Herramientas

| Herramienta | Uso |
|---|---|
| **AWS CLI v2** | Autenticación (`aws login`) y despliegue del frontend a S3 |
| **AWS Agent Toolkit** | Skills de AWS para el asistente de IA |
| **Python 3** | Scripts de geocodificación y despliegue |
| **npm** | Gestión de dependencias |

---

## 🏗️ Arquitectura

```
                         ┌──────────────────────────────────────────────┐
                         │              Navegador del usuario             │
                         │  React + Leaflet + OpenStreetMap Tiles         │
                         └──────────┬───────────────────┬────────────────┘
                                    │                   │
                          HTTPS (API)         HTTPS (Overpass/Nominatim/OSRM)
                                    │                   │
                         ┌──────────▼─────────┐  ┌──────▼──────────────┐
                         │   CloudFront CDN    │  │  APIs de OSM        │
                         │   (distribución)    │  │  (datos en vivo)    │
                         └──────────┬─────────┘  └─────────────────────┘
                                    │
                         ┌──────────▼─────────┐
                         │   Amazon S3         │
                         │  (frontend estático) │
                         └─────────────────────┘

                         ┌──────────────────────┐
                         │   API Gateway (REST)  │
                         │   /points (CRUD)       │
                         │   /points/nearby      │
                         │   /points/import-osm   │
                         └──────────┬───────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
              ┌─────▼─────┐  ┌─────▼─────┐  ┌─────▼─────┐
              │  Lambda   │  │  Lambda   │  │  Lambda   │
              │  GetPoints│  │ CreatePt  │  │ ImportOSM │
              │  GetPoint │  │ UpdatePt  │  │           │
              │  Nearby   │  │ DeletePt  │  │           │
              └─────┬─────┘  └─────┬─────┘  └─────┬─────┘
                    │               │               │
                    └───────────────┼───────────────┘
                                    │
                         ┌──────────▼─────────┐
                         │   DynamoDB         │
                         │  CollectionPoints   │
                         │  + 2 GSI            │
                         └─────────────────────┘
```

**Flujo de datos:**

1. El navegador carga la app desde CloudFront (S3)
2. La app descarga `config.json` con la URL del API
3. La app consulta `GET /points` en API Gateway → Lambda → DynamoDB
4. Opcionalmente consulta la API de Overpass para datos en vivo de OSM
5. El usuario puede agregar puntos (`POST /points`) o importar desde OSM
6. El trazado de rutas usa OSRM directamente desde el navegador

---

## 📁 Estructura del Proyecto

```
ecomapa/
├── backend/                          # Infraestructura como código (CDK)
│   ├── bin/
│   │   └── app.ts                     # Punto de entrada del CDK App
│   ├── lib/
│   │   └── ecomapa-stack.ts           # Stack CDK: DynamoDB + Lambda + API GW + S3 + CloudFront
│   ├── lambda/                        # Funciones Lambda (TypeScript, esbuild)
│   │   ├── shared.ts                  # Utilidades: DynamoDB client, tipos, validación, respuestas
│   │   ├── get-points.ts              # GET /points — lista con filtros (type, source, payment)
│   │   ├── get-point.ts               # GET /points/{id} — un punto por ID
│   │   ├── create-point.ts            # POST /points — crea nuevo punto
│   │   ├── update-point.ts            # PUT /points/{id} — actualiza punto
│   │   ├── delete-point.ts            # DELETE /points/{id} — elimina punto
│   │   ├── get-nearby.ts              # GET /points/nearby — búsqueda por proximidad (Haversine)
│   │   └── import-osm.ts              # POST /points/import-osm — importa desde Overpass API
│   ├── package.json
│   ├── tsconfig.json
│   └── cdk.json
│
├── frontend/                         # Aplicación web (React + Vite)
│   ├── src/
│   │   ├── main.jsx                   # Punto de entrada de React
│   │   ├── App.jsx                    # Componente principal — estado, datos, handlers
│   │   ├── index.css                  # Estilos globales (sidebar, mapa, modales, responsivo)
│   │   ├── components/
│   │   │   ├── MapView.jsx            # Mapa Leaflet: marcadores, popups, rutas, ubicación
│   │   │   ├── FilterPanel.jsx        # Panel lateral: filtros, toggles, botones de acción
│   │   │   ├── PointDetails.jsx       # Panel flotante: detalles del punto + trazado de ruta
│   │   │   └── AddPointForm.jsx       # Formulario para registrar nuevo centro de recolección
│   │   ├── services/
│   │   │   └── api.js                 # Cliente API: backend (CRUD, nearby, import) + Overpass + OSRM
│   │   └── data/
│   │       └── wasteTypes.js           # Definición de tipos de residuo (iconos, colores, etiquetas)
│   ├── index.html
│   ├── vite.config.js
│   ├── package.json
│   └── .env.example
│
├── deploy.sh                          # Script de despliegue completo (backend + frontend)
├── README.md
└── .gitignore
```

---

## 🔌 API Endpoints

### Base URL
```
https://<api-id>.execute-api.us-east-1.amazonaws.com/prod/
```

### Endpoints

| Método | Endpoint | Descripción | Query Params |
|---|---|---|---|
| `GET` | `/points` | Lista todos los puntos | `?type=metal` `&source=osm` `&payment=pay` |
| `POST` | `/points` | Crea un nuevo punto | — |
| `GET` | `/points/{pointId}` | Obtiene un punto por ID | — |
| `PUT` | `/points/{pointId}` | Actualiza un punto | — |
| `DELETE` | `/points/{pointId}` | Elimina un punto | — |
| `GET` | `/points/nearby` | Puntos cercanos a una ubicación | `?lat=19.43` `&lng=-99.13` `&radius=10` `&type=metal` |
| `POST` | `/points/import-osm` | Importa desde OpenStreetMap | Body: `{"lat":19.43, "lng":-99.13, "radius":50000}` |

### Ejemplo: Crear un punto

```bash
curl -X POST https://<api-url>/points \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Centro de Reciclaje Ejemplo",
    "lat": 19.4326,
    "lng": -99.1332,
    "types": ["metal", "plastic", "glass"],
    "paymentType": "pay",
    "paymentAmount": 5,
    "paymentUnit": "kg",
    "phone": "55 1234 5678",
    "hours": "L-V 9-18",
    "address": "Av. Reforma 100, CDMX"
  }'
```

### Ejemplo: Buscar puntos cercanos

```bash
curl "https://<api-url>/points/nearby?lat=19.4326&lng=-99.1332&radius=10&type=metal"
```

---

## 📦 Modelo de Datos

```typescript
interface CollectionPoint {
  pointId: string;          // Partition key (auto-generado)
  name: string;             // Nombre del centro (requerido)
  description?: string;     // Descripción / operador
  lat: number;              // Latitud (requerido, -90 a 90)
  lng: number;              // Longitud (requerido, -180 a 180)
  address?: string;         // Dirección física
  types: string[];          // Tipos de residuo aceptados (requerido, ver lista abajo)
  primaryType: string;      // Primer tipo (para GSI, auto-generado)
  paymentType: 'charge' | 'pay' | 'free' | 'none';  // Modelo de pago
  paymentAmount?: number;   // Monto (cuando aplica)
  paymentUnit?: string;     // 'kg' | 'unit' | 'load'
  phone?: string;           // Teléfono de contacto
  hours?: string;           // Horario de operación
  website?: string;         // Sitio web
  source: string;           // 'osm' | 'user' | 'government' | 'google'
  verified: boolean;        // Verificado por administrador
  submittedBy?: string;     // Quien lo registró
  createdAt: string;        // ISO 8601 (auto)
  updatedAt: string;        // ISO 8601 (auto)
}
```

### DynamoDB

- **Tabla**: `CollectionPoints`
- **Partition Key**: `pointId` (String)
- **GSI 1** (`type-index`): `primaryType` (String) + `createdAt` (String)
- **GSI 2** (`source-index`): `source` (String) + `createdAt` (String)
- **Billing**: PAY_PER_REQUEST (on-demand)
- **Encryption**: AWS-managed
- **PITR**: Habilitado

---

## ♻️ Tipos de Residuo Soportados

| ID | Etiqueta | Icono | Color |
|---|---|---|---|
| `metal` | Metal | 🔩 | Gris (#64748b) |
| `plastic` | Plástico | ♻️ | Azul (#3b82f6) |
| `glass` | Vidrio | 🍾 | Verde (#10b981) |
| `unicel` | Unicel | ⬜ | Ámbar (#f59e0b) |
| `cardboard` | Cartón | 📦 | Café (#a16207) |
| `paper` | Papel | 📄 | Índigo (#6366f1) |
| `organic` | Orgánico | 🍂 | Lima (#84cc16) |
| `battery` | Baterías | 🔋 | Rojo (#ef4444) |
| `electronic` | Electrónica | 💻 | Violeta (#8b5cf6) |
| `textile` | Textil | 👕 | Rosa (#ec4899) |
| `oil` | Aceite | 🛢️ | Slate (#475569) |
| `tire` | Llantas | 🛞 | Negro (#1c1917) |
| `construction` | Construcción | 🧱 | Café oscuro (#92400e) |

---

## 🌐 Fuentes de Datos

| Fuente | Descripción | Cómo se obtiene |
|---|---|---|
| **OpenStreetMap (Overpass API)** | Centros de reciclaje etiquetados en OSM | Importación vía Lambda → DynamoDB, o consulta en vivo desde el navegador |
| **SEDEMA CDMX (Reciclatrón)** | Sedes oficiales del programa de reciclaje electrónico | Geocodificadas con Nominatim, almacenadas en DynamoDB |
| **Nominatim (OSM)** | Geocodificación de direcciones a coordenadas | Usado para geocodificar centros encontrados por nombre |
| **Registro de usuarios** | Negocios no registrados que se agregan a sí mismos | Formulario en el frontend → POST /points |
| **Datos de ejemplo** | 15 centros precargados con datos realistas | Seed directo a DynamoDB vía API |

### Mapeo de etiquetas OSM a tipos de EcoMapa

La función de importación mapea las etiquetas `recycling:*` de OpenStreetMap a los tipos de EcoMapa:

| Etiqueta OSM | Tipo EcoMapa |
|---|---|
| `recycling:metal`, `recycling:aluminium`, `recycling:cans` | `metal` |
| `recycling:plastic`, `recycling:plastic_bottles` | `plastic` |
| `recycling:glass`, `recycling:glass_bottles` | `glass` |
| `recycling:paper`, `recycling:newspaper` | `paper` |
| `recycling:cardboard`, `recycling:beverage_cartons` | `cardboard` |
| `recycling:batteries` | `battery` |
| `recycling:electronics`, `recycling:electrical_appliances` | `electronic` |
| `recycling:clothes`, `recycling:textiles` | `textile` |
| `recycling:cooking_oil`, `recycling:engine_oil` | `oil` |
| `recycling:tyres` | `tire` |
| `recycling:green_waste` | `organic` |
| `recycling:styrofoam`, `recycling:eps` | `unicel` |

---

## 🚀 Despliegue

### Requisitos previos

- **Node.js** 20+ (probado con Node.js 24)
- **AWS CLI** v2 configurado (`aws login`)
- **Python 3** (para scripts de despliegue)
- Cuenta de AWS activa

### Despliegue completo (recomendado)

```bash
cd ecomapa
chmod +x deploy.sh
./deploy.sh
```

El script:
1. Verifica credenciales de AWS
2. Instala dependencias si no están instaladas
3. Ejecuta `cdk bootstrap` (idempotente)
4. Despliega el backend con `cdk deploy` (DynamoDB, Lambda, API Gateway, S3, CloudFront)
5. Construye el frontend con `vite build`
6. Genera `config.json` con la URL del API
7. Sube el frontend a S3
8. Invalida el cache de CloudFront

### Despliegue por separado

```bash
# Solo backend
./deploy.sh backend

# Solo frontend (requiere backend desplegado)
./deploy.sh frontend
```

### Despliegue manual paso a paso

```bash
# 1. Backend
cd backend
npm install
npx cdk bootstrap          # Solo la primera vez
npx cdk deploy --outputs-file cdk-outputs.json

# 2. Frontend
cd ../frontend
cp .env.example .env       # Configurar VITE_API_URL (opcional en producción)
npm install
npm run build

# 3. Subir a S3
API_URL=$(python3 -c "import json; print(json.load(open('../backend/cdk-outputs.json'))['EcoMapaStack']['ApiUrl'])")
BUCKET=$(python3 -c "import json; print(json.load(open('../backend/cdk-outputs.json'))['EcoMapaStack']['FrontendBucketName'])")
DIST_ID=$(python3 -c "import json; print(json.load(open('../backend/cdk-outputs.json'))['EcoMapaStack']['DistributionId'])")
echo "{\"apiUrl\": \"$API_URL\"}" > dist/config.json
aws s3 sync dist/ "s3://$BUCKET" --delete
aws cloudfront create-invalidation --distribution-id "$DIST_ID" --paths "/*"
```

---

## 💻 Desarrollo Local

### Frontend

```bash
cd frontend
cp .env.example .env       # Opcional: poner VITE_API_URL del API desplegado
npm install
npm run dev                # http://localhost:5173
```

Sin `VITE_API_URL`, el frontend intenta cargar `config.json`. En desarrollo local no existe, así que la app muestra un error y habilita automáticamente los datos en vivo de OpenStreetMap.

### Backend

```bash
cd backend
npm install
npx cdk synth              # Verificar plantilla CloudFormation
npx cdk deploy              # Desplegar a AWS
npx cdk diff                # Ver cambios pendientes
npx cdk destroy             # Eliminar todo (¡borra la DB!)
```

---

## 🔒 Seguridad

| Aspecto | Implementación |
|---|---|
| **DynamoDB** | Cifrado AWS-managed, recuperación puntual (PITR) |
| **IAM** | Permisos de mínimo privilegio por función Lambda (read-only para GET, write para POST/PUT/DELETE) |
| **API Gateway** | Rate limiting (100 req/s, burst 200), CORS configurado, métricas habilitadas |
| **S3** | Bucket privado, bloqueo de acceso público, acceso solo vía CloudFront OAC |
| **CloudFront** | HTTPS forzado, Origin Access Control (OAC) para S3 |
| **Lambda** | Arquitectura ARM64, tracing X-Ray activo, variables de entorno para configuración |
| **Validación** | Todos los inputs validados en el backend (lat/lng, tipos, paymentType) |

---

## 💰 Costo

La arquitectura es 100% serverless — los costos escalan con el uso:

| Servicio | Costo base | Nota |
|---|---|---|
| **DynamoDB** | $0 (Free Tier: 25 GB, 200M requests/año) | Pay-per-request |
| **Lambda** | $0 (Free Tier: 1M requests, 400K GB-seg/mes) | Solo se cobra por invocaciones |
| **API Gateway** | ~$1/mes (Free Tier: 1M requests) | Rate limiting incluido |
| **S3** | <$1/mes (Free Tier: 5 GB, 20K requests) | Almacenamiento del frontend |
| **CloudFront** | $0-2/mes (Free Tier: 1 TB transfer) | CDN |
| **Total estimado** | **$0-3/mes** para tráfico bajo | Escala con uso |

---

## 📊 Datos Precargados

El proyecto incluye **207 puntos reales** precargados en la base de datos:

| Fuente | Cantidad | Método de obtención |
|---|---|---|
| OpenStreetMap (Nominatim) | 167 | Geocodificación de centros de reciclaje encontrados en CDMX |
| SEDEMA / Gobierno (Reciclatrón) | 25 | Sedes oficiales del programa de reciclaje electrónico de SEDEMA CDMX |
| Datos de ejemplo | 15 | Centros realistas con todos los tipos de residuo representados |

Distribución por tipo de residuo: plástico (151), metal (150), cartón (148), vidrio (144), papel (138), baterías (34), electrónica (30), orgánico (9), aceite (3), llantas (2), unicel (2), textil (2), construcción (1).

---

## 🧹 Limpieza

```bash
# Eliminar toda la infraestructura (¡borra todos los datos!)
cd backend
npx cdk destroy
```

---

## 📝 Licencia

MIT License — Libre uso, modificación y distribución.

---

## 🤝 Contribuciones

Las contribuciones son bienvenidas. Por favor abre un issue o envía un pull request.

---

## 👤 Autor

Desarrollado con asistencia de **Kiro** (AI agent) usando el Agent Toolkit for AWS.
