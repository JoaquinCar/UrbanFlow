const pool = require('../../shared/db/pool')
const { httpError } = require('../../shared/utils/errors')

const ESTADOS = ['abierto', 'en_proceso', 'resuelto']

const SELECT_COMPLETO = `
  SELECT t.id, t.fraccionamiento_id, t.solicitante_id, t.tecnico_id,
         t.descripcion, t.ubicacion, t.estado, t.created_at, t.resuelto_at,
         s.nombre AS solicitante_nombre,
         s.rol    AS solicitante_rol,
         tec.nombre AS tecnico_nombre
  FROM solicitudes_mantenimiento t
  INNER JOIN usuarios s   ON s.id = t.solicitante_id
  LEFT  JOIN usuarios tec ON tec.id = t.tecnico_id
`

async function obtenerCrudo(fraccionamientoId, id) {
  const { rows } = await pool.query(
    `${SELECT_COMPLETO} WHERE t.id = $1 AND t.fraccionamiento_id = $2`,
    [id, fraccionamientoId]
  )
  return rows[0] ?? null
}

async function listar(fraccionamientoId, filtros = {}) {
  const { estado, tecnico_id, q } = filtros
  const limit = Math.min(parseInt(filtros.limit, 10) || 100, 500)
  const offset = parseInt(filtros.offset, 10) || 0

  const params = [fraccionamientoId, estado ?? null, tecnico_id ?? null, q ? `%${q}%` : null]
  const where = `
    WHERE t.fraccionamiento_id = $1
      AND ($2::estado_ticket IS NULL OR t.estado = $2)
      AND ($3::uuid          IS NULL OR t.tecnico_id = $3)
      AND ($4::varchar       IS NULL OR t.descripcion ILIKE $4 OR t.ubicacion ILIKE $4)
  `

  const { rows } = await pool.query(
    // Los abiertos primero: es lo que el administrador necesita atender.
    `${SELECT_COMPLETO} ${where}
     ORDER BY CASE t.estado WHEN 'abierto' THEN 0 WHEN 'en_proceso' THEN 1 ELSE 2 END,
              t.created_at DESC
     LIMIT $5 OFFSET $6`,
    [...params, limit, offset]
  )

  const { rows: conteo } = await pool.query(
    `SELECT COUNT(*)::int AS total FROM solicitudes_mantenimiento t ${where}`,
    params
  )

  return { items: rows, total: conteo[0].total }
}

// Tickets propios: los que reportó (propietario) o los que le asignaron
// (técnico). Un mismo endpoint sirve a los dos roles porque la pregunta es la
// misma —"¿qué me toca a mí?"— aunque el criterio cambie.
async function listarPropios(fraccionamientoId, usuario, filtros = {}) {
  const { estado } = filtros
  const columna = usuario.rol === 'tecnico' ? 't.tecnico_id' : 't.solicitante_id'

  const { rows } = await pool.query(
    `${SELECT_COMPLETO}
     WHERE t.fraccionamiento_id = $1
       AND ${columna} = $2
       AND ($3::estado_ticket IS NULL OR t.estado = $3)
     ORDER BY CASE t.estado WHEN 'abierto' THEN 0 WHEN 'en_proceso' THEN 1 ELSE 2 END,
              t.created_at DESC`,
    [fraccionamientoId, usuario.sub, estado ?? null]
  )
  return rows
}

// Técnicos disponibles con su carga actual, para que el administrador reparta
// con criterio en vez de a ciegas.
async function listarTecnicos(fraccionamientoId) {
  const { rows } = await pool.query(
    `SELECT u.id, u.nombre, u.email,
            COUNT(t.id) FILTER (WHERE t.estado <> 'resuelto')::int AS tickets_activos
     FROM usuarios u
     LEFT JOIN solicitudes_mantenimiento t ON t.tecnico_id = u.id
     WHERE u.fraccionamiento_id = $1 AND u.rol = 'tecnico' AND u.activo
     GROUP BY u.id, u.nombre, u.email
     ORDER BY tickets_activos, u.nombre`,
    [fraccionamientoId]
  )
  return rows
}

