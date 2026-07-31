# Decisiones de arquitectura

Registro de las decisiones tomadas durante el desarrollo, con el motivo y las
alternativas descartadas. El detalle de cada módulo está en
[docs/modulos/](modulos/).

---

## 1. Seguridad

### El fraccionamiento sale siempre del token

Cada función de servicio recibe `fraccionamientoId` como primer argumento y lo
filtra en toda consulta. El controlador lo toma de `req.user.fraccionamiento_id`,
**nunca** del cuerpo ni de la URL.

Si viniera del cliente, un administrador de Las Palmas podría leer o borrar
datos de Jardines del Sol enviando otro UUID. Con 16 usuarios de prueba en dos
fraccionamientos, esto es comprobable.

### El rol no basta: hay que comprobar la propiedad

`requireRole(['propietario'])` solo dice *"es un propietario"*, no *"es **este**
propietario"*. Todos los residentes comparten el rol.

Sin una segunda comprobación, cualquier vecino podría leer la CURP, el teléfono
y las escrituras de los demás cambiando el UUID de la URL. Aplica a:
fichas de propietario, documentos, códigos QR, recibos, tickets y reservaciones.

### Dos secretos JWT distintos

| Token | Secreto | Expira | Se revoca con |
|---|---|---|---|
| Access | `JWT_SECRET` | 15 min | — |
| Refresh | `JWT_REFRESH_SECRET` | 7 días | `usuarios.refresh_token` |
| QR de residente | `QR_SECRET` | **nunca** | `usuarios.qr_token` |

El QR es una credencial **física**: vive impresa o en una captura de pantalla y
se enseña a un vigilante. Firmarlo con la llave de los access tokens permitiría
que una fuga se reintentara contra `authGuard`.

Como no expira, la revocación no puede ser temporal: la caseta compara el token
escaneado contra el guardado en la base, de modo que rotarlo lo invalida al
instante.

### El access token vive en memoria

No en `localStorage`, donde cualquier script inyectado lo leería. El refresh
viaja en cookie `httpOnly`, que JavaScript no puede tocar. Al recargar, la
sesión se recupera con `refresh` → `me`.

### Socket.io autenticado

El código inicial aceptaba conexiones sin token y unía al cliente a la sala que
pidiera. Cualquier navegador podía escuchar en vivo el registro de visitantes de
otro fraccionamiento. Ahora la conexión valida el access token y la sala sale
del token, ignorando lo que mande el cliente.

---

## 2. Integraciones reales, sin modo simulado

MercadoPago, SMTP y Meta se implementan contra sus APIs reales. Sin credenciales
devuelven un error explícito (`"MP_ACCESS_TOKEN no configurado"`) en lugar de
fingir éxito.

**Un pago simulado que parece exitoso es peor que un error claro:** oculta el
problema hasta la demostración. Las pruebas *asertan esa ruta de error* en vez
de saltársela.

### La firma del webhook se valida antes de tocar la base

Sin ella, cualquiera que conozca la URL podría marcar cuotas como pagadas con un
POST. Se comprueba con `timingSafeEqual` y se puede verificar **sin credenciales
de MercadoPago**: la prueba calcula un HMAC válido con el secreto local y
comprueba que el endpoint no responde 401, lo que demuestra que el manifiesto se
construye igual que del otro lado.

### El estado del pago se lee de la API, no del aviso

La notificación solo dice *"algo pasó con el pago X"* y su contenido no está
firmado campo por campo.

---

## 3. Que la base impida los datos incoherentes

Cuatro restricciones hacen imposibles errores que de otro modo pasan
inadvertidos:

| Restricción | Bug que previene |
|---|---|
| `chk_ticket_resuelto` | Un ticket "en proceso, resuelto el 12 de julio" |
| `excl_reservaciones_solape` | Dos reservas del mismo horario bajo concurrencia |
| `uq_pagos_referencia_mp_online` | Un reintento del webhook duplicando el pago |
| `uq_cuota_mensual_mes` | Dos cuotas mensuales del mismo periodo |

La de reservaciones merece explicación. El diseño proponía comprobar el
solapamiento con un `SELECT`, pero eso tiene una carrera clásica: entre la
consulta y el `INSERT`, otro usuario puede tomar el mismo hueco, y ambos ven
"libre". El `SELECT` se conserva **solo para el mensaje** (poder decir con qué
choca); la garantía es la restricción `EXCLUDE`. Hay una prueba que lanza dos
peticiones idénticas en paralelo y comprueba que entra exactamente una.

