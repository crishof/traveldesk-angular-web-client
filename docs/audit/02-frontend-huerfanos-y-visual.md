# FASE 2 — Auditoría Frontend: Huérfanos, Rutas Muertas y Consistencia Visual

**Proyecto:** TravelDesk (Angular 19 standalone + Tailwind 3.4)
**Raíz auditada:** `traveldesk-web-client/src/app`
**Fecha:** 2026-07-16
**Método:** solo lectura. Cada hallazgo referencia `archivo:línea`. Lo no verificable se marca `NO DETERMINADO`.

---

## 1. Resumen (bullets)

- **Componentes huérfanos: 0.** Los 22 componentes standalone están enrutados o embebidos vía `imports`/selector. Se verificó cada `selector` y clase con grep en todo `src`.
- **Servicios huérfanos: 2 de 13.** `DashboardService` (`dashboard.service.ts:7`) y `ThemeSettingsService` (`theme-settings.service.ts:7`) no se inyectan en ningún archivo. El resto (11), la directiva `ClearZeroOnFocusDirective` y el pipe `SafeHtmlPipe` sí se usan.
- **Rutas muertas: 1 confirmada.** `commission-account` (`app.routes.ts:140`) no aparece en el menú del shell ni tiene ningún `routerLink`/`navigate`. Además hay 3 rutas duplicadas de invitación con solapamiento funcional.
- **Consistencia visual: baja.** El color de acento primario **cambia por pantalla** (cyan/teal, violet/purple, emerald/green), el rojo de error tiene 3 tonos distintos para el mismo concepto, y el token `brand-*` definido en `tailwind.config.js` **nunca se usa** (0 ocurrencias).
- **Pantallas incompletas: 2.** `commission-account` es un placeholder ("los detalles se mostrarán aquí cuando estén disponibles") y `agency-settings` tiene un guardado **falso** (`setTimeout` + `console.log`, no persiste).
- **Responsive irregular:** 8 de 19 plantillas no tienen ningún breakpoint (`sm:/md:/lg:`), incluyendo todo `auth`, `account` y `supplier-detail` (328 líneas).
- **Estado CSS:** base de diseño ligera y sana en `styles.scss` (75 líneas, `.card`/`.form-input`), 0 archivos `.scss` por componente, Tailwind usado de forma consistente como mecanismo pero con **valores ad-hoc**. Esfuerzo de migración a Tailwind: **BAJO** (ya está migrado); el trabajo real es **normalización de tokens**, no migración.

---

## 2. Huérfanos

### 2.1 Componentes huérfanos

**Ninguno.** Tabla de verificación (los 22 componentes):

| Componente | Selector | Cómo se referencia | Ubicación referencia |
|---|---|---|---|
| LandingComponent | app-landing | Ruta `''` | app.routes.ts:8 |
| AcceptInviteComponent | app-accept-invite | Rutas invite (x4) | app.routes.ts:17,22,27,64 |
| LoginComponent | app-login | Ruta `auth/login` | app.routes.ts:38 |
| RegisterComponent | app-register | Ruta `auth/register` | app.routes.ts:43 |
| VerifyEmailComponent | app-verify-email | Ruta `auth/verify-email` | app.routes.ts:48 |
| ForgotPasswordComponent | app-forgot-password | Ruta `auth/forgot-password` | app.routes.ts:53 |
| ResetPasswordComponent | app-reset-password | Ruta `auth/reset-password` | app.routes.ts:58 |
| ShellComponent | app-shell | Ruta `app` | app.routes.ts:75 |
| DashboardComponent | app-dashboard | Ruta `app/dashboard` | app.routes.ts:80 |
| SalesComponent | app-sales | Ruta `app/sales` | app.routes.ts:86 |
| SaleDetailsComponent | app-sale-details | Ruta `app/sales/:id` | app.routes.ts:92 |
| BookingsComponent | app-bookings | Ruta `app/bookings` | app.routes.ts:98 |
| ClientsComponent | app-clients | Ruta `app/clients` | app.routes.ts:104 |
| SuppliersComponent | app-suppliers | Ruta `app/suppliers` | app.routes.ts:110 |
| SupplierDetailComponent | app-supplier-detail | Ruta `app/suppliers/:id` | app.routes.ts:116 |
| TeamComponent | app-team | Ruta `app/team` | app.routes.ts:123 |
| AccountComponent | app-account | Ruta `app/account` | app.routes.ts:129 |
| AgencySettingsComponent | app-agency-settings | Ruta `app/agency-settings` | app.routes.ts:136 |
| CommissionAccountComponent | app-commission-account | Ruta `app/commission-account` (ver rutas muertas) | app.routes.ts:142 |
| AccountStatementComponent | app-account-statement | `imports` + selector en Account | account.component.ts:9 / account.component.html:63 |
| ExchangeRateBannerComponent | app-exchange-rate-banner | `imports` + selector en Shell | shell.component.ts:31 / shell.component.html:163 |
| AppComponent | app-root | Bootstrap | (raíz) |

