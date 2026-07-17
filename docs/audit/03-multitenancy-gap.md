# Auditoría 03 — Aislamiento multi-tenant (gap `agency_id` / `tenant_id`)

**Alcance:** Backend Spring Boot 4 / JPA (Hibernate) de TravelDesk.
**Raíz analizada:** `traveldesk-api/src/main/java/com/crishof/traveldeskapi`
**Modo:** SOLO LECTURA. No se modificó código fuente.
**Fecha:** 2026-07-16
**Método:** verificación línea por línea de entidades, repositorios, servicios, controladores y configuración de seguridad. Todo hallazgo cita `archivo:línea`. Lo no verificable se marca como `NO DETERMINADO`.

---

## 1. Resumen

- El aislamiento es **100% a nivel de aplicación**. No existe RLS de Postgres, ni esquemas separados, ni `@Filter`/`@FilterDef` de Hibernate, ni configuración de multi-tenancy. (Evidencia en sección 6.)
- La discriminación de tenant se hace hoy por la columna **`agency_id`**. **No existe `tenant_id` ni concepto de holding/organización padre.**
- **La resolución de `agency_id` por request es SEGURA en todos los controladores de negocio:** siempre proviene del principal autenticado (`securityUser.getAgencyId()`), nunca de path param, body ni header. `agencyId` se deriva del JWT → usuario → agencia (`SecurityUser.java:31`). No se detectó ningún endpoint donde el cliente pueda forjar el `agency_id`.
- Las fugas detectadas son mayormente **de tipo estructural / defensa en profundidad**: consultas sobre tablas con alcance de agencia que NO filtran por `agency_id` y que hoy quedan implícitamente acotadas solo porque reciben un `userId`/`id` derivado del principal. Son frágiles ante cualquier refactor futuro. Una entidad (`Payment`) y una tabla operativa (`AccountPayment` / `account_payments`) **carecen por completo de columna de agencia**.
- **Total de fugas / debilidades de aislamiento: 6** — 0 Críticas, 2 Altas, 2 Medias, 2 Bajas.

---

## 2. Inventario `agency_id`

### (a) Entidades CON alcance de agencia (columna `agency_id`)

| Entidad | Tabla | Campo `agency` | Ubicación |
|---|---|---|---|
| `User` | `tbl_users` | `@ManyToOne(optional=false) @JoinColumn("agency_id", nullable=false)` | `model/User.java:45-47` |
| `Customer` | `tbl_customers` | `@ManyToOne(optional=false) @JoinColumn("agency_id", nullable=false)` | `model/Customer.java:45-47` |
| `Supplier` | `tbl_suppliers` | `@ManyToOne(optional=false) @JoinColumn("agency_id", nullable=false)` | `model/Supplier.java:35-37` |
| `Sale` | `tbl_sales` | `@ManyToOne(optional=false) @JoinColumn("agency_id", nullable=false)` | `model/Sale.java:29-31` |
| `Booking` | `tbl_bookings` | `@ManyToOne(optional=false) @JoinColumn("agency_id", nullable=false)` | `model/Booking.java:32-34` |
| `TeamInvitation` | (relación `agency`) | mapeado como `mappedBy="agency"` en `Agency.java:92-93` | `model/agency/Agency.java:92` |
| `Agency` | `tbl_agencies` | es la entidad tenant en sí (raíz) | `model/agency/Agency.java:34-40` |

### (b) Entidades que DEBERÍAN tener alcance de agencia y NO lo tienen

| Entidad | Tabla | ¿Tiene `agency_id`? | Evidencia | Riesgo |
|---|---|---|---|---|
| **`Payment`** | `tbl_payments` | **NO.** Solo `@JoinColumn("sale_id")` | `model/Payment.java:25-27` — no hay campo `agency` en toda la clase | Alcance de agencia **indirecto** vía `Sale`. Aceptable solo si TODO acceso pasa por `Sale` filtrado por agencia (hoy se cumple, ver §5). |
| **`AccountPayment`** | `account_payments` | **NO.** Solo `private UUID userId` (`model/AccountPayment.java:25`) | Clase completa `model/AccountPayment.java:19-35`: sin campo `agency` ni relación | Tabla operativa/financiera sin discriminador de tenant. Acotada solo por `userId`. Ver Fuga #2. |

Notas:
- `AccountPayment` además usa un naming de tabla inconsistente (`account_payments`, `model/AccountPayment.java:14`) frente al resto (`tbl_*`), y guarda `userId` como UUID plano sin FK/relación JPA a `User`.
- `Payment` no tiene columna de agencia; la única vía de acceso es a través de `Sale` (`model/Sale.java:67-68`, `@OneToMany mappedBy="sale"`).

---

## 3. Decisión `agency_id` vs `tenant_id` (con evidencia)