### `uq_pagos_referencia_mp` se pasó de estricta

La primera versión aplicaba a cualquier `referencia_mp` no nula. Pero esa
columna también guarda el folio de caja de los cobros manuales, que **sí se
repite legítimamente**. El segundo cobro en efectivo con el mismo folio
reventaba. La migración 011 la acota a `metodo = 'online'`, que es donde importa
la idempotencia.

Este fallo **solo apareció al correr la suite completa**, no la de pagos
aislada: hacía falta que dos cobros manuales distintos reutilizaran el folio.

---

## 4. Migraciones inmutables con checksum

`schema_migrations` guarda el sha256 de cada archivo aplicado. Si una migración
ya aplicada cambia, `npm run migrate` aborta.

Sin esa comprobación, dos compañeros pueden acabar con esquemas distintos
creyendo que están iguales. Para modificar algo se crea un archivo nuevo.

Una transacción **por archivo**, no una global: si falla la 007, la 004 que sí
estaba bien no se deshace.

`CREATE TYPE` no admite `IF NOT EXISTS`, así que todos los enums van envueltos
en `DO $$ ... EXCEPTION WHEN duplicate_object THEN NULL; END $$`.

---

## 5. Estados calculados frente a estados almacenados

Una cuota está vencida cuando sigue pendiente y su mes ya pasó. Se calcula en la
consulta en lugar de depender de que el cron del día 1 voltee el enum: si no
corrió, el propietario vería como "pendiente" algo que lleva tres meses vencido.

El enum se sincroniza igualmente al generar las cuotas del mes, para que la
columna no mienta a quien consulte la base directamente.

**El precio de tener dos representaciones** fue un bug: el reporte de morosos
filtraba `estado = 'pendiente'` y se vaciaba justo después de generar las
cuotas, que es la acción que marca las atrasadas como `'vencido'`. Ahora todas
las consultas de morosidad aceptan ambos estados.

---

## 6. Acoplar los cambios que deben ir juntos

- **Asignar propietario a un lote lo marca `vendido`.** `cuota-cron` cobra según
  `lotes.estado = 'vendido'`; un lote con dueño en estado `disponible` sería un
  propietario al que nunca se le cobra.
- **Asignar técnico pasa el ticket a `en_proceso`.** Un ticket con técnico que
  siguiera "abierto" es ambiguo: ¿está en cola o ya lo atienden?
- **Borrar un propietario devuelve sus lotes a `disponible`.**
  `lotes.propietario_id` es `ON DELETE SET NULL`, así que la referencia se
  limpia sola pero el estado no.

---

## 7. Una consulta o varias, según lo que se necesite

Dos decisiones opuestas y deliberadas:

**Portal del propietario: seis peticiones.** Cada bloque se carga por separado,
así que un fallo del módulo de reservas no tumba la pantalla. Además, un
endpoint agregado duplicaría la lógica de permisos de seis módulos.

**Panel de administración: una consulta.** Las cifras se comparan entre sí, así
que tienen que ser del mismo instante. Con seis peticiones el panel podría
mostrar "3 dentro" de hace 200 ms junto a "7 visitas hoy" de ahora.

---

## 8. Las pruebas comprueban comportamiento, no forma

El runner es `server/scripts/smoke.js`: CommonJS puro, sin dependencias nuevas
(Node trae `fetch`, `FormData` y `Blob`), contra el servidor real y la base en
Docker.

Se eligió sobre `supertest` porque este arranca la aplicación en proceso y se
salta la pila HTTP real, CORS y cookies. Y sobre un script de `curl` porque hay
gente del equipo en Windows.

Lo que se comprueba no es que el endpoint responda 200:

- **Permisos cruzados:** que un propietario reciba 403 al pedir la ficha de otro.
- **Coherencia entre módulos:** que el conteo de morosos del panel sea el mismo
  que el del reporte de cuotas.
- **Concurrencia:** dos reservas simultáneas del mismo hueco.
- **Rutas de error:** que sin credenciales el checkout falle con el mensaje
  correcto.
- **Bytes reales:** que el PDF empiece por `%PDF` y el CSV lleve BOM.

Cada suite deja la base como la encontró.

**Verificación en navegador.** Además, cada módulo se comprobó en un navegador
real (Chromium headless): guards por rol, formularios contra la API, subidas de
archivo y errores del backend visibles en pantalla. Varios problemas se
descubrieron **solo al mirar la captura**: la barra lateral invisible por orden
de CSS, las reservas en orden inverso, y `text-transform: capitalize`
produciendo "Lunes, 14 De Septiembre".

