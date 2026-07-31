# PR 7 — Áreas comunes y reservaciones

**Responsable:** Miroslava Moheno · **Módulo:** Reserva de áreas comunes (Fase 3, semanas 7–8)

Catálogo de áreas (salón, alberca, cancha, asadores), calendario de
disponibilidad y reserva por franjas horarias sin solapamientos.

Con este PR quedan **montados los ocho módulos** de `server.js`.

---

## 1. Endpoints — `/api/reservaciones`

| Método | Ruta | Rol | Notas |
|---|---|---|---|
| GET | `/areas` | cualquiera | `?activa=true` para el selector de reserva |
| POST | `/areas` | admin | Crear |
| PUT/DELETE | `/areas/:id` | admin | Editar / eliminar |
| GET | `/areas/:id/disponibilidad?fecha=` | cualquiera | Franjas ocupadas del día |
| GET | `/mias` | propietario | Sus reservaciones |
| GET | `/` | admin | Todas, con filtros |
| POST | `/` | propietario, admin | Reservar |
| PUT | `/:id` | admin | Cambiar estado |
| PUT | `/:id/cancelar` | admin, propietario (dueño) | Cancelar |

### El orden de rutas aquí es especialmente peligroso

```js
router.get('/areas', ...)   // ← DEBE ir antes
router.get('/:id', ...)
```

Si `/:id` se registra primero, Express resuelve `GET /reservaciones/areas` como
"la reservación con id = `areas`" y falla con un error de UUID inválido. Es el
tipo de bug que se manifiesta como un 500 incomprensible. Hay una prueba
específica: `GET /areas no se confunde con /:id`.

---

## 2. El solapamiento: dos capas, y solo una es una garantía

El spec propone comprobar el solapamiento con una consulta:

```sql
WHERE area_id = $1 AND fecha = $2 AND estado <> 'cancelada'
  AND NOT (hora_fin <= $3 OR hora_inicio >= $4)
```

Ese `SELECT` se conserva, **pero no es la protección**. Tiene una condición de
carrera clásica: entre la consulta y el `INSERT`, otro usuario puede reservar el
mismo hueco. Los dos ven "libre" y los dos insertan.

La garantía real es una restricción de exclusión en la base:

```sql
ALTER TABLE reservaciones ADD CONSTRAINT excl_reservaciones_solape
  EXCLUDE USING gist (
    area_id WITH =,
    tsrange(fecha + hora_inicio, fecha + hora_fin) WITH &&
  ) WHERE (estado <> 'cancelada');
```

- `btree_gist` es lo que permite mezclar en un mismo índice GiST una comparación
  de **igualdad** (`area_id`) con una de **solapamiento** (`&&`).
- `fecha + hora` produce un `timestamp` y esa suma es inmutable, así que puede
  usarse dentro de un índice.
- `WHERE estado <> 'cancelada'` hace que cancelar libere el hueco de verdad.

Entonces, **¿para qué sirve el `SELECT`?** Para el mensaje. El `INSERT` que
choca contra la restricción devuelve un `23P01` genérico; la sonda permite
responder *"El horario choca con una reserva de 16:00 a 22:00"*. Es cortesía,
no seguridad.

El servicio captura `23P01` y responde *"Ese horario acaba de ser reservado por
alguien más"*, que describe exactamente lo que pasó.

### Verificado bajo concurrencia

El smoke test lanza **dos peticiones idénticas en paralelo** y comprueba que
entra exactamente una:

```js
const [c1, c2] = await Promise.all([ req(...), req(...) ])
// 1 × 201, 1 × 409
```

Sin la restricción `EXCLUDE`, esta prueba crearía dos reservas del mismo hueco.

---

## 3. Franjas contiguas sí se permiten

`tsrange` usa por defecto el intervalo `[inicio, fin)`: incluye el inicio y
excluye el fin. Eso significa que 10:00–12:00 y 12:00–14:00 **no** se solapan,
que es el comportamiento correcto: quien reserva hasta las 12:00 deja el área
libre a las 12:00.

