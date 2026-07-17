# FASE 5 — Facturación Verifactu (diagnóstico de gap)

> Solo diagnóstico. **No se diseña ni implementa** la solución en esta pasada. Verificado leyendo el código.

## Resumen

- **No existe ninguna funcionalidad de facturación en el proyecto.** Ni entidad `Invoice`/`Factura`, ni generación de PDF, ni cálculo/almacenamiento de IVA, ni numeración de facturas, ni registro fiscal.
- La única aparición de la palabra "facturación" en todo el repo es una **etiqueta de UI del dashboard** (`dashboard.component.html:57`: "Facturación últimos 30 días"), que en realidad muestra **volumen de ventas/ingresos**, no una factura fiscal.
- Gap respecto a Verifactu: **100%**. Todo está por hacer. Hoy no hay clientes reales, así que es correcto dejarlo solo como constancia.

## 1. Funcionalidad de facturación existente

| Buscado | Resultado |
|---|---|
| Entidad `Invoice`/`Factura` | ❌ No existe |
| Generación de PDF | ❌ No existe (sin dependencias tipo iText/OpenPDF/Flying Saucer en `pom.xml`) |
| IVA / impuestos (`tax`, `iva`, `vat`) | ❌ No modelado en ninguna entidad |
| Numeración / serie de factura | ❌ No existe |
| Encadenamiento / hash de registros | ❌ No existe |
| Envío AEAT / QR / huella | ❌ No existe |

Grep de `factur|invoice|verifactu|aeat|qr|iva|tax|pdf` sobre `traveldesk-api/src` y `traveldesk-web-client/src`: **una sola coincidencia**, la etiqueta de dashboard citada.

## 2. Entidades de dominio que mapearían a una futura factura

Aunque no hay factura, el modelo actual ya tiene las piezas de negocio que la alimentarían:

| Entidad | Archivo | Rol en una futura factura |
|---|---|---|
| `Sale` | `model/Sale.java` | **Núcleo del hecho facturable**: `amount`, `currency`, `destination`, `description`, `saleDate`, `customer`, `agency`, `commissionPercentage`, lista de `payments`. |
| `Payment` | `model/Payment.java` | Cobros asociados a la venta (`originalAmount`, `sourceCurrency`, `exchangeRate`, `convertedAmount`, `paymentDate`). |
| `Customer` | `model/Customer.java` | Receptor de la factura (datos fiscales del cliente — **verificar si tiene NIF/CIF, dirección fiscal**; hoy probablemente no). |
| `Agency` | `model/agency/Agency.java` | Emisor de la factura (datos fiscales del emisor — **verificar NIF, razón social, domicilio fiscal**). |
| `Booking` | `model/Booking.java` | Líneas de servicio/reserva que podrían detallar la factura. |

> **Gap de datos fiscales:** una factura española requiere NIF/razón social/domicilio del emisor y del receptor, base imponible, tipo y cuota de IVA, y número correlativo de serie. `Sale` guarda un `amount` bruto sin desglose de base/IVA, y no consta que `Customer`/`Agency` tengan campos fiscales. **A verificar en la fase de diseño**, pero es un gap seguro.

## 3. Checklist de requisitos Verifactu (alto nivel, solo gap)

Requisitos que Verifactu (RD 1007/2023 y Orden HAC/1177/2024) exigirá — ninguno está cubierto hoy:

- [ ] **Registro de facturación por cada factura** (alta) e, en su caso, **registro de anulación**, generados por el sistema informático de facturación (SIF).
- [ ] **Encadenamiento (hash) de registros**: cada registro incluye la huella del anterior → cadena inalterable.
- [ ] **Huella / hash** de cada registro con el algoritmo especificado.
- [ ] **Firma** de los registros (según modalidad Verifactu vs no-Verifactu).
- [ ] **Marca "VERI*FACTU"** y **código QR** en la factura (con URL de cotejo AEAT).
- [ ] **Remisión de los registros a la AEAT** (modalidad Verifactu: envío automático; o conservación para no-Verifactu).
- [ ] **Numeración correlativa** por serie y **fecha/hora** de expedición.
- [ ] **Desglose de IVA** (base imponible, tipo, cuota) y régimen aplicable (nota: agencias de viaje pueden requerir el **Régimen Especial de Agencias de Viajes, REAV**, con reglas de IVA propias — a analizar).
- [ ] **Trazabilidad e inalterabilidad**: los registros no pueden modificarse; las correcciones se hacen con facturas rectificativas.
- [ ] **Conservación** y **exportación** de los registros en el formato exigido.

## 4. Implicación para el orden de trabajo

Verifactu **depende de la identidad fiscal del tenant/agencia** (emisor) y del aislamiento correcto de datos: una factura debe emitirse con los datos fiscales de la agencia correcta y numerarse por serie propia. Por eso **multitenancy (FASE 3) debe resolverse antes** que la facturación. Se recoge en el informe ejecutivo (FASE 8).

## Notas de método

- Grep de términos de facturación en ambos módulos.
- Lectura de `Sale.java`, `Payment.java` y del listado de entidades de `model/`.
- Revisión de `pom.xml` para descartar librerías de PDF/firma.
- Los requisitos de Verifactu son de conocimiento normativo general (RD 1007/2023); **deben validarse con un asesor fiscal** antes de diseñar — no forman parte del código auditado.
