#!/usr/bin/env python3
"""Genera la colección de Bruno de UrbanFlow.

Se genera con un script y no a mano porque son ~80 peticiones: a mano es
seguro equivocarse en una ruta o en un token, y actualizar la colección cuando
cambie la API sería inviable.
"""
import json
import os
import shutil

RAIZ = 'bruno'

# ── helpers ────────────────────────────────────────────────────────────────

def escribir(ruta, contenido):
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    with open(ruta, 'w', encoding='utf-8') as f:
        f.write(contenido.rstrip() + '\n')


def carpeta(nombre, seq):
    return f"meta {{\n  name: {nombre}\n  seq: {seq}\n}}\n"


def peticion(nombre, seq, metodo, url, token=None, cuerpo=None,
             script=None, docs=None, form=None):
    partes = [f"meta {{\n  name: {nombre}\n  type: http\n  seq: {seq}\n}}\n"]

    tipo_cuerpo = 'none'
    if cuerpo is not None:
        tipo_cuerpo = 'json'
    elif form is not None:
        tipo_cuerpo = 'multipartForm'

    partes.append(
        f"{metodo} {{\n  url: {{{{baseUrl}}}}{url}\n"
        f"  body: {tipo_cuerpo}\n  auth: none\n}}\n"
    )

    # Los parámetros de consulta se declaran aparte para que Bruno los muestre
    # como campos activables en lugar de texto pegado en la URL.
    if '?' in url:
        _, qs = url.split('?', 1)
        lineas = []
        for par in qs.split('&'):
            if '=' in par:
                k, v = par.split('=', 1)
                lineas.append(f"  {k}: {v}")
        if lineas:
            partes.append("params:query {\n" + "\n".join(lineas) + "\n}\n")

    if token:
        partes.append(f"headers {{\n  Authorization: Bearer {{{{{token}}}}}\n}}\n")

    if cuerpo is not None:
        json_txt = json.dumps(cuerpo, indent=2, ensure_ascii=False)
        json_txt = "\n".join('  ' + l for l in json_txt.split('\n'))
        partes.append("body:json {\n" + json_txt + "\n}\n")

    if form is not None:
        lineas = "\n".join(f"  {k}: {v}" for k, v in form.items())
        partes.append("body:multipart-form {\n" + lineas + "\n}\n")

    if script:
        lineas = "\n".join('  ' + l for l in script.strip().split('\n'))
        partes.append("script:post-response {\n" + lineas + "\n}\n")

    if docs:
        lineas = "\n".join('  ' + l for l in docs.strip().split('\n'))
        partes.append("docs {\n" + lineas + "\n}\n")

    return "\n".join(partes)


# ── estructura ─────────────────────────────────────────────────────────────

if os.path.isdir(RAIZ):
    shutil.rmtree(RAIZ)

escribir(f'{RAIZ}/bruno.json', json.dumps({
    "version": "1",
    "name": "UrbanFlow",
    "type": "collection",
    "ignore": ["node_modules", ".git"],
}, indent=2))

escribir(f'{RAIZ}/environments/Local.bru', """vars {
  baseUrl: http://localhost:3000/api
}
""")

escribir(f'{RAIZ}/environments/Produccion.bru', """vars {
  baseUrl: https://CAMBIAR-POR-EL-DOMINIO/api
}
""")

# ── 1. Auth ────────────────────────────────────────────────────────────────
D = f'{RAIZ}/01 Auth'
escribir(f'{D}/folder.bru', carpeta('01 Auth', 1))

CAPTURA = """
if (res.getStatus() === 200) {
  bru.setEnvVar("%s", res.body.accessToken);
  bru.setEnvVar("%sId", res.body.user.id);
}
"""

for i, (rol, correo) in enumerate([
    ('admin', 'admin@urbanflow.test'),
    ('vigilante', 'vigilante@urbanflow.test'),
    ('propietario', 'propietario@urbanflow.test'),
    ('tecnico', 'tecnico@urbanflow.test'),
], start=1):
    var = 'token' + rol.capitalize()
    escribir(f'{D}/{i:02d} Login {rol}.bru', peticion(
        f'{i:02d} Login {rol}', i, 'post', '/auth/login',
        cuerpo={"email": correo, "password": "UrbanFlow2026!"},
        script=CAPTURA % (var, var),
        docs=f"""Inicia sesión como {rol} y guarda el token en la variable
`{var}`, que usan el resto de peticiones de la colección.

Devuelve además una cookie httpOnly `refreshToken` que Bruno conserva
automáticamente y que usa la petición de refrescar sesión.

**Ejecuta los cuatro logins antes que nada.** El resto de carpetas los
necesitan.""",
    ))

escribir(f'{D}/05 Yo (me).bru', peticion(
    '05 Yo (me)', 5, 'get', '/auth/me', token='tokenAdmin',
    docs="Datos del usuario dueño del token, incluido su `fraccionamiento_id`."))

