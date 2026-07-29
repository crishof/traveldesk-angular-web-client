# TravelDesk — Informe Ejecutivo de Auditoría

> **Fecha:** 2026-07-16 · **Alcance:** auditoría de solo lectura (no se modificó código de producción).
> **Método:** lectura directa del repo + grafo de llamadas verificado con grep + builds ejecutados realmente + 4 análisis en profundidad (backend, frontend, multitenancy, seguridad).
> **Documentos de detalle:** [00-arquitectura](00-arquitectura.md) · [01-backend](01-backend-codigo-huerfano.md) · [02-frontend](02-frontend-huerfanos-y-visual.md) · [03-multitenancy](03-multitenancy-gap.md) · [04-seguridad](04-seguridad.md) · [05-verifactu](05-verifactu-gap.md) · [06-testing](06-testing-gap.md) · [07-despliegue](07-despliegue.md)

> **⚠️ Corrección posterior a la auditoría (2026-07-16):** el hallazgo original **R1 ("backend no versionado")** era **impreciso** y queda **descartado**. `traveldesk-api/` es su **propio repositorio git independiente** con remoto en GitHub (`github.com/crishof/traveldesk-api`), historial completo, y su rama `dev` ya está mergeada y pusheada a `origin/main` (`.env` no trackeado). No es un monorepo: son **dos repos separados** en la misma carpeta. Se decidió **mantenerlos separados**. Además, la 2ª mitad del Bloque 0 **ya está ejecutada**: CORS de producción sin comodín + rate limiting básico (commit `e5751c4` en la rama `dev` del backend). Ver §1 (riesgos actualizados) y §7.

---

## 1. Resumen ejecutivo

TravelDesk es un monorepo funcional y **más avanzado de lo que asumía el brief**: el backend (Spring Boot **4.0.4** / Java **21**) y el frontend (Angular **19** con **Tailwind ya instalado**) **compilan y construyen hoy sin errores** (verificado, EXIT 0 en ambos). Existe una base de auth completa (JWT + refresh, verificación de email, reset de contraseña, invitaciones) y CRUD de ventas, pagos, clientes, proveedores, reservas, equipo y cuentas, con aislamiento por `agency_id` resuelto **desde el principal autenticado** (el cliente no puede forjarlo — 0 endpoints inseguros por este vector).

La deuda no está en "no funciona", sino en **fragilidad estructural**: el aislamiento multi-tenant es 100% de capa de aplicación (sin RLS, sin migraciones, con `ddl-auto=update` en producción), hay **features que aparentan funcionar pero no persisten** (guardado falso de configuración de agencia), errores mapeados a HTTP 500, inconsistencia visual alta y **cero facturación** (gap Verifactu del 100%).

### Top 5 riesgos

| # | Riesgo | Severidad | Referencia |
|---|---|---|---|
| ~~**R1**~~ | ~~El backend no está en git~~ **DESCARTADO** — el backend es su propio repo git pusheado (ver corrección arriba). Riesgo residual menor: la rama `dev` no tiene `origin/dev` (el trabajo vive vía merge en `main`). | 🟢 Resuelto | [00 §1](00-arquitectura.md) |
| **R2** | **Cimiento multi-tenant frágil** (ahora el riesgo nº1): aislamiento 100% en la app, sin RLS ni migraciones, `ddl-auto=update` en prod. 2 debilidades estructurales Altas (`AccountPayment` sin columna de agencia; `SaleRepository` consultando por `createdById` sin filtro de agencia). No explotable hoy, pero es la base sobre la que se construirá la facturación. | 🔴 Crítico (arquitectura) | [03](03-multitenancy-gap.md) |
| **R3** | **Funcionalidad rota que aparenta funcionar**: `agency-settings` simula guardar (setTimeout + console.log, **no persiste**); excepciones de validación/autorización devuelven **HTTP 500**; endpoints muertos y stubs no-op (`/team/invite`, `/theme`). Erosiona la confianza del MVP. | 🟠 Alto | [01](01-backend-codigo-huerfano.md), [02](02-frontend-huerfanos-y-visual.md) |
| **R4** | **Seguridad de perímetro**: ~~CORS de prod con comodín~~ (✅ **cerrado en Bloque 0**, commit `e5751c4`) y ~~sin rate limiting~~ (✅ **añadido en Bloque 0**). Pendiente: tokens en `localStorage` (expuestos a XSS); autorización solo binaria ADMIN/USER. | 🟠→🟡 Medio | [04 H-1](04-seguridad.md) |
| **R5** | **No desplegable "tal cual"**: falta `vercel.json` (rutas SPA darán 404 al recargar), faltan variables de entorno y no hay CI. Facturación Verifactu: gap del 100% (dependiente de R2). | 🟠 Alto | [07](07-despliegue.md), [05](05-verifactu-gap.md) |