### 2.2 Servicios / directivas / pipes huérfanos

| Elemento | Ubicación definición | Estado | Evidencia |
|---|---|---|---|
| **DashboardService** | dashboard.service.ts:7 | **HUÉRFANO** — no se inyecta en ningún componente/servicio. El Dashboard usa `SalesService` + `BookingsService` en su lugar. | Único match en todo `src` es su propia definición; dashboard.component.ts:30-31 inyecta otros servicios. |
| **ThemeSettingsService** | theme-settings.service.ts:7 | **HUÉRFANO** — no se inyecta en ningún sitio. Existe `ThemeService` (usado en 3 archivos) que cubre el tema. | Único match en `src` es su propia definición. |
| ClearZeroOnFocusDirective | clear-zero-on-focus.directive.ts:7 | Usado (6 usos en plantillas) | sales.html:229, sale-details.html:227/405/887, bookings.html:253, account-statement.html:151 |
| SafeHtmlPipe | safe-html.pipe.ts:9 | Usado | shell.component.html:68 (`item.icon \| safeHtml`) |
| Resto de servicios (Auth, Account, Sales, Suppliers, Bookings, Clients, Team, ExchangeRate, DisplayCurrency, VisibilityMode, Theme) | core/services/ | Usados | AuthService en 16 archivos; los demás en 1–5 |

> Nota: `AccountService` y `DisplayCurrencyService` se usan en un solo consumidor cada uno (account-statement.component.ts y exchange-rate-banner.component.ts respectivamente). No son huérfanos, pero son de acoplamiento mínimo.

---

## 3. Rutas muertas

### 3.1 Rutas definidas sin acceso desde la UI

| Ruta | Definición | ¿En menú del shell? | ¿Algún routerLink/navigate? | Veredicto |
|---|---|---|---|---|
| `app/commission-account` | app.routes.ts:140-144 | **NO** (navItems no la incluye — shell.component.ts:53-112) | **NO** (grep de `commission-account` solo devuelve la ruta y la definición del componente) | **RUTA MUERTA** — inalcanzable por navegación. |

El menú (`navItems`, shell.component.ts:53-112) contiene: dashboard, sales, bookings, clients, suppliers, team (admin), agency-settings (admin), account. `commission-account` no está y ningún botón/enlace apunta a ella.

### 3.2 Rutas de invitación redundantes (solapamiento)

Cuatro rutas cargan `AcceptInviteComponent`:
- `invite/:token` (app.routes.ts:15)
- `accept-invite` (app.routes.ts:20) — sin `:token`
- `accept-invite/:token` (app.routes.ts:25)
- `auth/invite/:token` (app.routes.ts:61, con `canActivate: []` explícito y comentario "No guard")

No es una ruta muerta estricta (los emails podrían usar cualquiera — `NO DETERMINADO` cuál emite el backend), pero es **deuda de rutas**: 4 caminos para un mismo componente, con `accept-invite` sin token probablemente inservible.

### 3.3 Links apuntando a rutas inexistentes