escribir(f'{D}/06 Refrescar sesion.bru', peticion(
    '06 Refrescar sesion', 6, 'post', '/auth/refresh',
    docs="""Renueva el access token usando la cookie `refreshToken`.

No lleva cabecera Authorization: se identifica solo con la cookie.

El refresh token **rota** en cada uso: el anterior queda invalidado."""))

escribir(f'{D}/07 Cambiar contrasena.bru', peticion(
    '07 Cambiar contrasena', 7, 'post', '/auth/change-password', token='tokenAdmin',
    cuerpo={"passwordActual": "UrbanFlow2026!", "passwordNueva": "UrbanFlow2026!"},
    docs="""Cambia la contraseña del usuario autenticado.

Invalida el refresh token, así que cierra la sesión en todos los dispositivos.

Esta petición cambia la contraseña **por la misma**, a propósito: recorre todo
el camino sin dejar inservibles las credenciales del resto de la colección.

Si pones otra y luego no puedes entrar, restaura con:
`SEED_RESET_PASSWORDS=true npm run seed --workspace=server`"""))

escribir(f'{D}/08 Cerrar sesion.bru', peticion(
    '08 Cerrar sesion', 8, 'post', '/auth/logout',
    docs="Invalida el refresh token en la base y borra la cookie."))

# ── 2. Fraccionamiento, lotes y mapa ───────────────────────────────────────
D = f'{RAIZ}/02 Lotes y mapa'
escribir(f'{D}/folder.bru', carpeta('02 Lotes y mapa', 2))

escribir(f'{D}/01 Datos del fraccionamiento.bru', peticion(
    '01 Datos del fraccionamiento', 1, 'get', '/fraccionamiento', token='tokenAdmin',
    docs="Fraccionamiento al que pertenece el token. Nunca se pasa por parámetro: sale del JWT."))

escribir(f'{D}/02 Listar lotes.bru', peticion(
    '02 Listar lotes', 2, 'get', '/fraccionamiento/lotes?limit=200', token='tokenAdmin',
    script="""
if (res.getStatus() === 200 && res.body.items.length) {
  bru.setEnvVar("loteId", res.body.items[0].id);
  const vendido = res.body.items.find(l => l.propietario_id);
  if (vendido) {
    bru.setEnvVar("loteVendidoId", vendido.id);
    // También el propietario, para que "Asignar propietario" no dependa de
    // haber corrido antes la carpeta 03.
    bru.setEnvVar("propietarioId", vendido.propietario_id);
  }
}
""",
    docs="""Lista paginada con el nombre del propietario resuelto.

Guarda el primer lote en `loteId` para las peticiones siguientes.

Filtros disponibles: `estado`, `etapa`, `q` (busca por número o propietario),
`limit`, `offset`."""))

escribir(f'{D}/03 Listar lotes vendidos.bru', peticion(
    '03 Listar lotes vendidos', 3, 'get', '/fraccionamiento/lotes?estado=vendido', token='tokenAdmin',
    docs="Filtro por estado. Valores posibles: `disponible`, `proceso`, `vendido`."))

escribir(f'{D}/04 Buscar lote.bru', peticion(
    '04 Buscar lote', 4, 'get', '/fraccionamiento/lotes?q=A-0', token='tokenAdmin',
    docs="Búsqueda por número de lote o por nombre del propietario."))

escribir(f'{D}/05 Detalle de lote.bru', peticion(
    '05 Detalle de lote', 5, 'get', '/fraccionamiento/lotes/{{loteId}}', token='tokenAdmin',
    docs="Incluye los datos de contacto del propietario, o `null` si no tiene."))

escribir(f'{D}/06 Crear lote.bru', peticion(
    '06 Crear lote', 6, 'post', '/fraccionamiento/lotes', token='tokenAdmin',
    cuerpo={"numero": "DEMO-01", "etapa": "Etapa 1", "superficie_m2": 250,
            "precio": 990000, "svg_path_id": "lote-DEMO-01"},
    script="""
if (res.getStatus() === 201) bru.setEnvVar("loteCreadoId", res.body.id);
""",
    docs="""Solo admin. Nace en estado `disponible`.

`svg_path_id` conecta el lote con la figura del plano; si se omite se genera
como `lote-<numero>`."""))

escribir(f'{D}/07 Actualizar lote.bru', peticion(
    '07 Actualizar lote', 7, 'put', '/fraccionamiento/lotes/{{loteCreadoId}}', token='tokenAdmin',
    cuerpo={"precio": 1150000},
    docs="Actualización parcial: los campos que no se envían conservan su valor."))

