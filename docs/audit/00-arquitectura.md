# FASE 0 — Mapa de arquitectura real

> Auditoría de solo lectura. Fecha: 2026-07-16. No se ha modificado código de producción.
> Todo lo aquí documentado está verificado leyendo el repositorio. Lo no verificable se marca como **NO DETERMINADO**.

## Resumen

- Monorepo con dos módulos: `traveldesk-api/` (backend) y `traveldesk-web-client/` (frontend).
- **Estructura de repositorios (corregido tras verificación):** NO es un monorepo git. Son **dos repos independientes** en la misma carpeta: el repo padre `TravelAgent` (`github.com/crishof/TravelAgent`, solo frontend + docs) y **`traveldesk-api/` como repo git propio** (`github.com/crishof/traveldesk-api`, historial completo, ramas `dev`/`main`, `.env` no trackeado). Aparecía como `?? traveldesk-api/` en el `git status` del padre solo porque es un repo anidado que el padre no recorre — **el backend sí está versionado y pusheado** (rama `dev` mergeada en `origin/main`). Decisión tomada: mantener los dos repos separados.
- Varias suposiciones del brief están **desactualizadas** (el repo lleva ~2 meses sin commits pero el backend en disco es más nuevo):
  - Spring Boot **ya está en 4.0.4** y Java en **21** (el brief decía "a actualizar a SB4 / Java 25 en fase posterior"). Falta solo el salto 21→25.
  - **Sí existen tests** en backend (6 archivos, ~480 líneas). El brief decía "no hay tests". En frontend efectivamente **no hay tests**.
  - **Tailwind ya está instalado y configurado** (`tailwindcss ^3.4`, `tailwind.config.js`, `postcss.config.js`). El brief decía "se añadirá en fase posterior".
- **El proyecto compila y construye hoy** en ambos módulos (verificado, ver §2).

---

## 1. Estructura del monorepo

```
app-traveldesk/
├── README.md, .gitignore, .gitattributes, .vscode/   (versionado)
├── traveldesk-api/          ← BACKEND (repo git propio: crishof/traveldesk-api)
└── traveldesk-web-client/   ← FRONTEND (repo padre TravelAgent)
```

### 1.1 Backend — `traveldesk-api/`

Java + Spring Boot, organizado **por capas** (no por feature):

```
src/main/java/com/crishof/traveldeskapi/
├── controller/     (12)  Controladores REST
├── service/        (22)  Interfaces + *Impl (11 servicios lógicos)
├── repository/     (12)  Repositorios Spring Data JPA
├── model/          (17)  Entidades JPA + enums de dominio
│   ├── agency/     (3)   Agency, CommissionType, ThemeMode
│   └── security/   (6)   Tokens de seguridad + SecurityAccount
├── dto/            (45)  DTOs de request/response
├── mapper/         (1)   Mapper MapStruct
├── exception/      (16)  Excepciones + GlobalExceptionHandler
├── config/         (1)   Configuración
└── security/
    ├── config/     (2)   SecurityFilterChain, CORS
    ├── jwt/        (3)   Generación/validación JWT
    ├── principal/  (3)   Principal autenticado
    └── web/        (4)   Filtros / entry points
```

Estructura por **capas técnicas**. A medida que crezca el dominio (facturación, multitenancy) conviene evaluar una organización por feature/módulo, pero hoy es manejable.

### 1.2 Frontend — `traveldesk-web-client/`

**Una sola app** Angular 19 (standalone components, lazy loading por ruta):

```
src/app/
├── core/          config, guards, interceptors, models, services
├── features/      account (+statement, +agency-settings, +commission), auth
│                  (login, register, verify-email, forgot/reset-password,
│                  accept-invite), bookings, clients, dashboard, landing,
│                  sales (+sale-details), shell, suppliers (+detail), team
├── shared/        components, directives, pipes
└── app.routes.ts, app.config.ts, app.component.ts
```

Inventario: **22 componentes**, 13 services, 1 guard (con `authGuard`/`guestGuard`/`adminGuard`), 1 interceptor, 1 pipe, 1 directive, 3 archivos de modelos.

