# FASE 4 — Auditoría de Seguridad (Backend TravelDesk)

**Alcance:** revisión defensiva de solo lectura del backend Spring Boot 4.0.4 / Java 21 (JWT + Spring Security).
**Fecha:** 2026-07-16
**Raíz backend:** `/Users/cristian/proyectos/app-traveldesk/traveldesk-api`
**Método:** verificación directa sobre el código. Todo hallazgo cita `archivo:línea`.

---

## 1. Resumen ejecutivo

**Nivel de riesgo global: MEDIO.**

La arquitectura de autenticación es sólida y está bien implementada: JWT firmado con HMAC (clave >= 256 bits obligatoria por configuración, sin *fallback* inseguro), BCrypt para contraseñas, sesión *stateless*, rotación y revocación de *refresh tokens*, y una cadena de filtros correcta. No se encontraron credenciales de producción incrustadas ni vectores de inyección SQL.

Los puntos débiles son de configuración y de modelo de autorización, no de fallas críticas explotables directamente:

- **CORS de producción con patrón comodín `https://*.vercel.app` + `allowCredentials(true)`** — amplía el conjunto de orígenes de confianza a cualquier despliegue Vercel (Alta).
- **Tokens (access + refresh) almacenados en `localStorage`** en el frontend — expuestos a XSS (Media).
- **Modelo de autorización binario**: solo `ADMIN` vs `USER` por URL; el resto de endpoints usan `@PreAuthorize("isAuthenticated()")`, sin autorización por rol a nivel de método. El aislamiento multi-tenant (agencyId) depende del código de servicio, no de anotaciones (Media).
- **`/actuator/health` público con `show-details=always`** en el perfil por defecto/dev (Baja, mitigado en prod).

No hay hallazgos **Críticos**. El endpoint de invitaciones de administrador **SÍ está protegido** (ver §6).

---

## 2. Autenticación / Autorización

### 2.1 Generación de tokens
- Generados en `JwtService`:
  - Access token: `generateAccessToken()` — `JwtService.java:40-47`. Claims: `uid`, `role`, `status`; `subject` = email.
  - Refresh token: `generateRefreshToken()` — `JwtService.java:49-54`. Claims: `uid`, `type=refresh`.
- Firma HMAC-SHA con `Keys.hmacShaKeyFor()` sobre clave Base64 — `JwtService.java:90-96`, `99-110`.
- Emisión centralizada en `AuthServiceImpl.issueAuthTokens(...)`, invocada por `login` (`AuthServiceImpl.java:130`) y `refreshToken` (`AuthServiceImpl.java:162`).

### 2.2 Expiraciones (confirmadas)
- `jwt.expiration=900000` ms = **15 min** (access) — `application.properties:39`.
- `jwt.refresh-expiration=604800000` ms = **7 días** (refresh) — `application.properties:40`.
- Inyectadas en `JwtService.java:29-31`. **Confirmado según lo indicado.**
- Tolerancia de reloj de 30 s — `JwtService.java:23,81`.

### 2.3 Validación de tokens
- `JwtFilter` (extiende `OncePerRequestFilter`) — `JwtFilter.java:26`. Extrae `Bearer` de forma robusta (case-insensitive, trim) — `JwtFilter.java:69-81`.
- Valida firma/expiración con `isTokenValid()` (`JwtService.java:65-72`) y compara el email del token con el usuario cargado — `JwtFilter.java:51`.
- Ante excepción, limpia el `SecurityContext` — `JwtFilter.java:59-65`. Correcto (falla cerrada).
- **Observación:** el filtro valida el token pero no distingue el claim `type=refresh`. En la práctica el *refresh token* no se acepta como *bearer* porque su verificación adicional ocurre solo en `/auth/refresh` contra la BD; aun así no hay una comprobación explícita de que un *refresh token* no sirva como *access token* en `JwtFilter`. Riesgo bajo (mismo *subject*/clave), anotado como mejora.

### 2.4 Mecanismo de refresh
- `AuthServiceImpl.refreshToken()` — `AuthServiceImpl.java:136-166`.
- Valida firma JWT, busca el token en BD (`findByTokenAndRevokedFalse`, `AuthServiceImpl.java:147`), verifica `isValid()`, **revoca el token usado y emite uno nuevo (rotación)** — `AuthServiceImpl.java:159-162`. Buena práctica.
- `logout` revoca el *refresh token*; `logout-all` revoca todas las sesiones del usuario (`AuthController.java:79-94`). Los *refresh tokens* son persistentes y revocables (buen control frente a robo).

