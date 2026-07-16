# FASE 7 — Despliegue (Railway + Vercel)

> Verificado leyendo el repositorio y ejecutando los builds. No se ha desplegado nada.

## Resumen

- **Backend → Railway:** 🟠 **Desplegable con ajustes moderados.** El `Dockerfile` y el perfil `prod` están bien preparados para Railway (y el backend ya está en su propio repo git pusheado). Ajustes pendientes: variables de entorno (`SPRING_PROFILES_ACTIVE=prod`, `BASE64_SECRET_KEY`, Postgres plugin, `BREVO_API_KEY`) y `ddl-auto=update`.
- **Frontend → Vercel:** 🟠 **Desplegable con ajustes menores-moderados.** El build de producción funciona, pero **falta `vercel.json`** → las rutas profundas SPA darán **404 al recargar**, y hay que fijar output directory + variable de API + CORS.
- **No existe configuración de despliegue en el repo:** sin `vercel.json`, sin `railway.json`/`railway.toml`, sin `Procfile`/`nixpacks.toml`, sin CI/CD.

---

## 1. Configuración de despliegue presente en el repo

| Fichero | ¿Presente? |
|---|---|
| `vercel.json` | ❌ No |
| `railway.json` / `railway.toml` | ❌ No |
| `Procfile` / `nixpacks.toml` | ❌ No |
| `Dockerfile` (backend) | ✅ Sí (`traveldesk-api/Dockerfile`) |
| `docker-compose.yml` | ✅ Sí (solo DB) |
| CI/CD (GitHub Actions, etc.) | ❌ No |
| `scripts/prepare-env.js` (frontend) | ✅ Sí (genera `environment.production.ts` en build) |

---

## 2. Backend en Railway

### 2.1 Dockerfile
`traveldesk-api/Dockerfile` — multi-stage, válido:
- Build: `maven:3.9.6-eclipse-temurin-21` → `mvn package -DskipTests`.
- Runtime: `eclipse-temurin:21-jre-alpine`, `java -jar app.jar`.
- ✅ **Puerto correcto vía env:** aunque `EXPOSE 8090` es fijo (informativo), el puerto real lo controla `server.port=${PORT:8090}` (`application.properties`), y Railway inyecta `PORT`. Correcto.
- ✅ `server.forward-headers-strategy=framework` en `application-prod.properties` → maneja bien el proxy/HTTPS de Railway.
- ✅ Swagger deshabilitado en prod (`springdoc.*.enabled=false`).
- ✅ Compila (verificado, EXIT 0).

### 2.2 Conexión a Postgres
- **Hoy (dev):** `application-dev.properties` → `jdbc:postgresql://localhost:5467/traveldesk_db` (Docker local).
- **Railway (prod):** `application-prod.properties` ya está preparado:
  ```
  spring.datasource.url=${SPRING_DATASOURCE_URL:jdbc:postgresql://${PGHOST}:${PGPORT:5432}/${PGDATABASE}}
  spring.datasource.username=${SPRING_DATASOURCE_USERNAME:${PGUSER}}
  spring.datasource.password=${SPRING_DATASOURCE_PASSWORD:${PGPASSWORD}}
  ```
  Compatible con las variables del **plugin Postgres de Railway** (`PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD`). ✅ Bien resuelto.

### 2.3 Bloqueantes / ajustes (Railway)

| # | Ítem | Severidad | Detalle |
|---|---|---|---|
| B1 | ~~Backend no versionado en git~~ **DESCARTADO** | 🟢 Resuelto | Verificado: `traveldesk-api/` **es su propio repo git pusheado** (`crishof/traveldesk-api`). Railway puede desplegar directamente desde ese repo. Solo aparecía `?? untracked` desde el repo padre por ser un repo anidado. |
| B2 | **`SPRING_PROFILES_ACTIVE=prod`** | 🔴 Bloqueante | Debe fijarse en Railway; por defecto arranca en `dev` (apunta a `localhost:5467`). |
| B3 | **`BASE64_SECRET_KEY`** | 🔴 Bloqueante | No tiene default; la app **no arranca sin ella** (correcto por seguridad). Hay que crear el secreto en Railway. |
| B4 | **Root directory del servicio** | 🟠 Moderado | Monorepo: configurar el servicio Railway con root `traveldesk-api/` para que use su `Dockerfile`. |
| B5 | **`CORS_ALLOWED_ORIGINS`** | 🟠 Moderado | Fijar al dominio real de Vercel. *(El default inseguro `https://*.vercel.app` ya se eliminó en el Bloque 0, commit `e5751c4`; el default ahora es solo `https://traveldesk-pi.vercel.app`.)* |
| B6 | **`ddl-auto=update` en prod** | 🟠 Moderado | Funciona para MVP pero es frágil (sin Flyway/Liquibase). Riesgo de divergencia de esquema y de cambios destructivos silenciosos. Aceptable para lanzar; **migrar a migraciones versionadas antes de facturación**. |
| B7 | **Mail (Brevo)** | 🟢 Menor | `application-prod.properties` ya usa `MAIL_PROVIDER=brevo-api` por defecto; requiere `BREVO_API_KEY`/`MAIL_*`. Sin ellas, el envío de emails de invitación/reset fallará. |