Coincide con el predicado del spec (`hora_fin <= x`), y hay una prueba de esa
frontera concreta porque es justo donde un `<=` mal puesto rompe todo.

---

## 4. Desactivar en lugar de borrar

```js
throw httpError(409, 'El área tiene reservaciones registradas. Desactívala en lugar de eliminarla.')
```

`reservaciones.area_id` es `ON DELETE CASCADE`, así que borrar un área
arrastraría todo su histórico. El error no solo bloquea: **dice qué hacer en su
lugar**. Desactivar consigue el objetivo real (que nadie pueda reservar más) sin
perder los datos.

---

## 5. Otras decisiones

- **`UNIQUE (fraccionamiento_id, nombre)`** en áreas: hace idempotente el seed y
  evita dos "Alberca" en el mismo fraccionamiento.
- **`CHECK (hora_fin > hora_inicio)`**: una reserva de duración cero o negativa
  no puede llegar a la tabla ni por error de la aplicación.
- **Reactivar una reserva cancelada puede fallar.** Si el hueco ya se ocupó, el
  `UPDATE` choca contra la misma restricción. Se captura y se explica.
- **Solo el admin reserva en nombre de otro.** Un propietario que mande
  `propietario_id` en el cuerpo lo ve ignorado: se usa el suyo.
- **Aislamiento por JOIN.** `reservaciones` no tiene `fraccionamiento_id`, igual
  que en `db-schema.md`; todas las consultas pasan por `areas_comunes`.

---

## 6. Frontend

**`Components/Calendario.jsx`** — rejilla de horas completas de 8:00 a 23:00.

Se eligieron franjas de una hora en vez de un selector libre de hora por tres
razones: acota el problema, hace obvio de un vistazo qué está libre, y evita
reservas de "10:37 a 11:14" que nadie quiere gestionar.

Las franjas ocupadas salen en gris, **deshabilitadas**, y muestran quién
reservó. La interacción es de dos toques: el primero fija el inicio, el segundo
el fin.

**`portal/Reservas.jsx`** — el propietario reserva y ve las suyas. Si el envío
falla por un choque, se recarga la disponibilidad: probablemente alguien reservó
mientras elegía.

**`admin/Areas.jsx`** — dos pestañas: catálogo de áreas (con alta, edición y
activar/desactivar) y todas las reservaciones con cambio de estado en línea.

### Un detalle de fechas que ya mordió antes

`fechaLegible` formatea con `timeZone: 'UTC'` y construye la fecha como
`` `${iso}T12:00:00Z` ``. La fecha llega como `2026-08-05` o
`2026-08-05T00:00:00.000Z`; en México (UTC−6/−7) interpretarla en local la
mostraría como **4 de agosto**. Es el mismo problema que apareció con
`mes_anio` en el módulo de pagos.

---

## Cómo probarlo

```bash
cd server && npm run migrate && npm run seed && npm run dev
npm run smoke -- --only=reservations    # 21 comprobaciones
cd ../client && npm run dev
```

Como `propietario@urbanflow.test` → **Reservar área**:
1. Ve sus reservaciones del seed con estado y horario.
2. "Reservar un área" abre el calendario. Las franjas ya tomadas están en gris
   con el nombre de quien reservó, y no se pueden pulsar.
3. Tocar dos horas arma el rango y el resumen lo confirma en texto.
4. Intentar una franja que se solape da un error que dice **con qué** choca.

Como `admin@urbanflow.test` → **Áreas comunes**:
1. Pestaña *Áreas*: crear una nueva, desactivarla, y comprobar que ya no aparece
   al reservar. Intentar borrar una con reservaciones sugiere desactivarla.
2. Pestaña *Reservaciones*: confirmar o cancelar cualquiera.

Verificado con 21 comprobaciones de API —incluida la prueba de concurrencia— y
14 en navegador real.