escribir(f'{D}/08 Asignar propietario.bru', peticion(
    '08 Asignar propietario', 8, 'put', '/fraccionamiento/lotes/{{loteCreadoId}}/propietario',
    token='tokenAdmin', cuerpo={"propietario_id": "{{propietarioId}}"},
    docs="""Asignar un propietario marca el lote como `vendido` en la misma
operación, porque el cron de cuotas cobra según `estado = 'vendido'`.

Enviar `propietario_id: null` lo desasigna y lo devuelve a `disponible`.

Requiere haber ejecutado antes «Listar propietarios» para tener
`propietarioId`."""))

escribir(f'{D}/09 Eliminar lote.bru', peticion(
    '09 Eliminar lote', 9, 'delete', '/fraccionamiento/lotes/{{loteCreadoId}}', token='tokenAdmin',
    docs="Responde 204 sin cuerpo. Un lote con visitas registradas no se puede eliminar."))

escribir(f'{D}/10 Mapa de lotes.bru', peticion(
    '10 Mapa de lotes', 10, 'get', '/fraccionamiento/mapa', token='tokenAdmin',
    docs="""Datos para pintar el plano: cada lote con su `svg_path_id` y su
estado, más un resumen con el conteo por estado."""))

escribir(f'{D}/11 Etapas.bru', peticion(
    '11 Etapas', 11, 'get', '/fraccionamiento/etapas', token='tokenAdmin',
    docs="Etapas existentes, derivadas de los lotes. Alimenta el filtro de la interfaz."))

escribir(f'{D}/12 Panel de administracion.bru', peticion(
    '12 Panel de administracion', 12, 'get', '/fraccionamiento/dashboard', token='tokenAdmin',
    docs="""Métricas de los seis módulos en una sola consulta, para que todas
las cifras sean del mismo instante.

Incluye actividad reciente: últimas visitas, tickets pendientes y mayores
adeudos."""))

escribir(f'{D}/13 Actualizar fraccionamiento.bru', peticion(
    '13 Actualizar fraccionamiento', 13, 'put', '/fraccionamiento', token='tokenAdmin',
    cuerpo={"direccion": "Av. Principal 100, Culiacán, Sinaloa"},
    docs="Solo admin."))

# ── 3. Propietarios ────────────────────────────────────────────────────────
D = f'{RAIZ}/03 Propietarios'
escribir(f'{D}/folder.bru', carpeta('03 Propietarios', 3))

escribir(f'{D}/01 Listar propietarios.bru', peticion(
    '01 Listar propietarios', 1, 'get', '/propietarios?limit=100', token='tokenAdmin',
    script="""
if (res.getStatus() === 200 && res.body.items.length) {
  bru.setEnvVar("propietarioId", res.body.items[0].id);
}
""",
    docs="""Cada propietario viene con sus lotes agregados y el correo de su
usuario. Admin y vigilante.

Guarda el primero en `propietarioId`."""))

escribir(f'{D}/02 Mi ficha.bru', peticion(
    '02 Mi ficha', 2, 'get', '/propietarios/me', token='tokenPropietario',
    docs="""Ficha del propietario autenticado, sin necesidad de conocer su id.

Solo rol propietario."""))

escribir(f'{D}/03 Detalle de propietario.bru', peticion(
    '03 Detalle de propietario', 3, 'get', '/propietarios/{{propietarioId}}', token='tokenAdmin',
    docs="""Un propietario solo puede consultar su propia ficha; el admin y el
vigilante, cualquiera."""))

escribir(f'{D}/04 Crear propietario.bru', peticion(
    '04 Crear propietario', 4, 'post', '/propietarios', token='tokenAdmin',
    cuerpo={"nombre_completo": "Demo Propietario", "email": "demo@urbanflow.test",
            "telefono": "6670000000", "whatsapp": "+526670000000",
            "curp": "DEPR900101HSLMMR01", "num_escritura": "ESC-DEMO-01"},
    script="""
if (res.getStatus() === 201) bru.setEnvVar("propietarioCreadoId", res.body.id);
""",
    docs="""Crea el propietario, su usuario con rol `propietario` y su código QR,
todo en una transacción.

Si no se envía `password`, se usa la del seed (`UrbanFlow2026!`)."""))

escribir(f'{D}/05 Actualizar propietario.bru', peticion(
    '05 Actualizar propietario', 5, 'put', '/propietarios/{{propietarioCreadoId}}',
    token='tokenAdmin', cuerpo={"telefono": "6679999999"},
    docs="Actualización parcial."))

escribir(f'{D}/06 Codigo QR (data URL).bru', peticion(
    '06 Codigo QR (data URL)', 6, 'get', '/propietarios/{{propietarioId}}/qr',
    token='tokenAdmin',
    script="""
if (res.getStatus() === 200) bru.setEnvVar("qrToken", res.body.qr_token);
""",
    docs="""Devuelve el token del QR y su imagen como data URL lista para un
`<img>`.

El token es un JWT firmado con `QR_SECRET`, **sin expiración**. Se revoca
rotándolo o desactivando al usuario.

Guarda el token en `qrToken` para la petición de entrada por QR."""))