### Esfuerzo estimado relativo por área

| Área | Esfuerzo | Comentario |
|---|---|---|
| Higiene de repo (git del backend) | 🟢 Bajo | Commit + push respetando `.gitignore`. Inmediato. |
| Config de despliegue (vercel.json, env, CI) | 🟢🟡 Bajo-Medio | Ficheros de config + variables. |
| Arreglo de features rotas / dead code / handlers de excepción | 🟡 Medio | Cambios acotados y verificables. |
| Endurecimiento de seguridad (CORS, rate limit, storage tokens) | 🟡 Medio | |
| Normalización visual (tokens de color/espaciado, estados, responsive) | 🟡 Medio | ~3-5 días; Tailwind ya está, no hay "migración". |
| Testing (negocio + aislamiento + frontend) | 🟡🔴 Medio-Alto | Base backend existe; frontend desde cero. |
| **Multitenancy** (decisión tenant, migraciones, RLS, filtro declarativo) | 🔴 Alto | Cimiento de todo lo fiscal. |
| **Facturación Verifactu** | 🔴 Alto | 100% por hacer; requiere asesor fiscal. |

---

## 2. Checklist — Qué está completo hoy (funciona de punta a punta)

> "Completo" = existe backend + frontend + persistencia y el flujo es coherente. Verificado por código, no ejecutado contra DB real salvo los builds.

- ✅ **Compilación y build** de backend y frontend (ambos EXIT 0).
- ✅ **Autenticación**: registro de agencia, login, emisión de JWT (15 min) + refresh token (7 días) con rotación y revocación, logout / logout-all, `/me`.
- ✅ **Verificación de email** (código con TTL) y **reset de contraseña** (con emails vía SMTP/Brevo).
- ✅ **Invitaciones de equipo** vía `POST /api/v1/admin/invitations` (protegido por rol ADMIN) + aceptación pública por token. *(Nota: el `POST /team/invite` es una vía alternativa muerta y rota.)*
- ✅ **CRUD Ventas** + registro/borrado de **pagos** por venta, con `paidAmount` y conversión de divisa.
- ✅ **CRUD Clientes, Proveedores, Reservas**.
- ✅ **Equipo** (listar, invitar, editar, comisión, borrar) y **Cuenta / Comisiones / Estado de cuenta**.
- ✅ **Dashboard** de estadísticas y **conversión de divisas** (API externa).
- ✅ **Aislamiento por agencia** resuelto desde el principal (no forjable por el cliente).
- ⚠️ **Configuración de agencia (`agency-settings`)**: la UI existe pero **el guardado es falso** (no persiste). *Cuenta como incompleto.*
- ⚠️ **Tema (theme)**: endpoint y llamada existen pero es un **stub no-op** sin persistencia.

---

## 3. Checklist — Qué falta para un MVP funcional desplegado

Severidad: 🔴 Bloqueante · 🟠 Importante · 🟢 Deseable. "Dep." = depende de.