### 2.5 Almacenamiento de tokens en el frontend
- **`localStorage`** para access y refresh token — `traveldesk-web-client/src/app/core/services/auth.service.ts:33-34, 145-150, 177-179`.
- Enviados vía cabecera `Authorization: Bearer` por el interceptor — `jwt.interceptor.ts:51, 99`.
- **No** se usan cookies `httpOnly`. Implicación: cualquier XSS en el SPA exfiltra ambos tokens. Ver Hallazgo H-2.

### 2.6 Modelo de roles/permisos
- Enum `Role { ADMIN, USER }` — `model/Role.java`. Modelo binario, sin granularidad.
- Autoridades: `ROLE_<rol>` en `SecurityUser.getAuthorities()` — `SecurityUser.java:42-44`.
- Enforcement por URL: `/api/v1/admin/**` y `/actuator/**` requieren `hasRole("ADMIN")` — `SecurityConfig.java:93-94`. El resto: `anyRequest().authenticated()` — `SecurityConfig.java:95`.
- **A nivel de método, todas las anotaciones `@PreAuthorize` son `isAuthenticated()`** (verificado en 11 controladores; ver §6). **No existe autorización basada en rol a nivel de método** salvo la regla de URL `/api/v1/admin/**`.
- **Aislamiento multi-tenant:** depende del `agencyId` del principal en la capa de servicio (p. ej. `AdminInvitationController.java:42` usa `securityUser.getAgencyId()`; `SaleRepository.java:23` filtra `s.agency.id = :agencyId`). No se refuerza con anotaciones; un endpoint que reciba un ID sin filtrar por agencia sería vulnerable a IDOR. Revisión por endpoint queda fuera del alcance de esta fase, pero se recomienda auditar (ver H-4).
- Cuenta habilitada exige `enabled && emailVerified && status==ACTIVE` — `SecurityUser.java:71-74`; bloqueo por `locked`/`BLOCKED` — `SecurityUser.java:61-64`. Correcto.

---

## 3. CORS / CSRF / Cabeceras de seguridad

### 3.1 CORS
- Configurado en `SecurityConfig.corsConfigurationSource()` — `SecurityConfig.java:101-114`.
- `setAllowedOriginPatterns(...)`, `setAllowCredentials(true)` (`:108`), `setAllowedHeaders("*")` (`:106`), métodos completos incl. OPTIONS (`:57`), `maxAge=3600` (`:109`).
- Orígenes por perfil:
  - dev/base: `localhost:3000/4200/5173`, `127.0.0.1` — `application.properties:55`.
  - **prod: `https://traveldesk-pi.vercel.app,https://*.vercel.app`** — `application-prod.properties:34`.
- **Riesgo (Alta, H-1):** el patrón `https://*.vercel.app` combinado con `allowCredentials(true)` autoriza peticiones autenticadas desde **cualquier subdominio `*.vercel.app`**, incluidos despliegues arbitrarios de terceros (p. ej. `https://atacante.vercel.app`). Amplía el perímetro de confianza CORS más allá del dominio propio de la aplicación. Se recomienda fijar el dominio exacto de producción.

### 3.2 CSRF
- **Deshabilitado** — `SecurityConfig.java:80` (`csrf(AbstractHttpConfigurer::disable)`).
- **Evaluación:** aceptable para esta arquitectura. La API es *stateless* (`SessionCreationPolicy.STATELESS`, `SecurityConfig.java:82-84`) y la autenticación viaja en la cabecera `Authorization` (no en cookies), por lo que no es explotable por CSRF clásico (un sitio atacante no puede fijar esa cabecera cross-origin sin pasar CORS). **Implicación:** la superficie CSRF se traslada a la corrección de la política CORS (§3.1) y al almacenamiento de tokens (§2.5).