escribir(f'{D}/07 Codigo QR (PNG).bru', peticion(
    '07 Codigo QR (PNG)', 7, 'get', '/propietarios/{{propietarioId}}/qr?format=png',
    token='tokenAdmin',
    docs="La misma imagen como PNG binario, para descargar o imprimir."))

escribir(f'{D}/08 Rotar codigo QR.bru', peticion(
    '08 Rotar codigo QR', 8, 'post', '/propietarios/{{propietarioId}}/qr/rotar',
    token='tokenAdmin',
    script="""
// Se guarda el token NUEVO: si no, la entrada por QR de la carpeta 04 seguiría
// usando el anterior, que esta petición acaba de invalidar.
if (res.getStatus() === 200) bru.setEnvVar("qrToken", res.body.qr_token);
""",
    docs="""Genera un QR nuevo e **invalida el anterior al instante**.

Es la forma de revocar un código perdido o compartido por error."""))

escribir(f'{D}/09 Subir documento.bru', peticion(
    '09 Subir documento', 9, 'post', '/propietarios/{{propietarioId}}/documentos',
    token='tokenAdmin', form={"tipo": "escritura", "archivo": "@file(ruta/al/archivo.pdf)"},
    docs="""Subida multipart. El campo del archivo se llama `archivo`.

Selecciona un archivo real desde Bruno antes de enviar.

Tipos aceptados: PDF, JPG, PNG y WEBP. Máximo 5 MB."""))

escribir(f'{D}/10 Listar documentos.bru', peticion(
    '10 Listar documentos', 10, 'get', '/propietarios/{{propietarioId}}/documentos',
    token='tokenAdmin',
    script="""
if (res.getStatus() === 200 && res.body.length) {
  bru.setEnvVar("documentoId", res.body[0].id);
}
""",
    docs="Metadatos, no el contenido. Guarda el primero en `documentoId`."))

escribir(f'{D}/11 Descargar documento.bru', peticion(
    '11 Descargar documento', 11, 'get', '/propietarios/documentos/{{documentoId}}',
    token='tokenAdmin',
    docs="""Devuelve el archivo con su nombre original, aunque en disco esté
guardado con un UUID."""))

escribir(f'{D}/12 Eliminar documento.bru', peticion(
    '12 Eliminar documento', 12, 'delete', '/propietarios/documentos/{{documentoId}}',
    token='tokenAdmin', docs="Borra el registro y el archivo del disco."))

escribir(f'{D}/13 Eliminar propietario.bru', peticion(
    '13 Eliminar propietario', 13, 'delete', '/propietarios/{{propietarioCreadoId}}',
    token='tokenAdmin',
    docs="""Elimina también su usuario y sus documentos, y devuelve sus lotes a
`disponible`."""))

# ── 4. Visitas y caseta ────────────────────────────────────────────────────
D = f'{RAIZ}/04 Visitas y caseta'
escribir(f'{D}/folder.bru', carpeta('04 Visitas y caseta', 4))

escribir(f'{D}/01 Tipos de visita.bru', peticion(
    '01 Tipos de visita', 1, 'get', '/visitas/tipos', token='tokenVigilante',
    docs="Catálogo del enum: `visita`, `delivery`, `servicio`, `residente`."))

escribir(f'{D}/02 Registrar entrada.bru', peticion(
    '02 Registrar entrada', 2, 'post', '/visitas/entrada', token='tokenVigilante',
    cuerpo={"lote_destino_id": "{{loteVendidoId}}", "nombre_visitante": "Visitante Demo",
            "tipo": "visita", "placa_vehiculo": "DEMO-01", "notas": "Registro de prueba"},
    script="""
if (res.getStatus() === 201) bru.setEnvVar("visitaId", res.body.id);
""",
    docs="""Registra la entrada y emite el evento `nueva-visita` por Socket.io a
la sala de la caseta.

Requiere `loteVendidoId`: ejecuta antes «Listar lotes» en la carpeta 02."""))

escribir(f'{D}/03 Entrada por QR.bru', peticion(
    '03 Entrada por QR', 3, 'post', '/visitas/qr', token='tokenVigilante',
    cuerpo={"token": "{{qrToken}}"},
    docs="""Entrada de un residente escaneando su código.

Además de verificar la firma, comprueba tres cosas: que el QR sea de este
fraccionamiento, que la cuenta esté activa, y que el token coincida con el
guardado en la base (es lo que permite revocarlo).

Requiere `qrToken`: ejecuta antes «Código QR» en la carpeta 03."""))

escribir(f'{D}/04 Quien esta dentro.bru', peticion(
    '04 Quien esta dentro', 4, 'get', '/visitas/activas', token='tokenVigilante',
    docs="Visitas sin salida registrada. Es la pantalla principal de la caseta."))

