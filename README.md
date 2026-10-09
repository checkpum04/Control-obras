# Control de Obras (PWA)

App móvil para registrar partes diarios (horas, materiales, gastos) y ver el coste de cada obra.

```bash
npm install
npm run dev        # desarrollo en http://localhost:5173
npm test           # tests de cálculos y autocompletado
npm run build      # versión para publicar (carpeta dist/, cualquier hosting estático con https)
npm run artifact   # versión de un solo archivo para la vista previa (artifact/index.html)
```

- Datos: IndexedDB en el dispositivo (`src/data/db.ts`). Todo el acceso pasa por `src/data/repo.ts`, que es lo único que cambia al pasar a Supabase (`docs/schema.sql`).
- Cálculos: `src/lib/calc.ts` (importes en céntimos).
- Diseño y decisiones: `docs/DISENO.md`.

## Cambios en la base de datos de la nube
Cuando la app añade tablas o columnas, el archivo está en `docs/migrations/`. Se ejecuta una vez en Supabase → SQL Editor, **antes** de publicar la versión que lo usa (la publicación comprueba que estén y se para si faltan).
- `001-partidas.sql`: partidas dentro de cada obra.