### Modelo de dominio observado
- `Agency` es la entidad raíz: agrupa `users`, `customers`, `suppliers`, `sales`, `bookings`, `invitations` mediante `@OneToMany` (`model/agency/Agency.java:77-93`).
- La relación `User → Agency` es `@ManyToOne(optional=false)` (`model/User.java:45-47`): **cada usuario pertenece a exactamente una agencia**.
- En el alta (`signup`) se crea **una** `Agency` nueva y **un** `User` (dueño) atado a ella: `AuthServiceImpl.java:74-85` (crea `new Agency()`, luego `new User()` con `user.setAgency(savedAgency)`).
- En `acceptInvite`, el usuario nuevo se ata a la agencia derivada del token de invitación (`AuthServiceImpl.java:225,237`), no a una agencia arbitraria.

### Evidencia por opción
- **Opción (a) — `tenant_id` reemplaza 1:1 a `agency_id`:** SOPORTADA por el código actual. No existe ninguna entidad padre por encima de `Agency`; `Agency` funciona hoy como el discriminador de tenant. Un usuario = una agencia. No hay tabla holding/grupo/organización en `model/` (verificado: solo `Agency`, `CommissionType`, `ThemeMode` en `model/agency/`).
- **Opción (b) — `tenant_id` como super-nivel (1 tenant → N agencias):** SIN evidencia en el código. No existe entidad de holding, ni relación `Agency → (padre)`, ni campo que agrupe agencias, ni caso de uso de un usuario operando sobre varias agencias.

### Conclusión
Con la evidencia actual, **`agency` ES el tenant** y un `tenant_id` mapearía **1:1 a `agency_id`** (opción a). Introducir un `tenant_id` separado como super-nivel (opción b) **solo se justifica si el negocio planea holdings / cadenas de agencias con administración compartida**, algo que **no tiene ningún respaldo en el código**.

> **DECISIÓN PENDIENTE (negocio):** confirmar si habrá concepto de holding / grupo de agencias.
> - Si **no** → no agregar `tenant_id`; formalizar `agency_id` como el discriminador de tenant y cerrar las fugas de §5.
> - Si **sí** → introducir entidad `Tenant`/`Organization` padre y `tenant_id` en `Agency` (y opcionalmente denormalizado en tablas hoja para consultas). Falta: requisito de negocio explícito, que no está en el repositorio.

---

## 4. Resolución de `agency_id` por request

Fuente del `agency_id` en cada endpoint. `SEGURO` = derivado del principal autenticado; `UNSAFE` = derivado de dato controlable por el cliente.

