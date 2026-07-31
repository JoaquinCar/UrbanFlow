# PR 4 — Cuotas, Pagos, recibos PDF y MercadoPago

**Responsable:** Jorge Ruiz · **Módulo:** Cuotas + Pagos + PDF (Fase 2, semanas 3–6)

El módulo financiero: estado de cuenta, cobro manual en caja, pago en línea con
MercadoPago, recibos en PDF, cuotas extraordinarias y reporte de morosidad.

---

## 1. Endpoints — `/api/pagos`

| Método | Ruta | Rol | Notas |
|---|---|---|---|
| POST | `/webhook` | **ninguno** | MercadoPago. Se valida con firma HMAC |
| GET | `/cuotas` | admin | Listado con resumen de montos |
| GET | `/cuotas/mias` | propietario | Estado de cuenta propio |
| GET | `/cuotas/:propietarioId` | admin | Estado de cuenta de un propietario |
| POST | `/cuotas` | admin | Cuota extraordinaria (a uno o a todos) |
| POST | `/cuotas/generar` | admin | Dispara a mano lo que hace el cron |
| PUT/DELETE | `/cuotas/:id` | admin | Editar / eliminar |
| GET | `/morosos` | admin | Reporte de morosidad |
| POST | `/checkout` | propietario, admin | Crea preferencia de MercadoPago |
| POST | `/manual` | admin | Cobro en efectivo o transferencia |
| GET | `/` | admin | Historial de pagos |
| GET | `/:id/pdf` | admin, propietario (suyo) | Recibo |

`POST /webhook` se registra **antes** de `router.use(authGuard)`: quien llama es
MercadoPago, no un usuario con sesión.

---

## 2. El estado "vencido" se calcula, no se espera

Una cuota está vencida cuando sigue pendiente y su mes ya pasó. Eso se resuelve
en la consulta:

```sql
CASE WHEN c.estado = 'pendiente' AND c.mes_anio < date_trunc('month', CURRENT_DATE)
     THEN 'vencido' ELSE c.estado::text END AS estado_actual
```

Depender de que un job voltee el enum a tiempo significaría que, si el cron no
corrió, el propietario vería como "pendiente" algo que lleva tres meses
vencido. Calcularlo hace el dato correcto siempre.

`POST /cuotas/generar` **además** sincroniza el enum almacenado, para que la
columna no mienta si alguien la consulta directamente en la base.

### Un bug que salió de esa doble representación

El reporte de morosos filtraba `estado = 'pendiente'`. Funcionaba… hasta que se
llamaba a `/cuotas/generar`, que marca las atrasadas como `'vencido'` — y
entonces **el reporte se vaciaba**, justo después de la acción que debería
poblarlo.

La corrección es aceptar los dos estados, porque una cuota atrasada puede estar
en cualquiera de ellos según si el job ya corrió:

```sql
AND c.estado IN ('pendiente', 'vencido')
AND c.mes_anio < date_trunc('month', CURRENT_DATE)
```

Lo mismo aplicaba al resumen de montos: para el administrador, pendiente y
vencido son igualmente dinero por cobrar. Hay una prueba de regresión concreta
para esto (`los morosos siguen apareciendo tras marcar las cuotas vencidas`).

---

## 3. MercadoPago

### La firma del webhook

Sin validarla, **cualquiera que conozca la URL podría marcar cuotas como
pagadas** mandando un POST. El manifiesto que firma MercadoPago es literalmente:

```
id:<data.id>;request-id:<x-request-id>;ts:<ts>;
```

y se compara con `crypto.timingSafeEqual` para no filtrar información por el
tiempo que tarda la comparación. Un detalle fácil de pasar por alto: MercadoPago
exige `data.id` **en minúsculas** cuando es alfanumérico.

Esto se puede verificar **sin credenciales de MercadoPago**: el smoke test
calcula un HMAC válido con el secreto local y comprueba que el endpoint no
responde 401. Eso demuestra que el manifiesto se construye igual que del otro
lado.

### El estado se lee de la API, no del aviso

La notificación solo dice "algo pasó con el pago X"; su contenido no está
firmado campo por campo. Por eso el flujo es: validar firma → **leer el pago con
la API** → aceptar solo si `status === 'approved'`.

### Idempotencia: la migración 010

MercadoPago **reintenta** las notificaciones. La migración 003 indexaba
`referencia_mp` pero sin `UNIQUE`, así que cada reintento habría insertado otra
fila en `pagos` y la cuota aparecería pagada dos o tres veces.

La 010 lo convierte en índice único parcial y el webhook usa:

```sql
INSERT INTO pagos (...) VALUES (...)
ON CONFLICT (referencia_mp) WHERE referencia_mp IS NOT NULL DO NOTHING
```

Es parcial porque los pagos en efectivo y transferencia no tienen referencia.

### El índice se pasó de estricto (migración 011)

La 010 puso la condición `WHERE referencia_mp IS NOT NULL`. El problema es que
esa columna **también** guarda la referencia de los cobros manuales: un folio de
caja o un número de transferencia. Y esos sí se repiten legítimamente entre
propietarios y periodos.

El resultado era que el segundo cobro en efectivo con el mismo folio reventaba
con `duplicate key value violates unique constraint`.

La migración 011 acota el índice a `metodo = 'online'`, que es exactamente donde
importa la idempotencia, y añade un índice normal para poder buscar por
referencia en los cobros de caja.

**Este fallo solo apareció al correr la suite completa**, no la de pagos
aislada: hacía falta que dos cobros manuales distintos usaran el mismo folio.
Es un buen argumento para ejecutar todas las suites juntas antes de cada PR.