**Ninguno detectado.** Todos los `routerLink` (landing, auth, dashboard, shell) y `router.navigate(...)` (auth.service.ts:183, suppliers, sales, bookings, etc.) resuelven a rutas existentes en `app.routes.ts`.

---

## 4. Matriz de inconsistencia visual (deliverable principal)

Leyenda: **Inc.** = ¿es inconsistencia respecto al patrón dominante? (Sí/No)

### 4.1 Color — acento primario / CTA (el hallazgo más grave)

Cada pantalla CRUD usa un **gradiente de acento distinto** para el botón primario "Nuevo …", sin criterio de dominio documentado.

| Componente | Atributo | Valor(es) encontrado(s) | Ubicación | Inc. |
|---|---|---|---|---|
| Sales | Gradiente CTA | `from-cyan-500 to-teal-600` | sales.component.html:16, 260 | No (patrón base) |
| Dashboard | Gradiente/acento | cyan/teal | dashboard.component.html:69,75,108,113 | No |
| Clients | Gradiente CTA | `from-violet-500 to-purple-600` | clients.component.html:15, 117 | **Sí** |
| Team | Gradiente CTA | `from-violet-500 to-purple-600` | team.component.html:15 | **Sí** |
| Suppliers | Gradiente CTA | `from-emerald-500 to-green-600` | suppliers.component.html:15, 177 | **Sí** |
| Supplier-detail | Gradiente CTA | `from-emerald-500 to-green-600` | supplier-detail.component.html:176 | **Sí** |
| Agency-settings | Botón primario | `bg-cyan-500` **sólido** (sin gradiente) `rounded-lg` | agency-settings.component.ts:53 | **Sí** |
| Auth (login/register/…) | Botón primario | `from-cyan-500 to-teal-600` | login/register/… | No |
| Landing | Gradiente hero | `from-cyan-500 to-emerald-500` (variante) | landing.component.html:26 | **Sí** (a `emerald` no `teal`) |
| tailwind.config.js | Token `brand.500=#06b6d4` (=cyan-500) | **0 usos** en todo el código | tailwind.config.js:14-20 | **Sí** (token muerto) |

Resumen de gradientes primarios (conteo global): `from-cyan-500 to-teal-600` ×14, `from-violet-500 to-purple-600` ×5, `from-emerald-500 to-green-600` ×3, `from-cyan-500 to-emerald-500` ×1.

### 4.2 Color — estado de error (rojo)

Tres tonos de rojo distintos para el mismo concepto de "error / texto de validación":

| Componente | Atributo | Valor | Ubicación | Inc. |
|---|---|---|---|---|
| Auth (todas) | Texto error | `text-red-400` | login:136, register:169/175, forgot:38, reset:68, verify:74, accept-invite:10/66 | **Sí** (auth=400) |
| Sales / Sale-details | Texto error/validación | `text-red-500` | sale-details:7,47,345,476,607,668,733 | **Sí** (CRUD=500) |
| Account-statement | Texto error | `text-red-500` | account-statement:51,67,83,200 | — |
| Team | Texto error | `text-red-400` | team:158 | mezcla |
| Banners alerta (bookings, sale-details) | Texto en banner | `text-red-700` + dark `text-red-300` | bookings:12,312; sale-details:623,685,750,962 | variante banner |
| Supplier-detail | Texto alerta | `text-red-700` / `text-red-200` | supplier-detail:28 | variante |

Patrón: no existe una clase de error única (p.ej. `.text-error`). `styles.scss:63-67` sí define estado inválido de `.form-input` con `red-500`, pero el texto de mensaje se codifica a mano con 400/500/700 según la pantalla.

### 4.3 Color — éxito (emerald vs green)

| Componente | Valor | Ubicación | Inc. |
|---|---|---|---|
| Mayoría | `emerald-500/600` | account.html, verify-email, account-statement:… | No (patrón) |
| Supplier-detail | `green-50/100/700/800` (badges de estado) | supplier-detail.component.html (bg-green-*, text-green-*) | **Sí** (usa `green` no `emerald`) |

### 4.4 Tipografía — tamaño del título de página (h1)

