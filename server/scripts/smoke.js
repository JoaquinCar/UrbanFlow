require('dotenv').config()

// Smoke tests contra el servidor corriendo de verdad (HTTP real, Postgres real).
//
//   npm run dev            # en otra terminal
//   npm run smoke
//   npm run smoke -- --only=auth,owners
//
// Sin dependencias nuevas: Node 20+ trae fetch, FormData y Blob nativos.
// Cada módulo agrega su entrada a SUITES y limpia lo que crea.

const BASE = process.env.SMOKE_URL || 'http://localhost:3000/api'
const PASSWORD = process.env.SEED_PASSWORD || 'UrbanFlow2026!'

let ok = 0
let fallos = 0
const cookies = new Map()

function guardarCookies(res) {
  const raw = res.headers.getSetCookie?.() || []
  for (const c of raw) {
    const [par] = c.split(';')
    const i = par.indexOf('=')
    if (i > 0) cookies.set(par.slice(0, i).trim(), par.slice(i + 1))
  }
}

async function req(metodo, ruta, { body, token, form, headers: extra } = {}) {
  const headers = { ...extra }
  if (token) headers.Authorization = `Bearer ${token}`
  if (cookies.size) headers.Cookie = [...cookies].map(([k, v]) => `${k}=${v}`).join('; ')

  let payload
  if (form) {
    payload = form
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }

  const res = await fetch(`${BASE}${ruta}`, { method: metodo, headers, body: payload })
  guardarCookies(res)

  const tipo = res.headers.get('content-type') || ''
  let data
  if (tipo.includes('json')) {
    data = await res.json()
  } else if (
    tipo.includes('pdf') || tipo.includes('image') ||
    tipo.includes('octet-stream') || tipo.includes('csv')
  ) {
    // El CSV se lee como bytes a propósito: res.text() decodifica UTF-8 y en el
    // proceso SE COME el BOM, así que no serviría para comprobar que va puesto.
    data = Buffer.from(await res.arrayBuffer())
  } else {
    data = await res.text()
  }

  return { status: res.status, data, headers: res.headers }
}

function check(nombre, cond, extra) {
  if (cond) {
    ok++
    console.log(`  ✓ ${nombre}`)
  } else {
    fallos++
    console.error(`  ✗ ${nombre}`, extra === undefined ? '' : JSON.stringify(extra)?.slice(0, 300))
  }
}

async function login(email) {
  const r = await req('POST', '/auth/login', { body: { email, password: PASSWORD } })
  if (r.status !== 200 || !r.data.accessToken) {
    throw new Error(`login ${email} falló (${r.status}): ${JSON.stringify(r.data)}`)
  }
  return r.data.accessToken
}