---

## 2. ¿Compila y levanta hoy?

Verificado ejecutando los builds reales (2026-07-16):

| Módulo | Comando | Resultado |
|---|---|---|
| Backend | `./mvnw -DskipTests clean compile` (JAVA_HOME=21) | ✅ **EXIT 0** — compila |
| Frontend | `npx ng build --configuration production` | ✅ **EXIT 0** — bundle generado en `dist/traveldesk/browser/` en ~6 s |

- **Toolchain local detectado:** JDK **25** (Temurin) instalado, `mvn` 3.9 + `mvnw`; Node **v20.20**, npm 11. El `pom.xml` fija `java.version=21`, por lo que se compiló forzando `JAVA_HOME` a JDK 21.
- No se ejecutó `spring-boot:run` end-to-end (requiere Postgres levantado en `localhost:5467` vía Docker Compose y variables de `.env`); la compilación limpia sí valida el árbol de código. Arranque en caliente: **NO DETERMINADO** (no verificado con DB real en esta pasada).
- `mvnw` está presente; el wrapper jar está `.gitignore`-ado.

---

## 3. Versiones reales (verificado en `pom.xml` / `package.json`)

### Backend (`pom.xml`)
| Componente | Versión |
|---|---|
| Spring Boot (parent) | **4.0.4** |
| Java | **21** |
| MapStruct | 1.6.3 |
| jjwt (JWT) | 0.12.7 |
| Lombok | 1.18.42 |
| springdoc-openapi (Swagger) | 3.0.2 |
| PostgreSQL driver | (gestionado por SB) runtime |
| H2 | test |

Starters clave: `data-jpa`, `security`, `webmvc` **y** `webflux` (ambos — WebFlux se usa aparentemente para el `WebClient` de APIs externas, ver §6), `validation`, `actuator`, `mail`. Tests: `data-jpa-test`, `security-test`, `webmvc-test`, `test-classic`, `spring-security-test`, `h2`.

> Observación: coexisten `spring-boot-starter-webmvc` y `spring-boot-starter-webflux`. Servlet stack (MVC) + WebClient reactivo para llamadas salientes. Conviene confirmar que no genera ambigüedad de auto-config (ver FASE 1 deuda técnica).

### Frontend (`package.json`)
| Componente | Versión |
|---|---|
| Angular | **^19.0.0** (core, common, forms, router, animations…) |
| RxJS | ~7.8 |
| TypeScript | ~5.6 |
| zone.js | ~0.15 |
| Tailwind CSS | **^3.4** |
| PostCSS / autoprefixer | ^8.4 / ^10.4 |
| @types/node | ^20 |
| Angular CLI / build-angular | ^19 |

`package-lock.json` presente. Sin librerías de UI de terceros (Material, PrimeNG) ni de iconos declaradas en `package.json` — la iconografía es inline/SVG (confirmar en FASE 2).

---

## 4. Docker / Docker Compose

- **`traveldesk-api/docker-compose.yml`**: define **solo el servicio `database`** (`postgres:16`), expuesto en `5467:5432`, con volumen `pg_dev_data`, red `travel-net` y healthcheck `pg_isready`. Toma credenciales de `.env` (`POSTGRES_DOCKER_*`).
  - El servicio `spring` (build de la app) está **comentado** — Compose hoy solo levanta la base de datos; el backend se ejecuta desde el IDE contra esa DB.
- **`traveldesk-api/Dockerfile`**: multi-stage (build `maven:3.9.6-eclipse-temurin-21` → runtime `eclipse-temurin:21-jre-alpine`), `mvn package -DskipTests`, `EXPOSE 8090`, entrypoint `java -jar app.jar`. **Válido para Railway** (ver FASE 7). Nota: `EXPOSE 8090` es informativo; el puerto real lo fija `server.port=${PORT:8090}`.
- Frontend: **sin Dockerfile** (se despliega en Vercel como estático).

---

## 5. Variables de entorno (externalizadas vs hardcodeadas)