| Componente | Valor h1 | Ubicación | Inc. |
|---|---|---|---|
| Dashboard | `text-2xl font-bold` | dashboard.component.html:4 | No (dominante) |
| Sale-details | `text-2xl font-bold` | sale-details.component.html:25 | No |
| Auth (register/forgot/reset/accept) | `text-2xl font-bold` | register:82/143, forgot:16, reset:16, accept-invite:17 | No |
| Verify-email | `text-xl font-bold` | verify-email.component.html:35 | **Sí** (menor) |
| Commission-account | `text-3xl font-bold` | commission-account.component.html:3 | **Sí** (mayor) |
| Agency-settings | `text-3xl font-bold` | agency-settings.component.ts:13 | **Sí** (mayor) |
| Landing (hero) | `text-4xl lg:text-5xl font-extrabold` | landing.component.html:36 | No (hero, aceptable) |

Encabezados de sección `<h2>` también varían: `text-xl` ×10 vs `text-lg` (agency-settings.ts:24, styles.scss base). Títulos de modal "Nuevo …" usan `text-xl font-semibold` (clients:90, suppliers:86, sales:145) — consistentes entre sí.

### 4.5 Bordes / radios / sombras

| Atributo | Valores encontrados (conteo) | Inc. | Nota |
|---|---|---|---|
| `rounded-*` | `rounded-xl` ×62, `rounded-2xl` ×54, `rounded-lg` ×52, `rounded-full` ×38, `rounded-3xl` ×7 | **Sí** | Tres radios "medianos" (lg/xl/2xl) compiten. Tarjetas: `styles.scss:.card` = `rounded-2xl`, pero agency-settings usa `rounded-lg` (agency-settings.ts:22). Inputs: base `.form-input`=`rounded-xl` pero agency-settings select=`rounded-lg` (ts:40). |
| `shadow-*` | `shadow-sm` ×30, `shadow-2xl` ×19, `shadow-lg` ×14, `shadow-md` ×2, `shadow-xl` ×1 | Parcial | Tarjetas usan `shadow-sm`; modales `shadow-2xl`; salto directo de sm→2xl sin escala intermedia consistente. |
| Botón CTA radio | `rounded-xl` (mayoría) vs `rounded-lg` (agency-settings.ts:53) | **Sí** | |

### 4.6 Estados (hover / focus / disabled / loading / error)

| Estado | Cobertura | Evidencia | Inc. |
|---|---|---|---|
| `hover:` | Amplia (casi todos los botones/links) | grep global positivo | No |
| `focus:ring-*` — **color** | `ring-cyan-500` ×2, `ring-violet-500` ×1, `ring-emerald-500` ×1, `ring-red-400` (login:136 zona) | styles.scss:61 (cyan), clients:27 (violet), suppliers (emerald), agency-settings.ts:40 (cyan) | **Sí** — el anillo de foco cambia de color según pantalla, siguiendo el acento local en vez de un color único. |
| `disabled:` | 14 de 19 plantillas | clients, suppliers, sales, sale-details, bookings, team, account-statement, todas auth | Parcial (falta en dashboard, account, agency-settings usa `disabled:opacity-60` inline) |
| loading / spinner | `animate-spin`/"Guardando"/"Cargando" en 13 plantillas | listado en método | No mayormente; dashboard/landing/commission-account/account sin estado de carga |
| error (validación visual) | `.form-input.ng-invalid.ng-touched` centralizado | styles.scss:63-68 | Bien centralizado, pero convive con `text-red-*` manual (ver 4.2) |

### 4.7 Responsive (breakpoints presentes)

