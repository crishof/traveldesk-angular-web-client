# Auditoría Backend TravelDesk — FASE 1: Código huérfano y deuda estructural

**Proyecto:** traveldesk-api (Spring Boot 4.0.4 / Java 21)
**Fecha:** 2026-07-16
**Alcance:** Auditoría de solo lectura. No se modificó código fuente.
**Método:** Lectura directa de las 3 capas (controller/service/repository), modelos JPA, config y seguridad; construcción de grafo de llamadas verificado con `grep` sobre el backend y sobre el frontend Angular (`traveldesk-web-client/src`). No hay `@Scheduled`, `@EventListener` ni `@Async` en el proyecto (verificado), por lo que no existen rutas de invocación reflexiva ocultas fuera de MapStruct y el cableado de Spring.

---

## Resumen

- **5 métodos huérfanos seguros de eliminar** (0 referencias reales): 2 métodos de repositorio Spring Data, 1 método privado, 1 método MapStruct sobrecargado y 1 método de interfaz de servicio (`TeamService.acceptInvite`).
- **1 entidad JPA huérfana** (`TeamInvitation` → tabla `tbl_team_invitations`) sin repositorio ni uso funcional, más su enum `InvitationStatus` y 2 clases marcador vacías. El supuesto "InvitationToken duplicado" es un falso duplicado: `model/security/InvitationToken.java` **no contiene** ninguna entidad, solo un marcador vacío; la entidad real y usada es `model/InvitationToken.java`.
- **1 endpoint muerto y roto**: `POST /api/v1/team/invite` (el frontend usa `/admin/invitations` y la implementación lanza "not implemented"). `ThemeController` (GET/PUT `/api/v1/theme`) **sí** es consumido por el frontend pero devuelve respuestas vacías (stub sin servicio ni persistencia).
- **Sin configuración muerta relevante**: todos los `@Bean` y todas las propiedades `application*.properties` están consumidas vía `@Value`.
- **Deuda estructural crítica**: 2 excepciones (`InvalidRequestException`, `ForbiddenOperationException`) sin `@ExceptionHandler` → devuelven **HTTP 500** en lugar de 400/403; y **3 casos de N+1** confirmados (destacando un query dentro de un bucle en el estado de cuenta).

---

## 1. Métodos huérfanos

### (a) Huérfanos seguros de eliminar (cero referencias)

| Clase/Archivo | Método/Elemento | Tipo de hallazgo | Confianza | Acción recomendada |
|---|---|---|---|---|
| `repository/AccountPaymentRepository.java:14` | `findByUserId(UUID)` | Método Spring Data sin ningún llamador (el servicio usa `findByUserIdAndCurrencyOrderByDateAscIdAsc`) | alta | Eliminar |
| `repository/SaleRepository.java:26` | `findByCreatedById(UUID)` | Método Spring Data sin ningún llamador (el servicio usa `findByCreatedByIdAndCurrencyOrderBySaleDateAsc`) | alta | Eliminar |
| `service/SalesServiceImpl.java:138-144` | `getSupplierOrNull(UUID, UUID)` | Método privado nunca invocado dentro de la clase (duplica el de `BookingServiceImpl`, que sí lo usa) | alta | Eliminar |
| `mapper/SupplierMapper.java:22` | `toEntity(SupplierRequest)` | Sobrecarga MapStruct nunca invocada; `create()` usa `toEntity(SupplierCreateRequest)` y `update()` usa `updateEntityFromRequest` | alta | Eliminar |
| `service/TeamService.java:21` + `service/TeamServiceImpl.java:81-84` | `acceptInvite(AcceptInviteRequest)` | Método de interfaz + impl nunca invocados; el flujo real es `AuthService.acceptInvite` vía `AuthController`. La impl solo lanza "not implemented yet" | alta | Eliminar de `TeamService`/`TeamServiceImpl` |

### (b) Huérfanos sospechosos (alcanzables pero muertos/rotos)

| Clase/Archivo | Método/Elemento | Tipo de hallazgo | Confianza | Acción recomendada |
|---|---|---|---|---|
| `service/TeamServiceImpl.java:73-79` | `inviteMember(...)` | Está cableado a `POST /api/v1/team/invite` (`TeamController.java:53-62`), pero lanza `InvalidRequestException("Team invitation flow is not implemented yet")`. El frontend **no** llama a ese endpoint (usa `POST /admin/invitations`). Método alcanzable pero no funcional | alta | Implementar o eliminar endpoint+método |
| `service/AuthServiceImpl.java:443` | parámetro `persistRefreshToken` de `issueAuthTokens` | Los 4 llamadores pasan siempre `true` (líneas 130, 162, 198, 253); la rama `if (persistRefreshToken)` nunca es falsa. Parámetro muerto | media | Simplificar firma (quitar parámetro) |

