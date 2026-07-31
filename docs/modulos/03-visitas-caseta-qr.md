# PR 3 — Visitas, Caseta, QR y notificaciones en vivo

**Responsable:** Joaquín Carmona · **Módulo:** Visitas + Caseta + QR (Fase 2, semanas 4–6)

El módulo operativo del sistema: la pantalla que usa el vigilante durante todo
su turno. Registro de entradas y salidas, escaneo del QR del residente, bitácora
de 30 días con exportación a CSV, y avisos en tiempo real.

---

## 1. Endpoints — `/api/visitas`

| Método | Ruta | Rol | Qué hace |
|---|---|---|---|
| POST | `/entrada` | vigilante, admin | Registra entrada manual |
| POST | `/qr` | vigilante, admin | Entrada escaneando el QR del residente |
| PUT | `/:id/salida` | vigilante, admin | Marca la salida |
| GET | `/activas` | vigilante, admin | Quién está dentro ahora |
| GET | `/bitacora` | admin, vigilante | Histórico con filtros |
| GET | `/bitacora.csv` | admin, vigilante | Exportación |
| GET | `/mis-visitas` | propietario | Visitas a sus propios lotes |
| GET | `/tipos` | cualquiera | Catálogo del enum |
| GET | `/:id` | admin, vigilante | Detalle |

---

## 2. Un cuarto valor en el enum: `residente`

`docs/db-schema.md` define `tipo_visita` como `(visita, delivery, servicio)`.
Pero el spec pide registrar en `visitas` las entradas por QR de residente, y un
residente no es ninguna de las tres.

Se añadió **`residente`** al crear el tipo en la migración 006. Dos razones:

- Añadirlo después con `ALTER TYPE ... ADD VALUE` es incómodo: en PostgreSQL no
  puede ejecutarse dentro de una transacción, lo que choca con el diseño del
  ledger de migraciones (una transacción por archivo).
- La alternativa de marcarlo en el campo `notas` convertiría el filtro de la
  bitácora en un `LIKE '%residente%'`, que es lento y frágil.

---

## 3. La validación del QR: tres comprobaciones, no una

Verificar la firma del JWT **no basta**. `entradaPorQr` hace tres cosas más:

```js
const payload = verificarQrToken(token)

// 1. El QR de otro fraccionamiento no abre esta caseta.
if (payload.fraccionamientoId !== fraccionamientoId) throw httpError(403, ...)

// 2. Revocación por cuenta desactivada.
if (!u.activo) throw httpError(403, 'La cuenta del residente está desactivada')

// 3. Revocación por rotación.
if (u.qr_token !== token) throw httpError(401, 'Código QR revocado')
```

**La comprobación 1** existe porque el secreto `QR_SECRET` es el mismo para toda
la instalación: la firma de un QR de Jardines del Sol es perfectamente válida en
Las Palmas. Sin este filtro, un residente podría entrar a un fraccionamiento que
no es el suyo.

**La comprobación 3 es la que hace seguro un token que no expira.**
`usuarios.qr_token` es la única fuente de verdad: comparar el token escaneado
contra el guardado significa que rotarlo invalida al instante cualquier copia
impresa o compartida por error. El smoke test lo verifica de punta a punta:
escanear → rotar → volver a escanear el viejo → 401.

---

## 4. Distinguir "no existe" de "ya salió"

```js
UPDATE visitas SET salida_at = NOW()
WHERE id = $1 AND fraccionamiento_id = $2 AND salida_at IS NULL
```

Si no actualiza ninguna fila hay dos causas posibles, y para quien está en la
caseta son problemas distintos: un id equivocado (404) o una visita que ya se
cerró (409). Una segunda consulta las separa. Devolver siempre 404 obligaría al
vigilante a adivinar.

---

## 5. La bitácora de 30 días

La ventana por defecto se resuelve dentro del propio `WHERE`:

```sql
AND ($2::timestamp IS NULL OR v.entrada_at >= $2)
AND ($2::timestamp IS NOT NULL OR v.entrada_at >= NOW() - INTERVAL '30 days')
```

Si viene `desde`, manda ese valor; si no, se aplica la ventana de 30 días del
spec. Las dos líneas son mutuamente excluyentes por construcción.

### Índices

El que sirve de verdad es el compuesto, porque **toda** consulta filtra por
fraccionamiento y ordena por fecha:

```sql
CREATE INDEX idx_visitas_fracc_entrada ON visitas (fraccionamiento_id, entrada_at DESC);
```

Y uno parcial para la pantalla principal de la caseta, porque las visitas
abiertas son un puñado frente al histórico completo:

```sql
CREATE INDEX idx_visitas_dentro ON visitas (fraccionamiento_id, entrada_at DESC)
  WHERE salida_at IS NULL;
```

### `ON DELETE RESTRICT`, no `CASCADE`

`lote_destino_id` y `registrado_por` usan `RESTRICT`. La bitácora es un registro
histórico y no debe perder filas porque se dé de baja un lote o un vigilante.
Esto es también lo que hace que borrar un lote con visitas devuelva 409 en PR 1.

---

## 6. El CSV: dos detalles que siempre se olvidan

### BOM UTF-8

```js
return '﻿' + [encabezado, ...cuerpo].join('\r\n') + '\r\n'
```

Sin el BOM, Excel en Windows lee el archivo como Latin-1 y "Pérez" sale como
"PÃ©rez". Se escribe como escape y no como carácter literal porque un BOM
literal es invisible en el editor y cualquiera podría borrarlo sin darse cuenta.

### Inyección de fórmulas

```js
const seguro = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
```