**Veredicto backend: 🟠 Desplegable con ajustes moderados.** El artefacto es correcto; los bloqueantes son de proceso (git) y de aprovisionamiento de variables, no de código.

---

## 3. Frontend en Vercel

### 3.1 Build de producción
- ✅ `npx ng build --configuration production` → **EXIT 0**, salida en `dist/traveldesk/browser/` (con `index.html`), lazy chunks por ruta, ~6 s.
- Script recomendado: `npm run build:prod` → ejecuta `scripts/prepare-env.js` (regenera `environment.production.ts` desde `SPRING_PUBLIC_API_URL`) y luego `ng build --configuration production`.

### 3.2 Configuración de la URL del backend
- `environment.ts` (dev) → `http://localhost:8090/api/v1`.
- `environment.production.ts` → `https://traveldesk-api-production.up.railway.app/api/v1` **hardcodeado**, pero `prepare-env.js` lo **sobrescribe en build** con `SPRING_PUBLIC_API_URL` (normaliza host→https y añade `/api/v1`). ✅ Buen patrón; **hay que definir `SPRING_PUBLIC_API_URL` en Vercel** apuntando al dominio Railway real.
- `exchangeRateApiUrl` (exchangerate-api.com) hardcodeado solo en prod. Confirmar que el consumo real usa el backend (`/api/v1/exchange-rate`) y no esta URL directa desde el navegador (posible CORS/rate-limit).

### 3.3 Bloqueantes / ajustes (Vercel)

| # | Ítem | Severidad | Detalle |
|---|---|---|---|
| V1 | **Falta `vercel.json` con rewrites SPA** | 🔴 Bloqueante funcional | Sin `{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }`, recargar o entrar directo a rutas como `/app/sales` o `/auth/login` devolverá **404**. Angular usa routing por path (no hash). |
| V2 | **Output directory** | 🟠 Moderado | El bundle queda en `dist/traveldesk/browser`. Configurar en Vercel *Output Directory* = `dist/traveldesk/browser` (el preset Angular por defecto puede no acertar con la ruta anidada del builder de Angular 19). |
| V3 | **`SPRING_PUBLIC_API_URL` en Vercel** | 🟠 Moderado | Necesaria para que `prepare-env.js` apunte al backend correcto. Build command: `npm run build:prod`. |
| V4 | **CORS del backend** | 🟠 Moderado | El dominio final de Vercel debe estar en `CORS_ALLOWED_ORIGINS` del backend (ligado a B5). |
| V5 | **`baseHref`** | 🟢 Menor | Sirviendo en raíz de dominio no hace falta; confirmar si se usa subruta. |

**Veredicto frontend: 🟠 Desplegable con ajustes menores-moderados.** El único bloqueante real es el `vercel.json` de rewrites; el resto es configuración de proyecto.

---

## 4. URLs hardcodeadas / `localhost` que romperían prod

| Ubicación | Valor | Riesgo |
|---|---|---|
| `environment.ts` | `http://localhost:8090/api/v1` | Solo dev (correcto que sea local). |
| `environment.production.ts` | URL Railway + exchangerate-api | Mitigado por `prepare-env.js` (API); confirmar el uso de `exchangeRateApiUrl`. |
| `application-dev.properties` | `localhost:5467`, `localhost:4200` | Solo perfil dev (correcto). |
| `application-prod.properties` | defaults `https://traveldesk-pi.vercel.app` | Defaults; sobreescribibles por env. Alinear con el dominio real. |

No se detectaron `localhost` hardcodeados en código de aplicación del frontend fuera de `environment.ts` (a confirmar de forma exhaustiva en FASE 2 si algún componente/servicio embebe URLs).

---

## 5. Recomendación de CI/CD (fase posterior)

No hay pipeline. Para un despliegue fiable: GitHub Actions (en cada repo) que en cada push a `main` ejecute `mvn test` (repo backend) y el build del frontend (repo `TravelAgent`), y disparen los deploys de Railway y Vercel respectivamente. Al ser dos repos, son dos workflows independientes.

## Notas de método

- Búsqueda de ficheros de config de deploy con `find` (vercel/railway/Procfile/nixpacks): ninguno salvo Dockerfile/compose.
- Lectura de `Dockerfile`, `docker-compose.yml`, `application-prod.properties`, `environments/*`, `scripts/prepare-env.js`, `angular.json`.
- Builds ejecutados realmente (EXIT 0 ambos); layout de `dist/` verificado con `find`.
- Estado git verificado con `git status`.
