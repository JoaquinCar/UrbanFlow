# PR 6 — Comunicados por email y WhatsApp

**Responsable:** Joaquín Carmona · **Módulo:** Comunicados (Fase 3, semanas 7–8)

Difusión de avisos de la administración a los residentes por correo y WhatsApp,
con historial de lo que se envió y a quién llegó.

---

## 1. Endpoints — `/api/comunicados`

| Método | Ruta | Rol | Notas |
|---|---|---|---|
| GET | `/webhook` | **ninguno** | Verificación de Meta |
| GET | `/canales` | admin | Qué proveedores están configurados |
| GET | `/destinatarios` | admin | Conteo por canal, para la vista previa |
| GET | `/mios` | cualquiera | Tablón de avisos del residente |
| GET | `/` | admin | Historial con resultado de envío |
| POST | `/` | admin | Crear y enviar |
| GET/DELETE | `/:id` | admin | Detalle / eliminar |

---

## 2. ⚠️ La trampa de WhatsApp que hay que conocer

**Meta solo entrega mensajes de texto libre dentro de una ventana de 24 horas**
de atención al cliente, es decir, si el residente escribió primero al número del
negocio.

Un comunicado en frío a vecinos que nunca han escrito **necesita una plantilla
aprobada por Meta**. Sin ella:

> La API responde **200 OK** y el mensaje **nunca llega**.

Es el peor modo de fallo posible: todo parece haber funcionado. En una demo,
esto significa asegurar que se enviaron 10 WhatsApps que nadie recibió.

Por eso existe `META_TEMPLATE_NAME`:
- **Vacío** → mensaje de texto libre. Solo sirve con el número de prueba de Meta,
  que permite 5 destinatarios en lista blanca.
- **Configurado** → mensaje de plantilla, que sí se entrega en frío.

La interfaz avisa de esto explícitamente cuando detecta que Meta está
configurada pero falta la plantilla.

El spec original describía el envío como "un bucle de `POST /messages` con
texto". Es correcto a nivel de API, pero silenciosamente no funciona para un
broadcast real.

---

## 3. Envío secuencial, no en paralelo

```js
for (const numero of numeros) {
  await enviarUno(...)
  await espera(250)
}
```

Meta limita las ráfagas por número emisor. Cuarenta peticiones simultáneas
acaban en un 429 masivo, así que se envía en serie con una pausa corta.

El correo sí va en lotes pequeños de 5 en paralelo, con pausa entre lotes: los
servidores SMTP toleran algo de concurrencia pero cierran la conexión ante
ráfagas grandes.

En ambos casos, **un fallo individual no aborta el resto**: los errores se
acumulan en el resultado. Que un número esté mal escrito no debe impedir que los
otros 39 residentes reciban el aviso.

Los reintentos son solo para lo transitorio (429 y 5xx). Un 400 por número
inválido no mejora reintentándolo.

---

## 4. El registro se guarda antes de enviar

```js
// 1. INSERT del comunicado
// 2. enviar por cada canal
// 3. UPDATE con el resultado
```

Deliberadamente **no** es una transacción. Si el SMTP falla a la mitad, queda
constancia de que se intentó y de a quién llegó. Un `ROLLBACK` borraría justo la
información que hace falta para saber a quién hay que volver a avisar.

Y un fallo de configuración de un canal no tumba la petición: se registra como
resultado de ese canal y el otro sigue su curso. El administrador ve
"Correo: 0/3 · WhatsApp: 3/3" en vez de un error genérico.

---

## 5. `resultado_envio`: una columna que no estaba en el esquema

`db-schema.md` solo define `canales JSONB`. Se añadió `resultado_envio JSONB`
para separar dos cosas distintas:

- `canales` — lo que se **pidió**: `{ "email": true, "whatsapp": false }`
- `resultado_envio` — lo que **pasó**: intentados, enviados, fallidos y el
  detalle de los errores, por canal.

La alternativa era una tabla de destinatarios con una fila por envío. Para un
fraccionamiento de 40 propietarios eso es mucha maquinaria para poder mostrar
"38 enviados, 2 fallidos" en una pantalla de historial.

---

## 6. Dos vistas de lo mismo

- `GET /` (admin) — incluye `resultado_envio` y el autor. Sirve para auditar.
- `GET /mios` (residente) — solo título, cuerpo, fecha y autor.

Un residente no tiene por qué saber que el correo de su vecino rebotó. La
separación se hace en la consulta, no ocultando campos en el frontend.

---

## 7. El webhook de verificación de Meta

```js
if (modo === 'subscribe' && token === process.env.META_VERIFY_TOKEN) {
  return res.status(200).send(String(challenge))
}
res.sendStatus(403)
```

Va **antes** de `authGuard`: quien llama es Meta durante el alta de la
suscripción, no un usuario. Se autentica comparando `hub.verify_token` con el
valor configurado.

Detalle: Meta espera el challenge en **texto plano**, no envuelto en JSON.
`res.send(String(challenge))` y no `res.json(...)`.

---

## 8. Se avisa antes, no después

`GET /canales` devuelve qué proveedores están configurados, y la pantalla
muestra el aviso **antes** de que el administrador escriba nada:

> El correo no está configurado (faltan `SMTP_HOST` y `SMTP_USER`).

Descubrir que falta una variable de entorno después de redactar un comunicado
largo y pulsar "Enviar" es una mala experiencia evitable.

---

## 9. `Message.jsx` por fin acepta props

El componente traía dentro un array fijo con avisos inventados en inglés
("Appointment Success", "You have successfully booked your appointment with
Dr. Emily Walker") y **no aceptaba ninguna prop**, así que era imposible
alimentarlo con datos reales.

Ahora recibe `items`, `cargando`, `error` y `vacio`. También se añadió el estilo
`.notification-icon--aviso` que faltaba: los tipos `alert` e `inform` del mock
antiguo no tenían color definido y se veían como círculos vacíos.

`Notifications.jsx` pasa de renderizar el mock a leer `/comunicados/mios`.

---

## 10. Escapado del HTML del correo

El título y el cuerpo los escribe un administrador, pero se escapan igual antes
de meterlos en la plantilla HTML. No hay razón para permitir que un `<` rompa el
correo, y el coste de escaparlo es nulo.

---

## Cómo probarlo

```bash
cd server && npm run migrate && npm run dev
npm run smoke -- --only=comms     # 16 comprobaciones
cd ../client && npm run dev
```

Como `admin@urbanflow.test` → **Comunicados**:
1. Aparece el aviso de qué canales faltan por configurar.
2. "Nuevo comunicado": el botón dice a cuántos propietarios se enviará.
3. Sin marcar ningún canal, avisa antes de enviar.
4. Al enviar sin credenciales, **el comunicado se guarda igual** y el historial
   muestra `Correo: 0/3` en rojo con el error en el tooltip.

Como `propietario@urbanflow.test` → **Avisos**: ve el comunicado real, con quién
lo publicó, y **no** ve los detalles de entrega.

### Para probar el envío de verdad

**Correo** (Gmail): activar la verificación en dos pasos, generar una App
Password y poner `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_USER` y
`SMTP_PASS`.

**WhatsApp**: crear una app en Meta for Developers, tomar el
`META_PHONE_NUMBER_ID` y el token temporal del número de prueba, y añadir los
números destino a la lista blanca. Para un envío en frío hace falta además una
plantilla aprobada en `META_TEMPLATE_NAME`.

Verificado con 16 comprobaciones de API y 14 en navegador real.
