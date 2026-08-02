const pool = require('../../shared/db/pool')
const { httpError } = require('../../shared/utils/errors')
const { generarPaseToken } = require('../../shared/utils/qr')

const TIPOS = ['visita', 'delivery', 'servicio']

// Tope de duración: sin él, un valor manipulado en el request dejaría un
// código "vigente" indefinidamente.
const DURACION_MAX_HORAS = 24 * 7

const CAMPOS = `
  pv.id, pv.nombre_visitante, pv.tipo, pv.expira_at, pv.usado_at,
  pv.visita_id, pv.creado_at, pv.lote_id, l.numero AS lote_numero
`

// Igual que en visits.service.entradaPorQr: un propietario puede tener más de
// un lote, así que se toma el primero por número. Limitación conocida.
async function loteDelPropietario(fraccionamientoId, usuarioId) {
  const { rows } = await pool.query(
    `SELECT l.id, l.numero
     FROM propietarios p
     INNER JOIN LATERAL (
       SELECT id, numero FROM lotes WHERE propietario_id = p.id ORDER BY numero LIMIT 1
     ) l ON TRUE
     WHERE p.usuario_id = $1 AND p.fraccionamiento_id = $2`,
    [usuarioId, fraccionamientoId]
  )
  return rows[0] ?? null
}

async function crear(fraccionamientoId, usuarioId, datos) {
  const { nombre_visitante, tipo, duracion_horas } = datos

  if (!nombre_visitante?.trim()) throw httpError(400, 'El nombre del visitante es requerido')
  if (!TIPOS.includes(tipo)) throw httpError(400, `Tipo de visita inválido: ${tipo}`)

  const horas = Number(duracion_horas)
  if (!Number.isFinite(horas) || horas <= 0 || horas > DURACION_MAX_HORAS) {
    throw httpError(400, `La duración debe ser mayor a 0 y menor a ${DURACION_MAX_HORAS} horas`)
  }

  const lote = await loteDelPropietario(fraccionamientoId, usuarioId)
  if (!lote) throw httpError(409, 'No tienes un lote asignado')

  const { rows } = await pool.query(
    `INSERT INTO pases_visitante
       (fraccionamiento_id, lote_id, creado_por, nombre_visitante, tipo, expira_at)
     VALUES ($1, $2, $3, $4, $5, NOW() + ($6 || ' hours')::interval)
     RETURNING id, expira_at`,
    [fraccionamientoId, lote.id, usuarioId, nombre_visitante.trim(), tipo, horas]
  )

  const pase = rows[0]

  return {
    id: pase.id,
    nombre_visitante: nombre_visitante.trim(),
    tipo,
    lote_numero: lote.numero,
    expira_at: pase.expira_at,
    token: generarPaseToken(pase.id, fraccionamientoId),
  }
}

async function misPases(fraccionamientoId, usuarioId) {
  const { rows } = await pool.query(
    `SELECT ${CAMPOS}
     FROM pases_visitante pv
     INNER JOIN lotes l ON l.id = pv.lote_id
     WHERE pv.fraccionamiento_id = $1 AND pv.creado_por = $2
     ORDER BY pv.creado_at DESC
     LIMIT 100`,
    [fraccionamientoId, usuarioId]
  )
  return rows
}

// Reobtiene el QR de un pase vigente. El token no se guarda: como no lleva
// 'jti' propio, firmarlo de nuevo con el mismo paseId da un JWT distinto en
// bytes pero igualmente válido.
async function obtenerToken(fraccionamientoId, usuarioId, id) {
  const { rows } = await pool.query(
    `SELECT id, expira_at, usado_at FROM pases_visitante
     WHERE id = $1 AND fraccionamiento_id = $2 AND creado_por = $3`,
    [id, fraccionamientoId, usuarioId]
  )
  const pase = rows[0]
  if (!pase) throw httpError(404, 'Pase no encontrado')
  if (pase.usado_at) throw httpError(409, 'Este código ya fue utilizado')
  if (new Date(pase.expira_at) <= new Date()) throw httpError(410, 'Este código ya expiró')

  return generarPaseToken(pase.id, fraccionamientoId)
}

async function cancelar(fraccionamientoId, usuarioId, id) {
  const { rows } = await pool.query(
    `UPDATE pases_visitante SET expira_at = NOW()
     WHERE id = $1 AND fraccionamiento_id = $2 AND creado_por = $3 AND usado_at IS NULL
     RETURNING id`,
    [id, fraccionamientoId, usuarioId]
  )
  if (!rows[0]) throw httpError(404, 'Código no encontrado o ya no está vigente')
}

// Consumo al escanear el QR en la caseta. Lo llama visits.service, que es
// quien arma la respuesta final con el detalle completo de la visita creada.
async function consumir(fraccionamientoId, vigilanteId, paseId) {
  const { rows } = await pool.query(
    `SELECT pv.id, pv.nombre_visitante, pv.tipo, pv.expira_at, pv.usado_at,
            pv.lote_id, l.numero AS lote_numero
     FROM pases_visitante pv
     INNER JOIN lotes l ON l.id = pv.lote_id
     WHERE pv.id = $1 AND pv.fraccionamiento_id = $2`,
    [paseId, fraccionamientoId]
  )
  const pase = rows[0]
  if (!pase) throw httpError(404, 'Código no encontrado')
  if (pase.usado_at) throw httpError(409, 'Este código ya fue utilizado')
  if (new Date(pase.expira_at) <= new Date()) throw httpError(410, 'Este código ya expiró')

  const { rows: nuevas } = await pool.query(
    `INSERT INTO visitas
       (fraccionamiento_id, lote_destino_id, nombre_visitante, tipo, registrado_por, notas)
     VALUES ($1, $2, $3, $4, $5, 'Entrada por código de invitado')
     RETURNING id`,
    [fraccionamientoId, pase.lote_id, pase.nombre_visitante, pase.tipo, vigilanteId]
  )

  await pool.query(
    'UPDATE pases_visitante SET usado_at = NOW(), visita_id = $1 WHERE id = $2',
    [nuevas[0].id, pase.id]
  )

  return {
    visitaId: nuevas[0].id,
    invitado: {
      nombre: pase.nombre_visitante,
      tipo: pase.tipo,
      lote: { id: pase.lote_id, numero: pase.lote_numero },
    },
  }
}

module.exports = {
  crear, misPases, obtenerToken, cancelar, consumir, TIPOS, DURACION_MAX_HORAS,
}