| Controlador | Endpoint(s) | Fuente de `agency_id` | Estado |
|---|---|---|---|
| `SalesController` | `/api/v1/sales/**` | `securityUser.getAgencyId()` (`SalesController.java:39,54,70,85,100,117,128,139`) | SEGURO |
| `BookingController` | `/api/v1/bookings/**` | `securityUser.getAgencyId()` (`BookingController.java:39,58,78,96,114`) | SEGURO |
| `CustomerController` | `/api/v1/customers/**` | `securityUser.getAgencyId()` (`CustomerController.java:39,58,78,96,114`) | SEGURO |
| `SupplierController` | `/api/v1/suppliers/**` | `securityUser.getAgencyId()` (`SupplierController.java:38,53,69,84,99`) | SEGURO |
| `TeamController` | `/api/v1/team/**` | `securityUser.getAgencyId()` (`TeamController.java:40,61,83,101,121`) | SEGURO |
| `DashboardController` | `/api/v1/dashboard/stats` | `securityUser.getAgencyId()` (`DashboardController.java:36`) | SEGURO |
| `AccountController` | `/api/v1/account/**` | `securityUser.getAgencyId()` / `getId()` (`AccountController.java:35,67,85,99,117`) | SEGURO |
| `AccountStatementController` | `/api/v1/account-statement/me/**` | `securityUser.getId()` (`AccountStatementController.java:30,40,51,61`) — self-scoped por usuario | SEGURO (ver Fuga #1/#2 por falta de filtro de agencia en capa repo) |
| `AdminInvitationController` | `/api/v1/admin/invitations` | `securityUser.getAgencyId()` (`AdminInvitationController.java:42`); además protegido con `hasRole("ADMIN")` (`SecurityConfig.java:93`) | SEGURO |
| `AuthController` | `/api/v1/auth/signup` | `request.agencyName()` crea **agencia nueva** (`AuthServiceImpl.java:74-78`) | SEGURO (alta de tenant propio, no acceso cruzado) |
| `AuthController` | `/api/v1/auth/accept-invite`, `/invite-info/{token}` | agencia derivada del **token de invitación** validado en servidor (`AuthServiceImpl.java:207,225`, `getInvitationAgencyOrThrow` `:495-500`) | SEGURO respecto a forjar agencia (la agencia NO viene del body; depende de la seguridad del token — fuera de alcance) |
| `ThemeController` | `/api/v1/theme` | ninguna — endpoints son stubs que devuelven `ok().build()` sin lógica (`ThemeController.java:26-28,39-41`) | N/A (sin acceso a datos) |
| `ExchangeRateController` | `/api/v1/exchange-rate` | `from`/`to` por query param; llama a proveedor externo, sin datos de agencia (`ExchangeRateController.java:26-30`) | N/A (sin datos de tenant) |

**Resultado:** **0 endpoints UNSAFE** por forja de `agency_id`. El patrón `@AuthenticationPrincipal SecurityUser` + `getAgencyId()` es consistente. El `agencyId` del principal se fija en `SecurityUser.java:31` desde `user.getAgency().getId()` al cargar el usuario, y el JWT solo transporta el email (subject) + `uid` (`JwtService.java:42-46`), por lo que el `agencyId` se re-resuelve desde BD en cada request (`SecurityUserDetailsService.java:26-30`) — no es falsificable por el cliente.

---

## 5. **Fugas de aislamiento detectadas**

Ordenadas por severidad. Ninguna es explotable hoy vía forja directa de `agency_id` (§4), pero varias dependen de invariantes implícitas frágiles y de tablas sin discriminador de tenant.

| # | Sev. | Vector / consulta | Ubicación | Descripción del riesgo |
|---|---|---|---|---|
| 1 | **Alta** | `AccountPayment` sin columna de agencia; repo filtra solo por `userId` | Entidad `model/AccountPayment.java:19-35` (sin `agency`); repo `AccountPaymentRepository.java:14,16,18` (`findByUserId`, `findByUserIdAndCurrency...`, `findByIdAndUserId`) | La tabla financiera `account_payments` no tiene forma de acotarse por agencia. El aislamiento depende 100% de que `userId` provenga del principal (hoy sí, `AccountStatementServiceImpl.java:103,120,138`). Un futuro endpoint admin/reporte que consulte por otro criterio devolvería pagos de cualquier agencia. Falta `agency_id` a nivel de esquema. |
| 2 | **Alta** | `SaleRepository.findByCreatedByIdAndCurrencyOrderBySaleDateAsc(userId, currency)` sin filtro `agency_id` | Repo `SaleRepository.java:28`; uso `AccountStatementServiceImpl.java:44` | Consulta sobre `tbl_sales` (con alcance de agencia) que filtra por `created_by_user_id` pero **no** por `agency_id`. Hoy queda acotada porque `userId` es el del principal, pero no hay defensa en profundidad: si `userId` llegara de otra fuente, o un usuario cambiara de agencia, retornaría ventas fuera de la agencia actual. El estado de cuenta y las comisiones se calculan sobre este resultado. |
| 3 | **Media** | `SaleRepository.existsByCustomerId(id)` / `BookingRepository.existsByCustomerId(id)` / `existsBySupplierId(id)` sin `agency_id` | Repos `SaleRepository.java:19`, `BookingRepository.java:22,23`; usos `CustomerServiceImpl.java:90`, `SupplierServiceImpl.java:104` | Chequeos de existencia global (cross-agency) usados como guarda de borrado. El `customerId`/`supplierId` ya fue resuelto con `findByIdAndAgencyId` antes, y los UUID son únicos por agencia, por lo que hoy no filtra datos ajenos; pero la consulta en sí **cruza el límite de agencia** y puede revelar existencia de referencias en otras agencias si esos IDs se reutilizaran/predijeran. Debería incluir `agency_id`. |
| 4 | **Media** | `Payment` sin columna de agencia; alcance indirecto vía `Sale` | Entidad `model/Payment.java:19-27` (sin `agency`) | Los pagos solo se acotan a la agencia porque siempre se acceden a través de `Sale` filtrada (`SalesServiceImpl.java:186,217,230` usan `findByIdAndAgencyId[WithPayments]`). Invariante correcta hoy, pero no garantizada por el esquema; cualquier repositorio directo de `Payment` (no existe aún) rompería el aislamiento. |
| 5 | **Baja** | `findById` directos sobre `User`/`Agency` con `id` del principal | `AccountServiceImpl.java:104-106` (`userRepository.findById(userId)`), `AccountStatementServiceImpl.java:231-233`, `SalesServiceImpl.java:130-131` (`agencyRepository.findById(agencyId)`) | Acceso por PK sin cláusula de agencia. Seguro hoy porque el `id` proviene del principal (self-scoped). Riesgo bajo; conviene encapsular en helpers `...AndAgencyId` para consistencia. `SalesServiceImpl.getUserOrThrow` (`:146-147`) sí valida agencia con `.filter(...)`, buen patrón a replicar. |
| 6 | **Baja** | Método de repositorio sin filtro de agencia definido pero sin uso (dead code) | `SaleRepository.java:26` (`findByCreatedById(UUID)`) | Método derivado que retornaría ventas de cualquier agencia por `created_by`. Actualmente **sin invocadores** (verificado por grep en `service/` y `controller/`). Riesgo latente: eliminar o reescribir como `findByAgencyIdAndCreatedById`. |

### Consultas verificadas como CORRECTAS (con filtro de agencia)
Para contraste, todos los accesos de lectura/escritura del flujo principal sí filtran por agencia:
- `CustomerRepository`: `findAllByAgencyId...`, `findByIdAndAgencyId`, `existsByAgencyId...`, `countByAgencyId` (`CustomerRepository.java:14-22`).
- `SupplierRepository`: idem (`SupplierRepository.java:14-22`).
- `BookingRepository`: `findAllByAgencyId...`, `findByIdAndAgencyId`, `existsByAgencyId...`, `countByAgencyId`, `findAllByAgencyIdAndCustomerId...` (`BookingRepository.java:14-34`).
- `SaleRepository`: `findAllByAgencyId...`, `findByIdAndAgencyId`, `findByIdAndAgencyIdWithPayments` (JPQL con `s.agency.id = :agencyId`), `countByAgencyId` (`SaleRepository.java:15-24`).
- `UserRepository`: `findAllByAgencyId...`, `findByIdAndAgencyId` (`UserRepository.java:20,22`).
- La única `@Query` JPQL del proyecto incluye el filtro de agencia (`SaleRepository.java:23`). No hay queries nativas (`nativeQuery=true`) en el código.

---

## 6. Aislamiento a nivel de base de datos

**El aislamiento es 100% de capa de aplicación.** Evidencia:

- **Sin RLS / esquemas / multi-tenancy de Hibernate:** búsqueda de `row.level`, `@Filter`, `@FilterDef`, `tenant`, `MultiTenant`, `CurrentTenant` en `src/main/` → **0 coincidencias**.
- **Sin migraciones ni políticas de BD:** en `src/main/resources/` no hay Flyway ni Liquibase. El esquema se genera con `spring.jpa.hibernate.ddl-auto=update` (`application-dev.properties`, `application-prod.properties`) y `create-drop` en test (`application-test.properties`). Un comentario lo confirma: "DDL: update para despliegues sin Flyway/Liquibase" (`application-prod.properties`). Sin control de `row_security` ni `search_path` por tenant.
- **Única barrera de aislamiento en runtime:** los filtros `WHERE agency_id = ?` embebidos en los métodos de repositorio (§5), más la resolución segura del `agencyId` desde el principal (§4). No hay red de seguridad por debajo de la capa JPA: un método de repositorio sin el filtro devuelve datos de todas las agencias.
- **Autorización de endpoints:** `SecurityConfig.java:89-95` — endpoints públicos enumerados (`:41-55`), `/api/v1/admin/**` y `/actuator/**` requieren `ROLE_ADMIN`, el resto `authenticated()`. Sesión `STATELESS` con JWT (`:82-84`). Esto controla *autenticación/rol*, no *aislamiento de datos entre agencias*, que sigue dependiendo enteramente de los filtros por `agency_id` en la capa de servicio/repositorio.

**Recomendación de defensa en profundidad:** dado que hoy no hay ninguna barrera bajo la capa de aplicación, un `@Filter` de Hibernate por `agency_id` o RLS de Postgres eliminaría el riesgo de las fugas #1–#6 ante omisiones futuras. Requisito previo: cerrar el gap de esquema en `Payment` y `AccountPayment` (agregar `agency_id`).

---

## 7. Notas de método

- Verificación por lectura directa de: 7 entidades de negocio (`User`, `Customer`, `Supplier`, `Sale`, `Booking`, `Payment`, `AccountPayment`) + `Agency`; los 12 repositorios; 5 service impls clave (`Sales`, `AccountStatement`, `Account`, `Dashboard`, `Team`) + extractos de `AuthServiceImpl`; los 12 controladores; `SecurityConfig`, `JwtService`, `JwtFilter`, `SecurityUser`, `SecurityUserDetailsService`; y `application*.properties`.
- No se ejecutó la aplicación ni se corrieron pruebas dinámicas; los hallazgos son estáticos.
- Fuera de alcance (no evaluado a fondo): fuerza/entropía y expiración de los tokens de invitación y de refresh; correcta protección CSRF (deshabilitada por diseño stateless, `SecurityConfig.java:80`); autorización a nivel de rol dentro de una misma agencia (p. ej. si un `SELLER` debería o no ver todo lo de la agencia). Estos requieren su propia auditoría.
- `NO DETERMINADO`: si existe un requisito de negocio de holdings/multi-agencia (afecta la decisión §3) — no hay artefacto en el repositorio que lo confirme o niegue.