| Componente | sm / md / lg | Inc. (rompe/omite mobile) |
|---|---|---|
| dashboard | 0 / 1 / 4 | No |
| shell | 1 / 5 / 0 | No |
| sale-details | 0 / 5 / 2 | No |
| bookings | 0 / 4 / 0 | Parcial (tabla ancha, `md:` solo) |
| account-statement | 0 / 3 / 0 | Parcial |
| sales | 3 / 0 / 0 | Parcial |
| landing | 0 / 1 / 2 | No |
| clients | 0 / 1 / 0 | Parcial |
| suppliers | 0 / 1 / 0 | Parcial |
| team | 0 / 1 / 0 | Parcial |
| **supplier-detail** | 0 / 0 / 0 | **Sí** — 328 líneas, sin ningún breakpoint |
| **account** | 0 / 0 / 0 | **Sí** |
| **commission-account** | 0 / 0 / 0 | Sí (contenido mínimo) |
| **auth: login/register/verify/forgot/reset/accept-invite** | 0 / 0 / 0 (los 6) | **Sí** — formularios centrados sin adaptación explícita (dependen del ancho fijo del card) |

**8 de 19 plantillas sin ningún breakpoint.** Las de mayor riesgo real: `supplier-detail` (formulario+tabla largo) y las tablas de `bookings`/`sales` que dependen solo de `md:`.

### 4.8 Iconografía

| Aspecto | Hallazgo | Ubicación | Inc. |
|---|---|---|---|
| Librería de iconos | **Ninguna** (sin Material Icons, FontAwesome, Lucide, Heroicons — grep sin resultados) | — | — |
| SVG inline | Solo 5 plantillas: shell (5 svg, generados por `svgIcon()`), login (3), landing (2), register (2), verify-email (1) | shell.component.ts:149-157 | Mezcla |
| Iconos de navegación | Paths SVG hardcodeados como strings en TS y renderizados vía `SafeHtmlPipe` | shell.component.ts:57-111, 149 | Frágil (paths crudos en código) |
| Emoji como iconos | 10 plantillas usan emoji (ℹ️, etc.) en vez de SVG | commission-account.html:16, clients, suppliers, sales, sale-details, bookings, register, accept-invite, team, account-statement | **Sí** — inconsistencia SVG vs emoji para iconografía |

Veredicto iconografía: **mezcla no sistematizada** — SVG inline (unos generados por función, otros a mano) conviviendo con emojis; sin set de iconos unificado.

---

## 5. Pantallas / flujos sin implementación visual (gaps de producto)

| Pantalla / flujo | Tipo de gap | Evidencia |
|---|---|---|
| **Commission-account** | **Placeholder puro.** 28 líneas; card informativo con texto "El sistema de comisiones está en uso. Los detalles se mostrarán aquí cuando estén disponibles en tu agencia." No hay datos, tabla ni acción. Además es ruta muerta (§3.1). | commission-account.component.html:1-28 |
| **Agency-settings** | **Guardado falso / stub funcional.** El botón "Guardar cambios" ejecuta `setTimeout(...500)` + `console.log("Cambios guardados:", ...)` y **no llama a ningún servicio ni persiste**. La única opción es "Moneda predeterminada". Template inline, `styles: []`. | agency-settings.component.ts:74-83 |
| Verify-email / verificación | Flujo funcional pero con h1 más pequeño y sin responsive (cosmético, no gap) | verify-email.component.html:35 |
| Rutas de invitación duplicadas | Ambigüedad de flujo (§3.2), `accept-invite` sin token probablemente sin uso | app.routes.ts:15-28, 61 |

No se hallaron marcadores `TODO`/`FIXME`/`WIP`/"Coming soon"/"Próximamente" en código (grep negativo); los gaps anteriores se detectaron por inspección de contenido, no por marcadores.

---

## 6. Estado del CSS/SCSS y esfuerzo de migración a Tailwind

### Hechos cuantificados