escribir(f'{D}/05 Registrar salida.bru', peticion(
    '05 Registrar salida', 5, 'put', '/visitas/{{visitaId}}/salida', token='tokenVigilante',
    docs="""Marca la salida.

Distingue entre una visita inexistente (404) y una que ya salió (409)."""))

escribir(f'{D}/06 Bitacora.bru', peticion(
    '06 Bitacora', 6, 'get', '/visitas/bitacora?limit=100', token='tokenAdmin',
    docs="""Histórico de accesos. Sin filtro de fecha devuelve los **últimos 30
días**.

Filtros: `desde`, `hasta` (AAAA-MM-DD), `tipo`, `lote_id`, `q`."""))

escribir(f'{D}/07 Bitacora filtrada.bru', peticion(
    '07 Bitacora filtrada', 7, 'get', '/visitas/bitacora?tipo=delivery', token='tokenAdmin',
    docs="Filtro por tipo de acceso."))

escribir(f'{D}/08 Exportar bitacora CSV.bru', peticion(
    '08 Exportar bitacora CSV', 8, 'get', '/visitas/bitacora.csv', token='tokenAdmin',
    docs="""Exporta en CSV con BOM UTF-8, para que Excel no destroce los acentos.

Acepta los mismos filtros que la bitácora."""))

escribir(f'{D}/09 Detalle de visita.bru', peticion(
    '09 Detalle de visita', 9, 'get', '/visitas/{{visitaId}}', token='tokenAdmin'))

escribir(f'{D}/10 Mis visitas (propietario).bru', peticion(
    '10 Mis visitas (propietario)', 10, 'get', '/visitas/mis-visitas', token='tokenPropietario',
    docs="Visitas dirigidas a los lotes del propietario autenticado."))

# ── 5. Cuotas y pagos ──────────────────────────────────────────────────────
D = f'{RAIZ}/05 Cuotas y pagos'
escribir(f'{D}/folder.bru', carpeta('05 Cuotas y pagos', 5))

escribir(f'{D}/01 Listar cuotas.bru', peticion(
    '01 Listar cuotas', 1, 'get', '/pagos/cuotas?limit=100', token='tokenAdmin',
    script="""
if (res.getStatus() === 200 && res.body.items.length) {
  const pend = res.body.items.find(c => c.estado_actual !== 'pagado');
  if (pend) bru.setEnvVar("cuotaId", pend.id);
}
""",
    docs="""Cuotas con un resumen de montos cobrados y pendientes.

`estado_actual` se calcula en la consulta: una cuota pendiente cuyo mes ya pasó
aparece como `vencido` aunque el enum almacenado no se haya actualizado.

Filtros: `estado`, `mes`, `propietario_id`."""))

escribir(f'{D}/02 Mi estado de cuenta.bru', peticion(
    '02 Mi estado de cuenta', 2, 'get', '/pagos/cuotas/mias', token='tokenPropietario',
    script="""
if (res.getStatus() === 200) {
  // Una cuota PROPIA para el checkout: un propietario solo puede pagar las
  // suyas, así que no sirve cualquiera de la lista global del admin.
  const pend = res.body.cuotas.find(c => c.estado_actual !== 'pagado');
  if (pend) bru.setEnvVar("cuotaPropiaId", pend.id);
}
""",
    docs="Cuotas del propietario autenticado, con totales por estado y el adeudo."))

escribir(f'{D}/03 Estado de cuenta de un propietario.bru', peticion(
    '03 Estado de cuenta de un propietario', 3, 'get', '/pagos/cuotas/{{propietarioId}}',
    token='tokenAdmin'))

escribir(f'{D}/04 Crear cuota extraordinaria.bru', peticion(
    '04 Crear cuota extraordinaria', 4, 'post', '/pagos/cuotas', token='tokenAdmin',
    cuerpo={"propietario_id": "todos", "monto": 2500,
            "concepto": "Reparación del portón principal"},
    docs="""Crea una cuota extraordinaria para un propietario o para **todos**
los que tienen lote vendido.

Con `propietario_id: "todos"` se genera una por cada uno."""))

escribir(f'{D}/05 Generar cuotas del mes.bru', peticion(
    '05 Generar cuotas del mes', 5, 'post', '/pagos/cuotas/generar', token='tokenAdmin',
    cuerpo={},
    docs="""Dispara a mano lo que el cron hace el día 1 de cada mes.

Es idempotente: volver a llamarla no duplica cuotas. Además marca como
`vencido` las pendientes de meses anteriores."""))

escribir(f'{D}/06 Actualizar cuota.bru', peticion(
    '06 Actualizar cuota', 6, 'put', '/pagos/cuotas/{{cuotaId}}', token='tokenAdmin',
    cuerpo={"monto": 1600}))

escribir(f'{D}/07 Morosos.bru', peticion(
    '07 Morosos', 7, 'get', '/pagos/morosos', token='tokenAdmin',
    docs="""Propietarios con cuotas de meses anteriores sin pagar, con el monto
adeudado y sus datos de contacto."""))