| # | Ítem | Área | Severidad | Dep. |
|---|---|---|---|---|
| 1 | ~~**Versionar el backend en git**~~ ✅ **Ya estaba** (repo propio pusheado). Residual 🟢: crear `origin/dev` si se quiere respaldar la rama de trabajo. | infra | ✅ | — |
| 2 | ~~**Añadir `vercel.json`**~~ ✅ **Hecho en Bloque 1** (rewrite SPA + `outputDirectory` + `build:prod`; commit `018f2766` en `TravelAgent@develop`). | infra/frontend | ✅ | — |
| 3 | **Aprovisionar variables de entorno**: Railway (`SPRING_PROFILES_ACTIVE=prod`, `BASE64_SECRET_KEY`, Postgres plugin, `BREVO_API_KEY`, `CORS_ALLOWED_ORIGINS`) y Vercel (`SPRING_PUBLIC_API_URL`, output dir `dist/traveldesk/browser`) | infra | 🔴 | 2 |
| 4 | ~~**Arreglar el guardado de `agency-settings`**~~ ✅ **Hecho en Bloque 1** (carga vía GET y persiste vía PUT `/account/agency`; commit `018f2766`). | frontend | ✅ | — |
| 5 | ~~**Registrar `@ExceptionHandler`**~~ ✅ **Hecho en Bloque 1** (`InvalidRequestException`→400, `ForbiddenOperationException`→403; commit `d70654e`). | backend | ✅ | — |
| 6 | ~~**Cerrar CORS de producción**~~ ✅ **Hecho en Bloque 0** (comodín eliminado; commit `e5751c4`). Al desplegar, fijar `CORS_ALLOWED_ORIGINS` al dominio Vercel exacto. | seguridad | ✅ | 3 |
| 7 | **Decidir `agency_id` vs `tenant_id`** — ✅ **DECIDIDO (2026-07-17): 1:1 (una agencia = un tenant)**. No se crea entidad `Tenant`; el trabajo es reforzar el aislamiento por agencia. | arquitectura | ✅ | — |
| 8 | **Reforzar aislamiento** — ✅ **Hecho (Bloque 2, commits `02ada02`, `2a704b7`, `b4f9af2`)**: `agency_id` en `account_payments` (V2) y `tbl_payments` (V3); **RLS de Postgres implementado y verificado, INACTIVO por defecto** (V4: rol sin superusuario + políticas + aspecto que fija el GUC por transacción). Se activa cambiando credenciales al rol `traveldesk_app` (checklist en informe 03 §6.b). Tests de aislamiento A vs B. | backend/DB | ✅ | — |
| 9 | ~~**Introducir migraciones** (Flyway) y quitar `ddl-auto=update`~~ ✅ **Hecho (Bloque 2, commit `965dda5`)**: Flyway + `V1__baseline.sql`, `ddl-auto=validate` en dev/prod, baseline-on-migrate para deploys existentes. Verificado contra Postgres real. | backend/DB | ✅ | — |
| 10 | ~~**Rate limiting** en login / forgot-password / refresh~~ ✅ **Hecho en Bloque 0** (`RateLimitingFilter`, 10 req/60s por IP; commit `e5751c4`). | seguridad | ✅ | — |
| 11 | **Eliminar código/entidades/endpoints muertos** — 🟢 **Hecho** (commits `885b1b4`, `793e7f0`): `TeamInvitation`+`InvitationStatus`+mapping, marcadores vacíos, métodos huérfanos de repos/servicio, **y el endpoint muerto `/team/invite` + `inviteMember`/`acceptInvite` + DTO huérfano** (trazado el flujo de invitación antes de borrar). **Pendiente menor:** decidir sobre `/theme` (stub no-op). | backend | 🟢 | — |
| 12 | **Resolver N+1** — 🟢 **Hecho en el estado de cuenta** (commits `885b1b4`, `5ecacdf`): fetch-join de asociaciones LAZY **y** batch de la query de bookings por venta (1 query en vez de N), respaldado por un **test de caracterización** (`AccountStatementServiceImplTests`). **Pendiente menor:** LAZY en `getAll` de ventas/reservas (endpoints de listado, menor impacto). | backend | 🟢 | — |
| 13 | **Normalización visual** — 🟡 **Casi completo (Bloque 3, commits `64fc8f0d`→`4a98782d`)**: tokens `brand`/`danger`/`success`/`warning` definidos y aplicados; **acento unificado a cyan** en toda la app; **error→`danger`**, **amber→`warning`**, **verdes de éxito→`success`** (todo pixel-idéntico salvo el acento); base tokenizada (`styles.scss`), **focus-visible global** (accesibilidad), estados de `.form-input`, y **primitivas `.btn-*`** con estados. Reality-check móvil: auth/landing renderizan bien a 375px. **Pendiente:** responsive de las **tablas de datos autenticadas** (ventas/clientes/proveedores/reservas/equipo) — necesita backend+login para inspeccionar y reflow por componente. | frontend | 🟡 | — |
| 14 | **Completar pantallas placeholder** (`commission-account`) y limpiar ruta muerta | frontend | 🟢 | — |
| 15 | **Tests de negocio y de aislamiento** (backend) + configurar runner y tests de guards/interceptor (frontend); Testcontainers para integración real | testing | 🟠 | 8 |
| 16 | **CI** — 🟢 **Hecho** (workflows GitHub Actions en ambos repos): backend `./mvnw verify` (JDK 21) y frontend `npm run build:prod` (Node 20) en push a develop/main y PRs a main. **Deploys** siguen vía integración git de Railway/Vercel (no requieren tokens en el repo). | infra | 🟢 | — |
| 17 | **Mover tokens JWT de `localStorage`** a cookie httpOnly (o mitigar XSS) — endurecimiento | seguridad | 🟢 | — |
| 18 | **Facturación Verifactu**: modelo de factura, datos fiscales (NIF emisor/receptor), desglose IVA (¿REAV?), numeración por serie, encadenamiento/hash, QR, envío AEAT | backend | 🟢 (futuro) | 7,8,9 |

