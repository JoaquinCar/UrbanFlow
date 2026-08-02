const pool = require('../../shared/db/pool')
const { httpError } = require('../../shared/utils/errors')
const { verificarQrToken, verificarPaseToken, tipoDeToken } = require('../../shared/utils/qr')
const { aCsv } = require('../../shared/utils/csv')
const pases = require('../passes/passes.service')

const TIPOS = ['visita', 'delivery', 'servicio', 'residente']

// Un mes de bitácora de un fraccionamiento real cabe de sobra; el tope acota la
// memoria si alguien pide un rango absurdo.
const MAX_EXPORT = 10000

const CAMPOS = `
  v.id, v.fraccionamiento_id, v.lote_destino_id, v.nombre_visitante,
  v.placa_vehiculo, v.tipo, v.entrada_at, v.salida_at, v.registrado_por, v.notas
`

const SELECT_COMPLETO = `
  SELECT ${CAMPOS},
         l.numero AS lote_numero,
         u.nombre AS registrado_por_nombre
  FROM visitas v
  INNER JOIN lotes l    ON l.id = v.lote_destino_id
  INNER JOIN usuarios u ON u.id = v.registrado_por
`

async function obtenerConDetalle(id, fraccionamientoId) {
  const { rows } = await pool.query(
    `${SELECT_COMPLETO} WHERE v.id = $1 AND v.fraccionamiento_id = $2`,
    [id, fraccionamientoId]
  )
  return rows[0] ?? null
}

async function registrarEntrada(fraccionamientoId, vigilanteId, datos) {
  const { lote_destino_id, nombre_visitante, tipo, placa_vehiculo, notas } = datos

  if (!lote_destino_id) throw httpError(400, 'El lote destino es requerido')
  if (!nombre_visitante?.trim()) throw httpError(400, 'El nombre del visitante es requerido')
  if (tipo && !TIPOS.includes(tipo)) throw httpError(400, `Tipo de visita inválido: ${tipo}`)

  // El lote debe ser de este fraccionamiento. Sin esta comprobación, un
  // vigilante podría registrar visitas contra lotes de otro fraccionamiento.
  const { rows: lotes } = await pool.query(
    'SELECT id FROM lotes WHERE id = $1 AND fraccionamiento_id = $2',
    [lote_destino_id, fraccionamientoId]
  )
  if (!lotes[0]) throw httpError(404, 'Lote no encontrado en este fraccionamiento')

  const { rows } = await pool.query(
    `INSERT INTO visitas
       (fraccionamiento_id, lote_destino_id, nombre_visitante, placa_vehiculo, tipo, registrado_por, notas)
     VALUES ($1, $2, $3, $4, COALESCE($5::tipo_visita, 'visita'), $6, $7)
     RETURNING id`,
    [
      fraccionamientoId, lote_destino_id, nombre_visitante.trim(),
      placa_vehiculo?.trim() || null, tipo ?? null, vigilanteId, notas?.trim() || null,
    ]
  )
  return obtenerConDetalle(rows[0].id, fraccionamientoId)
}

// Entrada por QR en la caseta. El mismo escáner sirve tanto para el QR fijo
// del residente como para un pase temporal de visitante: hay que ver el
// 'type' del payload antes de saber cuál de los dos flujos validar.
async function entradaPorQr(fraccionamientoId, vigilanteId, token) {
  if (!token) throw httpError(400, 'El token del QR es requerido')

  if (tipoDeToken(token) === 'visitor-pass') {
    const { paseId, fraccionamientoId: paseFraccId } = verificarPaseToken(token)
    if (paseFraccId !== fraccionamientoId) {
      throw httpError(403, 'El código QR pertenece a otro fraccionamiento')
    }
    const { visitaId, invitado } = await pases.consumir(fraccionamientoId, vigilanteId, paseId)
    return { visita: await obtenerConDetalle(visitaId, fraccionamientoId), invitado }
  }

  const payload = verificarQrToken(token)

  // 1. El QR de otro fraccionamiento no abre esta caseta, aunque la firma sea
  //    válida (el secreto es el mismo para toda la instalación).
  if (payload.fraccionamientoId !== fraccionamientoId) {
    throw httpError(403, 'El código QR pertenece a otro fraccionamiento')
  }

  const { rows } = await pool.query(
    `SELECT u.id, u.nombre, u.activo, u.qr_token,
            p.id AS propietario_id,
            l.id AS lote_id, l.numero AS lote_numero
     FROM usuarios u
     LEFT JOIN propietarios p ON p.usuario_id = u.id
     LEFT JOIN LATERAL (
       SELECT id, numero FROM lotes WHERE propietario_id = p.id ORDER BY numero LIMIT 1
     ) l ON TRUE
     WHERE u.id = $1 AND u.fraccionamiento_id = $2`,
    [payload.userId, fraccionamientoId]
  )

  const u = rows[0]
  if (!u) throw httpError(404, 'Residente no encontrado')

  // 2. Revocación por desactivación de la cuenta.
  if (!u.activo) throw httpError(403, 'La cuenta del residente está desactivada')

  // 3. Revocación por rotación. Esto es lo que hace seguro un token que no
  //    expira: usuarios.qr_token es la única fuente de verdad, así que rotarlo
  //    invalida al instante cualquier copia que ande circulando.
  if (u.qr_token !== token) throw httpError(401, 'Código QR revocado')

  if (!u.lote_id) throw httpError(409, 'El residente no tiene lote asignado')

  const { rows: nuevas } = await pool.query(
    `INSERT INTO visitas
       (fraccionamiento_id, lote_destino_id, nombre_visitante, tipo, registrado_por, notas)
     VALUES ($1, $2, $3, 'residente', $4, 'Entrada por código QR')
     RETURNING id`,
    [fraccionamientoId, u.lote_id, u.nombre, vigilanteId]
  )

  return {
    visita: await obtenerConDetalle(nuevas[0].id, fraccionamientoId),
    residente: {
      id: u.id,
      nombre: u.nombre,
      propietario_id: u.propietario_id,
      lote: { id: u.lote_id, numero: u.lote_numero },
    },
  }
}