async function crear(fraccionamientoId, solicitanteId, datos) {
  const { descripcion, ubicacion } = datos
  if (!descripcion?.trim()) throw httpError(400, 'La descripción es requerida')

  const { rows } = await pool.query(
    `INSERT INTO solicitudes_mantenimiento
       (fraccionamiento_id, solicitante_id, descripcion, ubicacion)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [fraccionamientoId, solicitanteId, descripcion.trim(), ubicacion?.trim() || null]
  )
  return obtenerCrudo(fraccionamientoId, rows[0].id)
}

async function obtener(fraccionamientoId, id) {
  const ticket = await obtenerCrudo(fraccionamientoId, id)
  if (!ticket) throw httpError(404, 'Solicitud no encontrada')
  return ticket
}

// estado y resuelto_at tienen que moverse juntos: la restricción
// chk_ticket_resuelto de la base rechaza cualquier combinación incoherente.
// Reabrir un ticket debe limpiar la fecha, no solo cambiar el estado — y esa
// es justo la omisión que la restricción impide que pase inadvertida.
async function actualizar(fraccionamientoId, id, datos) {
  const { descripcion, ubicacion, tecnico_id, estado } = datos

  if (estado && !ESTADOS.includes(estado)) {
    throw httpError(400, `Estado inválido. Se admiten: ${ESTADOS.join(', ')}`)
  }
  if (tecnico_id) await validarTecnico(fraccionamientoId, tecnico_id)

  const { rows } = await pool.query(
    `UPDATE solicitudes_mantenimiento SET
       descripcion = COALESCE($3, descripcion),
       ubicacion   = COALESCE($4, ubicacion),
       tecnico_id  = COALESCE($5, tecnico_id),
       estado      = COALESCE($6::estado_ticket, estado),
       resuelto_at = CASE WHEN COALESCE($6::estado_ticket, estado) = 'resuelto'
                          THEN COALESCE(resuelto_at, NOW())
                          ELSE NULL END
     WHERE id = $1 AND fraccionamiento_id = $2
     RETURNING id`,
    [id, fraccionamientoId, descripcion ?? null, ubicacion ?? null, tecnico_id ?? null, estado ?? null]
  )
  if (!rows[0]) throw httpError(404, 'Solicitud no encontrada')
  return obtenerCrudo(fraccionamientoId, id)
}

async function validarTecnico(fraccionamientoId, tecnicoId) {
  const { rows } = await pool.query(
    `SELECT id FROM usuarios
     WHERE id = $1 AND fraccionamiento_id = $2 AND rol = 'tecnico' AND activo`,
    [tecnicoId, fraccionamientoId]
  )
  // 400 y no 404: el id existe, pero no es un técnico de este fraccionamiento.
  // Es un error de la petición, no un recurso ausente.
  if (!rows[0]) throw httpError(400, 'El usuario indicado no es un técnico activo de este fraccionamiento')
}

// Asignar mueve el ticket a 'en_proceso' en la misma operación: un ticket con
// técnico que siguiera 'abierto' sería un estado que no significa nada.
async function asignar(fraccionamientoId, id, tecnicoId) {
  if (!tecnicoId) throw httpError(400, 'tecnico_id es requerido')
  await validarTecnico(fraccionamientoId, tecnicoId)

  const { rows } = await pool.query(
    `UPDATE solicitudes_mantenimiento
     SET tecnico_id = $3,
         estado = CASE WHEN estado = 'resuelto' THEN estado ELSE 'en_proceso'::estado_ticket END
     WHERE id = $1 AND fraccionamiento_id = $2
     RETURNING id`,
    [id, fraccionamientoId, tecnicoId]
  )
  if (!rows[0]) throw httpError(404, 'Solicitud no encontrada')
  return obtenerCrudo(fraccionamientoId, id)
}

async function cambiarEstado(fraccionamientoId, id, estado) {
  if (!ESTADOS.includes(estado)) {
    throw httpError(400, `Estado inválido. Se admiten: ${ESTADOS.join(', ')}`)
  }

  const { rows } = await pool.query(
    `UPDATE solicitudes_mantenimiento
     SET estado = $3::estado_ticket,
         resuelto_at = CASE WHEN $3::estado_ticket = 'resuelto'
                            THEN COALESCE(resuelto_at, NOW())
                            ELSE NULL END
     WHERE id = $1 AND fraccionamiento_id = $2
     RETURNING id`,
    [id, fraccionamientoId, estado]
  )
  if (!rows[0]) throw httpError(404, 'Solicitud no encontrada')
  return obtenerCrudo(fraccionamientoId, id)
}

async function eliminar(fraccionamientoId, id) {
  const { rowCount } = await pool.query(
    'DELETE FROM solicitudes_mantenimiento WHERE id = $1 AND fraccionamiento_id = $2',
    [id, fraccionamientoId]
  )
  if (rowCount === 0) throw httpError(404, 'Solicitud no encontrada')
}

module.exports = {
  listar,
  listarPropios,
  listarTecnicos,
  crear,
  obtener,
  actualizar,
  asignar,
  cambiarEstado,
  eliminar,
  ESTADOS,
}
