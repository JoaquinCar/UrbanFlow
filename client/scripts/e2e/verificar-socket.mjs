import { io } from 'socket.io-client'

// Prueba de regresión del fallo de seguridad corregido en el PR #8: la
// conexión de Socket.io no exigía token y 'join-caseta' aceptaba el
// fraccionamiento que mandara el cliente, así que cualquier navegador podía
// escuchar en vivo el registro de visitantes de otro fraccionamiento.
//
//   node client/scripts/e2e/verificar-socket.mjs
//
// A diferencia del resto de scripts de este directorio, no necesita navegador:
// usa socket.io-client directamente.

const API = 'http://localhost:3000/api'
const URL = 'http://localhost:3000'
let ok = 0, fallos = 0
const check = (n, c, x) => c ? (ok++, console.log(`  ✓ ${n}`)) : (fallos++, console.error(`  ✗ ${n}`, x ?? ''))

async function login(email) {
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'UrbanFlow2026!' }),
  })
  const d = await r.json()
  return d.accessToken
}

function conectar(auth) {
  return new Promise((resolve) => {
    const s = io(URL, { auth, transports: ['websocket'], reconnection: false })
    s.on('connect', () => resolve({ ok: true, socket: s }))
    s.on('connect_error', (e) => resolve({ ok: false, error: e.message }))
    setTimeout(() => resolve({ ok: false, error: 'timeout' }), 5000)
  })
}

const tokenVig = await login('vigilante@urbanflow.test')
const tokenAdmin2 = await login('admin2@urbanflow.test')  // otro fraccionamiento

console.log('\n── autenticación del socket ──')
const sinToken = await conectar({})
check('conexión sin token → rechazada', !sinToken.ok, sinToken.error)

const tokenMalo = await conectar({ token: 'basura' })
check('conexión con token inválido → rechazada', !tokenMalo.ok, tokenMalo.error)

const conToken = await conectar({ token: tokenVig })
check('conexión con token válido → aceptada', conToken.ok, conToken.error)

console.log('\n── aislamiento de la sala de caseta ──')
// El vigilante de Las Palmas escucha; el admin del otro fraccionamiento
// intenta unirse a la sala mandando un id ajeno.
const espia = await conectar({ token: tokenAdmin2 })
check('el usuario de otro fraccionamiento sí conecta', espia.ok, espia.error)

let recibioEspia = false
let recibioVigilante = false
espia.socket.on('nueva-visita', () => { recibioEspia = true })
conToken.socket.on('nueva-visita', () => { recibioVigilante = true })

// Antes, join-caseta aceptaba el id del cliente. Ahora lo ignora.
espia.socket.emit('join-caseta', (await (await fetch(`${API}/auth/me`, {
  headers: { Authorization: `Bearer ${tokenVig}` },
})).json()).fraccionamiento_id)
conToken.socket.emit('join-caseta')

await new Promise(r => setTimeout(r, 600))

// Se genera una visita real en Las Palmas.
const lotes = await (await fetch(`${API}/fraccionamiento/lotes?estado=vendido&limit=1`, {
  headers: { Authorization: `Bearer ${tokenVig}` },
})).json()

const alta = await fetch(`${API}/visitas/entrada`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenVig}` },
  body: JSON.stringify({ lote_destino_id: lotes.items[0].id, nombre_visitante: 'Socket QA' }),
})
const visita = await alta.json()
await new Promise(r => setTimeout(r, 900))

check('el vigilante del fraccionamiento recibe nueva-visita', recibioVigilante)
check('un usuario de otro fraccionamiento NO recibe el evento aunque mande el id ajeno', !recibioEspia)

// limpieza
await fetch(`${API}/visitas/${visita.id}/salida`, {
  method: 'PUT', headers: { Authorization: `Bearer ${tokenVig}` },
})

conToken.socket?.close(); espia.socket?.close()
console.log(`\n${ok} ok, ${fallos} fallos`)
process.exit(fallos ? 1 : 0)