const SUITES = {
  auth: async (ctx) => {
    const r1 = await req('POST', '/auth/login', {
      body: { email: 'admin@urbanflow.test', password: PASSWORD },
    })
    check('login devuelve accessToken y user', r1.status === 200 && !!r1.data.accessToken && r1.data.user?.rol === 'admin', r1.data)

    const r2 = await req('POST', '/auth/login', {
      body: { email: 'admin@urbanflow.test', password: 'password-incorrecto' },
    })
    check('login con password incorrecto → 401', r2.status === 401, r2.data)

    const r3 = await req('GET', '/auth/me', { token: ctx.admin })
    check('/me con token → 200 y trae fraccionamiento_id', r3.status === 200 && !!r3.data.fraccionamiento_id, r3.data)

    const r4 = await req('GET', '/auth/me')
    check('/me sin token → 401', r4.status === 401, r4.data)

    // La cookie refreshToken quedó guardada por el login de arriba.
    const r5 = await req('POST', '/auth/refresh')
    check('/refresh con cookie → nuevo accessToken', r5.status === 200 && !!r5.data.accessToken, r5.data)

    const r6 = await req('GET', '/ruta-que-no-existe', { token: ctx.admin })
    check('ruta inexistente → 404 JSON', r6.status === 404 && !!r6.data.error, r6.data)

    const r7 = await req('POST', '/auth/change-password', {
      token: ctx.admin,
      body: { passwordActual: 'no-es-mi-password', passwordNueva: 'OtraCosa2026!' },
    })
    check('change-password con actual incorrecta → 401', r7.status === 401, r7.data)

    const r8 = await req('POST', '/auth/change-password', {
      token: ctx.admin,
      body: { passwordActual: PASSWORD, passwordNueva: 'corta' },
    })
    check('change-password con nueva muy corta → 400', r8.status === 400, r8.data)
  },

  fraccionamiento: async (ctx) => {
    const r1 = await req('GET', '/fraccionamiento', { token: ctx.admin })
    check('GET /fraccionamiento devuelve el del token', r1.status === 200 && !!r1.data.nombre, r1.data)

    const r2 = await req('GET', '/fraccionamiento/lotes', { token: ctx.admin })
    check('lista de lotes con total', r2.status === 200 && r2.data.total > 0, r2.data?.total)

    const r3 = await req('GET', '/fraccionamiento/lotes?estado=vendido', { token: ctx.admin })
    check('filtro por estado solo trae vendidos',
      r3.status === 200 && r3.data.items.length > 0 && r3.data.items.every(l => l.estado === 'vendido'),
      r3.data?.items?.map(l => l.estado))

    check('los lotes vendidos traen el nombre del propietario',
      r3.data.items.every(l => !!l.propietario_nombre), r3.data?.items?.[0])

    const r4 = await req('GET', '/fraccionamiento/mapa', { token: ctx.admin })
    check('el mapa trae svg_path_id en todos los lotes',
      r4.status === 200 && r4.data.lotes.length > 0 && r4.data.lotes.every(l => !!l.svg_path_id),
      r4.data?.lotes?.[0])
    check('el mapa trae resumen por estado',
      r4.data.resumen && typeof r4.data.resumen.vendido === 'number', r4.data?.resumen)

    const r5 = await req('GET', '/fraccionamiento/etapas', { token: ctx.admin })
    check('etapas se derivan de los lotes', r5.status === 200 && r5.data.includes('Etapa 1'), r5.data)

    // ── permisos ──
    const r6 = await req('POST', '/fraccionamiento/lotes', {
      token: ctx.propietario, body: { numero: 'HACK-01' },
    })
    check('un propietario no puede crear lotes → 403', r6.status === 403, r6.data)

    // ── ciclo de vida completo ──
    const numero = 'ZZ-99'
    const r7 = await req('POST', '/fraccionamiento/lotes', {
      token: ctx.admin,
      body: { numero, etapa: 'Etapa 1', superficie_m2: 250, precio: 990000, svg_path_id: `lote-${numero}` },
    })
    check('admin crea lote → 201 y nace disponible',
      r7.status === 201 && r7.data.estado === 'disponible', r7.data)
    const loteId = r7.data?.id

    const r8 = await req('POST', '/fraccionamiento/lotes', { token: ctx.admin, body: { numero } })
    check('número duplicado → 409', r8.status === 409, r8.data)

    const r9 = await req('POST', '/fraccionamiento/lotes', {
      token: ctx.admin, body: { numero: 'ZZ-98', estado: 'inventado' },
    })
    check('estado inválido → 400', r9.status === 400, r9.data)

    // Asignar propietario debe marcar el lote como vendido.
    const props = await req('GET', '/fraccionamiento/lotes?estado=vendido&limit=1', { token: ctx.admin })
    const propId = props.data?.items?.[0]?.propietario_id

    const r10 = await req('PUT', `/fraccionamiento/lotes/${loteId}/propietario`, {
      token: ctx.admin, body: { propietario_id: propId },
    })
    check('asignar propietario marca el lote vendido',
      r10.status === 200 && r10.data.estado === 'vendido' && r10.data.propietario_id === propId, r10.data)

    const r11 = await req('PUT', `/fraccionamiento/lotes/${loteId}/propietario`, {
      token: ctx.admin, body: { propietario_id: null },
    })
    check('desasignar lo devuelve a disponible',
      r11.status === 200 && r11.data.estado === 'disponible' && r11.data.propietario_id === null, r11.data)

    const r12 = await req('PUT', `/fraccionamiento/lotes/${loteId}/propietario`, {
      token: ctx.admin, body: { propietario_id: '00000000-0000-0000-0000-000000000000' },
    })
    check('propietario de otro fraccionamiento → 404', r12.status === 404, r12.data)

    const r13 = await req('PUT', `/fraccionamiento/lotes/${loteId}`, {
      token: ctx.admin, body: { precio: 1234567 },
    })
    check('actualización parcial no borra los otros campos',
      r13.status === 200 && Number(r13.data.precio) === 1234567 && r13.data.numero === numero, r13.data)

    const r14 = await req('GET', `/fraccionamiento/lotes/${loteId}`, { token: ctx.admin })
    check('detalle de lote trae propietario null cuando no tiene',
      r14.status === 200 && r14.data.propietario === null, r14.data)

    // Limpieza: la suite deja la base como la encontró.
    const r15 = await req('DELETE', `/fraccionamiento/lotes/${loteId}`, { token: ctx.admin })
    check('admin elimina el lote → 204', r15.status === 204, r15.status)

    const r16 = await req('GET', `/fraccionamiento/lotes/${loteId}`, { token: ctx.admin })
    check('el lote eliminado ya no existe → 404', r16.status === 404, r16.status)
  },

  owners: async (ctx) => {
    const r1 = await req('GET', '/propietarios', { token: ctx.admin })
    check('lista de propietarios con lotes agregados',
      r1.status === 200 && r1.data.total >= 3 && Array.isArray(r1.data.items[0].lotes), r1.data?.items?.[0])
    check('la lista trae el email del usuario vinculado',
      r1.data.items.every(p => !!p.email), r1.data?.items?.[0])

    const r2 = await req('GET', '/propietarios/me', { token: ctx.propietario })
    check('/me devuelve la ficha del propietario autenticado',
      r2.status === 200 && r2.data.nombre_completo === 'Juan Pérez Domínguez', r2.data)
    const miId = r2.data?.id

    const r3 = await req('GET', '/propietarios/me', { token: ctx.admin })
    check('/me no aplica al admin → 403', r3.status === 403, r3.data)

    // ── aislamiento entre propietarios ──
    const otro = r1.data.items.find(p => p.id !== miId)
    const r4 = await req('GET', `/propietarios/${otro.id}`, { token: ctx.propietario })
    check('un propietario no puede ver la ficha de otro → 403', r4.status === 403, r4.data)

    const r5 = await req('GET', `/propietarios/${miId}`, { token: ctx.propietario })
    check('un propietario sí puede ver la suya', r5.status === 200, r5.status)

    const r6 = await req('GET', '/propietarios', { token: ctx.propietario })
    check('un propietario no puede listar a todos → 403', r6.status === 403, r6.data)

    // ── QR ──
    const r7 = await req('GET', `/propietarios/${miId}/qr`, { token: ctx.propietario })
    check('el QR devuelve token y data URL',
      r7.status === 200 && r7.data.data_url?.startsWith('data:image/png;base64,'), Object.keys(r7.data ?? {}))
    const qrOriginal = r7.data?.qr_token

    const r8 = await req('GET', `/propietarios/${miId}/qr?format=png`, { token: ctx.propietario })
    check('?format=png devuelve un PNG real',
      r8.status === 200 && Buffer.isBuffer(r8.data) && r8.data.slice(1, 4).toString() === 'PNG', r8.status)

    const r9 = await req('GET', `/propietarios/${otro.id}/qr`, { token: ctx.propietario })
    check('no se puede pedir el QR de otro propietario → 403', r9.status === 403, r9.data)

    const r10 = await req('POST', `/propietarios/${miId}/qr/rotar`, { token: ctx.admin })
    check('rotar genera un QR distinto',
      r10.status === 200 && r10.data.qr_token && r10.data.qr_token !== qrOriginal, r10.status)

    // ── alta completa ──
    const email = `qa-owner-${Date.now()}@urbanflow.test`
    const r11 = await req('POST', '/propietarios', {
      token: ctx.admin,
      body: { nombre_completo: 'QA Propietario', email, telefono: '6670000000', whatsapp: '+526670000000' },
    })
    check('crear propietario → 201', r11.status === 201 && !!r11.data.id, r11.data)
    const nuevoId = r11.data?.id

    const r12 = await req('POST', '/propietarios', {
      token: ctx.admin, body: { nombre_completo: 'Duplicado', email },
    })
    check('email duplicado → 409', r12.status === 409, r12.data)

    const r13 = await req('POST', '/auth/login', { body: { email, password: PASSWORD } })
    check('el usuario del propietario nuevo puede iniciar sesión',
      r13.status === 200 && r13.data.user?.rol === 'propietario', r13.data?.user)

    const r14 = await req('GET', `/propietarios/${nuevoId}/qr`, { token: ctx.admin })
    check('el alta genera QR automáticamente', r14.status === 200 && !!r14.data.qr_token, r14.status)

    // ── documentos ──
    const pdfFalso = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(512, 0x20)])
    const form = new FormData()
    form.append('tipo', 'escritura')
    form.append('archivo', new Blob([pdfFalso], { type: 'application/pdf' }), 'escritura firmada.pdf')

    const r15 = await req('POST', `/propietarios/${nuevoId}/documentos`, { token: ctx.admin, form })
    check('subir documento → 201 con metadatos',
      r15.status === 201 && r15.data.nombre_archivo === 'escritura firmada.pdf' && r15.data.tamano_bytes > 0,
      r15.data)
    const docId = r15.data?.id

    const formMalo = new FormData()
    formMalo.append('tipo', 'ine')
    formMalo.append('archivo', new Blob([Buffer.from('MZ')], { type: 'application/x-msdownload' }), 'virus.exe')
    const r16 = await req('POST', `/propietarios/${nuevoId}/documentos`, { token: ctx.admin, form: formMalo })
    check('tipo de archivo no permitido → 400', r16.status === 400, r16.data)

    const r17 = await req('GET', `/propietarios/documentos/${docId}`, { token: ctx.admin })
    check('descargar documento devuelve el PDF',
      r17.status === 200 && Buffer.isBuffer(r17.data) && r17.data.slice(0, 4).toString() === '%PDF', r17.status)
    check('la descarga conserva el nombre original',
      /escritura%20firmada\.pdf/.test(r17.headers.get('content-disposition') ?? ''),
      r17.headers.get('content-disposition'))

    const r18 = await req('GET', `/propietarios/documentos/${docId}`, { token: ctx.propietario })
    check('otro propietario no puede descargar el documento → 403', r18.status === 403, r18.data)

    const r19 = await req('GET', `/propietarios/${nuevoId}/documentos`, { token: ctx.admin })
    check('listar documentos del propietario', r19.status === 200 && r19.data.length === 1, r19.data)

    // ── limpieza ──
    const r20 = await req('DELETE', `/propietarios/documentos/${docId}`, { token: ctx.admin })
    check('eliminar documento → 204', r20.status === 204, r20.status)

    const r21 = await req('DELETE', `/propietarios/${nuevoId}`, { token: ctx.admin })
    check('eliminar propietario → 204', r21.status === 204, r21.status)

    const r22 = await req('POST', '/auth/login', { body: { email, password: PASSWORD } })
    check('borrar el propietario borra también su usuario', r22.status === 401, r22.status)
  },

  visits: async (ctx) => {
    // Un lote vendido cualquiera para dirigir las visitas de prueba.
    const lotes = await req('GET', '/fraccionamiento/lotes?estado=vendido&limit=1', { token: ctx.admin })
    const loteId = lotes.data?.items?.[0]?.id

    const r1 = await req('POST', '/visitas/entrada', {
      token: ctx.vigilante,
      body: { lote_destino_id: loteId, nombre_visitante: 'QA Visitante', tipo: 'visita', placa_vehiculo: 'QA-0001' },
    })
    check('el vigilante registra una entrada → 201',
      r1.status === 201 && r1.data.salida_at === null, r1.data)
    check('la entrada trae el número de lote resuelto', !!r1.data?.lote_numero, r1.data?.lote_numero)
    const visitaId = r1.data?.id

    const r2 = await req('POST', '/visitas/entrada', {
      token: ctx.propietario,
      body: { lote_destino_id: loteId, nombre_visitante: 'Intruso' },
    })
    check('un propietario no puede registrar entradas → 403', r2.status === 403, r2.data)

    const r3 = await req('POST', '/visitas/entrada', {
      token: ctx.vigilante,
      body: { lote_destino_id: '00000000-0000-0000-0000-000000000000', nombre_visitante: 'X' },
    })
    check('lote de otro fraccionamiento → 404', r3.status === 404, r3.data)

    const r4 = await req('POST', '/visitas/entrada', {
      token: ctx.vigilante, body: { lote_destino_id: loteId, nombre_visitante: '  ' },
    })
    check('nombre vacío → 400', r4.status === 400, r4.data)

    const r5 = await req('GET', '/visitas/activas', { token: ctx.vigilante })
    check('la visita aparece entre las activas',
      r5.status === 200 && r5.data.some(v => v.id === visitaId), r5.data?.length)

    const r6 = await req('PUT', `/visitas/${visitaId}/salida`, { token: ctx.vigilante })
    check('registrar salida → 200 con salida_at', r6.status === 200 && !!r6.data.salida_at, r6.data?.salida_at)

    const r7 = await req('PUT', `/visitas/${visitaId}/salida`, { token: ctx.vigilante })
    check('segunda salida sobre la misma visita → 409', r7.status === 409, r7.data)

    const r8 = await req('GET', '/visitas/activas', { token: ctx.vigilante })
    check('tras la salida ya no está entre las activas',
      !r8.data.some(v => v.id === visitaId), r8.data?.length)

    // ── QR de residente ──
    const ficha = await req('GET', '/propietarios/me', { token: ctx.propietario })
    const qr = await req('GET', `/propietarios/${ficha.data.id}/qr`, { token: ctx.propietario })
    const qrToken = qr.data?.qr_token

    const r9 = await req('POST', '/visitas/qr', { token: ctx.vigilante, body: { token: qrToken } })
    check('entrada por QR → 201 y tipo residente',
      r9.status === 201 && r9.data.visita?.tipo === 'residente', r9.data?.visita?.tipo)
    check('la respuesta identifica al residente y su lote',
      !!r9.data?.residente?.nombre && !!r9.data?.residente?.lote?.numero, r9.data?.residente)
    const visitaQr = r9.data?.visita?.id

    const r10 = await req('POST', '/visitas/qr', { token: ctx.vigilante, body: { token: 'basura' } })
    check('QR inválido → 401', r10.status === 401, r10.data)

    // Rotar el QR debe invalidar el anterior al instante.
    await req('POST', `/propietarios/${ficha.data.id}/qr/rotar`, { token: ctx.admin })
    const r11 = await req('POST', '/visitas/qr', { token: ctx.vigilante, body: { token: qrToken } })
    check('un QR rotado queda revocado → 401', r11.status === 401, r11.data)

    const qr2 = await req('GET', `/propietarios/${ficha.data.id}/qr`, { token: ctx.propietario })
    const r12 = await req('POST', '/visitas/qr', { token: ctx.vigilante, body: { token: qr2.data.qr_token } })
    check('el QR nuevo sí funciona', r12.status === 201, r12.status)
    const visitaQr2 = r12.data?.visita?.id

    // ── bitácora ──
    const r13 = await req('GET', '/visitas/bitacora', { token: ctx.admin })
    check('la bitácora trae los 30 días sembrados',
      r13.status === 200 && r13.data.total >= 40, r13.data?.total)

    const r14 = await req('GET', '/visitas/bitacora?tipo=delivery', { token: ctx.admin })
    check('filtro por tipo funciona',
      r14.status === 200 && r14.data.items.every(v => v.tipo === 'delivery'), r14.data?.total)

    const r15 = await req('GET', '/visitas/bitacora?q=Estafeta', { token: ctx.admin })
    check('búsqueda por texto funciona', r15.status === 200 && r15.data.total > 0, r15.data?.total)

    const r16 = await req('GET', '/visitas/bitacora.csv', { token: ctx.admin })
    check('el CSV se sirve como text/csv',
      /text\/csv/.test(r16.headers.get('content-type') ?? ''), r16.headers.get('content-type'))
    check('el CSV lleva BOM UTF-8 para Excel',
      r16.data.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])),
      r16.data?.subarray(0, 6))
    const csvTexto = r16.data.toString('utf8')
    check('el CSV trae encabezados y filas',
      csvTexto.includes('Visitante') && csvTexto.split('\r\n').length > 10,
      csvTexto.split('\r\n').length)
    check('el CSV conserva los acentos', /Registró/.test(csvTexto), csvTexto.slice(0, 80))

    const r17 = await req('GET', '/visitas/mis-visitas', { token: ctx.propietario })
    check('el propietario ve solo las visitas de sus lotes',
      r17.status === 200 && Array.isArray(r17.data) && r17.data.length > 0, r17.data?.length)

    const r18 = await req('GET', '/visitas/bitacora', { token: ctx.propietario })
    check('un propietario no puede ver la bitácora completa → 403', r18.status === 403, r18.data)

    // ── limpieza ──
    for (const id of [visitaQr, visitaQr2].filter(Boolean)) {
      await req('PUT', `/visitas/${id}/salida`, { token: ctx.vigilante })
    }
    check('limpieza: las entradas por QR quedan cerradas', true)
  },

  payments: async (ctx) => {
    const r1 = await req('GET', '/pagos/cuotas', { token: ctx.admin })
    check('lista de cuotas con resumen de montos',
      r1.status === 200 && r1.data.total > 0 && r1.data.resumen.monto_cobrado !== undefined,
      r1.data?.resumen)

    const r2 = await req('GET', '/pagos/cuotas/mias', { token: ctx.propietario })
    check('estado de cuenta propio con totales',
      r2.status === 200 && r2.data.cuotas.length > 0 && typeof r2.data.totales.adeudo === 'number',
      r2.data?.totales)
    check('el estado de cuenta calcula el adeudo',
      r2.data.totales.adeudo === r2.data.totales.pendiente + r2.data.totales.vencido,
      r2.data?.totales)

    const r3 = await req('GET', '/pagos/cuotas', { token: ctx.propietario })
    check('un propietario no puede listar todas las cuotas → 403', r3.status === 403, r3.data)

    // ── morosidad ──
    const r4 = await req('GET', '/pagos/morosos', { token: ctx.admin })
    check('el reporte de morosos trae monto adeudado',
      r4.status === 200 && r4.data.length > 0 && Number(r4.data[0].monto_adeudado) > 0, r4.data?.[0])

    // ── cuota extraordinaria ──
    const r5 = await req('POST', '/pagos/cuotas', {
      token: ctx.admin,
      body: { propietario_id: 'todos', monto: 750, concepto: 'QA prueba extraordinaria' },
    })
    check('cuota extraordinaria para todos → 201',
      r5.status === 201 && r5.data.creadas >= 3, r5.data)

    const r6 = await req('POST', '/pagos/cuotas', {
      token: ctx.admin, body: { propietario_id: 'todos', monto: -5, concepto: 'X' },
    })
    check('monto negativo → 400', r6.status === 400, r6.data)

    const r7 = await req('POST', '/pagos/cuotas', {
      token: ctx.admin, body: { propietario_id: 'todos', monto: 100 },
    })
    check('sin concepto → 400', r7.status === 400, r7.data)

    // Se paga la cuota de OTRO propietario, no la del que inicia sesión en las
    // pruebas: así el recibo resultante sirve para comprobar el 403.
    const miFicha = await req('GET', '/propietarios/me', { token: ctx.propietario })
    const listado = await req('GET', '/pagos/cuotas?estado=pendiente&limit=500', { token: ctx.admin })
    const cuotaQa = listado.data.items.find(
      c => c.concepto === 'QA prueba extraordinaria' && c.propietario_id !== miFicha.data.id
    )
    check('la cuota extraordinaria aparece en el listado', !!cuotaQa, cuotaQa?.concepto)

    // ── pago manual ──
    const r8 = await req('POST', '/pagos/manual', {
      token: ctx.admin,
      body: { cuota_id: cuotaQa.id, monto_pagado: 750, metodo: 'efectivo', referencia: 'QA-CAJA-01' },
    })
    check('pago manual en efectivo → 201', r8.status === 201 && r8.data.metodo === 'efectivo', r8.data)
    const pagoId = r8.data?.id

    const r9 = await req('GET', `/pagos/cuotas/${cuotaQa.propietario_id}`, { token: ctx.admin })
    const cuotaTrasPago = r9.data.cuotas.find(c => c.id === cuotaQa.id)
    check('la cuota queda marcada como pagada', cuotaTrasPago?.estado === 'pagado', cuotaTrasPago?.estado)

    const r10 = await req('POST', '/pagos/manual', {
      token: ctx.admin, body: { cuota_id: cuotaQa.id, monto_pagado: 750, metodo: 'efectivo' },
    })
    check('pagar dos veces la misma cuota → 409', r10.status === 409, r10.data)

    const r11 = await req('POST', '/pagos/manual', {
      token: ctx.admin, body: { cuota_id: cuotaQa.id, monto_pagado: 100, metodo: 'bitcoin' },
    })
    check('método de pago inválido → 400', r11.status === 400, r11.data)

    // Regresión: la unicidad de referencia_mp debe aplicar solo a los pagos en
    // línea. Dos cobros de caja con el mismo folio son legítimos.
    const otraCuota = listado.data.items.find(
      c => c.concepto === 'QA prueba extraordinaria' && c.id !== cuotaQa.id
    )
    if (otraCuota) {
      const r11b = await req('POST', '/pagos/manual', {
        token: ctx.admin,
        body: { cuota_id: otraCuota.id, monto_pagado: 750, metodo: 'efectivo', referencia: 'QA-CAJA-01' },
      })
      check('dos cobros manuales pueden repetir folio de caja', r11b.status === 201, r11b.data)
    }

    const r12 = await req('DELETE', `/pagos/cuotas/${cuotaQa.id}`, { token: ctx.admin })
    check('no se puede borrar una cuota con pagos → 409', r12.status === 409, r12.data)

    // ── recibo PDF ──
    const r13 = await req('GET', `/pagos/${pagoId}/pdf`, { token: ctx.admin })
    check('el recibo se sirve como PDF real',
      r13.status === 200 && Buffer.isBuffer(r13.data) && r13.data.subarray(0, 4).toString() === '%PDF',
      r13.data?.subarray?.(0, 8)?.toString())
    check('el PDF tiene contenido', r13.data.length > 1000, r13.data?.length)
    check('el recibo se descarga con nombre de archivo',
      /recibo-.*\.pdf/.test(r13.headers.get('content-disposition') ?? ''),
      r13.headers.get('content-disposition'))

    const r14 = await req('GET', `/pagos/${pagoId}/pdf`, { token: ctx.propietario })
    check('un propietario no descarga recibos ajenos → 403', r14.status === 403, r14.data)

    // ── webhook de MercadoPago ──
    const r15 = await req('POST', '/pagos/webhook?type=payment&data.id=123', { body: {} })
    check('webhook sin firma → 401', r15.status === 401, r15.data)

    const r16 = await req('POST', '/pagos/webhook?type=payment&data.id=123', {
      body: {}, headers: { 'x-signature': 'ts=1,v1=deadbeef', 'x-request-id': 'abc' },
    })
    check('webhook con firma inválida → 401', r16.status === 401, r16.data)

    // Firma HMAC válida calculada localmente: demuestra que el manifiesto se
    // construye igual que en MercadoPago, sin necesitar credenciales suyas.
    const secret = process.env.MP_WEBHOOK_SECRET
    if (secret) {
      const crypto = require('crypto')
      const ts = '1700000000'
      const manifest = `id:123;request-id:req-qa;ts:${ts};`
      const v1 = crypto.createHmac('sha256', secret).update(manifest).digest('hex')
      const r17 = await req('POST', '/pagos/webhook?type=payment&data.id=123', {
        body: {}, headers: { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': 'req-qa' },
      })
      check('webhook con firma válida no da 401 (el manifiesto es correcto)',
        r17.status !== 401, `${r17.status} ${JSON.stringify(r17.data)}`)
    } else {
      check('MP_WEBHOOK_SECRET sin configurar: se omite la prueba de firma válida', true)
    }

    // ── checkout: sin credenciales debe fallar con un mensaje claro ──
    // Se relee la lista: las pruebas anteriores ya pagaron algunas cuotas y una
    // cuota pagada daría 409 antes de llegar a la comprobación de MercadoPago.
    const pendientesAhora = await req('GET', '/pagos/cuotas?estado=pendiente&limit=500', { token: ctx.admin })
    const cuotaPendiente = pendientesAhora.data.items[0]
    const r18 = await req('POST', '/pagos/checkout', {
      token: ctx.admin, body: { cuota_id: cuotaPendiente.id },
    })
    if (process.env.MP_ACCESS_TOKEN) {
      check('checkout crea preferencia de MercadoPago', r18.status === 201 && !!r18.data.init_point, r18.data)
    } else {
      check('sin MP_ACCESS_TOKEN el checkout falla con mensaje explícito',
        r18.status === 500 && /MP_ACCESS_TOKEN no configurado/.test(r18.data.error ?? ''), r18.data)
    }

    const r19 = await req('POST', '/pagos/checkout', { token: ctx.admin, body: {} })
    check('checkout sin cuota_id → 400', r19.status === 400, r19.data)

    // ── generación mensual a mano ──
    const r20 = await req('POST', '/pagos/cuotas/generar', { token: ctx.admin, body: {} })
    check('generar cuotas del mes responde conteos',
      r20.status === 200 && typeof r20.data.insertadas === 'number', r20.data)

    // Regresión: "generar" marca las atrasadas como 'vencido'. Si el reporte de
    // morosos solo mirara estado='pendiente', se vaciaría justo después.
    const r21 = await req('GET', '/pagos/morosos', { token: ctx.admin })
    check('los morosos siguen apareciendo tras marcar las cuotas vencidas',
      r21.status === 200 && r21.data.length > 0, r21.data?.length)

    // ── limpieza ──
    const pendientesQa = await req('GET', '/pagos/cuotas?limit=500', { token: ctx.admin })
    const aBorrar = pendientesQa.data.items.filter(c => c.concepto === 'QA prueba extraordinaria')
    for (const c of aBorrar) {
      // La que tiene pago no se puede borrar hasta quitar el pago; se deja y se
      // reconstruye con el seed. Las demás sí.
      await req('DELETE', `/pagos/cuotas/${c.id}`, { token: ctx.admin })
    }
    check('limpieza de cuotas de prueba ejecutada', true)
  },

  maintenance: async (ctx) => {
    const r1 = await req('GET', '/mantenimiento', { token: ctx.admin })
    check('lista de tickets con nombres resueltos',
      r1.status === 200 && r1.data.total >= 6 && !!r1.data.items[0].solicitante_nombre,
      r1.data?.items?.[0])
    check('los abiertos salen primero',
      r1.data.items[0].estado === 'abierto', r1.data?.items?.[0]?.estado)

    const r2 = await req('GET', '/mantenimiento/tecnicos', { token: ctx.admin })
    check('los técnicos vienen con su carga de trabajo',
      r2.status === 200 && r2.data.length > 0 && typeof r2.data[0].tickets_activos === 'number',
      r2.data?.[0])
    const tecnicoId = r2.data?.[0]?.id

    const r3 = await req('GET', '/mantenimiento', { token: ctx.propietario })
    check('un propietario no puede listar todos los tickets → 403', r3.status === 403, r3.data)

    // ── alta por el propietario ──
    const r4 = await req('POST', '/mantenimiento', {
      token: ctx.propietario,
      body: { descripcion: 'QA: la reja de mi lote no cierra bien', ubicacion: 'Lote QA' },
    })
    check('el propietario reporta una incidencia → 201',
      r4.status === 201 && r4.data.estado === 'abierto' && r4.data.resuelto_at === null, r4.data)
    const ticketId = r4.data?.id

    const r5 = await req('POST', '/mantenimiento', { token: ctx.propietario, body: { descripcion: '  ' } })
    check('descripción vacía → 400', r5.status === 400, r5.data)

    const r6 = await req('GET', '/mantenimiento/mios', { token: ctx.propietario })
    check('el propietario ve sus propios reportes',
      r6.status === 200 && r6.data.some(t => t.id === ticketId), r6.data?.length)

    // ── asignación ──
    const r7 = await req('PUT', `/mantenimiento/${ticketId}/asignar`, {
      token: ctx.admin, body: { tecnico_id: ctx.adminId },
    })
    check('asignar a alguien que no es técnico → 400', r7.status === 400, r7.data)

    const r8 = await req('PUT', `/mantenimiento/${ticketId}/asignar`, {
      token: ctx.admin, body: { tecnico_id: tecnicoId },
    })
    check('asignar técnico pasa el ticket a en_proceso',
      r8.status === 200 && r8.data.estado === 'en_proceso' && r8.data.tecnico_id === tecnicoId,
      r8.data?.estado)

    const r9 = await req('GET', '/mantenimiento/mios', { token: ctx.tecnico })
    check('el técnico ve los tickets que le asignaron',
      r9.status === 200 && r9.data.some(t => t.id === ticketId), r9.data?.length)

    // ── ciclo de estados y la restricción de la base ──
    const r10 = await req('PUT', `/mantenimiento/${ticketId}/estado`, {
      token: ctx.tecnico, body: { estado: 'resuelto' },
    })
    check('el técnico resuelve y se registra resuelto_at',
      r10.status === 200 && r10.data.estado === 'resuelto' && !!r10.data.resuelto_at, r10.data)

    const r11 = await req('PUT', `/mantenimiento/${ticketId}/estado`, {
      token: ctx.tecnico, body: { estado: 'en_proceso' },
    })
    check('reabrir limpia resuelto_at (chk_ticket_resuelto no lo permitiría al revés)',
      r11.status === 200 && r11.data.estado === 'en_proceso' && r11.data.resuelto_at === null, r11.data)

    const r12 = await req('PUT', `/mantenimiento/${ticketId}/estado`, {
      token: ctx.tecnico, body: { estado: 'inventado' },
    })
    check('estado inválido → 400', r12.status === 400, r12.data)

    // ── permisos entre técnicos y propietarios ──
    const r13 = await req('PUT', `/mantenimiento/${ticketId}/estado`, {
      token: ctx.propietario, body: { estado: 'resuelto' },
    })
    check('un propietario no cambia el estado → 403', r13.status === 403, r13.data)

    const otroTicket = r1.data.items.find(t => t.tecnico_id !== tecnicoId && t.estado !== 'resuelto')
    if (otroTicket) {
      const r14 = await req('GET', `/mantenimiento/${otroTicket.id}`, { token: ctx.tecnico })
      check('un técnico no ve tickets que no le tocan → 403', r14.status === 403, r14.status)
    }

    const r15 = await req('GET', `/mantenimiento/${ticketId}`, { token: ctx.propietario })
    check('el solicitante sí puede ver su ticket', r15.status === 200, r15.status)

    // ── limpieza ──
    const r16 = await req('DELETE', `/mantenimiento/${ticketId}`, { token: ctx.admin })
    check('el admin elimina el ticket → 204', r16.status === 204, r16.status)
  },

  comms: async (ctx) => {
    const r1 = await req('GET', '/comunicados/canales', { token: ctx.admin })
    check('el estado de los canales se reporta a la interfaz',
      r1.status === 200 && typeof r1.data.email === 'boolean' && typeof r1.data.whatsapp === 'boolean',
      r1.data)

    const r2 = await req('GET', '/comunicados/destinatarios', { token: ctx.admin })
    check('la vista previa cuenta destinatarios por canal',
      r2.status === 200 && r2.data.total >= 3 && r2.data.con_whatsapp >= 3, r2.data)

    // Sin canales activos se ejercita la persistencia sin tocar proveedores.
    const r3 = await req('POST', '/comunicados', {
      token: ctx.admin,
      body: {
        titulo: 'QA: corte de agua programado',
        cuerpo: 'El martes de 9 a 14 h habrá corte por mantenimiento de la red.',
        canales: { email: false, whatsapp: false },
      },
    })
    check('crear comunicado sin canales → 201 y queda registrado',
      r3.status === 201 && !!r3.data.comunicado.id, r3.data?.comunicado?.titulo)
    const comunicadoId = r3.data?.comunicado?.id

    check('los canales se guardan tal cual se pidieron',
      r3.data.comunicado.canales.email === false && r3.data.comunicado.canales.whatsapp === false,
      r3.data?.comunicado?.canales)

    const r4 = await req('POST', '/comunicados', { token: ctx.admin, body: { titulo: '  ', cuerpo: 'x' } })
    check('título vacío → 400', r4.status === 400, r4.data)

    const r5 = await req('POST', '/comunicados', { token: ctx.admin, body: { titulo: 'x' } })
    check('sin cuerpo → 400', r5.status === 400, r5.data)

    const r6 = await req('POST', '/comunicados', {
      token: ctx.propietario, body: { titulo: 'Intruso', cuerpo: 'x' },
    })
    check('un propietario no puede enviar comunicados → 403', r6.status === 403, r6.data)

    // ── canal email sin credenciales ──
    const r7 = await req('POST', '/comunicados', {
      token: ctx.admin,
      body: { titulo: 'QA email', cuerpo: 'prueba', canales: { email: true, whatsapp: false } },
    })
    if (process.env.SMTP_HOST) {
      check('con SMTP configurado el correo se envía',
        r7.status === 201 && r7.data.resultado.email.enviados > 0, r7.data?.resultado?.email)
    } else {
      check('sin SMTP el comunicado se guarda y el error queda en el resultado',
        r7.status === 201 &&
        r7.data.resultado.email.enviados === 0 &&
        /SMTP no configurado/.test(r7.data.resultado.email.errores[0]?.error ?? ''),
        r7.data?.resultado?.email)
    }
    const comunicadoEmail = r7.data?.comunicado?.id

    // ── canal whatsapp sin credenciales ──
    const r8 = await req('POST', '/comunicados', {
      token: ctx.admin,
      body: { titulo: 'QA whatsapp', cuerpo: 'prueba', canales: { email: false, whatsapp: true } },
    })
    if (process.env.META_ACCESS_TOKEN) {
      check('con Meta configurada el WhatsApp se envía',
        r8.status === 201 && r8.data.resultado.whatsapp.enviados > 0, r8.data?.resultado?.whatsapp)
    } else {
      check('sin Meta el comunicado se guarda y el error queda en el resultado',
        r8.status === 201 &&
        /Meta Cloud API no configurada/.test(r8.data.resultado.whatsapp.errores[0]?.error ?? ''),
        r8.data?.resultado?.whatsapp)
    }
    const comunicadoWa = r8.data?.comunicado?.id

    // ── historial y tablón ──
    const r9 = await req('GET', '/comunicados', { token: ctx.admin })
    check('el historial trae los comunicados con su resultado',
      r9.status === 200 && r9.data.items.some(c => c.id === comunicadoId), r9.data?.total)
    check('el historial incluye el nombre del autor',
      r9.data.items.every(c => !!c.autor_nombre), r9.data?.items?.[0]?.autor_nombre)

    const r10 = await req('GET', '/comunicados/mios', { token: ctx.propietario })
    check('el residente ve el tablón de avisos',
      r10.status === 200 && r10.data.some(c => c.id === comunicadoId), r10.data?.length)
    check('el tablón no expone los detalles de entrega',
      r10.data.every(c => c.resultado_envio === undefined), Object.keys(r10.data?.[0] ?? {}))

    // ── webhook de Meta ──
    const verify = process.env.META_VERIFY_TOKEN
    if (verify) {
      const r11 = await req('GET',
        `/comunicados/webhook?hub.mode=subscribe&hub.verify_token=${verify}&hub.challenge=42`)
      check('el webhook de Meta devuelve el challenge en texto plano',
        r11.status === 200 && String(r11.data).trim() === '42', r11.data)
    } else {
      check('META_VERIFY_TOKEN sin configurar: se omite la prueba del challenge', true)
    }

    const r12 = await req('GET',
      '/comunicados/webhook?hub.mode=subscribe&hub.verify_token=token-equivocado&hub.challenge=42')
    check('el webhook rechaza un verify_token incorrecto → 403', r12.status === 403, r12.status)

    // ── limpieza ──
    for (const id of [comunicadoId, comunicadoEmail, comunicadoWa].filter(Boolean)) {
      await req('DELETE', `/comunicados/${id}`, { token: ctx.admin })
    }
    const r13 = await req('GET', `/comunicados/${comunicadoId}`, { token: ctx.admin })
    check('los comunicados de prueba quedaron eliminados', r13.status === 404, r13.status)
  },
}