Perfiles Spring: `application.properties` (base) + `application-dev.properties` + `application-prod.properties` + `application-test.properties`. Perfil activo por `SPRING_PROFILES_ACTIVE` (default `dev`). Import opcional de `.env` vía `spring.config.import=optional:file:.env[.properties]`.

**Bien externalizado** (todo con `${VAR:default}`):

| Variable | Uso | Default |
|---|---|---|
| `PORT` | Puerto servidor | 8090 |
| `SPRING_PROFILES_ACTIVE` | Perfil | dev |
| `BASE64_SECRET_KEY` | Clave JWT (`jwt.secret_key`) | **sin default** (requerida) |
| `POSTGRES_DEV_URL/USER/PASSWORD` | Datasource dev | localhost:5467 / postgres / postgres |
| `SPRING_DATASOURCE_URL/USERNAME/PASSWORD`, `PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD` | Datasource prod (Railway) | — |
| `CORS_ALLOWED_ORIGINS` | CORS | localhost:* (dev) / `*.vercel.app` (prod) |
| `MAIL_*`, `BREVO_API_*`, `MAIL_PROVIDER` | Email (SMTP o Brevo API) | mail deshabilitado en dev |
| `FREE_CURRENCY_APIKEY`, `FREE_CURRENCY_BASE_URL` | API de divisas | — |
| `RESET_PASSWORD_BASE_URL`, `ACCEPT_INVITE_BASE_URL` | URLs de frontend en emails | localhost:4200 (dev) / vercel (prod) |
| `jwt.expiration` / `jwt.refresh-expiration` | 900000 ms (15 min) / 604800000 ms (7 días) | fijos en properties |

**Hardcodeadas / a vigilar:**

- `application-test.properties`: `BASE64_SECRET_KEY=MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=` **en claro**. Es una clave **solo de test** (perfil `test`, H2 en memoria); aceptable pero debe documentarse que nunca debe reutilizarse en otros perfiles. Detalle en FASE 4.
- `.env` **existe en disco** (`traveldesk-api/.env`) con secretos reales (DB, `BASE64_SECRET_KEY`, credenciales de mail, `FREE_CURRENCY_APIKEY`). Está **git-ignored** (`git check-ignore` lo confirma) y **no trackeado** en el repo del backend (`git ls-files` lo confirma), por lo que **no hay secretos commiteados**. Riesgo = pérdida local, no fuga en git. Detalle en FASE 4.
- Frontend `environment.production.ts`: `apiUrl` de Railway y `exchangeRateApiUrl` **hardcodeados**, pero el script `scripts/prepare-env.js` los **regenera en build** desde `SPRING_PUBLIC_API_URL`. `environment.ts` (dev) apunta a `http://localhost:8090/api/v1`. Detalle en FASE 7.

---

## 6. Inventario de endpoints REST

Base global: `/api/v1`. Anotación de seguridad por endpoint (`@PreAuthorize`) indicada; la protección efectiva se cruza con la `SecurityFilterChain` en **FASE 4**.

### `AuthController` — `/api/v1/auth` (público por diseño, salvo indicado)
| Método | Path | Seguridad |
|---|---|---|
| POST | `/signup` | público |
| POST | `/login` | público |
| GET | `/invite-info/{token}` | público |
| POST | `/accept-invite` | público |
| POST | `/logout` | público |
| POST | `/logout-all` | `isAuthenticated()` |
| GET | `/me` | `isAuthenticated()` |
| POST | `/refresh` | público |
| POST | `/verify-email` | público |
| POST | `/resend-verification` | público |
| POST | `/forgot-password` | público |
| POST | `/reset-password` | público |

### `CustomerController` — `/api/v1/customers` · todos `isAuthenticated()`
GET `/`, POST `/`, PUT `/{id}`, GET `/{id}`, DELETE `/{id}`

### `SupplierController` — `/api/v1/suppliers` · todos `isAuthenticated()`
GET `/`, POST `/`, PUT `/{id}`, GET `/{id}`, DELETE `/{id}`

### `SalesController` — `/api/v1/sales` · todos `isAuthenticated()`
GET `/`, POST `/`, PUT `/{id}`, GET `/{id}`, DELETE `/{id}`, POST `/{saleId}/payments`, GET `/{saleId}/payments`, DELETE `/{saleId}/payments/{paymentId}`

