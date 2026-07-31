# PR 5 — Mantenimiento y tickets

**Responsable:** Jorge Ruiz · **Módulo:** Mantenimiento + Tickets (Fase 3, semana 7)

Reporte de incidencias, asignación a técnicos y seguimiento del estado. Es el
único módulo que no dependía de ningún otro: `solicitudes_mantenimiento` solo
referencia `fraccionamientos` y `usuarios`, ambas de la migración 001.

---

## 1. Endpoints — `/api/mantenimiento`

| Método | Ruta | Rol | Qué hace |
|---|---|---|---|
| GET | `/` | admin | Todos los tickets, con filtros |
| GET | `/mios` | propietario, tecnico | Los suyos (criterio según rol) |
| GET | `/tecnicos` | admin | Técnicos activos con su carga |
| GET | `/estados` | cualquiera | Catálogo del enum |
| POST | `/` | propietario, admin, vigilante | Reportar |
| GET | `/:id` | admin, tecnico, propietario | Con control de propiedad |
| PUT | `/:id` | admin | Actualización general |
| PUT | `/:id/asignar` | admin | Asignar técnico |
| PUT | `/:id/estado` | admin, tecnico (asignado) | Mover estado |
| DELETE | `/:id` | admin | Eliminar |

**El vigilante también puede reportar.** Es quien detecta una luminaria fundida
o un portón que falla durante su turno; obligarle a avisar al administrador para
que lo capture sería perder información.

---

## 2. La restricción que impide datos incoherentes

```sql
CONSTRAINT chk_ticket_resuelto CHECK ((estado = 'resuelto') = (resuelto_at IS NOT NULL))
```

Esta línea es la pieza más útil de la migración. Obliga a que `estado` y
`resuelto_at` se muevan siempre juntos, y el error que previene es concreto:
**reabrir un ticket dejando puesta la fecha de resolución**.

Sin la restricción, ese ticket quedaría "en proceso, resuelto el 12 de julio" —
un dato que nadie nota hasta que alguien construye un informe con él. Con la
restricción, la base rechaza la fila y el bug aparece en desarrollo.

Por eso todas las escrituras de estado usan la misma expresión:

```sql
resuelto_at = CASE WHEN <nuevo estado> = 'resuelto'
                   THEN COALESCE(resuelto_at, NOW())
                   ELSE NULL END
```

El `COALESCE` conserva la fecha original si el ticket ya estaba resuelto, en vez
de reescribirla en cada guardado.

Hay una prueba explícita de este ciclo: resolver → comprobar `resuelto_at` →
reabrir → comprobar que quedó en `null`.

---

## 3. Asignar y cambiar de estado van juntos

```sql
SET tecnico_id = $3,
    estado = CASE WHEN estado = 'resuelto' THEN estado ELSE 'en_proceso' END
```

Un ticket con técnico asignado que siguiera "abierto" es un estado que no
significa nada: ¿está en cola o alguien ya lo está atendiendo? Acoplar las dos
cosas elimina esa ambigüedad.

La excepción es un ticket ya resuelto: reasignarlo no debe reabrirlo.

---

## 4. Validar al técnico, y con el código correcto

```js
if (!rows[0]) throw httpError(400, 'El usuario indicado no es un técnico activo de este fraccionamiento')
```

**400 y no 404.** El id puede existir perfectamente —puede ser el del
administrador— pero no es un técnico. Eso es un error en la petición, no un
recurso ausente. Devolver 404 haría pensar que el usuario no existe.

El smoke test lo comprueba intentando asignar un ticket al propio administrador.

---

## 5. `ON DELETE SET NULL` para el técnico

```sql
tecnico_id UUID REFERENCES usuarios(id) ON DELETE SET NULL
```

Si se da de baja a un técnico, sus tickets no deben desaparecer: vuelven a
quedar sin asignar para que alguien los recoja. `CASCADE` habría borrado
trabajo pendiente junto con el usuario.

El solicitante sí es `CASCADE`: si se elimina al propietario, sus reportes se
van con él (igual que sus documentos y su cuenta).

---

## 6. Permisos: tres roles, un endpoint

`GET /mios` sirve tanto al propietario como al técnico, porque la pregunta de
fondo es la misma —"¿qué me toca a mí?"— y solo cambia la columna:

```js
const columna = usuario.rol === 'tecnico' ? 't.tecnico_id' : 't.solicitante_id'
```

Para el detalle de un ticket, el rol no basta: `tecnico` y `propietario` son
roles compartidos por varias personas. El controlador comprueba que quien
consulta sea el solicitante, el técnico asignado, o un administrador.

Y el técnico solo puede mover el estado de **sus** tickets, no de cualquiera.

---

## 7. Orden de la lista

```sql
ORDER BY CASE t.estado WHEN 'abierto' THEN 0 WHEN 'en_proceso' THEN 1 ELSE 2 END,
         t.created_at DESC
```

Los abiertos primero. Ordenar solo por fecha enterraría un ticket abierto de
hace tres días bajo diez resueltos de ayer, que es justo lo contrario de lo que
necesita quien administra.

---

## 8. Técnicos con su carga de trabajo

```sql
COUNT(t.id) FILTER (WHERE t.estado <> 'resuelto')::int AS tickets_activos
...
ORDER BY tickets_activos, u.nombre
```

El selector de asignación muestra "Carlos Técnico (3 activos)" y ordena por
menor carga. Sin ese dato, el administrador reparte a ciegas y siempre elige al
primero de la lista.

---

## 9. Frontend: una pantalla, tres vistas

`Tickets.jsx` sirve a los tres roles en lugar de duplicarse en tres archivos.
Lo que cambia:

| Rol | Título | Alcance | Puede |
|---|---|---|---|
| admin | Mantenimiento | Todos | Asignar, cambiar estado, eliminar |
| tecnico | Mis asignaciones | Los suyos | Cambiar estado |
| propietario | Mis reportes | Los suyos | Reportar |

Se muestran como **tarjetas y no como tabla**: la descripción es texto libre de
longitud variable y recortarla en una celda haría perder justo la información
que importa.

El alcance real lo decide el backend (`/` vs `/mios`); el frontend solo elige a
cuál llamar. Ocultar botones no es seguridad — es comodidad.

---

## Cómo probarlo

```bash
cd server && npm run migrate && npm run seed && npm run dev
npm run smoke -- --only=maintenance    # 17 comprobaciones
cd ../client && npm run dev
```

1. Como `admin@urbanflow.test` → **Mantenimiento**: 6 tickets, los abiertos
   arriba. Asignar un técnico a uno abierto: pasa a "En proceso" solo.
2. Como `tecnico@urbanflow.test`: aterriza directo en sus asignaciones, ve
   menos tickets y no ve quién los reportó. Marcar uno como resuelto y volver a
   abrirlo: la fecha de resolución desaparece.
3. Como `propietario@urbanflow.test` → **Mis reportes**: reportar una
   incidencia. Nace abierta y sin asignar, y no tiene controles para cambiar el
   estado.

Verificado con 17 comprobaciones de API y 16 en navegador real, cubriendo los
tres roles.
