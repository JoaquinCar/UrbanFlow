const pool = require('../../shared/db/pool')
const { httpError } = require('../../shared/utils/errors')

// Todas las funciones reciben fraccionamientoId como primer argumento y filtran
// por él. Es el contrato multi-tenant: un admin de Las Palmas no puede tocar
// nada de Jardines del Sol aunque adivine un UUID.

const CAMPOS_LOTE = `
  l.id, l.fraccionamiento_id, l.numero, l.superficie_m2, l.precio,
  l.etapa, l.estado, l.svg_path_id, l.propietario_id, l.created_at
`

// La misma lista sin el alias, para los RETURNING.
const CAMPOS_LOTE_RET = CAMPOS_LOTE.replace(/l\./g, '')

async function obtenerFraccionamiento(fraccionamientoId) {
  const { rows } = await pool.query(
    `SELECT id, nombre, direccion, config_mapa, created_at
     FROM fraccionamientos WHERE id = $1`,
    [fraccionamientoId]
  )
  if (!rows[0]) throw httpError(404, 'Fraccionamiento no encontrado')
  return rows[0]
}

async function actualizarFraccionamiento(fraccionamientoId, datos) {
  const { nombre, direccion, config_mapa } = datos
  const { rows } = await pool.query(
    `UPDATE fraccionamientos SET
       nombre      = COALESCE($2, nombre),
       direccion   = COALESCE($3, direccion),
       config_mapa = COALESCE($4, config_mapa)
     WHERE id = $1
     RETURNING id, nombre, direccion, config_mapa, created_at`,
    [fraccionamientoId, nombre ?? null, direccion ?? null, config_mapa ?? null]
  )
  if (!rows[0]) throw httpError(404, 'Fraccionamiento no encontrado')
  return rows[0]
}

