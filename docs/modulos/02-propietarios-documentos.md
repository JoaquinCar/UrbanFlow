# PR 2 — Propietarios + Documentos + QR de residente

**Responsable:** Joaquín Carmona · **Módulo:** Propietarios + Documentos (Fase 2, semana 3)

Alta de propietarios con su cuenta de acceso, expediente de documentos adjuntos
y el código QR que usarán en la caseta.

---

## 1. Endpoints — `/api/propietarios`

| Método | Ruta | Rol | Notas |
|---|---|---|---|
| GET | `/` | admin, vigilante | Lista con lotes agregados y búsqueda |
| GET | `/me` | propietario | Su propia ficha, sin conocer su id |
| GET | `/:id` | admin, vigilante, propietario (suyo) | Detalle |
| POST | `/` | admin | Crea propietario + usuario + QR |
| PUT | `/:id` | admin | Actualización parcial |
| DELETE | `/:id` | admin | Borra propietario, usuario y documentos |
| GET | `/:id/qr` | admin, propietario (suyo) | `?format=png` o data URL |
| POST | `/:id/qr/rotar` | admin | Invalida el QR anterior |
| GET | `/:id/documentos` | admin, vigilante, propietario (suyo) | Lista |
| POST | `/:id/documentos` | admin | Subida multipart |
| GET | `/documentos/:docId` | admin, propietario (dueño) | Descarga |
| DELETE | `/documentos/:docId` | admin | Elimina |

### El orden de las rutas importa

`/me` y `/documentos/:docId` se registran **antes** que `/:id`. Express resuelve
en orden de declaración, así que con `/:id` primero una petición a
`/propietarios/me` entraría como "propietario con id `me`" y devolvería un
error de UUID inválido.

---

## 2. Dos niveles de permiso, no uno

`requireRole(['propietario'])` no basta. Todos los residentes comparten ese rol,
así que el guard solo dice "es un propietario", no "es *este* propietario".

Por eso el controlador añade una segunda comprobación:

```js
async function exigirPropioSiEsPropietario(req, propietarioId) {
  if (req.user.rol !== 'propietario') return
  const mio = await service.obtenerPorUsuario(fracc(req), req.user.sub)
  if (!mio || mio.id !== propietarioId) throw httpError(403, 'Acceso denegado')
}
```

Sin esto, cualquier residente podría leer la CURP, el teléfono y las escrituras
de sus vecinos cambiando el UUID de la URL. El smoke test lo comprueba
explícitamente (`un propietario no puede ver la ficha de otro → 403`).

En la descarga de documentos la comprobación va **después** de resolver el
documento, porque hay que saber de quién es antes de poder decidir.

---

## 3. Crear un propietario crea también su usuario

Son 1:1 y un propietario sin acceso al portal no sirve de nada, así que el alta
hace las dos cosas en **una transacción**:

1. `INSERT usuarios` con `rol = 'propietario'` y contraseña hasheada.
2. `INSERT propietarios` vinculado a ese usuario.
3. `UPDATE usuarios SET qr_token` con el QR recién generado.

Si el segundo `INSERT` falla, el `ROLLBACK` evita dejar un usuario huérfano que
además bloquearía el email para siempre.

El borrado es simétrico: se elimina el **usuario**, y `propietarios` cae por
`ON DELETE CASCADE`, arrastrando a su vez los `documentos`.

### Un detalle que no es automático

Antes de borrar hay que devolver los lotes a `disponible`:

```sql
UPDATE lotes SET estado = 'disponible' WHERE propietario_id = $1
```

`lotes.propietario_id` es `ON DELETE SET NULL`, así que la referencia se limpia
sola — pero el **estado no**. Sin este `UPDATE` quedarían lotes marcados como
`vendido` sin dueño, y `cuota-cron.js`, que cobra con `WHERE estado = 'vendido'`,
intentaría generar cuotas para un propietario inexistente.

---

## 4. El QR de residente

Un JWT con `{ userId, fraccionamientoId, type: 'resident-qr', jti }`.

### Por qué un secreto propio

Se firma con `QR_SECRET`, **nunca con `JWT_SECRET`**. Este token es una
credencial física: vive impresa en un papel o en una captura en el teléfono, se
enseña a un vigilante, y no caduca. Si se firmara con la llave de los access
tokens, una fuga del QR podría intentar reutilizarse contra `authGuard`.

### Por qué no expira, y cómo se revoca entonces

El diseño pide que no expire: un residente no debería renovar su QR cada 15
minutos. La consecuencia es que **la revocación no puede ser por tiempo**.

La fuente de verdad es `usuarios.qr_token`. Quien valide el QR en la caseta
(PR 3) no solo verifica la firma: compara el token escaneado contra el que está
guardado en la base. Así:

- `POST /:id/qr/rotar` genera otro y el anterior deja de servir al instante.
- Desactivar al usuario (`activo = FALSE`) lo bloquea igual.

El campo `jti` con un UUID aleatorio garantiza que rotar produzca siempre un
token distinto, aunque el usuario y el fraccionamiento sean los mismos. Sin él,
`jwt.sign` con la misma carga útil daría la misma cadena y "rotar" no rotaría
nada.

### Generación tardía