- **`src/styles.scss`: 75 líneas.** Contiene base sana: reset ligero (`box-sizing`, fuente DM Sans vía `@import` de Google Fonts línea 1), scrollbar custom, y una **capa de componentes** con `.gradient-text`, `.card`/`.card-dark`/`.card-light`, `.form-input`/`.form-input-dark`/`.form-input-light` (styles.scss:41-75). Todo con `@apply` (Tailwind idiomático).
- **Archivos `.scss` por componente: 0.** Ningún componente tiene `styleUrl`. Solo `agency-settings` declara `styles: []` (vacío) (agency-settings.component.ts:62). Es decir: **no hay CSS ad-hoc por componente**; todo el estilo vive en clases utilitarias en las plantillas.
- **`tailwind.config.js`:** `darkMode: 'class'`, fuente `DM Sans`, animaciones `fade-in`/`slide-up`, y paleta `brand.50/100/500/600/700`. **La paleta `brand` no se usa (0 referencias)** — el código usa `cyan-*`/`teal-*` directamente.
- **CSS hardcodeado:** prácticamente nulo. Único hex crudo relevante: los gradientes `radial-gradient(...#f8fafc...)` en la clase arbitraria del hero de landing (landing.component.html:2). Sin `style="...px..."` inline detectados.
- **Dark mode:** ampliamente implementado con `dark:` en todas las plantillas — punto fuerte.

### Veredicto de esfuerzo

**El esfuerzo de "migración a Tailwind" es esencialmente NULO: el proyecto ya está 100% en Tailwind, sin CSS heredado que migrar.** No hay archivos SCSS por componente, no hay estilos inline con px, no hay librería CSS externa que reemplazar.

El trabajo real pendiente NO es migración sino **normalización / tokenización del sistema de diseño** (esfuerzo BAJO–MEDIO):

1. **Definir y usar tokens semánticos** en `tailwind.config.js` (`primary`, `success`, `danger`, radios y sombras de escala) y **eliminar/usar** el token `brand` muerto. (2-4 h)
2. **Unificar el acento primario**: decidir uno (cyan/teal parece el dominante, ×14) o formalizar el mapeo por dominio si violet=personas y emerald=proveedores es intencional; hoy es inconsistente sin criterio documentado. (medio día)
3. **Extraer clases de botón** (`.btn-primary`, `.btn-danger`) a la capa `@layer components`, igual que ya se hizo con `.card` y `.form-input`, para eliminar la repetición de `px-4 py-2.5 rounded-xl ... shadow-lg` en cada plantilla. (medio día)
4. **Estandarizar el rojo de error** en una clase única (hoy 400/500/700 mezclados). (2 h)
5. **Añadir breakpoints** a las 8 plantillas sin responsive, prioridad `supplier-detail`, `account` y tablas de `bookings`/`sales`. (1-2 días)
6. **Unificar iconografía** (elegir un set SVG, retirar emojis). (medio día–1 día)

**Estimación total de normalización visual: ~3–5 días de trabajo**, sin riesgo de migración de framework CSS.

---

## 7. Notas de método

- **Enrutado/uso verificado por grep** de cada `selector` (23) y clase `*Component` (22) en `src/**/*.{ts,html}`, cruzado con `app.routes.ts` e `imports: [...]`. Un componente se consideró vivo si estaba enrutado, importado o presente por selector en otra plantilla.
- **Servicios**: contados por número de archivos que referencian el nombre de clase, excluyendo su propia definición; los de 0 consumidores se marcaron huérfanos y se re-verificaron contra `src/` completo (incl. `app.config.ts`, `main.ts`).
- **Rutas muertas**: se comparó la lista de `path` en `app.routes.ts` contra `navItems` de shell (shell.component.ts:53-112) y contra todos los `routerLink`/`router.navigate`/`navigateByUrl` del proyecto.
- **Matriz visual**: construida con `grep -oE` sobre las 19 plantillas HTML + template inline de `agency-settings`, tabulando familias de color, `rounded-*`, `shadow-*`, tamaños `text-*` en headings, breakpoints `sm/md/lg`, y estados `hover/focus/disabled`. Conteos son de ocurrencias de clase, no de elementos DOM renderizados.
- **Limitaciones / `NO DETERMINADO`**: no se ejecutó la app; el comportamiento responsive real (overflow de tablas) se infiere de ausencia de breakpoints, no se midió en viewport. Cuál de las 4 rutas de invitación emite el backend es `NO DETERMINADO`. La intención de diseño detrás de los acentos por dominio (violet/emerald) no está documentada en el código: se reporta como inconsistencia por ausencia de criterio explícito.