### Códigos de respuesta del webhook

- Firma inválida → **401**. Es el único caso en que queremos que MercadoPago
  sepa que rechazamos el aviso.
- Cualquier otro error → **200**, tras registrarlo en el log. Devolver 5xx ante
  un error permanente nuestro haría que MercadoPago reintentara indefinidamente.

### Sin credenciales

`POST /checkout` responde `500 {"error": "MP_ACCESS_TOKEN no configurado…"}`.
No hay modo simulado: un pago falso que parece exitoso es peor que un error
claro. El smoke test **asserta esa ruta de error** en vez de saltarse la prueba.

Para probarlo de verdad hace falta un origen público: `ngrok http 3000` y
`PUBLIC_URL` apuntando ahí, porque `notification_url` y `auto_return` no admiten
`localhost`.

### La pantalla de retorno no confirma nada

`/pagos/exito` es solo informativa. El pago se da por bueno cuando llega el
webhook firmado, no cuando el navegador vuelve — esa URL la puede abrir
cualquiera escribiéndola a mano.

---

## 4. El recibo PDF

Se genera **en memoria** y se manda como buffer. No se hace `doc.pipe(res)`:

> Si el documento falla a mitad del stream, las cabeceras ya se enviaron y el
> navegador recibe un PDF truncado sin ningún mensaje. Con el buffer, cualquier
> fallo llega al `errorHandler` y el cliente recibe un JSON claro.

Tampoco se guarda en disco. El spec lo pide explícitamente porque el plan
gratuito de Railway/Render no tiene almacenamiento persistente. Por eso
**`pagos.pdf_url` se queda siempre en `NULL`**: la columna existe en el esquema
documentado, pero el recibo se genera bajo demanda. Se mantiene en vez de
tirarla porque gastar una migración en eliminarla no aporta nada.

El pie del recibo dice explícitamente que **no es un CFDI**. Un documento que
parece fiscal sin serlo causa problemas reales a quien lo recibe.

---

## 5. Cuotas extraordinarias

Se pueden asignar a un propietario o a **todos** de golpe, en una transacción.
"Todos" significa quienes tienen lote vendido — la misma regla que usa el cron
para decidir quién paga.

El índice único de cuotas mensuales es **parcial** (`WHERE tipo = 'mensual'`),
así que varias extraordinarias del mismo mes con conceptos distintos conviven
sin chocar. Ese detalle del esquema es lo que hace posible esta funcionalidad
sin tocar la base.

---

## 6. Aislamiento y permisos

`pagos` no tiene `fraccionamiento_id`. El aislamiento va siempre por
`JOIN cuotas c ON c.id = pg.cuota_id WHERE c.fraccionamiento_id = $1`, aislado en
la constante `JOIN_PAGO_TENANT`.

Dos comprobaciones de propiedad, no solo de rol:

- `crearPreferencia`: un propietario solo puede pagar **sus** cuotas.
- `recibo`: un propietario solo descarga **sus** recibos.

*Nota de la verificación:* la primera versión del smoke test reportó que un
propietario podía descargar un recibo ajeno. Era un fallo de la prueba — la
cuota que había pagado resultó ser suya, así que el 200 era correcto. Se
corrigió eligiendo deliberadamente la cuota de otro propietario.

---

## 7. Frontend

**`portal/EstadoCuenta.jsx`** — reemplaza a `Payments.jsx`, que era una copia
literal de `Access.jsx` (su componente de tarjeta seguía llamándose `AccessCard`,
el modal de detalle decía "Código QR" y las tres filas mock compartían `id: 1`).

Tarjeta de saldo que cambia de color según haya deuda, cuotas separadas en "por
pagar" e "historial", botón de pago que abre MercadoPago y descarga de recibo.

**`admin/Cuotas.jsx`** — tres pestañas: Cuotas (con cobro en caja), Morosos y
Pagos. Más creación de extraordinarias y disparo manual de la generación
mensual.

Un detalle de fechas: `mes_anio` es siempre el día 1 del mes, y se formatea con
`timeZone: 'UTC'`. Sin eso, en México (UTC−6/−7) `new Date('2026-07-01')` se
interpreta como las 18:00 del 30 de junio y el periodo se mostraría **un mes
antes**.

---

## Cómo probarlo

```bash
cd server && npm run migrate && npm run seed && npm run dev
npm run smoke -- --only=payments    # 26 comprobaciones
cd ../client && npm run dev
```

Como `propietario@urbanflow.test`, en **Mi estado de cuenta**:
1. Saldo pendiente con el desglose de vencido.
2. Seis meses de historial con recibo descargable en PDF.
3. "Pagar" sin credenciales de MercadoPago avisa con el mensaje exacto de qué
   falta configurar.

Como `admin@urbanflow.test`, en **Cuotas y pagos**:
1. Tabla con resumen cobrado/pendiente.
2. "Cobrar" en una cuota pendiente → registrar efectivo → queda pagada.
3. Pestaña **Morosos** con el adeudo calculado.
4. Pestaña **Pagos** con descarga de recibo.
5. "Cuota extraordinaria" para todos los propietarios con lote.

Para probar MercadoPago de verdad: credenciales de prueba en `MP_ACCESS_TOKEN` y
`MP_WEBHOOK_SECRET`, `ngrok http 3000`, y `PUBLIC_URL` con la URL de ngrok.

Verificado con 26 comprobaciones de API y 14 en navegador real.