async function registrarSalida(fraccionamientoId, id) {
  const { rows } = await pool.query(
    `UPDATE visitas SET salida_at = NOW()
     WHERE id = $1 AND fraccionamiento_id = $2 AND salida_at IS NULL
     RETURNING id`,
    [id, fraccionamientoId]
  )

  if (!rows[0]) {
    // Distinguir "no existe" de "ya salió": son problemas distintos para quien
    // está en la caseta.
    const existente = await obtenerConDetalle(id, fraccionamientoId)
    if (!existente) throw httpError(404, 'Visita no encontrada')
    throw httpError(409, 'Esta visita ya tiene salida registrada')
  }

  return obtenerConDetalle(id, fraccionamientoId)
}

// Quién está dentro ahora mismo: la pantalla principal de la caseta.
async function listarActivas(fraccionamientoId) {
  const { rows } = await pool.query(
    `${SELECT_COMPLETO}
     WHERE v.fraccionamiento_id = $1 AND v.salida_at IS NULL
     ORDER BY v.entrada_at DESC`,
    [fraccionamientoId]
  )
  return rows
}

function construirFiltrosBitacora(fraccionamientoId, filtros) {
  const { desde, hasta, tipo, lote_id, q } = filtros

  // Sin fecha desde, la ventana por defecto son 30 días (spec §7).
  const where = `
    WHERE v.fraccionamiento_id = $1
      AND ($2::timestamp IS NULL OR v.entrada_at >= $2)
      AND ($2::timestamp IS NOT NULL OR v.entrada_at >= NOW() - INTERVAL '30 days')
      AND ($3::timestamp IS NULL OR v.entrada_at <= $3)
      AND ($4::tipo_visita IS NULL OR v.tipo = $4)
      AND ($5::uuid IS NULL OR v.lote_destino_id = $5)
      AND ($6::varchar IS NULL OR v.nombre_visitante ILIKE $6 OR v.placa_vehiculo ILIKE $6 OR l.numero ILIKE $6)
  `
  const params = [
    fraccionamientoId,
    desde || null,
    hasta || null,
    tipo || null,
    lote_id || null,
    q ? `%${q}%` : null,
  ]
  return { where, params }
}

async function bitacora(fraccionamientoId, filtros = {}) {
  const limit = Math.min(parseInt(filtros.limit, 10) || 100, 500)
  const offset = parseInt(filtros.offset, 10) || 0
  const { where, params } = construirFiltrosBitacora(fraccionamientoId, filtros)

  const { rows } = await pool.query(
    `${SELECT_COMPLETO} ${where} ORDER BY v.entrada_at DESC LIMIT $7 OFFSET $8`,
    [...params, limit, offset]
  )

  const { rows: conteo } = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM visitas v
     INNER JOIN lotes l ON l.id = v.lote_destino_id
     ${where}`,
    params
  )

  return { items: rows, total: conteo[0].total }
}

const COLUMNAS_CSV = [
  { titulo: 'Entrada', campo: 'entrada_at' },
  { titulo: 'Salida', campo: 'salida_at' },
  { titulo: 'Visitante', campo: 'nombre_visitante' },
  { titulo: 'Tipo', campo: 'tipo' },
  { titulo: 'Placa', campo: 'placa_vehiculo' },
  { titulo: 'Lote', campo: 'lote_numero' },
  { titulo: 'Registró', campo: 'registrado_por_nombre' },
  { titulo: 'Notas', campo: 'notas' },
]

async function bitacoraCsv(fraccionamientoId, filtros = {}) {
  const { where, params } = construirFiltrosBitacora(fraccionamientoId, filtros)

  const { rows } = await pool.query(
    `${SELECT_COMPLETO} ${where} ORDER BY v.entrada_at DESC LIMIT ${MAX_EXPORT}`,
    params
  )

  // Fechas en formato local legible, no ISO con Z: el CSV lo abre una persona.
  const filas = rows.map(r => ({
    ...r,
    entrada_at: r.entrada_at ? new Date(r.entrada_at).toLocaleString('es-MX') : '',
    salida_at: r.salida_at ? new Date(r.salida_at).toLocaleString('es-MX') : 'Dentro',
  }))

  return aCsv(COLUMNAS_CSV, filas)
}

// Visitas dirigidas a los lotes del propietario autenticado.
async function listarPorPropietario(fraccionamientoId, usuarioId, filtros = {}) {
  const limit = Math.min(parseInt(filtros.limit, 10) || 50, 200)

  const { rows } = await pool.query(
    `${SELECT_COMPLETO}
     INNER JOIN propietarios p ON p.id = l.propietario_id
     WHERE v.fraccionamiento_id = $1 AND p.usuario_id = $2
     ORDER BY v.entrada_at DESC
     LIMIT $3`,
    [fraccionamientoId, usuarioId, limit]
  )
  return rows
}

async function obtener(fraccionamientoId, id) {
  const visita = await obtenerConDetalle(id, fraccionamientoId)
  if (!visita) throw httpError(404, 'Visita no encontrada')
  return visita
}

module.exports = {
  registrarEntrada,
  entradaPorQr,
  registrarSalida,
  listarActivas,
  bitacora,
  bitacoraCsv,
  listarPorPropietario,
  obtener,
  TIPOS,
}
