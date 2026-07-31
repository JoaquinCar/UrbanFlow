# Guion de pruebas de extremo a extremo

Recorrido manual por los cuatro roles. Sirve tanto para verificar la aplicación
como de guion para la demostración.

**Duración estimada:** 15 minutos el recorrido completo.

---

## Preparación

```bash
docker compose up -d
npm run migrate --workspace=server
npm run seed --workspace=server        # deja la base en un estado conocido
npm run dev:server                     # terminal 1
npm run dev:client                     # terminal 2
```

Antes de empezar, las pruebas automáticas:

```bash
npm run smoke --workspace=server       # debe dar 167 ok, 0 fallos
```

> Vuelve a ejecutar `npm run seed` antes de la demostración: las pruebas
> automáticas dejan algunas visitas de prueba en la bitácora.

Contraseña de todos los usuarios: **`UrbanFlow2026!`**

---

## 1 · Administrador — `admin@urbanflow.test`

### 1.1 Panel de administración
Al iniciar sesión aterriza aquí.

- [ ] Siete métricas con cifras reales: 25 lotes, 10 propietarios, cobrado del
      mes, por cobrar, visitas de hoy, tickets abiertos, reservas próximas.
- [ ] La barra de ocupación coincide con la leyenda (vendidos + en proceso +
      disponibles = total).
- [ ] "Mayores adeudos" lista propietarios con importe.
- [ ] Pulsar la métrica **Lotes** navega a `/lotes`.

### 1.2 Lotes
- [ ] 25 registros con estado, superficie, precio y propietario.
- [ ] Filtrar por **Vendido**: solo aparecen los que tienen propietario.
- [ ] Buscar `A-0`: filtra contra la API.
- [ ] **Nuevo lote** → número `DEMO-01` → se crea como *Disponible*.
- [ ] Crear otra vez `DEMO-01` → error *"Ya existe el lote DEMO-01…"*.
- [ ] Eliminar `DEMO-01`.

### 1.3 Mapa
- [ ] 25 figuras coloreadas según su estado.
- [ ] Los conteos de la leyenda cuadran con la tabla de Lotes.
- [ ] Click en un lote azul (vendido) → detalle con nombre y teléfono reales.
- [ ] Navegar con **Tab** hasta un lote y activarlo con **Enter**.

### 1.4 Propietarios
- [ ] 10 registros con sus lotes.
- [ ] Buscar "María" → un resultado.
- [ ] Abrir un detalle → pestaña **Código QR**: se ve el código.
- [ ] **Regenerar** → el código cambia (el anterior deja de servir en la caseta).
- [ ] Pestaña **Documentos** → adjuntar un PDF → descargarlo (conserva el
      nombre original) → eliminarlo.
- [ ] Intentar subir un `.exe` → rechazado con mensaje claro.

### 1.5 Cuotas y pagos
- [ ] Resumen con cobrado y pendiente.
- [ ] **Cobrar** en una cuota pendiente → efectivo → queda *Pagado*.
- [ ] Pestaña **Morosos**: 3 propietarios con su adeudo.
- [ ] Pestaña **Pagos**: descargar un recibo → se abre un PDF con folio,
      concepto, periodo y total.
- [ ] **Cuota extraordinaria** para todos → se crea una por propietario.

### 1.6 Comunicados
- [ ] Aviso en amarillo indicando qué canales faltan por configurar.
- [ ] **Nuevo comunicado**: el botón dice a cuántos propietarios se enviará.
- [ ] Sin marcar canales → avisa antes de enviar.
- [ ] Enviar por correo sin credenciales → **el comunicado se guarda igual** y
      el historial muestra `Correo: 0/10` en rojo.

### 1.7 Áreas comunes
- [ ] Pestaña **Áreas**: 4 áreas con capacidad.
- [ ] Crear "Gimnasio" → desactivarla → intentar borrar una con reservaciones →
      sugiere desactivarla.
- [ ] Pestaña **Reservaciones**: confirmar una pendiente.

### 1.8 Mantenimiento
- [ ] 6 tickets, los abiertos arriba.
- [ ] Asignar un técnico a uno abierto → pasa a **En proceso** solo.
- [ ] El selector muestra la carga de cada técnico (`0 activos`).

---

## 2 · Vigilante — `vigilante@urbanflow.test`

Aterriza directamente en la **Caseta**.

### 2.1 Caseta
- [ ] Indicador **En vivo** en verde (Socket.io conectado).
- [ ] 3 visitas dentro, con tipo, lote, placa y tiempo relativo.
- [ ] **Registrar entrada** → elegir lote, nombre y placa → aparece al instante.
- [ ] **Salida** en esa tarjeta → desaparece de la lista.

### 2.2 Entrada por QR
Necesita cámara y `localhost` o HTTPS.

- [ ] Desde otro dispositivo o pestaña, abrir el QR de un propietario
      (Propietarios → detalle → Código QR).
- [ ] **Escanear QR** en la caseta → mostrar el código → pantalla verde
      *"Acceso autorizado"* con el nombre y el lote del residente.
- [ ] Aparece en "Dentro ahora" con la etiqueta **Residente**.

### 2.3 En tiempo real
- [ ] Abrir la caseta en **dos ventanas**. Registrar una entrada en una: la otra
      se actualiza sola, sin recargar.