escribir(f'{D}/08 Registrar pago en caja.bru', peticion(
    '08 Registrar pago en caja', 8, 'post', '/pagos/manual', token='tokenAdmin',
    cuerpo={"cuota_id": "{{cuotaId}}", "monto_pagado": 1500,
            "metodo": "efectivo", "referencia": "CAJA-001"},
    script="""
if (res.getStatus() === 201) bru.setEnvVar("pagoId", res.body.id);
""",
    docs="""Cobro presencial. Métodos: `efectivo` o `transferencia`.

Marca la cuota como pagada en la misma transacción."""))

escribir(f'{D}/09 Listar pagos.bru', peticion(
    '09 Listar pagos', 9, 'get', '/pagos?limit=100', token='tokenAdmin',
    script="""
if (res.getStatus() === 200 && res.body.items.length) {
  bru.setEnvVar("pagoId", res.body.items[0].id);
}
""",
    docs="Historial de pagos. Filtros: `desde`, `hasta`, `metodo`."))

escribir(f'{D}/10 Descargar recibo PDF.bru', peticion(
    '10 Descargar recibo PDF', 10, 'get', '/pagos/{{pagoId}}/pdf', token='tokenAdmin',
    docs="""Recibo en PDF generado en memoria al vuelo.

No se guarda en disco: `pagos.pdf_url` queda siempre en `NULL`."""))

escribir(f'{D}/11 Checkout MercadoPago.bru', peticion(
    '11 Checkout MercadoPago', 11, 'post', '/pagos/checkout', token='tokenPropietario',
    cuerpo={"cuota_id": "{{cuotaPropiaId}}"},
    docs="""Crea una preferencia de pago y devuelve la URL del checkout.

Sin `MP_ACCESS_TOKEN` configurado responde 500 con un mensaje explícito, en
lugar de simular un pago que no existe."""))

escribir(f'{D}/12 Webhook MercadoPago.bru', peticion(
    '12 Webhook MercadoPago', 12, 'post', '/pagos/webhook?type=payment&data.id=123456',
    cuerpo={"type": "payment", "data": {"id": "123456"}},
    docs="""**Lo llama MercadoPago, no un usuario.** No lleva token.

Se autentica con la firma HMAC de la cabecera `x-signature`, que se valida
antes de tocar la base de datos.

Desde Bruno responderá 401 porque no se puede falsificar esa firma: es
exactamente el comportamiento correcto."""))

# ── 6. Mantenimiento ───────────────────────────────────────────────────────
D = f'{RAIZ}/06 Mantenimiento'
escribir(f'{D}/folder.bru', carpeta('06 Mantenimiento', 6))

escribir(f'{D}/01 Estados de ticket.bru', peticion(
    '01 Estados de ticket', 1, 'get', '/mantenimiento/estados', token='tokenAdmin',
    docs="Catálogo del enum: `abierto`, `en_proceso`, `resuelto`."))

escribir(f'{D}/02 Listar tickets.bru', peticion(
    '02 Listar tickets', 2, 'get', '/mantenimiento?limit=100', token='tokenAdmin',
    script="""
if (res.getStatus() === 200 && res.body.items.length) {
  bru.setEnvVar("ticketId", res.body.items[0].id);
}
""",
    docs="""Todos los tickets del fraccionamiento, con los abiertos primero.

Filtros: `estado`, `tecnico_id`, `q`."""))

escribir(f'{D}/03 Tecnicos disponibles.bru', peticion(
    '03 Tecnicos disponibles', 3, 'get', '/mantenimiento/tecnicos', token='tokenAdmin',
    script="""
if (res.getStatus() === 200 && res.body.length) {
  bru.setEnvVar("tecnicoId", res.body[0].id);
}
""",
    docs="""Técnicos activos con su carga de trabajo, ordenados de menor a mayor,
para poder repartir con criterio."""))

escribir(f'{D}/04 Reportar incidencia.bru', peticion(
    '04 Reportar incidencia', 4, 'post', '/mantenimiento', token='tokenPropietario',
    cuerpo={"descripcion": "La luminaria de la calle lleva tres noches apagada",
            "ubicacion": "Calle Palmas, frente al A-04"},
    script="""
if (res.getStatus() === 201) bru.setEnvVar("ticketCreadoId", res.body.id);
""",
    docs="""Pueden reportar el propietario, el admin y el vigilante (es quien
detecta las averías durante su turno).

Nace en estado `abierto` y sin técnico asignado."""))

escribir(f'{D}/05 Mis tickets.bru', peticion(
    '05 Mis tickets', 5, 'get', '/mantenimiento/mios', token='tokenPropietario',
    docs="""Un mismo endpoint para dos roles: al propietario le devuelve los que
reportó, al técnico los que le asignaron."""))