async function listarLotes(fraccionamientoId, filtros = {}) {
  const { estado, etapa, q } = filtros
  const limit = Math.min(parseInt(filtros.limit, 10) || 50, 200)
  const offset = parseInt(filtros.offset, 10) || 0

  // Los filtros opcionales se resuelven con "$n IS NULL OR ..." para no armar
  // el SQL por concatenación.
  const params = [fraccionamientoId, estado ?? null, etapa ?? null, q ? `%${q}%` : null]

  const where = `
    WHERE l.fraccionamiento_id = $1
      AND ($2::estado_lote IS NULL OR l.estado = $2)
      AND ($3::varchar     IS NULL OR l.etapa  = $3)
      AND ($4::varchar     IS NULL OR l.numero ILIKE $4 OR p.nombre_completo ILIKE $4)
  `

  const { rows } = await pool.query(
    `SELECT ${CAMPOS_LOTE}, p.nombre_completo AS propietario_nombre
     FROM lotes l
     LEFT JOIN propietarios p ON p.id = l.propietario_id
     ${where}
     ORDER BY l.etapa NULLS LAST, l.numero
     LIMIT $5 OFFSET $6`,
    [...params, limit, offset]
  )

  const { rows: conteo } = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM lotes l
     LEFT JOIN propietarios p ON p.id = l.propietario_id
     ${where}`,
    params
  )

  return { items: rows, total: conteo[0].total }
}

async function obtenerLote(fraccionamientoId, id) {
  const { rows } = await pool.query(
    `SELECT ${CAMPOS_LOTE},
            p.nombre_completo AS propietario_nombre,
            p.telefono        AS propietario_telefono,
            p.whatsapp        AS propietario_whatsapp
     FROM lotes l
     LEFT JOIN propietarios p ON p.id = l.propietario_id
     WHERE l.id = $1 AND l.fraccionamiento_id = $2`,
    [id, fraccionamientoId]
  )
  const lote = rows[0]
  if (!lote) throw httpError(404, 'Lote no encontrado')

  const { propietario_nombre, propietario_telefono, propietario_whatsapp, ...resto } = lote
  return {
    ...resto,
    propietario: lote.propietario_id
      ? {
          id: lote.propietario_id,
          nombre_completo: propietario_nombre,
          telefono: propietario_telefono,
          whatsapp: propietario_whatsapp,
        }
      : null,
  }
}

// Valida que el propietario exista y sea del mismo fraccionamiento. Sin esta
// comprobación se podría colgar un lote de un propietario de otro
// fraccionamiento pasando su UUID.
async function validarPropietario(fraccionamientoId, propietarioId) {
  if (!propietarioId) return
  const { rows } = await pool.query(
    'SELECT id FROM propietarios WHERE id = $1 AND fraccionamiento_id = $2',
    [propietarioId, fraccionamientoId]
  )
  if (!rows[0]) throw httpError(404, 'Propietario no encontrado en este fraccionamiento')
}

async function crearLote(fraccionamientoId, datos) {
  const { numero, superficie_m2, precio, etapa, estado, svg_path_id, propietario_id } = datos
  if (!numero) throw httpError(400, 'El número de lote es requerido')

  await validarPropietario(fraccionamientoId, propietario_id)

  try {
    const { rows } = await pool.query(
      `INSERT INTO lotes
         (fraccionamiento_id, numero, superficie_m2, precio, etapa, estado, svg_path_id, propietario_id)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6::estado_lote, 'disponible'), $7, $8)
       RETURNING ${CAMPOS_LOTE_RET}`,
      [
        fraccionamientoId, numero, superficie_m2 ?? null, precio ?? null,
        etapa ?? null, estado ?? null, svg_path_id ?? null, propietario_id ?? null,
      ]
    )
    return rows[0]
  } catch (err) {
    if (err.code === '23505') throw httpError(409, `Ya existe el lote ${numero} en este fraccionamiento`)
    if (err.code === '22P02') throw httpError(400, 'Estado de lote inválido')
    throw err
  }
}

async function actualizarLote(fraccionamientoId, id, datos) {
  const { numero, superficie_m2, precio, etapa, estado, svg_path_id } = datos

  try {
    const { rows } = await pool.query(
      `UPDATE lotes SET
         numero        = COALESCE($3, numero),
         superficie_m2 = COALESCE($4, superficie_m2),
         precio        = COALESCE($5, precio),
         etapa         = COALESCE($6, etapa),
         estado        = COALESCE($7::estado_lote, estado),
         svg_path_id   = COALESCE($8, svg_path_id)
       WHERE id = $1 AND fraccionamiento_id = $2
       RETURNING ${CAMPOS_LOTE_RET}`,
      [
        id, fraccionamientoId, numero ?? null, superficie_m2 ?? null,
        precio ?? null, etapa ?? null, estado ?? null, svg_path_id ?? null,
      ]
    )
    if (!rows[0]) throw httpError(404, 'Lote no encontrado')
    return rows[0]
  } catch (err) {
    if (err.code === '23505') throw httpError(409, `Ya existe el lote ${numero} en este fraccionamiento`)
    if (err.code === '22P02') throw httpError(400, 'Estado de lote inválido')
    throw err
  }
}

async function eliminarLote(fraccionamientoId, id) {
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM lotes WHERE id = $1 AND fraccionamiento_id = $2',
      [id, fraccionamientoId]
    )
    if (rowCount === 0) throw httpError(404, 'Lote no encontrado')
  } catch (err) {
    // 23503: algo apunta a este lote (una visita, por ejemplo).
    if (err.code === '23503') {
      throw httpError(409, 'El lote tiene registros asociados y no puede eliminarse')
    }
    throw err
  }
}

// Asignar propietario marca el lote como vendido; quitarlo lo devuelve a
// disponible. Es la regla que usa el cron de cuotas para saber quién paga.
async function asignarPropietario(fraccionamientoId, id, propietarioId) {
  await validarPropietario(fraccionamientoId, propietarioId)

  const { rows } = await pool.query(
    `UPDATE lotes
     SET propietario_id = $3,
         estado = CASE WHEN $3::uuid IS NULL THEN 'disponible'::estado_lote
                       ELSE 'vendido'::estado_lote END
     WHERE id = $1 AND fraccionamiento_id = $2
     RETURNING ${CAMPOS_LOTE_RET}`,
    [id, fraccionamientoId, propietarioId ?? null]
  )
  if (!rows[0]) throw httpError(404, 'Lote no encontrado')
  return rows[0]
}

// Datos mínimos para pintar el mapa: el SVG se colorea por estado y el click
// resuelve el lote a través de svg_path_id.
async function obtenerMapa(fraccionamientoId) {
  const fracc = await obtenerFraccionamiento(fraccionamientoId)

  const { rows } = await pool.query(
    `SELECT l.id, l.numero, l.estado, l.etapa, l.svg_path_id,
            p.nombre_completo AS propietario_nombre
     FROM lotes l
     LEFT JOIN propietarios p ON p.id = l.propietario_id
     WHERE l.fraccionamiento_id = $1
     ORDER BY l.numero`,
    [fraccionamientoId]
  )

  const resumen = rows.reduce((acc, l) => {
    acc[l.estado] = (acc[l.estado] || 0) + 1
    return acc
  }, { disponible: 0, proceso: 0, vendido: 0 })

  return { config_mapa: fracc.config_mapa, lotes: rows, resumen, total: rows.length }
}

// Etapas existentes, para poblar el filtro del frontend sin hardcodearlas.
async function listarEtapas(fraccionamientoId) {
  const { rows } = await pool.query(
    `SELECT DISTINCT etapa FROM lotes
     WHERE fraccionamiento_id = $1 AND etapa IS NOT NULL
     ORDER BY etapa`,
    [fraccionamientoId]
  )
  return rows.map(r => r.etapa)
}

module.exports = {
  obtenerFraccionamiento,
  actualizarFraccionamiento,
  listarLotes,
  obtenerLote,
  crearLote,
  actualizarLote,
  eliminarLote,
  asignarPropietario,
  obtenerMapa,
  listarEtapas,
}
