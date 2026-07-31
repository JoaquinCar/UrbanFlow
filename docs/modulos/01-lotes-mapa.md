# PR 1 — Lotes + Mapa SVG interactivo

**Responsable:** Miroslava Moheno · **Módulo:** Lotes + Mapa (Fase 2, semanas 3–5)

Primer módulo funcional completo: API de lotes, tabla de administración y plano
interactivo donde cada figura se colorea según el estado real del lote en la
base de datos.

---

## 1. Endpoints

Montado en `/api/fraccionamiento`, no en `/api/lotes`. El plan original hablaba
de `/lotes` suelto, pero `server.js` ya tenía preparado el montaje por módulo y
los lotes pertenecen conceptualmente al fraccionamiento. El frontend aísla esa
decisión en una sola constante (`BASE` en `api/lotes.js`).

| Método | Ruta | Rol | Qué hace |
|---|---|---|---|
| GET | `/api/fraccionamiento` | cualquiera | Datos del fraccionamiento del token |
| PUT | `/api/fraccionamiento` | admin | Actualiza nombre, dirección, `config_mapa` |
| GET | `/api/fraccionamiento/mapa` | cualquiera | Lotes con `svg_path_id` + resumen por estado |
| GET | `/api/fraccionamiento/etapas` | cualquiera | Etapas existentes, para el filtro |
| GET | `/api/fraccionamiento/lotes` | cualquiera | Lista con filtros `estado`, `etapa`, `q`, paginada |
| POST | `/api/fraccionamiento/lotes` | admin | Crea lote |
| GET | `/api/fraccionamiento/lotes/:id` | cualquiera | Detalle con datos de contacto del propietario |
| PUT | `/api/fraccionamiento/lotes/:id` | admin | Actualización parcial |
| DELETE | `/api/fraccionamiento/lotes/:id` | admin | Elimina |
| PUT | `/api/fraccionamiento/lotes/:id/propietario` | admin | Asigna o desasigna dueño |

Lectura abierta a todos los roles a propósito: el vigilante necesita listar
lotes para elegir el destino de una visita (PR 3) y el propietario para ver el
suyo. Escribir es exclusivo de admin.

---

## 2. El contrato multi-tenant

Todas las funciones del servicio reciben `fraccionamientoId` como **primer
argumento** y lo filtran en cada consulta. El controlador lo saca siempre del
token:

```js
const fracc = (req) => req.user.fraccionamiento_id
```

Nunca del cuerpo ni de la URL. Si viniera del cliente, un admin de Las Palmas
podría leer o borrar lotes de Jardines del Sol mandando otro UUID.

La misma idea aplica a las referencias cruzadas: `asignarPropietario` no
confía en el `propietario_id` que llega, valida antes que ese propietario
pertenezca al mismo fraccionamiento.

---

## 3. Un bug de tipos que solo aparece en tiempo de ejecución

La primera versión de `crearLote` usaba:

```sql
VALUES ($1, $2, $3, $4, $5, COALESCE($6, 'disponible'), $7, $8)
```

y fallaba con:

```
column "estado" is of type estado_lote but expression is of type text
```

PostgreSQL infiere el tipo de un parámetro por el contexto. En un `COALESCE`
entre un parámetro sin tipo y el literal `'disponible'`, resuelve ambos como
`text`, y `text` no se asigna implícitamente a un ENUM. La solución es el cast
explícito:

```sql
COALESCE($6::estado_lote, 'disponible')
```

Lo mismo en el `UPDATE`: `estado = COALESCE($7::estado_lote, estado)`.

**Se detectó con el smoke test, no leyendo el código.** Es exactamente el tipo
de error que no se ve revisando: el SQL parece correcto.

---

## 4. Filtros opcionales sin concatenar SQL

```sql
WHERE l.fraccionamiento_id = $1
  AND ($2::estado_lote IS NULL OR l.estado = $2)
  AND ($3::varchar     IS NULL OR l.etapa  = $3)
  AND ($4::varchar     IS NULL OR l.numero ILIKE $4 OR p.nombre_completo ILIKE $4)
```

Cuando el filtro no viene, se manda `null` y la condición se cumple sola. La
alternativa —ir armando el `WHERE` con `if`s y concatenación— acaba siempre en
inyección SQL o en numeración de parámetros desincronizada.

Actualización parcial con el mismo patrón: `COALESCE($n, columna)` deja
intactos los campos que no se mandaron. El smoke test lo comprueba
explícitamente (`actualización parcial no borra los otros campos`).

---

## 5. Asignar propietario cambia el estado

```sql
SET propietario_id = $3,
    estado = CASE WHEN $3::uuid IS NULL THEN 'disponible'::estado_lote
                  ELSE 'vendido'::estado_lote END
```

No es cosmético: **`cuota-cron.js` decide a quién cobrar con
`WHERE l.estado = 'vendido'`**. Si se pudiera asignar un dueño dejando el lote
en `disponible`, ese propietario nunca recibiría cuotas. Acoplar las dos cosas
en una sola operación hace imposible ese estado inconsistente.

Por la misma razón, el seed no marca ningún lote de Jardines del Sol como
vendido: ese fraccionamiento todavía no tiene propietarios sembrados, y un lote
vendido sin dueño sería un cobro a nadie.

---

## 6. El plano SVG

No existía ningún plano en el repositorio. Se generó con
`client/scripts/generate-mapa-svg.mjs` en vez de dibujarlo a mano:

- 25 paths a mano son 25 oportunidades de equivocarse en un `id`, y un `id` mal
  escrito significa un lote que nunca se pinta.