### 3.3 Cabeceras de seguridad
- **No hay configuración explícita de `.headers(...)`** en `SecurityConfig`. No se deshabilitan, por lo que aplican los **valores por defecto de Spring Security**: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Cache-Control` en respuestas autenticadas, y HSTS solo sobre HTTPS.
- **No hay Content-Security-Policy (CSP)** — no se define en el backend ni se observa cabecera CSP. Dado que el frontend es un SPA que guarda tokens en `localStorage`, la ausencia de CSP eleva el impacto de un XSS. Recomendado añadir CSP (a nivel de SPA/hosting) y confirmar HSTS en producción tras el proxy (`server.forward-headers-strategy=framework`, `application-prod.properties:16`). Ver H-5.

---

## 4. Gestión de secretos

- **`jwt.secret_key=${BASE64_SECRET_KEY}` sin valor por defecto** — `application.properties:38`. Si la variable de entorno falta, la resolución del *placeholder* falla y **la aplicación no arranca** (no hay clave débil de reserva). `JwtService` además rechaza clave vacía o Base64 inválida — `JwtService.java:100-109`. **Comportamiento correcto y seguro.**
- **Sin credenciales de producción incrustadas:**
  - BD prod vía variables de entorno — `application-prod.properties:6-8`.
  - Mail/Brevo/FreeCurrency API keys todas por env con defaults vacíos — `application.properties:48, 61-62, 74`.
  - BD dev usa `postgres/postgres` por defecto, pero **solo en perfil dev** — `application-dev.properties:7-8` (aceptable para local).
- **Clave de test incrustada (esperada, solo test):** `BASE64_SECRET_KEY=MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=` — `application-test.properties:2`. Decodifica a `0123456789abcdef0123456789abcdef` (32 bytes = 256 bits, válida para HS256 pero **trivialmente adivinable**). Riesgo **Bajo**: limitada al perfil `test` (H2 en memoria, mail deshabilitado). **Debe no usarse nunca en dev/prod.** Anotado como H-6.
- `.env` local ignorado por git y todo el directorio backend actualmente sin trackear (contexto confirmado) — no verificable el contenido de `.env`; no forma parte del código fuente.

---

## 5. Hashing de contraseñas

- **Bean `PasswordEncoder` = `BCryptPasswordEncoder`** (fuerza por defecto = **10 rounds**) — `SecurityConfig.java:68-71`. BCrypt es apropiado; strength por defecto aceptable.
- **Registro (hash):**
  - `signup`: `passwordEncoder.encode(request.password())` — `AuthServiceImpl.java:92`.
  - `acceptInvite`: `passwordEncoder.encode(...)` — `AuthServiceImpl.java:242`.
  - `resetPassword`: `passwordEncoder.encode(request.newPassword())` — `AuthServiceImpl.java:313`, con comprobación de que la nueva contraseña no coincide con la anterior — `AuthServiceImpl.java:309`.
- **Login (verificación):** delegada a `AuthenticationManager.authenticate(...)` — `AuthServiceImpl.java:117-118`, que usa el `DaoAuthenticationProvider` con el `PasswordEncoder` BCrypt y `SecurityUserDetailsService` (`SecurityUserDetailsService.java:19-31`). El hash nunca se compara manualmente.
- Las contraseñas se almacenan como `passwordHash` en `SecurityAccount` (`SecurityUser.java:33`). **Nunca en texto plano.** Correcto.
- **Observación menor (H-7):** `SignupRequest` permite contraseña de 8–72 (`SignupRequest.java`), pero `LoginRequest` la limita a 8–**16** (`LoginRequest.java`). Un usuario con contraseña de 17–72 caracteres registrada no podría iniciar sesión (validación rechaza antes de autenticar). Inconsistencia funcional con impacto de usabilidad; no es una falla de seguridad directa.

---

## 6. Endpoints sin autenticación

Regla de la cadena (`SecurityConfig.java:89-95`), evaluada en orden: `OPTIONS /**` → `PUBLIC_ENDPOINTS` (`:41-55`) → `/api/v1/admin/**` ADMIN → `/actuator/**` ADMIN → `anyRequest().authenticated()`.

**Verificación clave — AdminInvitationController:** mapea a `/api/v1/admin/invitations` (`AdminInvitationController.java:21`). Aunque **carece de `@PreAuthorize`**, queda cubierto por la regla de URL `/api/v1/admin/**` → `hasRole("ADMIN")` (`SecurityConfig.java:93`). **NO es un endpoint sin autenticación: requiere rol ADMIN. La "bandera roja" queda descartada.** (Recomendación de defensa en profundidad: añadir también `@PreAuthorize("hasRole('ADMIN')")` para no depender de una única capa.)

**ThemeController** (`/api/v1/theme`, `ThemeController.java:14`) y **ExchangeRateController** (`/api/v1/exchange-rate`, `ExchangeRateController.java:15`): sin `@PreAuthorize`, **pero** caen en `anyRequest().authenticated()` → **requieren autenticación**. No son públicos. (Nota aparte: `ThemeController` GET/PUT devuelven `ResponseEntity.ok().build()` sin lógica — son *stubs*, `ThemeController.java:26-29, 39-41`.)

| Endpoint | Regla | ¿Intencional / Olvido? | Riesgo |
|---|---|---|---|
| `OPTIONS /**` | permitAll (`:91`) | Intencional (preflight CORS) | Ninguno |
| `POST /api/v1/auth/signup` | permitAll (`:47`) | Intencional | Bajo |
| `POST /api/v1/auth/login` | permitAll (`:48`) | Intencional | Bajo |
| `POST /api/v1/auth/refresh` | permitAll (`:48`) | Intencional (valida token en BD) | Bajo |
| `POST /api/v1/auth/verify-email` | permitAll (`:49`) | Intencional | Bajo |
| `POST /api/v1/auth/forgot-password` | permitAll (`:50`) | Intencional (respuesta genérica, no revela existencia — `AuthController.java:152`) | Bajo |
| `POST /api/v1/auth/reset-password` | permitAll (`:51`) | Intencional (valida token) | Bajo |
| `GET /api/v1/auth/invite-info/**` | permitAll (`:52`) | Intencional (datos públicos de invitación por token) | Bajo |
| `POST /api/v1/auth/accept-invite` | permitAll (`:53`) | Intencional | Bajo |
| `POST /api/v1/auth/logout` | permitAll (`:54`) | Intencional (revoca refresh token entregado) | Bajo |
| `POST /api/v1/auth/resend-verification` | permitAll (`:55`) | Intencional | Bajo (posible abuso de envío de correo — sin rate limiting observado) |
| `swagger-ui/**`, `v3/api-docs/**` | permitAll (`:42-44`) | Intencional; **deshabilitado en prod** (`application-prod.properties:47-48`) | Bajo |
| `GET /actuator/health` | permitAll (`:45`) | Intencional (healthcheck), **pero** `show-details=always` en base/dev (`application.properties:80`); `never` en prod (`application-prod.properties:44`) | Bajo (fuga de detalles solo en dev) |
| `/api/v1/theme`, `/api/v1/exchange-rate` | authenticated (fallback) | Requieren auth; **falta `@PreAuthorize`** pero cubiertos | Bajo (mejora: anotar explícitamente) |
| `/api/v1/admin/invitations` (POST) | ADMIN por URL (`:93`) | Protegido; **falta `@PreAuthorize`** (defensa en profundidad) | Bajo |

**Sin rate limiting** observado en endpoints públicos (`login`, `forgot-password`, `resend-verification`, `refresh`): expuestos a fuerza bruta / abuso de correo. Ver H-3.

---

## 7. Validación de inputs e inyección

### 7.1 Bean Validation
- `@Valid` aplicado en los `@RequestBody` de los controladores (p. ej. `AuthController.java:32,44,68,79,115,126,138,150,162`; `AdminInvitationController.java:38`; `ThemeController.java:39`).
- DTOs con restricciones adecuadas: `SignupRequest` (`@NotBlank`, `@Email`, `@Size`), `LoginRequest`, `CreateInvitationRequest` (`@NotBlank`, `@Email`, `@NotNull Role`). 24 anotaciones de validación repartidas en los 45 DTOs. Cobertura razonable en los DTOs sensibles revisados.
- **Recomendación:** verificar caso por caso que todos los DTOs de escritura tengan validación (no auditados los 45 individualmente en esta fase).

### 7.2 Inyección SQL
- **Único `@Query` personalizado:** `SaleRepository.java:23` — JPQL con **parámetros nombrados** (`:id`, `:agencyId`), sin concatenación de cadenas. **No vulnerable.**
- **No se encontró** `nativeQuery=true`, `createQuery`/`createNativeQuery` ni concatenación de SQL en el código (búsqueda en `src/main/java`). El resto del acceso a datos usa métodos derivados de Spring Data JPA (parametrizados). **Sin riesgo de inyección SQL identificado.**
- Escritura JSON manual en `SecurityErrorResponseWriter.toJson()` — `SecurityErrorResponseWriter.java:34-49`: incluye `escape()` de comillas y backslashes (`:47-49`). Mitiga inyección en el JSON de error. Aceptable (aunque usar un serializador sería más robusto).

---

## 8. Hallazgos priorizados

| ID | Severidad | Hallazgo | Ubicación |
|---|---|---|---|
| H-1 | **Alta** | CORS de producción permite el comodín `https://*.vercel.app` con `allowCredentials(true)`: cualquier despliegue Vercel de terceros se convierte en origen de confianza. Fijar el/los dominios exactos. | `application-prod.properties:34`; `SecurityConfig.java:104,108` |
| H-2 | **Media** | Access y refresh tokens almacenados en `localStorage` (expuestos a XSS). Considerar cookie `httpOnly`+`Secure`+`SameSite` para el refresh token. | `auth.service.ts:33-34,145-150` |
| H-3 | **Media** | Ausencia de rate limiting / anti-fuerza bruta en endpoints públicos (`login`, `forgot-password`, `resend-verification`, `refresh`). Riesgo de fuerza bruta de credenciales y abuso de envío de correos. | `SecurityConfig.java:47-55`; `AuthController.java:44,138,150` |
| H-4 | **Media** | Autorización solo binaria (ADMIN/USER) y por URL; el resto usa `@PreAuthorize("isAuthenticated()")`. El aislamiento multi-tenant (agencyId) depende de la capa de servicio, sin refuerzo declarativo → riesgo potencial de IDOR entre agencias si algún endpoint no filtra por `agencyId`. Auditar acceso por recurso. | `SecurityConfig.java:93-95`; controladores (`@PreAuthorize` = isAuthenticated en 11 controladores) |
| H-5 | **Baja** | Sin Content-Security-Policy; cabeceras de seguridad no configuradas explícitamente (aplican defaults de Spring Security). Confirmar HSTS en prod. Eleva el impacto de un XSS dado el uso de `localStorage`. | `SecurityConfig.java:78-99` (sin `.headers(...)`) |
| H-6 | **Baja** | Clave JWT de test débil e incrustada (`0123...` tras Base64). Solo perfil `test`; debe no propagarse a dev/prod. | `application-test.properties:2` |
| H-7 | **Baja** | Inconsistencia de longitud de contraseña: signup permite 8–72, login limita a 8–16 → usuarios con contraseña >16 no pueden iniciar sesión. Impacto de usabilidad. | `SignupRequest.java`; `LoginRequest.java` |
| H-8 | **Baja** | `/actuator/health` público con `show-details=always` en perfil base/dev (fuga de detalles de infraestructura). Mitigado en prod (`never`). | `application.properties:80`; `SecurityConfig.java:45` |
| H-9 | **Baja (mejora)** | `AdminInvitationController`, `ThemeController` y `ExchangeRateController` sin `@PreAuthorize` (cubiertos por reglas de URL / fallback authenticated). Añadir anotaciones explícitas como defensa en profundidad. `JwtFilter` no distingue el claim `type=refresh`. | `AdminInvitationController.java:35`; `ThemeController.java:25,38`; `ExchangeRateController.java:25`; `JwtFilter.java:45-58` |

---

## 9. Aspectos correctos (fortalezas)

- Clave JWT obligatoria sin *fallback* inseguro; validación de formato Base64 y longitud — `JwtService.java:100-109`.
- Rotación + revocación de *refresh tokens* persistidos; `logout` y `logout-all` — `AuthServiceImpl.java:159-162`; `AuthController.java:79-94`.
- BCrypt para hashing; verificación vía `AuthenticationManager` — `SecurityConfig.java:69`; `AuthServiceImpl.java:117`.
- Sesión *stateless*; filtro JWT que falla cerrado — `SecurityConfig.java:82-84`; `JwtFilter.java:59-65`.
- Sin inyección SQL (JPQL parametrizado / métodos derivados) — `SaleRepository.java:23`.
- `forgot-password` con respuesta genérica que no revela existencia de cuenta — `AuthController.java:152`.
- Swagger deshabilitado y detalles de health ocultos en producción — `application-prod.properties:44,47-48`.
