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
  if (tipo.includes('json')) data = await res.json()
  else if (tipo.includes('pdf') || tipo.includes('image') || tipo.includes('octet-stream')) {
    data = Buffer.from(await res.arrayBuffer())
  } else data = await res.text()

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