### (c) Falsos positivos (usados de forma no obvia — NO eliminar)

| Clase/Archivo | Método/Elemento | Por qué NO es huérfano | Confianza |
|---|---|---|---|
| `mapper/SupplierMapper.java:38` | `map(SupplierType)` | Método `default` invocado por el código generado por MapStruct para mapear `type`→`serviceType` en `toResponse` | alta |
| `repository/SecurityAccountRepository.java:14` | `findByUserEmailIgnoreCase(String)` | Usado en `security/principal/SecurityUserDetailsService.java:26` | alta |
| Todos los métodos de interfaces `*Service` implementados en `*ServiceImpl` (excepto `TeamService.acceptInvite`) | — | Invocados desde sus respectivos controllers (verificado uno a uno) | alta |
| `repository/EmailVerificationTokenRepository.deleteByUser`, `PasswordResetTokenRepository.deleteByUser`, `RefreshTokenRepository.findAllByUserAndRevokedFalse` | — | Usados en `AuthServiceImpl` (issueEmailVerificationCode, forgotPassword, revokeAllRefreshTokens) | alta |

---

## 2. Entidades / tablas huérfanas

| Clase/Archivo | Elemento | Tipo de hallazgo | Confianza | Acción recomendada |
|---|---|---|---|---|
| `model/TeamInvitation.java:30` | `@Entity` → tabla `tbl_team_invitations` | **Entidad huérfana**: no existe `TeamInvitationRepository`; solo está referenciada por el mapeo `Agency.invitations` (`model/agency/Agency.java:93`), colección que nunca se lee ni se escribe. Hibernate crea la tabla pero ninguna lógica la persiste/consulta. Coincide con el flujo de invitación de equipo "not implemented" | alta | Eliminar entidad + mapeo en `Agency` (o completar el feature) |
| `model/InvitationStatus.java:3` | `enum InvitationStatus` | Solo usado por `TeamInvitation.status` (`model/TeamInvitation.java:56`). Muerto por transitividad | alta | Eliminar junto con `TeamInvitation` |
| `model/security/InvitationToken.java:3` | `class SecurityInvitationTokenMarker` | El archivo **no declara ninguna entidad** `InvitationToken`; contiene una clase marcador `final` vacía sin uso. Es un archivo mal nombrado, no un duplicado real de entidad | alta | Eliminar archivo (código muerto) |
| `model/security/SecurityModelPackageMarker.java:3` | `class SecurityModelPackageMarker` | Clase marcador `final` package-private, sin referencias (verificado por grep) | alta | Eliminar (código muerto) |

**Resolución del supuesto "InvitationToken duplicado":** la única entidad `InvitationToken` real es `model/InvitationToken.java` (mapea `tbl_invitation_tokens`), importada y usada por `AuthServiceImpl.java:7` y `InvitationTokenRepository.java:3`. El archivo `model/security/InvitationToken.java` es un placeholder que declara `SecurityInvitationTokenMarker`, no una entidad. **No hay conflicto de mapeo.**

**Falso positivo:** `model/Payment.java` no tiene repositorio propio, pero **no es huérfana**: se gestiona por cascada desde `Sale.payments` (`model/Sale.java:67`, `cascade = ALL, orphanRemoval = true`) y se accede vía `SaleRepository.findByIdAndAgencyIdWithPayments`. Correcto.

Resto de entidades (`AccountPayment`, `Booking`, `Customer`, `Sale`, `Supplier`, `User`, `Agency`, `EmailVerificationToken`, `PasswordResetToken`, `RefreshToken`, `SecurityAccount`) tienen repositorio y uso confirmado.

---

## 3. Controllers / endpoints muertos

Cruce de cada `@RequestMapping` contra llamadas HTTP del frontend Angular (`traveldesk-web-client/src`).

| Clase/Archivo | Endpoint | Tipo de hallazgo | Confianza | Acción recomendada |
|---|---|---|---|---|
| `controller/TeamController.java:52-62` | `POST /api/v1/team/invite` | **Muerto y roto**: el frontend invita vía `POST /admin/invitations` (`core/services/team.service.ts:26`), nunca `/team/invite`; además la impl lanza "not implemented" | alta | Eliminar endpoint (redundante con `AdminInvitationController`) |
| `controller/ThemeController.java:26-42` | `GET` y `PUT /api/v1/theme` | **Stub no-op**: `getTheme` devuelve `ResponseEntity.ok().build()` (cuerpo vacío) y `updateTheme` idem; no inyecta servicio ni persiste nada. **Sí** es consumido por el frontend (`core/services/theme-settings.service.ts:12,16`), por lo que la UI recibe respuestas vacías | alta | Implementar persistencia real o retirar del frontend |