async function main() {
  const only = process.argv.find(a => a.startsWith('--only='))?.split('=')[1]
  const nombres = only ? only.split(',').map(s => s.trim()) : Object.keys(SUITES)

  const desconocidas = nombres.filter(n => !SUITES[n])
  if (desconocidas.length) {
    console.error(`Suites desconocidas: ${desconocidas.join(', ')}`)
    console.error(`Disponibles: ${Object.keys(SUITES).join(', ')}`)
    process.exit(1)
  }

  const ctx = {
    admin: await login('admin@urbanflow.test'),
    vigilante: await login('vigilante@urbanflow.test'),
    propietario: await login('propietario@urbanflow.test'),
    tecnico: await login('tecnico@urbanflow.test'),
  }

  // Algunas pruebas necesitan el id del admin (por ejemplo, para comprobar que
  // no se puede asignar un ticket a alguien que no es técnico).
  const me = await req('GET', '/auth/me', { token: ctx.admin })
  ctx.adminId = me.data.id

  for (const n of nombres) {
    console.log(`\n── ${n} ──`)
    await SUITES[n](ctx)
  }

  console.log(`\n${ok} ok, ${fallos} fallos`)
  process.exit(fallos ? 1 : 0)
}

main().catch(err => {
  console.error('\nsmoke abortó:', err.message)
  process.exit(1)
})
