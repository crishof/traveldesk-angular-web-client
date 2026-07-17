# FASE 6 — Testing

> Verificado leyendo el repositorio.

## Resumen

- **Backend: SÍ hay tests** (corrección al brief) — 6 archivos, ~480 líneas, ~17 métodos `@Test`. Cubren auth/invitaciones, email, CORS y manejo de excepciones. **No** cubren la lógica de negocio central (ventas, reservas, clientes, proveedores, cuentas, dashboard, multitenancy).
- **Frontend: 0 tests.** No hay `*.spec.ts`, ni carpeta `e2e/`, ni runner configurado (`angular.json` **no tiene target `test`**, no hay `karma.conf.js` ni `jest.config`).
- **Sin tests e2e** en ningún módulo. Sin cobertura medida. Sin CI que ejecute tests.

## 1. Estado de tests por módulo

### Backend (`traveldesk-api/src/test`)

| Archivo | Líneas | Qué cubre |
|---|---|---|
| `TraveldeskApiApplicationTests.java` | 15 | `contextLoads` (arranque del contexto) |
| `config/FrontendUrlPropertiesTests.java` | 43 | URLs de frontend por perfil (dev/prod/test) |
| `controller/AuthInvitationFlowTests.java` | 172 | Flujo de invitación: `invite-info` público sin JWT, aceptar invitación, política de contraseña |
| `service/EmailServiceImplProviderTests.java` | 138 | Selección de proveedor de email (SMTP vs Brevo API), URLs en el cuerpo del email, fallo sin API key |
| `exception/GlobalExceptionHandlerConflictTests.java` | 53 | Mapeo de excepciones de conflicto a HTTP 409 |
| `security/config/SecurityConfigCorsTests.java` | 59 | Preflight CORS: acepta origen configurado, rechaza no configurado, mantiene headers en signup |

Infra de test disponible en `pom.xml`: `spring-boot-starter-*-test`, `spring-security-test`, **H2** en memoria (perfil `test`, `ddl-auto=create-drop`, clave JWT de test fija). Base sólida para ampliar.

**Áreas sin ningún test (backend):**
- Ventas (`SalesServiceImpl`) — creación, pagos, cálculo de `paidAmount`, comisiones.
- Reservas (`BookingServiceImpl`).
- Clientes / Proveedores (CRUD).
- Cuentas y estados de cuenta (`AccountServiceImpl`, `AccountStatementServiceImpl`).
- Dashboard / estadísticas.
- **Aislamiento por `agency_id`** (crítico — ver FASE 3): no hay ni un test que verifique que un usuario de la agencia A no puede leer datos de la agencia B.
- Conversión de divisas (`ExchangeRateServiceImpl`).

### Frontend (`traveldesk-web-client`)

- `*.spec.ts`: **0**.
- `e2e/`: no existe.
- Runner: **no configurado** (sin target `test` en `angular.json`, sin karma/jest). El script `"test": "ng test"` en `package.json` **fallaría** hoy por falta de configuración.

## 2. Flujos de negocio críticos que deberían tener cobertura prioritaria

Orden sugerido por criticidad (para cuando se aborde testing; **no se implementa ahora**):

| # | Flujo | Tipo prioritario | Por qué |
|---|---|---|---|
| 1 | **Aislamiento multitenant** (usuario de agencia A no accede a datos de B) | Integración backend | Riesgo de fuga de datos entre clientes; es el riesgo #1 del proyecto (FASE 3). |
| 2 | **Login + JWT + refresh + logout** | Integración backend + e2e | Puerta de entrada; ya hay base parcial de auth. |
| 3 | **Registro de agencia + verificación de email + aceptar invitación** | Integración backend | Onboarding; parcialmente cubierto (invitación). |
| 4 | **Crear venta + registrar pagos + `paidAmount`/saldo** | Unit + integración backend | Núcleo de negocio y dinero; sin cobertura. |
| 5 | **Comisiones** (cálculo por `commissionPercentage`, cuenta de comisiones) | Unit backend | Cálculo financiero sensible. |
| 6 | **CRUD de clientes / proveedores con scoping por agencia** | Integración backend | Verifica aislamiento en entidades de dominio. |
| 7 | **Estado de cuenta / pagos del equipo** | Integración backend | Movimientos de dinero. |
| 8 | **Conversión de divisas** (exchange rate, `convertedAmount`) | Unit backend | Cálculo con `exchangeRate`; errores → importes incorrectos. |
| 9 | **Guards de rutas Angular** (`authGuard`/`guestGuard`/`adminGuard`) + interceptor JWT | Unit frontend | Protección de navegación y refresh de token. |
| 10 | **(Futuro) Facturación Verifactu**: numeración, encadenamiento, desglose IVA | Integración backend | Cuando exista; correctness fiscal (FASE 5). |

## 3. Recomendaciones de infraestructura (para fase posterior)

- Backend: ampliar sobre la base H2 existente; añadir **Testcontainers (Postgres)** para tests de integración fieles al motor real (H2 en modo PostgreSQL no cubre native queries ni RLS).
- Frontend: configurar runner (Jest o Karma/Vitest) y añadir target `test`; e2e con Playwright/Cypress para los flujos 2–4.
- CI: pipeline que ejecute `mvn test` y los tests de frontend en cada push (hoy no existe CI, ver FASE 7).

## Notas de método

- Conteo de tests con `find`/`grep @Test` sobre `src/test`.
- Frontend: `find *.spec.ts` (0), inspección de `angular.json` (sin target `test`), ausencia de karma/jest.
- Nombres de test extraídos con `grep @Test` de cada archivo.