escribir(f'{D}/06 Detalle de ticket.bru', peticion(
    '06 Detalle de ticket', 6, 'get', '/mantenimiento/{{ticketCreadoId}}', token='tokenAdmin'))

escribir(f'{D}/07 Asignar tecnico.bru', peticion(
    '07 Asignar tecnico', 7, 'put', '/mantenimiento/{{ticketCreadoId}}/asignar',
    token='tokenAdmin', cuerpo={"tecnico_id": "{{tokenTecnicoId}}"},
    docs="""Asignar un técnico pasa el ticket a `en_proceso` en la misma
operación: un ticket con técnico que siguiera «abierto» sería ambiguo.

Se asigna a `tokenTecnicoId`, que es el técnico con cuyo token trabaja la
petición siguiente. Si se usara el primero de «Técnicos disponibles» —que
ordena por menor carga— podría ser otro y «Cambiar estado» daría 403."""))

escribir(f'{D}/08 Cambiar estado.bru', peticion(
    '08 Cambiar estado', 8, 'put', '/mantenimiento/{{ticketCreadoId}}/estado',
    token='tokenTecnico', cuerpo={"estado": "resuelto"},
    docs="""El técnico solo puede mover los tickets que tiene asignados.

Marcar como `resuelto` registra la fecha de resolución; reabrirlo la borra."""))

escribir(f'{D}/09 Actualizar ticket.bru', peticion(
    '09 Actualizar ticket', 9, 'put', '/mantenimiento/{{ticketCreadoId}}', token='tokenAdmin',
    cuerpo={"ubicacion": "Calle Palmas, poste 12"}))

escribir(f'{D}/10 Eliminar ticket.bru', peticion(
    '10 Eliminar ticket', 10, 'delete', '/mantenimiento/{{ticketCreadoId}}', token='tokenAdmin'))

# ── 7. Comunicados ─────────────────────────────────────────────────────────
D = f'{RAIZ}/07 Comunicados'
escribir(f'{D}/folder.bru', carpeta('07 Comunicados', 7))

escribir(f'{D}/01 Estado de los canales.bru', peticion(
    '01 Estado de los canales', 1, 'get', '/comunicados/canales', token='tokenAdmin',
    docs="""Qué proveedores están configurados. Permite avisar en la interfaz
antes de redactar un comunicado que no se podrá enviar."""))

escribir(f'{D}/02 Contar destinatarios.bru', peticion(
    '02 Contar destinatarios', 2, 'get', '/comunicados/destinatarios', token='tokenAdmin',
    docs="Cuántos propietarios recibirían, desglosado por canal."))

escribir(f'{D}/03 Enviar comunicado.bru', peticion(
    '03 Enviar comunicado', 3, 'post', '/comunicados', token='tokenAdmin',
    cuerpo={"titulo": "Corte de agua programado",
            "cuerpo": "El martes de 9 a 14 h habrá corte por mantenimiento de la red.",
            "canales": {"email": True, "whatsapp": False}},
    script="""
if (res.getStatus() === 201) bru.setEnvVar("comunicadoId", res.body.comunicado.id);
""",
    docs="""Registra el comunicado y lo envía por los canales marcados.

Se puede acotar a ciertos propietarios con
`"destinatarios": ["id1", "id2"]`; si se omite, van todos.

El registro se guarda **aunque el envío falle**: la respuesta trae el detalle
de cuántos se enviaron y cuántos fallaron por canal."""))

escribir(f'{D}/04 Historial de comunicados.bru', peticion(
    '04 Historial de comunicados', 4, 'get', '/comunicados?limit=50', token='tokenAdmin',
    docs="Incluye el resultado de entrega de cada envío."))

escribir(f'{D}/05 Detalle de comunicado.bru', peticion(
    '05 Detalle de comunicado', 5, 'get', '/comunicados/{{comunicadoId}}', token='tokenAdmin'))

escribir(f'{D}/06 Tablon de avisos (residente).bru', peticion(
    '06 Tablon de avisos (residente)', 6, 'get', '/comunicados/mios', token='tokenPropietario',
    docs="""Lo que ve un residente: título, cuerpo, fecha y autor.

Sin los detalles de entrega, que solo le interesan a quien administra."""))

escribir(f'{D}/07 Eliminar comunicado.bru', peticion(
    '07 Eliminar comunicado', 7, 'delete', '/comunicados/{{comunicadoId}}', token='tokenAdmin'))

escribir(f'{D}/08 Webhook de verificacion Meta.bru', peticion(
    '08 Webhook de verificacion Meta', 8, 'get',
    '/comunicados/webhook?hub.mode=subscribe&hub.verify_token=CAMBIAR&hub.challenge=12345',
    docs="""**Lo llama Meta al dar de alta la suscripción**, no un usuario. No
lleva token.

Se autentica comparando `hub.verify_token` con `META_VERIFY_TOKEN` del
servidor. Si coincide, devuelve el `hub.challenge` en texto plano.

Cambia el valor de `hub.verify_token` por el de tu `.env` para probarlo."""))