Todos los demás endpoints (`auth/*`, `account/*`, `account-statement/*`, `bookings/*`, `customers/*`, `sales/*` incl. pagos, `suppliers/*`, `team` GET/PUT/PATCH/DELETE, `dashboard/stats`, `exchange-rate`, `admin/invitations`) tienen referencia confirmada en el frontend.

---

## 4. Configuración muerta

| Clase/Archivo | Elemento | Tipo de hallazgo | Confianza | Acción recomendada |
|---|---|---|---|---|
| `config/WebClientConfig.java:11` | `@Bean webClientBuilder()` | **No es muerto**: inyectado por `EmailServiceImpl` (`webClientBuilder`) y `ExchangeRateServiceImpl` (constructor) | alta | Mantener |
| `security/config/SecurityConfig.java:69,74,79,102` | `@Bean` passwordEncoder / authenticationManager / securityFilterChain / corsConfigurationSource | Todos consumidos por Spring Security / inyección | alta | Mantener |
| `application*.properties` (todas las claves) | `jwt.*`, `app.mail.*`, `app.mail.brevo.*`, `app.free-currency.*`, `app.email-verification.*`, `app.reset-password.*`, `app.accept-invite.*`, `app.security.cors.*` | Todas resueltas por `@Value` (verificado: `JwtService:29-31`, `EmailServiceImpl:28-53`, `ExchangeRateServiceImpl:29-31`, `AuthServiceImpl:54`, `SecurityConfig:65`) | alta | Sin acción |

**No se detectó configuración muerta.** No existe ninguna clase `@ConfigurationProperties` (a pesar del nombre del test `config/FrontendUrlPropertiesTests`; la configuración se lee con `@Value` inline).

---

## 5. Deuda técnica estructural

### 5.1 Manejo inconsistente de excepciones (crítico)

| Clase/Archivo | Elemento | Tipo de hallazgo | Confianza | Acción recomendada |
|---|---|---|---|---|
| `exception/InvalidRequestException.java:3` | `extends RuntimeException` sin `@ExceptionHandler` | **Bug de contrato HTTP**: se lanza en ~9 sitios de todos los servicios (validaciones de id, parseo de enums, rangos de fecha, etc.) pero `GlobalExceptionHandler` **no tiene handler** para ella y **no** extiende `IllegalArgumentException`, así que cae en `handleGeneric(Exception)` (`GlobalExceptionHandler.java:140-144`) → **HTTP 500** en vez de 400 | alta | Añadir `@ExceptionHandler(InvalidRequestException.class)` → `400`; o extender de una base ya manejada |
| `exception/ForbiddenOperationException.java:3` | `extends RuntimeException` sin `@ExceptionHandler` | Lanzada en `TeamServiceImpl.java:66` ("no puedes eliminar tu propia cuenta"); sin handler → **HTTP 500** en vez de 403 | alta | Añadir `@ExceptionHandler` → `403` |

### 5.2 Consultas N+1 (rendimiento)

| Clase/Archivo | Elemento | Tipo de hallazgo | Confianza | Acción recomendada |
|---|---|---|---|---|
| `service/AccountStatementServiceImpl.java:44-77` y `144-187` | `getStatement` → `calculateCommissionAmount` | **N+1 severo**: por cada `Sale` del bucle (línea 46) se accede a asociaciones LAZY (`getCreatedBy`, `getPayments`, `getAgency`, `getCustomer`) **y** se ejecuta un query de repositorio `bookingRepository.findAllByAgencyIdAndCustomerIdAndCreatedByIdAndDepartureDateAndStatus(...)` **dentro del bucle** (línea 165). Escala como O(N) queries por venta | alta | Precargar bookings agregados en un solo query / `JOIN FETCH` |
| `service/SalesServiceImpl.java:34` + `178-179` | `getAll` → `toResponse` | `findAllByAgencyIdOrderBySaleDateDesc` no hace fetch join; `toResponse` accede a `sale.getCustomer()` y `sale.getCreatedBy()` (LAZY) por fila → N+1 | alta | `@EntityGraph`/`JOIN FETCH` de customer y createdBy |
| `service/BookingServiceImpl.java:36` + `225-244` | `getAll` → `toResponse` | `findAllByAgencyIdOrderByCreatedAtDesc` sin fetch join; `toResponse` accede a `booking.getCustomer()` y `booking.getSupplier()` (LAZY) por fila → N+1 | alta | `@EntityGraph`/`JOIN FETCH` de customer y supplier |