*(Verifactu es 🟢 para "MVP desplegado" porque hoy no hay clientes reales, pero es 🔴 para "MVP comercializable en España".)*

---

## 4. Orden recomendado de abordaje (propuesta, no implementada)

**Bloque 0 — Blindaje inmediato — ✅ COMPLETADO (2026-07-16).**
1. ~~Versionar el backend~~ → verificado: ya estaba en su propio repo pusheado (R1 descartado). Se mantienen 2 repos separados.
2. ~~Endurecer CORS de prod y añadir rate limiting básico~~ → hecho, commit `e5751c4` en `dev` (backend compila y los 6 tests siguen en verde).

**Bloque 1 — Hacer que el MVP sea desplegable y honesto (días).**
3. `vercel.json` + variables de entorno + primer deploy real a Railway/Vercel (R5). *Cierra el bucle end-to-end.*
4. Arreglar features que mienten: guardado de `agency-settings`, `@ExceptionHandler` (500→400/403), limpiar dead code y endpoints muertos (R3). *La confianza del producto depende de esto.*
5. Resolver N+1 evidentes (R3/rendimiento).

**Bloque 2 — Cimiento multi-tenant (antes que facturación).**
6. **Decisión de negocio `agency_id` vs `tenant_id`** (R2). *Todo lo demás se apoya aquí.*
7. Introducir migraciones (Flyway) y retirar `ddl-auto=update` de prod. *Prerrequisito para cambios de esquema controlados.*
8. Reforzar aislamiento (columna/filtro de agencia en `AccountPayment` y queries por `createdById`; evaluar RLS). *Convierte el aislamiento en garantía, no en convención.*
9. Tests de aislamiento y de negocio sobre esta base (R... testing). *Congela el comportamiento correcto antes de tocar dinero.*

**Bloque 3 — Producto y pulido.**
10. Normalización visual (tokens, estados, responsive) — habilita una UI coherente y facilita futuras pantallas.
11. Completar pantallas placeholder; CI/CD; endurecimiento de storage de tokens.

**Bloque 4 — Facturación Verifactu.**
12. Diseñar e implementar Verifactu **sobre el tenant ya resuelto y con migraciones** (Bloque 2). *Una factura debe emitirse con la identidad fiscal correcta y numeración por serie propia del tenant; por eso va después de multitenancy, no antes.* Requiere asesor fiscal (REAV, encadenamiento, QR, AEAT).

**Justificación del orden clave:** *multitenancy antes que Verifactu* porque la facturación fiscal exige emisor correcto, numeración por serie y aislamiento garantizado; *git antes que todo* porque es la única protección contra pérdida y el habilitador del deploy; *arreglar lo que miente antes que añadir features* porque un MVP con guardado falso y errores 500 destruye confianza más rápido de lo que una feature nueva la construye.

---

## 5. Nota sobre supuestos del brief (corregidos con evidencia)