- Cuando el fraccionamiento crezca, basta cambiar las constantes `MANZANAS`.

Cada lote es un `<path id="lote-A-01">`, y ese id es exactamente el valor de
`lotes.svg_path_id`. Esa cadena es toda la unión entre el dibujo y los datos.

### Por qué se inyecta el SVG en vez de usar `<img>`

`MapaLotes.jsx` descarga el SVG como texto y lo inserta con
`dangerouslySetInnerHTML`. Con `<img src="...">` el SVG es opaco: no hay DOM al
que engancharse, así que no se podría colorear cada figura ni escuchar sus
clicks. Con `<object>` habría un documento aparte y haría falta cruzar la
frontera entre documentos.

El contenido es un archivo estático propio del proyecto, no entrada de usuario,
así que la inyección es segura aquí. Si algún día el plano se subiera desde la
interfaz, habría que sanearlo antes.

### El estado vive en la base, no en el archivo

Los colores son clases CSS (`.mapa-lote--vendido`), no atributos `fill` dentro
del SVG. El archivo generado es estático y tonto; el estado lo aplica React al
montar. Así, cambiar un lote a "vendido" en la tabla se refleja en el plano sin
regenerar nada.

Un lote cuyo `svg_path_id` no exista en el plano no se pinta y se avisa por
consola en desarrollo. Una figura del plano sin lote en la base se dibuja gris
con borde punteado (`.mapa-lote--sin-datos`). Los dos casos son visibles en vez
de fallar en silencio.

### Accesibilidad

Cada path recibe `tabindex="0"`, `role="button"` y un `aria-label` con número,
estado y propietario, y responde a Enter y Espacio. Un plano que solo funciona
con ratón deja fuera a quien navega con teclado.

---

## 7. El bug de StrictMode que apareció al probar el mapa

Al verificar el mapa en el navegador, la sesión se caía al recargar. La causa
no estaba en el mapa.

`AuthProvider` pide `/auth/refresh` al montar. **React StrictMode ejecuta los
efectos dos veces en desarrollo**, así que se disparaban dos renovaciones casi
simultáneas. Y como `auth.service.refresh()` **rota** el refresh token en cada
uso, la primera invalidaba el token que la segunda estaba usando: `401 Refresh
token revocado` y sesión cerrada.

Es la misma carrera que el interceptor 401 ya resolvía con una cola compartida
—pero el arranque llamaba a `/auth/refresh` por su cuenta y se la saltaba.

La corrección fue exportar esa cola y usarla también en el arranque:

```js
export function renovarSesion() {
  renovando = renovando || renovarToken().finally(() => { renovando = null })
  return renovando
}
```

Era intermitente: dependía de si la primera respuesta llegaba a tiempo de
actualizar la cookie antes de que saliera la segunda petición. Ese tipo de
fallo es el que nunca se reproduce cuando lo buscas.

---

## 8. Seed idempotente

Se reescribió `seed.js` aprovechando las claves naturales de la migración 004.
El detalle que importa:

```sql
ON CONFLICT (email) DO UPDATE SET nombre = EXCLUDED.nombre, ...
RETURNING id, email, rol
```

**`DO UPDATE`, no `DO NOTHING`.** Con `DO NOTHING`, el `RETURNING` no devuelve
filas cuando el registro ya existe: se pierde el id y el script se rompe. Ese
era exactamente el bug del seed anterior.

Dos detalles más:
- `password_hash` solo se escribe al insertar, nunca en el `DO UPDATE`. Volver a
  correr el seed no debe pisar una contraseña que alguien haya cambiado.
- Un solo `bcrypt.hash` reutilizado. Hashear 20 veces con coste 12 son unos 8
  segundos tirados a la basura.

Sin aleatoriedad: el estado sale de `estadoPorIndice(i)`, así que cada corrida
produce exactamente el mismo escenario de demostración.

Resultado tras dos corridas seguidas: 2 fraccionamientos, 7 usuarios, 3
propietarios, 40 lotes. Sin duplicados.

---

## 9. Frontend

**`admin/Lotes.jsx`** — tabla con `DataTable`, filtros por texto/estado/etapa,
alta y edición en modal, borrado con confirmación. En móvil la tabla se apila
como tarjetas usando `data-label` (ver `styles/table.css`): seis columnas en
450px no se leen.

**`admin/Mapa.jsx`** — leyenda con conteos reales, plano interactivo y modal de
detalle. El mapa solo trae lo necesario para pintar; el detalle completo
(precio, superficie, contacto) se pide al hacer click. Traer todo de golpe
serían 40 registros completos para mostrar uno.

---

## Cómo probarlo

```bash
cd server && npm run migrate && npm run seed && npm run dev
npm run smoke -- --only=fraccionamiento     # 18 comprobaciones

cd ../client
node scripts/generate-mapa-svg.mjs          # regenera el plano
npm run dev
```

Con `admin@urbanflow.test` / `UrbanFlow2026!`:

1. **Lotes** — 25 registros, filtrar por "Vendido" deja solo los que tienen
   propietario. Crear `QA-01`; intentar crearlo otra vez muestra "Ya existe el
   lote QA-01". Eliminarlo.
2. **Mapa** — 25 figuras coloreadas por estado, conteos de la leyenda cuadrando
   con la tabla. Click en un lote azul abre su detalle con nombre y teléfono
   reales del propietario. Se navega con Tab y se activa con Enter.
3. Entrar como `propietario@urbanflow.test`: Lotes y Mapa no aparecen en el menú
   y las URLs directas rebotan.

Verificado con 18 comprobaciones de API y 14 en navegador real.