### 5.3 Límites transaccionales

| Clase/Archivo | Elemento | Tipo de hallazgo | Confianza | Acción recomendada |
|---|---|---|---|---|
| `application.properties:21` + servicios de listado | `spring.jpa.open-in-view=false` combinado con `@Transactional(TxType.SUPPORTS)` en métodos de lectura | Con OIV desactivado y `SUPPORTS`, si el método corre sin transacción activa, las entidades quedan detached tras cada llamada al repositorio y el acceso LAZY en `toResponse` (`SalesServiceImpl:178`, `BookingServiceImpl:225`, `AccountStatementServiceImpl:144+`) puede lanzar `LazyInitializationException`. Requiere verificación en runtime; el mecanismo es frágil | media | Cambiar a `@Transactional(readOnly=true)` en los métodos de lectura para garantizar contexto de persistencia abierto |
| Global (servicios vs repositorios) | Mezcla de `jakarta.transaction.Transactional` (servicios) y `org.springframework.transaction.annotation.Transactional` (repos `deleteByUser`) | Inconsistencia de anotación; `jakarta` no soporta `readOnly` ni propagación fina | baja | Unificar en `org.springframework...Transactional` |

### 5.3 (bis) Lógica y features incompletas

| Clase/Archivo | Elemento | Tipo de hallazgo | Confianza | Acción recomendada |
|---|---|---|---|---|
| `service/TeamServiceImpl.java:73-84` | `inviteMember` / `acceptInvite` | Ambos lanzan "not implemented yet"; feature de invitación de equipo a medio construir (junto con la entidad huérfana `TeamInvitation`) | alta | Completar o eliminar |
| `controller/ExchangeRateController.java:26-31` | `convert` | Lógica de negocio en el controller (`blockOptional().orElseThrow(...)`) en lugar de delegar al servicio | baja | Mover a `ExchangeRateService` |
| `service/SalesServiceImpl.java:44-52` | `create` (rama `customerId == null`) | Crea y persiste un `Customer` solo con `fullName` (sin email/phone, saltando validaciones de unicidad de `CustomerServiceImpl`); patrón `new Customer()` reasignado. Riesgo de datos inconsistentes | media | Reusar la lógica de creación de cliente / validar |

---

## Notas de método

- **Inventario:** `find src -name "*.java"` (98 archivos main + 6 test).
- **Grafo de llamadas de servicios/repos:** lectura completa de los 12 controllers, 11 pares interface/impl de servicio, 12 repositorios y todos los `@Entity`. Cada método público sospechoso se verificó con `grep -rn "<nombre>" --include="*.java"` sobre `src/` (main + test).
- **Confirmaciones de huérfanos:** `findByUserId`, `findByCreatedById`, `findByUserEmailIgnoreCase`, `getSupplierOrNull`, `acceptInvite`, `toEntity`, `existsByEmailIgnoreCaseAndIdNot` verificados individualmente por grep (solo aparecen en su declaración, salvo los falsos positivos documentados).
- **Cruce con frontend:** `grep -rn` sobre `traveldesk-web-client/src/**/*.ts` para cada path de controller (`/theme`, `/exchange-rate`, `/team/invite`, `/admin/invitations`, `/account-statement`, `auth/*`, CRUD). El endpoint `/theme` se localizó en `core/services/theme-settings.service.ts`; los invites de equipo se localizaron en `core/services/team.service.ts` (usan `/admin/invitations`, no `/team/invite`).
- **Rutas reflexivas:** `grep` de `@Scheduled`, `@EventListener`, `@Async`, `@ConfigurationProperties`, `@EntityScan` → **sin resultados**, por lo que no hay invocaciones ocultas fuera de Spring DI y el código generado por MapStruct.
- **Config:** verificación cruzada de cada `@Value`/constructor `@Value` contra las claves de `application.properties`, `application-dev/prod/test.properties`.
- **Excepciones:** se listaron las 14 clases de `exception/` con su `extends` y se contrastaron contra los `@ExceptionHandler` de `GlobalExceptionHandler`; `InvalidRequestException` y `ForbiddenOperationException` no tienen handler y no heredan de una clase manejada.
- **Limitaciones:** el riesgo de `LazyInitializationException` (5.3) no se ejecutó en runtime; se marca confianza media. Todo lo demás se verificó estáticamente sobre el código.