| Supuesto del brief | Realidad verificada |
|---|---|
| "A actualizar a SB4 / Java 25 en fase posterior" | Ya en **SB 4.0.4 / Java 21**. Solo falta el salto 21→25. |
| "Se añadirá Tailwind en fase posterior" | **Tailwind 3.4 ya instalado y en uso** (100% Tailwind, 0 `.scss` por componente). El trabajo es normalizar, no migrar. |
| "No hay tests" | **Backend sí tiene 6 tests** (auth/email/CORS/exception). Frontend efectivamente 0. |
| "Monorepo (backend + frontend)" | **No es un monorepo git**: son **dos repos independientes** (`traveldesk-api` y `TravelAgent`), ambos versionados. El backend NO estaba "sin git" (R1 descartado). |

---

## 6. Nota sobre secretos y estado de git (actualizada)

No se detectaron **secretos commiteados** en ninguno de los dos repos: el `.env` real está `git-ignored` y no trackeado (verificado con `git ls-files`). El backend **sí está versionado** en su propio repo (`crishof/traveldesk-api`, rama `dev`/`main`), con la rama `dev` ya mergeada en `origin/main`. El `git status` de la carpeta padre mostraba `?? traveldesk-api/` simplemente porque es un repo anidado independiente que el repo padre (`TravelAgent`) no recorre — no porque el código estuviera sin versionar. Riesgo residual menor: la rama `dev` no tiene `origin/dev` (respaldo opcional).

## 7. Estado del Bloque 0 (ejecutado el 2026-07-16)

- **Estructura de repos:** confirmada decisión de **mantener dos repos separados** (Railway ← `traveldesk-api`, Vercel ← `TravelAgent`).
- **CORS:** eliminado el comodín `https://*.vercel.app` del default de producción (`application-prod.properties`); solo dominio exacto. Añadido aviso en arranque si se configura un patrón con comodín + credenciales (`SecurityConfig.java`).
- **Rate limiting:** nuevo `RateLimitingFilter` (en memoria, ventana fija, default 10 req/60 s por IP) sobre los endpoints de auth sensibles; responde 429 + `Retry-After`; configurable vía `app.security.rate-limit.*`; deshabilitado en el perfil `test`.
- **Verificación:** el backend compila (EXIT 0) y **los 6 tests siguen pasando** (EXIT 0).
- **Commit:** `e5751c4` en la rama `dev` del repo backend, **sin push** (por decisión del usuario). El `.env` no se tocó ni se trackeó.

## 8. Estado del Bloque 1 (parcial — ejecutado el 2026-07-16)

Objetivo: hacer el MVP **desplegable y honesto**. Completados los ítems bien acotados; verificados con build/test en verde.

- **`vercel.json`** (nuevo, `TravelAgent@develop`, commit `018f2766`): `buildCommand: npm run build:prod`, `outputDirectory: dist/traveldesk/browser`, y rewrite SPA `/(.*) → /index.html` (elimina el 404 al recargar rutas profundas).
- **`agency-settings`** (mismo commit): ya no simula guardar. Carga la configuración real (`GET /account/agency`) y persiste (`PUT /account/agency`) preservando `agencyName` y `timeZone` (requeridos por el backend); añade feedback de éxito/error.
- **`@ExceptionHandler`** (backend `dev`, commit `d70654e`): `InvalidRequestException`→400, `ForbiddenOperationException`→403 (antes 500).
- **Verificación:** backend `mvn test` EXIT 0 (6 tests verdes); frontend `ng build --prod` EXIT 0 (output en `dist/traveldesk/browser`). Sin push.

**También ejecutado en Bloque 1** (backend `dev`, commit `885b1b4`; compila + 6 tests verdes):
- **N+1 (parcial):** fetch-join `DISTINCT` de las asociaciones LAZY del estado de cuenta (payments/createdBy/customer/agency), eliminando ~4 queries por venta. Cambio behavior-preserving.
- **Código muerto (verificado):** eliminados `TeamInvitation` + `InvitationStatus` + `Agency.invitations`, dos clases marcador vacías, `AccountPaymentRepository.findByUserId`, `SaleRepository.findByCreatedById` (también sin filtro de agencia), y el privado `SalesServiceImpl.getSupplierOrNull` con su dependencia `SupplierRepository`.
- **Corrección al informe FASE 1:** `SupplierMapper.toEntity` NO era huérfano (se usa en `SupplierServiceImpl:61`); no se tocó.