Excel y Google Sheets interpretan como fórmula cualquier celda que empiece por
`=`, `+`, `-`, `@` o tabulador. Un visitante registrado como
`=HYPERLINK("http://malo","clic")` se convertiría en un enlace ejecutable al
abrir el archivo; con `=IMPORTXML()` eso es exfiltración de datos. El apóstrofo
inicial fuerza a tratarlo como texto.

### Un detalle de la verificación

La primera versión del smoke test decía que faltaba el BOM. **Sí se enviaba**:
el problema era que `res.text()` de `fetch` decodifica UTF-8 y en el proceso
elimina el BOM. Hubo que leer la respuesta como bytes y comparar contra
`EF BB BF` para comprobarlo de verdad.

---

## 7. Fallo de seguridad corregido en Socket.io

El código que ya estaba en `server.js` desde el esqueleto inicial:

```js
socket.on('join-caseta', (fraccionamientoId) => {
  socket.join(`caseta-${fraccionamientoId}`)
})
```

Tenía dos problemas: **la conexión no exigía token**, y la sala se tomaba de un
argumento que mandaba el cliente. Cualquier navegador podía conectarse, emitir
`join-caseta` con un UUID ajeno y quedarse escuchando en vivo el registro de
visitantes de otro fraccionamiento — nombres, placas y lotes.

La corrección:

```js
io.use((socket, next) => {
  const token = socket.handshake.auth?.token
  if (!token) return next(new Error('No autorizado'))
  try {
    socket.user = jwt.verify(token, process.env.JWT_SECRET)
    next()
  } catch { next(new Error('Token inválido o expirado')) }
})

socket.on('join-caseta', () => {
  // El fraccionamiento sale del token, nunca de un argumento del cliente.
  socket.join(`caseta-${socket.user.fraccionamiento_id}`)
})
```

Es la misma regla que ya seguían las consultas SQL, aplicada al canal en tiempo
real. Cambia el contrato del cliente: `io(url, { auth: { token } })` y
`emit('join-caseta')` sin argumentos.

Verificado con un cliente real: conexión sin token rechazada, con token inválido
rechazada, y un usuario del otro fraccionamiento **no recibe el evento aunque
mande el id ajeno**.

### Dónde se emite

En un helper, `shared/utils/realtime.js`, y siempre desde el controlador
**después** de que la escritura haya ido bien. Nunca desde el servicio: los
servicios no conocen `req` y así se mantienen agnósticos de HTTP. Y nunca antes
de confirmar, o se anunciaría una visita que no llegó a guardarse.

Eventos: `nueva-visita`, `qr-entrada`, `salida-visita`.

---

## 8. El escáner de QR

`jsQR` trabaja sobre píxeles, así que el flujo es: `getUserMedia` → `<video>` →
volcar cada fotograma a un `<canvas>` → leer los píxeles → decodificar.

Tres decisiones:

**`requestAnimationFrame`, no `setInterval`.** El bucle se pausa solo cuando la
pestaña pasa a segundo plano. Con `setInterval` seguiría consumiendo batería en
el móvil del vigilante durante todo el turno con la caseta abierta.

**Bandera `yaLeidoRef`.** Un código permanece en cuadro muchos fotogramas
seguidos. Sin ella se dispararían decenas de registros de entrada por cada
escaneo.

**`facingMode: 'environment'` y `playsinline`.** Lo primero pide la cámara
trasera, que es la que apunta al código. Lo segundo evita que iOS abra el vídeo
a pantalla completa y tape la interfaz.

Los errores de cámara se traducen a mensajes accionables (permiso denegado,
sin cámara) y siempre se recuerda que existe el registro manual como
alternativa.

---

## 9. Frontend

**`caseta/Caseta.jsx`** — pantalla principal: quién está dentro con tiempo
relativo ("hace 9 h"), botón de salida por visita, alta manual y escáner. El
indicador "En vivo" refleja el estado real del socket.

La lista se recarga con los eventos del socket, no con un temporizador. Si hay
dos vigilantes en turno, ambos ven lo mismo al instante.

**`caseta/Bitacora.jsx`** — tabla con filtros de texto, tipo y rango de fechas,
y exportación a CSV. La descarga pasa por axios y no por un `<a href>` porque el
endpoint exige el token de sesión, que viaja en una cabecera.

**`context/SocketContext.jsx`** — una sola conexión para toda la aplicación,
dentro de `AuthProvider` porque necesita el token y el rol. `useSocketEvent`
guarda el manejador en una ref para que la suscripción no se rehaga en cada
render; si no, se perderían eventos entre el desmontaje y el montaje del
listener.

---

## Cómo probarlo

```bash
cd server && npm run migrate && npm run seed && npm run dev
npm run smoke -- --only=visits    # 24 comprobaciones
cd ../client && npm run dev
```

Como `vigilante@urbanflow.test` / `UrbanFlow2026!` (aterriza directo en
`/caseta`):

1. Se ven **3 visitas dentro** y el indicador **En vivo** en verde.
2. "Registrar entrada" → elegir lote, nombre y placa. Aparece en la lista al
   instante.
3. "Salida" en esa tarjeta: desaparece de la lista.
4. **Bitácora**: ~45 accesos de los últimos 30 días. Filtrar por "Entrega".
   Exportar CSV y abrirlo en Excel — los acentos se ven bien.
5. Para el escáner hace falta cámara y HTTPS o localhost. Se puede probar el
   flujo completo generando el QR de un propietario desde Propietarios →
   Código QR y mostrándolo a la cámara.

Como `propietario@urbanflow.test`: `/caseta` y `/bitacora` rebotan, pero
`/api/visitas/mis-visitas` devuelve las visitas a sus lotes.

Verificado con 24 comprobaciones de API, 6 de Socket.io y 14 en navegador real.