### 2.4 Bitácora
- [ ] ~45 accesos de los últimos 30 días.
- [ ] Filtrar por **Entrega**.
- [ ] **Exportar CSV** → abrirlo en Excel: los acentos se ven bien
      ("Registró", "Paquetería").

### 2.5 Permisos
- [ ] El menú **no** muestra Lotes, Propietarios ni Cuotas.
- [ ] Escribir `/cuotas` en la barra de direcciones → rebota.

---

## 3 · Propietario — `propietario@urbanflow.test`

### 3.1 Portal
- [ ] Su nombre y sus lotes reales.
- [ ] Saldo pendiente con el desglose de vencido.
- [ ] Próximas reservas en orden cronológico.
- [ ] Visitas recientes a su lote.
- [ ] Cuatro accesos rápidos que navegan a sus módulos.

### 3.2 Mi acceso
- [ ] **Mi código QR**: el mismo que acepta la caseta. Descargable.
- [ ] **Historial de visitas**: las visitas a sus lotes, no las de todos.

### 3.3 Estado de cuenta
- [ ] Cuotas separadas en "Por pagar" e "Historial".
- [ ] Descargar el recibo de una cuota pagada.
- [ ] **Pagar** sin credenciales de MercadoPago → mensaje explícito de qué falta
      configurar.

### 3.4 Reservar área
- [ ] **Reservar un área** → calendario con las franjas ocupadas en gris,
      deshabilitadas y con el nombre de quien reservó.
- [ ] Tocar dos horas → el resumen confirma el rango en texto.
- [ ] Confirmar → aparece como *Pendiente*.
- [ ] Intentar una franja que se solape → error diciendo **con qué** choca.
- [ ] Cancelar una reserva → el horario vuelve a estar libre.

### 3.5 Mantenimiento
- [ ] **Mis reportes** → reportar una incidencia → nace *Abierto* y *Sin
      asignar*.
- [ ] No tiene controles para cambiar el estado ni asignar técnico.

### 3.6 Permisos
- [ ] El menú no muestra Lotes, Mapa, Propietarios, Cuotas ni Comunicados.
- [ ] `/owners`, `/cuotas` y `/caseta` rebotan.

---

## 4 · Técnico — `tecnico@urbanflow.test`

- [ ] Aterriza en **Mis asignaciones**.
- [ ] Solo ve los tickets que le asignaron, no los seis.
- [ ] **No** ve quién reportó cada uno.
- [ ] Marcar uno como **Resuelto** → se registra la fecha de resolución.
- [ ] Volver a abrirlo → la fecha de resolución desaparece.
- [ ] El menú solo muestra Mantenimiento, Avisos y Configuración.

---

## 5 · Transversal

### 5.1 La sesión sobrevive
- [ ] Con sesión iniciada, pulsar **F5**: sigue dentro, en la misma pantalla.
- [ ] Cerrar sesión → `/dashboard` rebota al login.

### 5.2 Cambio de contraseña
- [ ] Configuración → **Cambiar contraseña**.
- [ ] Con la actual incorrecta → error.
- [ ] Con una nueva de menos de 8 caracteres → error.
- [ ] Correcta → cierra la sesión y pide iniciar de nuevo.

### 5.3 Responsive
- [ ] En escritorio (≥768px): barra lateral anclada, sin botón hamburguesa.
- [ ] Reducir a menos de 768px: vuelve el hamburguesa y el menú se desliza.
- [ ] La caseta y el portal se usan cómodamente en un móvil.

### 5.4 Aislamiento entre fraccionamientos
- [ ] Iniciar sesión como `admin2@urbanflow.test` (Jardines del Sol).
- [ ] Ve **15 lotes**, no 40, y **cero propietarios**.
- [ ] Copiar el UUID de un lote de Las Palmas y pedirlo por URL → 404.

### 5.5 Ruta inexistente
- [ ] `/una-ruta-cualquiera` → pantalla 404 con botón de vuelta.

---

## Con credenciales reales

Estas tres partes necesitan configuración externa y no se pueden probar en
local sin ella.

### MercadoPago
1. Credenciales de prueba en `MP_ACCESS_TOKEN` y `MP_WEBHOOK_SECRET`.
2. `ngrok http 3000` y poner la URL en `PUBLIC_URL`.
3. Registrar `<PUBLIC_URL>/api/pagos/webhook` en el panel de MercadoPago.
4. Como propietario: **Pagar** → redirige al checkout → pagar con una tarjeta de
   prueba → al volver, la cuota aparece como pagada (la confirma el webhook, no
   el retorno del navegador).

### Correo
`SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_USER` y una **App Password**
de Google (requiere verificación en dos pasos). Enviar un comunicado por correo
y comprobar que llega con el formato de la plantilla.

### WhatsApp
`META_PHONE_NUMBER_ID` y `META_ACCESS_TOKEN` del número de prueba de Meta, con
los destinatarios en lista blanca.

> ⚠️ Sin `META_TEMPLATE_NAME` con una plantilla aprobada, Meta responde **200**
> y el mensaje **no llega**. Para la demostración, o se configura la plantilla o
> se usan números que hayan escrito al número de prueba en las últimas 24 horas.