**Cerrado después (steps 1 y 2, backend `develop`→`main`):**
- **Step 1 — N+1 de bookings batcheado** (commit `5ecacdf`): 1 query en vez de N por venta, con **test de caracterización** (`AccountStatementServiceImplTests`) escrito y verde antes y después del refactor.
- **Step 2 — `/team/invite` eliminado** (commit `793e7f0`): endpoint y métodos stub muertos, tras trazar el flujo real de invitación.

**Pendiente del Bloque 1:**
- LAZY en `getAll` de ventas/reservas (menor impacto) y decisión sobre `/theme`.
- El **deploy real** (crear proyectos en Railway/Vercel y fijar variables) es una acción en tus cuentas — no la ejecuto yo.

## 9. Estado de git (2026-07-17)

Ambos repos: trabajo en `develop` local, releases mergeadas a `main` con `--no-ff` y **pusheadas**.
- **Backend** (`traveldesk-springboot-api`, antes `traveldesk-api`): `origin/main` = `6bbde81`. Contiene Bloque 0 + Bloque 1 (steps 1-2).
- **Frontend/docs** (`traveldesk-angular-web-client`, antes `TravelAgent`): `origin/main` con `vercel.json`, `agency-settings` real y los informes de auditoría.
- Ambos repos fueron **renombrados en GitHub**; los remotos locales aún apuntan a la URL antigua (funciona por redirección; conviene `git remote set-url`).

## 10. Estado del Bloque 2 — Cimiento multi-tenant (en curso)

- **Decisión de tenancy:** `tenant_id = agency_id` (1:1). No hay entidad `Tenant`; se refuerza el aislamiento por agencia existente.
- **Migraciones (Flyway):** ✅ **hecho y verificado** (commit `965dda5`, en `main`). Ver ítem 9. Verificado end-to-end contra un Postgres 16 real: BBDD nueva (V1 crea el esquema + `validate` OK), BBDD existente (baseline sin re-ejecutar V1), y suite H2 en verde con Flyway deshabilitado.
- **Aislamiento de `AccountPayment`:** ✅ **hecho y verificado** (migración `V2`, commit `02ada02`): `agency_id` NOT NULL+FK, poblado desde la agencia del usuario, con **test de aislamiento** A vs B. Verificado contra Postgres (V1+V2 + `validate`) y H2 (suite verde).
- **Aislamiento de `Payment`:** ✅ **hecho y verificado** (migración `V3`, commit `2a704b7`): `tbl_payments.agency_id` NOT NULL+FK, poblado desde la venta. Verificado contra Postgres (V1+V2+V3 + `validate`) y H2.
- **RLS de Postgres — ✅ implementado y verificado, INACTIVO por defecto** (commit `b4f9af2`): migración `V4` (rol `traveldesk_app` sin superusuario + políticas `agency_isolation` en las 6 tablas con `agency_id`), aspecto que fija `app.current_agency` por transacción (gated por `app.security.rls.enabled=false`), y lecturas de servicio pasadas a transaccionales (`SUPPORTS`→`REQUIRED`) para que el GUC aplique. Verificado end-to-end contra Postgres real (fail-closed, per-agency, WITH CHECK, y run HTTP login→crear→listar devolviendo solo datos de la agencia del llamante). Se mantiene inactivo porque la app conecta como superusuario `postgres` (que ignora RLS); **se activa** siguiendo el checklist del informe [03 §6.b](03-multitenancy-gap.md) (cambiar credenciales al rol `traveldesk_app` + `RLS_ENABLED=true`).
- **Bloque 2 — COMPLETO.** Cimiento multi-tenant listo: Flyway, `agency_id` en todas las tablas de dinero, y RLS preparado y probado.
- **Nota de entorno:** durante la verificación se levantó el Postgres de Docker Compose (`traveldesk-db` en `localhost:5467`); queda corriendo para desarrollo local.
