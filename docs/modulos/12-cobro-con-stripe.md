# Cobro en línea: por qué se dejó de usar Vexor

Con las credenciales reales en la mano, el checkout resultó estar roto de tres
formas distintas. Las tres pasaban desapercibidas porque la prueba solo
comprobaba que se devolviera **una URL**.

## Qué pasaba

El módulo creaba la sesión de pago con el SDK de [Vexor](https://vexorpay.com),
una capa que envuelve a Stripe:

```js
const response = await vexor.pay.stripe({
  items: [{ id: cuota.id, title: ..., quantity: 1, unit_price: Number(cuota.monto) }],
  options: { successRedirect: ..., failureRedirect: ... },
})
```

Devolvía una URL de `checkout.stripe.com` perfectamente funcional. Pero al
recuperar esa sesión de Stripe con nuestra propia clave, aparecía esto:

```json
{
  "currency": "usd",
  "amount_total": 250000,
  "client_reference_id": null,
  "metadata": { "identifier": "91ce6738-aced-4cd0-9990-29e547a375b2" },
  "success_url": "http://localhost:5173/pagos/exito"
}
```

### 1. Cobraba en dólares

Una cuota de **$2,500 MXN** se cobraba como **$2,500 USD** — unas 20 veces de
más. `VexorPaymentBody.options` sí admite `currency`, pero el código no la
enviaba, y Stripe no hereda la moneda por defecto de la cuenta: usa la que se le
diga en `price_data`.

### 2. El pago nunca se habría registrado

Esta es la grave. `client_reference_id` viene `null` y la metadata solo trae el
identificador interno de Vexor. Pero el webhook resuelve la cuota así:

```js
const cuotaId = session.client_reference_id || session.metadata?.cuota_id
if (!cuotaId) return { ignorado: true, motivo: 'sin client_reference_id' }
```

Es decir: el residente paga, Stripe cobra de verdad, avisa por webhook, y el
sistema **descarta el aviso**. La cuota se queda en «pendiente» y el dinero ya
salió. El fallo peor posible en un módulo de cobros — falla en silencio y en
contra del usuario.

La interfaz de Vexor no ofrece forma de adjuntar datos propios a la sesión: el
único asidero que devuelve es su `identifier`. Conciliar por ahí habría exigido
una tabla nueva que mapeara identificador → cuota.

### 3. Las URLs de retorno apuntaban a localhost

Tras pagar, el residente habría acabado en `http://localhost:5173` — su propia
máquina. Esto venía de la configuración, no del SDK, pero se arregla igual.

## Qué se hizo

Crear la sesión hablando con Stripe directamente. `payments.vexorpay.js` pasó a
ser `payments.stripe.js`:

```js
const session = await stripe.checkout.sessions.create({
  mode: 'payment',
  client_reference_id: cuota.id,
  metadata: { cuota_id: cuota.id },
  payment_intent_data: { metadata: { cuota_id: cuota.id } },
  line_items: [{ quantity: 1, price_data: {
    currency: moneda, unit_amount: Math.round(Number(cuota.monto) * 100), product_data: {...},
  }}],
  success_url: urlRetorno('STRIPE_BACK_URL_SUCCESS', '/pagos/exito'),
  cancel_url: urlRetorno('STRIPE_BACK_URL_FAILURE', '/pagos/error'),
})
```

**Es menos código, no más.** Vexor no aportaba nada aquí: cobraba sobre nuestra
propia cuenta de Stripe con nuestras propias claves, así que era un intermediario
entre nosotros y una API que ya sabíamos usar. De hecho el webhook **ya** se
validaba con el SDK de Stripe directamente, sin pasar por Vexor — el diseño
estaba a medias, y esto lo termina de un lado en vez del otro.

Detalles que importan:

- **El id de la cuota viaja por duplicado.** En `client_reference_id`, que llega
  en `checkout.session.completed`, y en la metadata del payment intent, que llega
  en `payment_intent.payment_succeeded`. El webhook acepta los dos eventos, así
  que los dos tienen que poder resolver la cuota por su cuenta.
- **`unit_amount` va en centavos.** El monto sale de Postgres como `NUMERIC`, que
  `node-postgres` entrega como *cadena*; de ahí el `Math.round(Number(...) * 100)`.
- **`urlRetorno()` deriva las URLs de `CLIENT_URL`** si no están puestas, y lanza
  un 500 explícito si no hay de dónde sacarlas. Es preferible negarse a crear el
  cobro que mandar al residente a una URL rota después de pagarle a Stripe.

Se quitó la dependencia `vexor` del `package.json`, que ya no importa nadie.

## La lección: qué probaba la prueba

La suite daba **27 de 27 en verde** con las tres cosas rotas. La comprobación
era:

```js
check('checkout devuelve una URL de pago',
  r18.status === 201 && !!(r18.data.init_point || r18.data.url), r18.data)
```

Comprobaba que el endpoint **respondiera**, no que hiciera lo correcto. Con una
integración externa esa distinción es todo: la API remota contesta `200` a
peticiones mal formadas siempre que sean válidas *para ella*.

Ahora se recupera la sesión de Stripe y se comprueba lo que va a pasar de
verdad:

```js
check('la sesión de Stripe cobra en la moneda configurada', ...)
check('la sesión de Stripe cobra el monto de la cuota', ...)
check('la sesión de Stripe referencia la cuota, para poder conciliarla', ...)
check('las URLs de retorno no apuntan a una máquina local', ...)
```

Y, sobre todo, se prueba **el webhook con firma válida**, que es el que cobra:

```js
function firmaStripe(cuerpo, secreto) {
  const t = Math.floor(Date.now() / 1000)
  const v1 = crypto.createHmac('sha256', secreto).update(`${t}.${cuerpo}`).digest('hex')
  return `t=${t},v1=${v1}`
}
```

Antes solo se comprobaba que una firma **falsa** se rechazara. Eso protege
contra un atacante, pero no dice nada sobre si un pago real se registra. Las
tres pruebas nuevas cubren el camino feliz, el estado resultante de la cuota, y
que un reintento de Stripe no genere un pago duplicado.

De 27 comprobaciones a 34 en este módulo; 190 en total.

## Lo que sigue pendiente

- **Dar de alta el endpoint del webhook en el panel de Stripe**, apuntando a
  `https://urbanflowfullstack.duckdns.org/api/pagos/webhook`, y poner el
  `STRIPE_WEBHOOK_SECRET` que genere. La firma se valida contra ese secreto, y
  el que hay ahora es de otro endpoint.
- **`STRIPE_BACK_URL_*` con el dominio de producción**, no con localhost.
- Las claves son de **prueba** (`sk_test_`). Para cobrar de verdad hacen falta
  las `sk_live_`, y Stripe exige verificar la cuenta antes de darlas.
- `payments.mercadopago.js` quedó sin usar desde que se cambió de proveedor. No
  se borra en este cambio para no mezclar temas, pero es código muerto.