# ── 8. Áreas comunes y reservaciones ───────────────────────────────────────
D = f'{RAIZ}/08 Areas y reservaciones'
escribir(f'{D}/folder.bru', carpeta('08 Areas y reservaciones', 8))

escribir(f'{D}/01 Listar areas.bru', peticion(
    '01 Listar areas', 1, 'get', '/reservaciones/areas', token='tokenPropietario',
    script="""
if (res.getStatus() === 200 && res.body.length) {
  bru.setEnvVar("areaId", res.body[0].id);
}
""",
    docs="""Áreas comunes del fraccionamiento. Con `?activa=true` solo las
disponibles para reservar."""))

escribir(f'{D}/02 Crear area.bru', peticion(
    '02 Crear area', 2, 'post', '/reservaciones/areas', token='tokenAdmin',
    cuerpo={"nombre": "Gimnasio", "capacidad": 12, "activa": True},
    script="""
if (res.getStatus() === 201) bru.setEnvVar("areaCreadaId", res.body.id);
""",
    docs="Solo admin. El nombre es único dentro del fraccionamiento."))

escribir(f'{D}/03 Actualizar area.bru', peticion(
    '03 Actualizar area', 3, 'put', '/reservaciones/areas/{{areaCreadaId}}',
    token='tokenAdmin', cuerpo={"capacidad": 20, "activa": False},
    docs="""Desactivar un área impide reservarla sin borrar su histórico.

Es lo recomendado frente a eliminarla."""))

escribir(f'{D}/04 Disponibilidad de un area.bru', peticion(
    '04 Disponibilidad de un area', 4, 'get',
    '/reservaciones/areas/{{areaId}}/disponibilidad?fecha=2026-08-15',
    token='tokenPropietario',
    docs="""Franjas ya ocupadas del día indicado. Es lo que pinta el calendario.

`fecha` es obligatoria, en formato AAAA-MM-DD."""))

escribir(f'{D}/05 Crear reservacion.bru', peticion(
    '05 Crear reservacion', 5, 'post', '/reservaciones', token='tokenPropietario',
    cuerpo={"area_id": "{{areaId}}", "fecha": "2026-08-15",
            "hora_inicio": "16:00", "hora_fin": "20:00"},
    script="""
if (res.getStatus() === 201) bru.setEnvVar("reservacionId", res.body.id);
""",
    docs="""Nace en estado `pendiente`.

El solapamiento lo impide una restricción de la base de datos, no solo una
comprobación previa: dos peticiones simultáneas del mismo horario no pueden
entrar las dos.

Las franjas contiguas sí se permiten: 10:00–12:00 y 12:00–14:00 no chocan."""))

escribir(f'{D}/06 Mis reservaciones.bru', peticion(
    '06 Mis reservaciones', 6, 'get', '/reservaciones/mias', token='tokenPropietario'))

escribir(f'{D}/07 Listar todas las reservaciones.bru', peticion(
    '07 Listar todas las reservaciones', 7, 'get', '/reservaciones?limit=100',
    token='tokenAdmin',
    docs="Solo admin. Filtros: `area_id`, `fecha`, `estado`, `propietario_id`."))

escribir(f'{D}/08 Detalle de reservacion.bru', peticion(
    '08 Detalle de reservacion', 8, 'get', '/reservaciones/{{reservacionId}}',
    token='tokenPropietario'))

escribir(f'{D}/09 Confirmar reservacion.bru', peticion(
    '09 Confirmar reservacion', 9, 'put', '/reservaciones/{{reservacionId}}',
    token='tokenAdmin', cuerpo={"estado": "confirmada"},
    docs="Solo admin. Estados: `pendiente`, `confirmada`, `cancelada`."))

escribir(f'{D}/10 Cancelar reservacion.bru', peticion(
    '10 Cancelar reservacion', 10, 'put', '/reservaciones/{{reservacionId}}/cancelar',
    token='tokenPropietario',
    docs="""Puede cancelar el dueño de la reserva o el admin.

Cancelar libera el horario: la restricción de solapamiento no cuenta las
canceladas."""))

escribir(f'{D}/11 Eliminar area.bru', peticion(
    '11 Eliminar area', 11, 'delete', '/reservaciones/areas/{{areaCreadaId}}',
    token='tokenAdmin',
    docs="""Un área con reservaciones registradas no se puede eliminar: la
respuesta sugiere desactivarla en su lugar."""))

# ── resumen ────────────────────────────────────────────────────────────────
total = sum(len([f for f in fs if f.endswith('.bru') and f != 'folder.bru'])
            for _, _, fs in os.walk(RAIZ))
print(f'{total} peticiones generadas en {RAIZ}/')
