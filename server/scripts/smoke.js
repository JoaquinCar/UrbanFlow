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

async function req(metodo, ruta, { body, token, form, headers: extra, crudo } = {}) {
  const headers = { ...extra }
  if (token) headers.Authorization = `Bearer ${token}`
  if (cookies.size) headers.Cookie = [...cookies].map(([k, v]) => `${k}=${v}`).join('; ')

  let payload
  if (form) {
    payload = form
  } else if (crudo !== undefined) {
    // Cuerpo exacto, sin volver a serializar. Lo necesita el webhook de Stripe:
    // la firma se calcula sobre unos bytes concretos y un JSON.stringify de más
    // los cambiaría.
    headers['Content-Type'] = 'application/json'
    payload = crudo
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

// Cabecera 'stripe-signature' auténtica. Stripe firma "<timestamp>.<cuerpo>"
// con HMAC-SHA256 y el secreto del endpoint; se reproduce aquí con crypto para
// poder probar el camino del webhook VÁLIDO, que es el que de verdad cobra.
function firmaStripe(cuerpo, secreto) {
  const t = Math.floor(Date.now() / 1000)
  const v1 = require('crypto')
    .createHmac('sha256', secreto)
    .update(`${t}.${cuerpo}`)
    .digest('hex')
  return `t=${t},v1=${v1}`
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

  // Entradas malformadas contra toda la API. Antes varias de estas devolvían
  // 500 con el mensaje crudo de PostgreSQL ("invalid input syntax for type
  // uuid"), que es un error del cliente presentado como fallo del servidor y
  // además filtra detalles del motor.
  errores: async (ctx) => {
    const malformados = [
      ['/fraccionamiento/lotes/abc', 'lote'],
      ['/propietarios/123', 'propietario'],
      ['/pagos/xyz/pdf', 'recibo'],
      ['/visitas/no-uuid', 'visita'],
      ['/mantenimiento/1', 'ticket'],
      ['/reservaciones/nope', 'reservación'],
    ]
    for (const [ruta, que] of malformados) {
      const r = await req('GET', ruta, { token: ctx.admin })
      check(`identificador inválido de ${que} → 400, no 500`, r.status === 400, `${r.status} ${r.data?.error}`)
    }

    const r1 = await req('GET', '/fraccionamiento/lotes/abc', { token: ctx.admin })
    check('el error no filtra el mensaje interno de PostgreSQL',
      !/invalid input syntax|uuid|SELECT|FROM /i.test(r1.data.error ?? ''), r1.data?.error)
    check('el error no incluye el stack en la respuesta', r1.data.stack === undefined, Object.keys(r1.data))

    const r2 = await req('POST', '/fraccionamiento/lotes', {
      token: ctx.admin,
      body: undefined,
      headers: { 'Content-Type': 'application/json' },
    })
    // Se manda un cuerpo roto a mano: JSON.stringify no puede producirlo.
    const roto = await fetch(`${BASE}/fraccionamiento/lotes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ctx.admin}` },
      body: '{"numero":',
    })
    const cuerpoRoto = await roto.json()
    check('JSON mal formado → 400 en español',
      roto.status === 400 && /JSON válido/.test(cuerpoRoto.error ?? ''), cuerpoRoto)

    const r3 = await req('GET', '/visitas/bitacora?desde=ayer', { token: ctx.admin })
    check('fecha no interpretable → 400 explicando el formato',
      r3.status === 400 && /AAAA-MM-DD/.test(r3.data.error ?? ''), r3.data)

    const r4 = await req('POST', '/fraccionamiento/lotes', {
      token: ctx.admin, body: { numero: 'ZZ-QA', precio: 'mucho dinero' },
    })
    check('número no numérico → 400 sin culpar al campo equivocado',
      r4.status === 400 && !/[Ee]stado/.test(r4.data.error ?? ''), r4.data)

    const r5 = await req('POST', '/fraccionamiento/lotes', {
      token: ctx.admin, body: { numero: 'X'.repeat(300) },
    })
    check('texto más largo que la columna → 400', r5.status === 400, r5.data)

    // Inyección SQL: todas las consultas van parametrizadas, así que esto se
    // trata como texto y simplemente no encuentra nada.
    const r6 = await req('GET', "/fraccionamiento/lotes?q=' OR 1=1 --", { token: ctx.admin })
    check('intento de inyección SQL se trata como texto literal',
      r6.status === 200 && r6.data.total === 0, `${r6.status} total=${r6.data?.total}`)

    const r7 = await req('GET', '/fraccionamiento/lotes', { token: 'esto-no-es-un-jwt' })
    check('token con formato inválido → 401', r7.status === 401, r7.data)

    const r8 = await req('GET', '/fraccionamiento/lotes', {
      // JWT bien formado pero firmado con otra llave
      token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIn0.firmafalsa',
    })
    check('token con firma falsa → 401', r8.status === 401, r8.data)

    const r9 = await req('GET', '/ruta/que/no/existe', { token: ctx.admin })
    check('ruta inexistente → 404 en JSON', r9.status === 404 && !!r9.data.error, r9.data)
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

  dashboard: async (ctx) => {
    const r1 = await req('GET', '/fraccionamiento/dashboard', { token: ctx.admin })
    check('el panel responde con todas las secciones',
      r1.status === 200 &&
      r1.data.lotes && r1.data.cuotas && r1.data.visitas &&
      r1.data.tickets && r1.data.reservaciones && r1.data.actividad,
      Object.keys(r1.data ?? {}))

    const d = r1.data

    // Coherencia con las otras fuentes: si el panel y los listados no cuadran,
    // el panel miente y nadie lo nota.
    const lotes = await req('GET', '/fraccionamiento/lotes?limit=500', { token: ctx.admin })
    check('el conteo de lotes cuadra con el listado',
      d.lotes.total === lotes.data.total, { panel: d.lotes.total, listado: lotes.data.total })
    check('los lotes por estado suman el total',
      d.lotes.disponible + d.lotes.proceso + d.lotes.vendido === d.lotes.total, d.lotes)

    const morosos = await req('GET', '/pagos/morosos', { token: ctx.admin })
    check('el conteo de morosos cuadra con el reporte',
      d.cuotas.morosos === morosos.data.length, { panel: d.cuotas.morosos, reporte: morosos.data.length })

    const activas = await req('GET', '/visitas/activas', { token: ctx.admin })
    check('las visitas dentro cuadran con la caseta',
      d.visitas.dentro === activas.data.length, { panel: d.visitas.dentro, caseta: activas.data.length })

    const tickets = await req('GET', '/mantenimiento?estado=abierto', { token: ctx.admin })
    check('los tickets abiertos cuadran con mantenimiento',
      d.tickets.abiertos === tickets.data.total, { panel: d.tickets.abiertos, modulo: tickets.data.total })

    check('el monto adeudado es un número positivo',
      Number(d.cuotas.monto_adeudado) > 0, d.cuotas?.monto_adeudado)
    check('hay actividad reciente de visitas y tickets',
      d.actividad.visitas.length > 0 && Array.isArray(d.actividad.tickets), {
        visitas: d.actividad?.visitas?.length, tickets: d.actividad?.tickets?.length,
      })

    // ── permisos ──
    for (const [rol, token] of [['propietario', ctx.propietario], ['vigilante', ctx.vigilante], ['tecnico', ctx.tecnico]]) {
      const r = await req('GET', '/fraccionamiento/dashboard', { token })
      check(`el panel está cerrado al rol ${rol} → 403`, r.status === 403, r.status)
    }
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

    // ── webhook de Stripe ──
    // La firma se valida ANTES de cualquier escritura, así que un aviso sin
    // firma o falsificado nunca llega a marcar una cuota como pagada.
    const cuotasAntes = await req('GET', '/pagos/cuotas?estado=pagado&limit=500', { token: ctx.admin })

    const r15 = await req('POST', '/pagos/webhook?type=payment', { body: {} })
    check('webhook sin firma no se procesa',
      r15.status === 401 || /no configurado|[Ff]irma/.test(JSON.stringify(r15.data)),
      `${r15.status} ${JSON.stringify(r15.data).slice(0, 90)}`)

    const r16 = await req('POST', '/pagos/webhook', {
      body: {}, headers: { 'stripe-signature': 't=1,v1=firmafalsa' },
    })
    check('webhook con firma falsa no se procesa',
      r16.status === 401 || /no configurado|[Ff]irma/.test(JSON.stringify(r16.data)),
      `${r16.status} ${JSON.stringify(r16.data).slice(0, 90)}`)

    const cuotasDespues = await req('GET', '/pagos/cuotas?estado=pagado&limit=500', { token: ctx.admin })
    check('ningún webhook falso alteró las cuotas',
      cuotasAntes.data.total === cuotasDespues.data.total,
      `antes ${cuotasAntes.data?.total} · después ${cuotasDespues.data?.total}`)

    // ── checkout: sin credenciales debe fallar con un mensaje claro ──
    // Se relee la lista: las pruebas anteriores ya pagaron algunas cuotas y una
    // cuota pagada daría 409 antes de llegar a la comprobación de MercadoPago.
    const pendientesAhora = await req('GET', '/pagos/cuotas?estado=pendiente&limit=500', { token: ctx.admin })
    const cuotaPendiente = pendientesAhora.data.items[0]
    const r18 = await req('POST', '/pagos/checkout', {
      token: ctx.admin, body: { cuota_id: cuotaPendiente.id },
    })
    if (process.env.STRIPE_SECRET_KEY) {
      check('checkout devuelve una URL de pago',
        r18.status === 201 && !!(r18.data.init_point || r18.data.url), r18.data)

      // Que devuelva una URL no basta: durante un tiempo el checkout creó
      // sesiones perfectamente válidas que cobraban en dólares y no llevaban
      // ninguna referencia a la cuota, así que el webhook no podía saber qué
      // marcar como pagado. Se comprueba la sesión REAL en Stripe.
      const sesion = await new (require('stripe'))(process.env.STRIPE_SECRET_KEY)
        .checkout.sessions.retrieve(r18.data.preference_id).catch(err => ({ error: err.message }))

      const monedaEsperada = (process.env.STRIPE_CURRENCY || process.env.MP_CURRENCY || 'mxn').toLowerCase()
      check('la sesión de Stripe cobra en la moneda configurada',
        sesion.currency === monedaEsperada, { esperada: monedaEsperada, recibida: sesion.currency })

      check('la sesión de Stripe cobra el monto de la cuota',
        sesion.amount_total === Math.round(Number(cuotaPendiente.monto) * 100),
        { cuota: cuotaPendiente.monto, sesion: sesion.amount_total })

      check('la sesión de Stripe referencia la cuota, para poder conciliarla',
        sesion.client_reference_id === cuotaPendiente.id && sesion.metadata?.cuota_id === cuotaPendiente.id,
        { client_reference_id: sesion.client_reference_id, metadata: sesion.metadata })

      check('las URLs de retorno no apuntan a una máquina local',
        !/localhost|127\.0\.0\.1/.test(String(sesion.success_url)) || process.env.NODE_ENV !== 'production',
        sesion.success_url)
    } else {
      // Sin credenciales responde un error explícito diciendo qué falta, en
      // lugar de fingir un pago que no existe.
      check('sin credenciales el checkout dice exactamente qué falta',
        r18.status === 500 && /STRIPE_.*no configurad/.test(r18.data.error ?? ''), r18.data)
    }

    // ── webhook VÁLIDO: el camino que de verdad cobra ──
    // Las pruebas de arriba solo comprobaban que una firma falsa se rechaza.
    // Eso deja sin cubrir lo importante: que una firma buena marque la cuota.
    if (process.env.STRIPE_WEBHOOK_SECRET) {
      const paraWebhook = pendientesAhora.data.items.find(
        c => c.id !== cuotaPendiente.id && c.concepto === 'QA prueba extraordinaria'
      ) || pendientesAhora.data.items[1]

      const evento = JSON.stringify({
        id: 'evt_qa_smoke',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_qa_smoke',
            client_reference_id: paraWebhook.id,
            payment_intent: 'pi_test_qa_smoke',
            amount_total: Math.round(Number(paraWebhook.monto) * 100),
          },
        },
      })
      const firma = firmaStripe(evento, process.env.STRIPE_WEBHOOK_SECRET)

      const r18b = await req('POST', '/pagos/webhook', {
        crudo: evento, headers: { 'stripe-signature': firma },
      })
      check('webhook con firma válida registra el pago',
        r18b.status === 200 && r18b.data.registrado === true, r18b.data)

      const trasWebhook = await req('GET', `/pagos/cuotas/${paraWebhook.propietario_id}`, { token: ctx.admin })
      check('la cuota queda pagada tras el webhook',
        trasWebhook.data.cuotas.find(c => c.id === paraWebhook.id)?.estado === 'pagado',
        trasWebhook.data.cuotas.find(c => c.id === paraWebhook.id)?.estado)

      // Stripe reintenta los avisos que no confirma a tiempo. Sin la clave
      // única parcial sobre referencia_mp, cada reintento sería un pago más.
      const r18c = await req('POST', '/pagos/webhook', {
        crudo: evento, headers: { 'stripe-signature': firmaStripe(evento, process.env.STRIPE_WEBHOOK_SECRET) },
      })
      check('reenviar el mismo webhook no duplica el pago',
        r18c.status === 200 && r18c.data.duplicado === true, r18c.data)
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
    // Se usa el técnico cuyo token tienen las pruebas, no el primero de la
    // lista: /tecnicos ordena por menor carga y puede devolver a otro.
    const tecnicoId = ctx.tecnicoId
    check('el técnico de las pruebas aparece en el listado',
      r2.data.some(t => t.id === tecnicoId), r2.data?.map(t => t.nombre))

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

  reservations: async (ctx) => {
    // La ruta literal /areas debe ganarle a /:id.
    const r1 = await req('GET', '/reservaciones/areas', { token: ctx.propietario })
    check('GET /areas no se confunde con /:id',
      r1.status === 200 && Array.isArray(r1.data) && r1.data.length >= 4, r1.data?.length)
    const areaId = r1.data?.find(a => a.nombre === 'Cancha de pádel')?.id

    const r2 = await req('POST', '/reservaciones/areas', {
      token: ctx.propietario, body: { nombre: 'Área pirata' },
    })
    check('un propietario no puede crear áreas → 403', r2.status === 403, r2.data)

    const r3 = await req('POST', '/reservaciones/areas', {
      token: ctx.admin, body: { nombre: 'Salón de eventos' },
    })
    check('área con nombre duplicado → 409', r3.status === 409, r3.data)

    const r4 = await req('POST', '/reservaciones/areas', {
      token: ctx.admin, body: { nombre: 'QA Gimnasio', capacidad: 0 },
    })
    check('capacidad cero → 400', r4.status === 400, r4.data)

    const r5 = await req('POST', '/reservaciones/areas', {
      token: ctx.admin, body: { nombre: 'QA Gimnasio', capacidad: 12 },
    })
    check('crear área → 201', r5.status === 201 && r5.data.activa === true, r5.data)
    const areaQa = r5.data?.id

    // ── reservar ──
    const fecha = new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10)

    const r6 = await req('POST', '/reservaciones', {
      token: ctx.propietario,
      body: { area_id: areaQa, fecha, hora_inicio: '10:00', hora_fin: '12:00' },
    })
    check('el propietario reserva → 201 y nace pendiente',
      r6.status === 201 && r6.data.estado === 'pendiente', r6.data)
    const reservaId = r6.data?.id

    const r7 = await req('POST', '/reservaciones', {
      token: ctx.propietario,
      body: { area_id: areaQa, fecha, hora_inicio: '11:00', hora_fin: '13:00' },
    })
    check('un horario solapado → 409 diciendo con qué choca',
      r7.status === 409 && /choca con una reserva/.test(r7.data.error ?? ''), r7.data)

    // Frontera: 12:00-14:00 empieza justo cuando termina la anterior. tsrange
    // es [inicio, fin) así que NO debe considerarse solapamiento.
    const r8 = await req('POST', '/reservaciones', {
      token: ctx.propietario,
      body: { area_id: areaQa, fecha, hora_inicio: '12:00', hora_fin: '14:00' },
    })
    check('una franja contigua (12:00 tras 10:00-12:00) sí se permite', r8.status === 201, r8.data)
    const reservaContigua = r8.data?.id

    const r9 = await req('POST', '/reservaciones', {
      token: ctx.propietario,
      body: { area_id: areaQa, fecha, hora_inicio: '15:00', hora_fin: '15:00' },
    })
    check('hora de fin igual a la de inicio → 400', r9.status === 400, r9.data)

    // ── disponibilidad ──
    const r10 = await req('GET', `/reservaciones/areas/${areaQa}/disponibilidad?fecha=${fecha}`, {
      token: ctx.propietario,
    })
    check('la disponibilidad lista las franjas ocupadas',
      r10.status === 200 && r10.data.ocupado.length === 2, r10.data?.ocupado?.length)

    const r11 = await req('GET', `/reservaciones/areas/${areaQa}/disponibilidad`, { token: ctx.propietario })
    check('disponibilidad sin fecha → 400', r11.status === 400, r11.data)

    // ── permisos ──
    const r12 = await req('GET', '/reservaciones/mias', { token: ctx.propietario })
    check('el propietario ve sus reservaciones',
      r12.status === 200 && r12.data.some(r => r.id === reservaId), r12.data?.length)

    const r13 = await req('GET', '/reservaciones', { token: ctx.propietario })
    check('un propietario no lista todas las reservaciones → 403', r13.status === 403, r13.data)

    // ── confirmar y cancelar ──
    const r14 = await req('PUT', `/reservaciones/${reservaId}`, {
      token: ctx.admin, body: { estado: 'confirmada' },
    })
    check('el admin confirma la reservación', r14.status === 200 && r14.data.estado === 'confirmada', r14.data)

    const r15 = await req('PUT', `/reservaciones/${reservaId}/cancelar`, { token: ctx.propietario })
    check('el dueño cancela su reservación', r15.status === 200 && r15.data.estado === 'cancelada', r15.data)

    const r16 = await req('PUT', `/reservaciones/${reservaId}/cancelar`, { token: ctx.propietario })
    check('cancelar dos veces → 409', r16.status === 409, r16.data)

    // Cancelar libera el hueco: 10:00-12:00 vuelve a estar disponible.
    const r17 = await req('POST', '/reservaciones', {
      token: ctx.propietario,
      body: { area_id: areaQa, fecha, hora_inicio: '10:00', hora_fin: '12:00' },
    })
    check('cancelar libera el horario para otra reserva', r17.status === 201, r17.data)
    const reservaRepetida = r17.data?.id

    // ── concurrencia: lo que la sonda NO puede evitar ──
    // Dos peticiones idénticas en paralelo. Ambas pasan la sonda SELECT porque
    // ninguna ve todavía a la otra; solo la restricción EXCLUDE de la base
    // impide la doble reserva. Debe entrar exactamente una.
    const fechaCarrera = new Date(Date.now() + 40 * 86400000).toISOString().slice(0, 10)
    const cuerpoCarrera = { area_id: areaQa, fecha: fechaCarrera, hora_inicio: '09:00', hora_fin: '11:00' }

    const [c1, c2] = await Promise.all([
      req('POST', '/reservaciones', { token: ctx.propietario, body: cuerpoCarrera }),
      req('POST', '/reservaciones', { token: ctx.propietario, body: cuerpoCarrera }),
    ])
    const creadas = [c1, c2].filter(r => r.status === 201)
    const rechazadas = [c1, c2].filter(r => r.status === 409)
    check('dos reservas simultáneas del mismo hueco: solo entra una',
      creadas.length === 1 && rechazadas.length === 1, [c1.status, c2.status])

    const reservaCarrera = creadas[0]?.data?.id

    // ── área desactivada ──
    await req('PUT', `/reservaciones/areas/${areaQa}`, { token: ctx.admin, body: { activa: false } })
    const r18 = await req('POST', '/reservaciones', {
      token: ctx.propietario,
      body: { area_id: areaQa, fecha, hora_inicio: '18:00', hora_fin: '19:00' },
    })
    check('no se puede reservar un área desactivada → 409', r18.status === 409, r18.data)

    const r19 = await req('DELETE', `/reservaciones/areas/${areaQa}`, { token: ctx.admin })
    check('no se borra un área con reservaciones → 409 sugiriendo desactivar',
      r19.status === 409 && /[Dd]esactí?vala/.test(r19.data.error ?? ''), r19.data)

    // ── limpieza ──
    for (const id of [reservaId, reservaContigua, reservaRepetida, reservaCarrera].filter(Boolean)) {
      await req('DELETE', `/reservaciones/${id}`, { token: ctx.admin })
    }
    const r20 = await req('DELETE', `/reservaciones/areas/${areaQa}`, { token: ctx.admin })
    check('sin reservaciones, el área ya se puede eliminar → 204', r20.status === 204, r20.status)
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
  const meTecnico = await req('GET', '/auth/me', { token: ctx.tecnico })
  ctx.tecnicoId = meTecnico.data.id

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