### `BookingController` — `/api/v1/bookings` · todos `isAuthenticated()`
GET `/`, POST `/`, PUT `/{id}`, GET `/{id}`, DELETE `/{id}`

### `TeamController` — `/api/v1/team` · todos `isAuthenticated()`
GET `/`, POST `/invite`, PUT `/{id}`, PATCH `/{id}/commission`, DELETE `/{id}`

### `AccountController` — `/api/v1/account` · todos `isAuthenticated()`
GET `/`, PUT `/`, GET `/agency`, PUT `/agency`, GET `/commission`, PUT `/commission`

### `AccountStatementController` — `/api/v1/account-statement` · todos `isAuthenticated()`
GET `/me`, POST `/me/payments`, PUT `/me/payments/{paymentId}`, DELETE `/me/payments/{paymentId}`

### `DashboardController` — `/api/v1/dashboard` · `isAuthenticated()`
GET `/stats`

### `AdminInvitationController` — `/api/v1/admin/invitations`
| Método | Path | Seguridad |
|---|---|---|
| POST | `/` | ⚠️ **SIN `@PreAuthorize`** — verificar en FASE 4 si la `SecurityFilterChain` lo protege. Un endpoint de invitación de administrador sin anotación es una bandera roja. |

### `ThemeController` — `/api/v1/theme`
GET `/`, PUT `/` — ⚠️ **SIN `@PreAuthorize`** (verificar en FASE 4)

### `ExchangeRateController` — `/api/v1/exchange-rate`
GET `/` — ⚠️ **SIN `@PreAuthorize`** (verificar en FASE 4; puede ser intencional)

> **Observación de autorización:** todos los endpoints protegidos usan únicamente `isAuthenticated()`. La autorización **por rol** solo aparece en el frontend (`adminGuard`) y — a confirmar en FASE 4 — apenas en backend. Esto significa que hoy **cualquier usuario autenticado puede llamar a endpoints de administración** salvo que la lógica de servicio lo impida. Se analiza en FASE 3 (multitenancy) y FASE 4 (seguridad).

---

## 7. Rutas del frontend (Angular)

Definidas en `traveldesk-web-client/src/app/app.routes.ts` (lazy `loadComponent`):

- **Públicas:** `''` (landing), `invite/:token`, `accept-invite`, `accept-invite/:token`.
- **`auth/*`** (`guestGuard`): `login`, `register`, `verify-email`, `forgot-password`, `reset-password`, `invite/:token`.
- **`app/*`** (`authGuard`, shell): `dashboard`, `sales`, `sales/:id`, `bookings`, `clients`, `suppliers`, `suppliers/:id`, `team` (`adminGuard`), `account`, `agency-settings` (`adminGuard`), `commission-account`.
- **Fallback:** `**` → `''`.

> Nota: existe `account-statement.component.ts` sin ruta directa en `app.routes.ts` (posible orphan o render embebido) — se resuelve en **FASE 2**.

---

## 8. Base de datos

- **PostgreSQL 16** en Docker (Compose), puerto host `5467`.
- **Sin migraciones** (Flyway/Liquibase ausentes). El esquema se gestiona con `spring.jpa.hibernate.ddl-auto=update` en dev **y en prod**, y `create-drop` en test. Ver riesgos en FASE 7 (despliegue) — `ddl-auto=update` en producción es frágil para evolución de esquema y facturación fiscal.
- Tablas con prefijo `tbl_` (`tbl_sales`, `tbl_payments`, …).

## Notas de método

- Estructura obtenida con `find`/`ls` sobre ambos módulos.
- Versiones leídas directamente de `pom.xml` y `package.json`.
- Endpoints extraídos con `grep` de anotaciones `@*Mapping`/`@PreAuthorize` en `controller/`.
- Builds ejecutados realmente (no inferidos), ambos con EXIT 0: backend `./mvnw -DskipTests clean compile` (JAVA_HOME=21) y frontend `npx ng build --configuration production`.
- Estado git verificado con `git status`, `git check-ignore`.