Los propietarios sembrados antes de este módulo no tenían QR. En vez de un
script de migración de datos, `obtenerQr` lo genera al primer acceso si
`qr_token IS NULL`. Menos piezas móviles y el resultado es el mismo.

---

## 5. Subida de documentos

### El nombre del archivo no es de fiar

Multer guarda cada archivo con un UUID aleatorio, no con el nombre que mandó el
cliente. Un `originalname` puede traer `../../etc/passwd`, caracteres que rompan
el sistema de archivos, o chocar con otro archivo existente.

El nombre original se guarda aparte, en `documentos.nombre_archivo`, y se
restituye al descargar:

```js
res.setHeader('Content-Disposition',
  `attachment; filename*=UTF-8''${encodeURIComponent(doc.nombre_archivo)}`)
```

El `filename*=UTF-8''` es necesario para que "escritura firmada.pdf" o cualquier
nombre con acentos no rompa la cabecera.

Esto obligó a apartarse de `docs/db-schema.md`, que solo lista
`(id, propietario_id, tipo, url_archivo, created_at)`. Sin `nombre_archivo`,
`mime_type` y `tamano_bytes` la descarga no puede devolver ni el nombre correcto
ni el `Content-Type` correcto.

### Lista blanca, no lista negra

Solo se aceptan PDF, JPEG, PNG y WEBP. Una lista negra siempre se queda corta.

### Orden de las operaciones

- **Al subir**: multer ya escribió el archivo cuando llega al servicio, así que
  si el propietario resulta no ser de este fraccionamiento hay que **borrar el
  archivo** antes de lanzar el 404. Si no, se acumula basura subida por alguien
  sin permiso.
- **Al borrar**: primero la fila, después el archivo, y el `unlink` no bloquea.
  Si falla, queda un archivo huérfano en disco — mucho menos grave que una fila
  apuntando a un archivo que ya no existe.
- **Al descargar**: `path.basename()` sobre el valor de la columna. Aunque hoy
  lo escribimos nosotros, es la última defensa contra un path traversal si algún
  día ese campo se pudiera manipular.

### Limitación conocida

Los archivos van a disco local (`UPLOAD_DIR`). En Railway/Render el sistema de
archivos es **efímero**: los adjuntos se pierden en cada despliegue. Para el
proyecto escolar es aceptable. Migrar a S3 solo tocaría
`upload.middleware.js` y el contenido de `url_archivo`, porque ninguna otra
parte del código maneja rutas.

---

## 6. Aislamiento sin columna redundante

`documentos` no tiene `fraccionamiento_id`, igual que en `db-schema.md`. El
aislamiento se hace siempre con el mismo JOIN:

```sql
FROM documentos d
INNER JOIN propietarios p ON p.id = d.propietario_id
WHERE p.fraccionamiento_id = $1
```

Duplicar la columna sería más rápido de escribir pero abre la puerta a que las
dos copias se contradigan. El JOIN está aislado en la constante
`JOIN_DOC_TENANT` para que ninguna consulta se lo salte por olvido.

---

## 7. Frontend

**`Owners.jsx`** — reescrito. Tabla real con búsqueda contra la API, alta en
modal y borrado con confirmación que explica lo que arrastra.

**Se eliminó el mapa de Leaflet.** Mostraba marcadores inventados sobre Mérida
con direcciones como "123 Oak Street, CA 98765". Ni `propietarios` ni `lotes`
tienen coordenadas en la base, así que ese mapa **nunca** podría alimentarse con
datos reales. El mapa del producto es el plano de lotes de PR 1, que sí se
conecta por `svg_path_id`. Quitar `leaflet` y `react-leaflet` bajó el bundle de
**445 KB a 298 KB**.

**`admin/PropietarioDetalle.jsx`** — tres pestañas reutilizando el componente
`Tabs` que ya existía: Datos, Código QR (con descarga y regeneración) y
Documentos (subida, descarga y borrado).

La descarga no puede ser un `<a href>` normal porque el endpoint exige el token
de sesión, que va en una cabecera. Se pide como `blob` y se dispara desde
memoria con un `<a download>` temporal.

En la subida **no se fija `Content-Type` a mano**: el navegador tiene que
añadir el `boundary` del multipart, y ponerlo manualmente rompe la petición.

---

## Cómo probarlo

```bash
cd server && npm run migrate && npm run seed && npm run dev
npm run smoke -- --only=owners     # 24 comprobaciones
cd ../client && npm run dev
```

Como `admin@urbanflow.test`:

1. **Propietarios** — 3 registros con sus lotes. Buscar "María" deja uno solo.
2. Abrir un detalle → pestaña **Código QR**: se ve el QR. "Regenerar" produce
   otro distinto; el anterior ya no serviría en la caseta.
3. Pestaña **Documentos**: adjuntar un PDF, descargarlo (conserva el nombre
   original) y eliminarlo. Un `.exe` es rechazado con un mensaje claro.
4. Dar de alta un propietario y cerrar sesión: ese correo ya puede entrar al
   portal con la contraseña asignada.

Como `propietario@urbanflow.test`: `/owners` rebota, y `/api/propietarios/me`
devuelve su ficha mientras que la de otro da 403.

Verificado con 24 comprobaciones de API y 13 en navegador real.