---

## 9. Frontend

### Tailwind se queda aunque no se use ninguna clase

Hay cero clases de utilidad de Tailwind en el proyecto, pero `@tailwind base`
(Preflight) es **el único reset CSS que existe**: no hay `body { margin: 0 }` ni
`box-sizing` en ninguna otra parte. Quitarlo desplazaría toda la interfaz.

Se mantienen las directivas y se sigue escribiendo CSS a mano, que es lo que
hace el 100% del código.

### Especificidad en lugar de orden

Las reglas de escritorio duplican la clase (`.sidemenu-drawer.sidemenu-drawer`)
para ganarle a `main.css` sin depender del orden en que Vite concatene las
hojas. Con especificidad igual, `main.css` a veces quedaba después y la barra
lateral anclada no se aplicaba.

### La cola de refresh es compartida

El backend **rota** el refresh token en cada uso, así que dos renovaciones en
paralelo se invalidan entre sí y cierran la sesión de un usuario válido. Pasa en
dos situaciones: varias peticiones caducando a la vez, y el arranque de la app
—porque StrictMode monta los efectos dos veces en desarrollo—. Ambas comparten
la misma promesa.

### Sin librería de gráficas

La distribución de lotes se dibuja con tres `<span>` de ancho porcentual. Traer
Chart.js o Recharts (150–400 KB) para tres números, en un bundle que ya avisa
por tamaño, sería desproporcionado. Lleva `role="img"` y `aria-label`.

### Fechas en UTC

`mes_anio` y `fecha` son fechas sin hora. En México (UTC−6/−7),
`new Date('2026-08-05')` se interpreta como las 18:00 del 4 de agosto y se
mostraría **un día antes**. Todos los formateadores pasan `timeZone: 'UTC'`.

---

## 10. Diferencias respecto al diseño original

| Punto | Decisión | Motivo |
|---|---|---|
| Rutas `/lotes`, `/cuotas`, `/areas` sueltas | Anidadas bajo los ocho prefijos que ya montaba `server.js` | Los mounts ya estaban en `main` |
| `cuotas.mes_año` | `mes_anio`, sin `ñ` | Un identificador acentuado obliga a entrecomillarlo en cada consulta |
| `pagos.pdf_url` | Se conserva, siempre `NULL` | El recibo se genera bajo demanda; el plan gratuito no tiene disco persistente |
| `tipo_visita` con 3 valores | Se añade `residente` | Una entrada por QR no es visita, delivery ni servicio |
| `documentos` con 5 columnas | Se añaden `nombre_archivo`, `mime_type`, `tamano_bytes` | Multer renombra a UUID; sin ellas la descarga no puede devolver el nombre ni el `Content-Type` correctos |
| `comunicados.canales` | Se añade `resultado_envio` | Separa lo que se pidió de lo que pasó, sin una tabla de destinatarios |
| "Cuota por propietario **activo**" | Se cobra a quien tiene lote vendido | `propietarios` no tiene columna `activo`, y es la regla que ya usaba el cron |
| Web Push **o** Socket.io | Solo Socket.io | Web Push exige VAPID, service worker y origen HTTPS |
| Mapa con Leaflet en Propietarios | Eliminado | Ni `propietarios` ni `lotes` tienen coordenadas: nunca podría alimentarse con datos reales. El mapa del producto es el plano SVG de lotes |
| Registro público de usuarios | No existe | El administrador da de alta al propietario y el sistema le crea la cuenta |

---

## 11. Limitaciones conocidas

- **Los documentos se pierden al desplegar.** Van a disco local y en
  Railway/Render el sistema de archivos es efímero. Migrar a S3 solo tocaría
  `upload.middleware.js` y el contenido de `url_archivo`.
- **WhatsApp en frío necesita plantilla aprobada.** Sin
  `META_TEMPLATE_NAME`, Meta responde 200 y el mensaje no llega.
- **La cookie de refresh tiene `sameSite: 'strict'`.** Funciona en local, pero
  si en producción el cliente y la API quedan en dominios distintos habrá que
  cambiarla a `none` con `secure: true`.
- **No hay recuperación de contraseña por correo.** Requiere un token de un solo
  uso; por ahora la restablece la administración.
- **No hay linter configurado.** El estilo es convención: CommonJS en el
  servidor, sin punto y coma, comillas simples, dos espacios.
