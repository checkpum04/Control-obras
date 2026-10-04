# App de control de obras: análisis y diseño (v1)

Documento corto de referencia. El objetivo de la app es uno: **cerrar el día sabiendo cuánto llevas gastado en cada obra**, con un parte diario que se rellena en uno o dos minutos desde el móvil.

## 1. Análisis de requisitos

| Prioridad | Qué | Decisión |
|---|---|---|
| Imprescindible (MVP) | Obras, trabajadores, materiales, partes diarios, horas, materiales usados, otros gastos, cálculos, dashboard, historial, autocompletado, copiar día anterior | Todo incluido en la v1 |
| Incluido también en v1 | Buscador general, fotos/documentos, informe por fechas, frecuentes, exportar a Excel (CSV) | Se hace ya porque cuesta poco |
| Más adelante | PDF del informe, varios usuarios, sincronizar entre móvil y ordenador, presupuesto por partidas, facturación | La estructura de datos ya lo permite |

Reglas que condicionan el diseño:

- **Rapidez por encima de todo**: la fecha de hoy viene puesta, la obra se elige con un toque, los trabajadores de ayer se copian con un botón, y cada nombre se autocompleta con su precio.
- **Los precios del pasado no cambian nunca**: cada línea de un parte guarda su propio nombre, unidad y precio en el momento de registrarla (copia, no referencia). Cambiar el precio habitual de un material solo afecta a lo que se registre a partir de ese momento.
- **No se pierde nada**: borrar un parte o una línea lo marca como borrado (`deleted_at`) en lugar de eliminarlo físicamente, y hay copia de seguridad.
- **Un parte por obra y día**: si ya existe el parte de hoy, el botón principal lo abre para seguir editándolo en vez de crear otro.

## 2. Arquitectura

```
Móvil / ordenador (navegador o app instalada)
 └─ PWA: React + Vite + TypeScript
     ├─ Pantallas (Inicio, Obra, Parte, Buscar, Catálogo, Informe, Ajustes)
     ├─ Cálculos puros (lib/calc.ts) — probados con tests
     └─ Capa de datos (data/repo.ts)  ← única puerta de entrada a los datos
          ├─ v1: IndexedDB en el propio dispositivo (Dexie). Funciona sin internet.
          └─ v2: Supabase (Postgres + almacenamiento de fotos + login)
```

- **Por qué PWA**: una sola aplicación para móvil y ordenador, se instala en la pantalla de inicio como una app, funciona sin cobertura en la obra y no depende de las tiendas de apps.
- **Por qué empezar en local**: funciona hoy mismo, sin cuentas ni costes. La contrapartida es que los datos viven en ese teléfono; por eso hay *Exportar copia de seguridad* en Ajustes.
- **Paso a Supabase**: cuando quieras ver los datos en el móvil y en el ordenador a la vez. Se sustituye solo `data/repo.ts`; las pantallas no cambian. El esquema SQL ya está escrito en [`schema.sql`](schema.sql).

## 3. Modelo de datos

Importes en **céntimos** (enteros) para evitar errores de redondeo. Fechas como `AAAA-MM-DD` y se muestran `DD/MM/AAAA`.

| Entidad | Campos principales | Notas |
|---|---|---|
| `clients` | name, phone, email, notes | Se crea sola al escribir un cliente nuevo en una obra |
| `projects` (obras) | name, client_id, address, start_date, end_date, status (`pendiente` / `en_curso` / `terminada`), budget_cents, notes | |
| `workers` | name, default_rate_cents, phone, active, use_count, last_used_at | Catálogo: precio/hora **habitual** |
| `materials` | name, default_unit, last_price_cents, use_count, last_used_at | Catálogo: unidad y **último precio** |
| `expense_concepts` | name, category, last_amount_cents, use_count | Aprende los conceptos de gasto |
| `daily_reports` (partes) | project_id, date, notes | Único por obra y fecha |
| `labor_entries` | report_id, project_id, worker_id, **worker_name, hours, rate_cents, cost_cents** | Copia histórica del precio |
| `material_entries` | report_id, project_id, material_id, **material_name, unit, quantity, unit_price_cents, cost_cents** | Copia histórica del precio |
| `expenses` | project_id, report_id (opcional), date, category, concept, amount_cents, note | Pueden ir dentro de un parte o sueltos |
| `attachments` | project_id, expense_id (opcional), kind (`foto` / `documento` / `ticket`), name, mime, size, blob / storage_path | Fotos de obra, tickets, facturas |

Todas las tablas llevan `id` (UUID), `created_at`, `updated_at` y `deleted_at`.

**Cálculos** (en `lib/calc.ts`):

- Coste trabajador/día = horas × precio/hora
- Coste material = cantidad × precio unitario
- Coste total obra = mano de obra + materiales + otros gastos
- Restante = presupuesto − coste; % consumido = coste ÷ presupuesto; beneficio estimado actual = presupuesto − coste
- **Semáforo**: verde por debajo del 75 % del presupuesto, naranja del 75 % al 90 %, rojo a partir del 90 % (o superado). Sin presupuesto: gris.

## 4. Pantallas

1. **Inicio**: botón grande *+ Añadir parte de hoy*, tarjetas de obras con presupuesto, gastado, restante, % y color de semáforo. Filtro por estado.
2. **Elegir obra** (al pulsar el botón principal): lista de obras en curso con un toque. Si solo hay una en curso, va directo.
3. **Parte diario**: fecha (hoy por defecto), *Copiar día anterior*, y tres bloques: Mano de obra, Materiales, Otros gastos. Cada bloque tiene buscador con autocompletado y botones de frecuentes. Total del día fijo abajo y botón *Guardar*.
4. **Obra** con pestañas: Resumen (cifras y gráficos), Partes, Trabajadores, Materiales, Gastos, Archivos.
5. **Detalle de parte**: todo lo de ese día, con opción de editar.
6. **Nueva / editar obra**.
7. **Buscar**: obras, trabajadores, materiales, gastos y partes en un solo cuadro.
8. **Catálogo**: trabajadores (precio habitual), materiales (unidad y precio), conceptos de gasto.
9. **Informe de obra**: rango de fechas, resumen económico, desglose, copiar tabla para Excel y exportar CSV.
10. **Ajustes**: copia de seguridad (exportar / importar), borrar datos de ejemplo.

## 5. Flujo principal (el de todos los días)

1. Abrir la app → **+ Añadir parte de hoy**.
2. Tocar la obra (si solo hay una en curso, se salta este paso).
3. **Copiar día anterior** → aparecen Juan, Pedro y Miguel con sus 8 h. Ajustar horas o quitar a alguien.
4. Materiales: escribir “cem” → *Cemento 25 kg · saco · 6,50 €* → poner cantidad.
5. Gastos (si hay): tocar *Gasolina* en frecuentes → importe.
6. **Guardar** → vuelve a la obra con el total actualizado y el semáforo.
