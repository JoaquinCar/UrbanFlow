const pool = require('../../shared/db/pool')
const { httpError } = require('../../shared/utils/errors')

const ESTADOS = ['pendiente', 'confirmada', 'cancelada']

// reservaciones no tiene fraccionamiento_id (igual que en db-schema.md): el
// aislamiento se hace SIEMPRE con este JOIN contra areas_comunes.
const SELECT_RESERVA = `
  SELECT r.id, r.area_id, r.propietario_id, r.fecha, r.hora_inicio, r.hora_fin,
         r.estado, r.created_at,
         a.nombre AS area_nombre, a.fraccionamiento_id,
         p.nombre_completo AS propietario_nombre, p.usuario_id
  FROM reservaciones r
  INNER JOIN areas_comunes a ON a.id = r.area_id
  INNER JOIN propietarios p  ON p.id = r.propietario_id
`

// ── Áreas comunes ───────────────────────────────────────────────────────────

async function listarAreas(fraccionamientoId, filtros = {}) {
  const soloActivas = filtros.activa === 'true' || filtros.activa === true

  const { rows } = await pool.query(
    `SELECT id, fraccionamiento_id, nombre, capacidad, activa, created_at
     FROM areas_comunes
     WHERE fraccionamiento_id = $1 AND ($2::boolean IS NOT TRUE OR activa)
     ORDER BY nombre`,
    [fraccionamientoId, soloActivas]
  )
  return rows
}

async function crearArea(fraccionamientoId, datos) {
  const { nombre, capacidad, activa } = datos
  if (!nombre?.trim()) throw httpError(400, 'El nombre del área es requerido')
  if (capacidad !== undefined && capacidad !== null && Number(capacidad) <= 0) {
    throw httpError(400, 'La capacidad debe ser mayor a cero')
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO areas_comunes (fraccionamiento_id, nombre, capacidad, activa)
       VALUES ($1, $2, $3, COALESCE($4, TRUE))
       RETURNING id, fraccionamiento_id, nombre, capacidad, activa, created_at`,
      [fraccionamientoId, nombre.trim(), capacidad ?? null, activa ?? null]
    )
    return rows[0]
  } catch (err) {
    if (err.code === '23505') throw httpError(409, `Ya existe un área llamada "${nombre}"`)
    throw err
  }
}

async function actualizarArea(fraccionamientoId, id, datos) {
  const { nombre, capacidad, activa } = datos

  try {
    const { rows } = await pool.query(
      `UPDATE areas_comunes SET
         nombre    = COALESCE($3, nombre),
         capacidad = COALESCE($4, capacidad),
         activa    = COALESCE($5, activa)
       WHERE id = $1 AND fraccionamiento_id = $2
       RETURNING id, fraccionamiento_id, nombre, capacidad, activa, created_at`,
      [id, fraccionamientoId, nombre?.trim() ?? null, capacidad ?? null, activa ?? null]
    )
    if (!rows[0]) throw httpError(404, 'Área no encontrada')
    return rows[0]
  } catch (err) {
    if (err.code === '23505') throw httpError(409, `Ya existe un área llamada "${nombre}"`)
    throw err
  }
}

async function eliminarArea(fraccionamientoId, id) {
  const { rows } = await pool.query(
    'SELECT COUNT(*)::int AS n FROM reservaciones WHERE area_id = $1',
    [id]
  )
  if (rows[0].n > 0) {
    // Borrar arrastraría el histórico de reservaciones por CASCADE. Desactivar
    // consigue el objetivo real (que no se pueda reservar más) sin perderlo.
    throw httpError(409, 'El área tiene reservaciones registradas. Desactívala en lugar de eliminarla.')
  }

  const { rowCount } = await pool.query(
    'DELETE FROM areas_comunes WHERE id = $1 AND fraccionamiento_id = $2',
    [id, fraccionamientoId]
  )
  if (rowCount === 0) throw httpError(404, 'Área no encontrada')
}

// Franjas ocupadas de un día, para pintar el calendario.
async function disponibilidad(fraccionamientoId, areaId, fecha) {
  if (!fecha) throw httpError(400, 'La fecha es requerida (formato YYYY-MM-DD)')

  const { rows: areas } = await pool.query(
    'SELECT id, nombre, capacidad, activa FROM areas_comunes WHERE id = $1 AND fraccionamiento_id = $2',
    [areaId, fraccionamientoId]
  )
  if (!areas[0]) throw httpError(404, 'Área no encontrada')

  const { rows } = await pool.query(
    `SELECT r.id, r.hora_inicio, r.hora_fin, r.estado, p.nombre_completo AS propietario_nombre
     FROM reservaciones r
     INNER JOIN propietarios p ON p.id = r.propietario_id
     WHERE r.area_id = $1 AND r.fecha = $2 AND r.estado <> 'cancelada'
     ORDER BY r.hora_inicio`,
    [areaId, fecha]
  )

  return { area: areas[0], fecha, ocupado: rows }
}

// ── Reservaciones ───────────────────────────────────────────────────────────

async function listar(fraccionamientoId, filtros = {}) {
  const { area_id, fecha, estado, propietario_id } = filtros
  const limit = Math.min(parseInt(filtros.limit, 10) || 100, 500)

  const { rows } = await pool.query(
    `${SELECT_RESERVA}
     WHERE a.fraccionamiento_id = $1
       AND ($2::uuid IS NULL OR r.area_id = $2)
       AND ($3::date IS NULL OR r.fecha = $3)
       AND ($4::estado_reservacion IS NULL OR r.estado = $4)
       AND ($5::uuid IS NULL OR r.propietario_id = $5)
     ORDER BY r.fecha DESC, r.hora_inicio
     LIMIT $6`,
    [fraccionamientoId, area_id ?? null, fecha ?? null, estado ?? null, propietario_id ?? null, limit]
  )
  return { items: rows, total: rows.length }
}

async function listarPropias(fraccionamientoId, usuarioId) {
  const { rows } = await pool.query(
    `${SELECT_RESERVA}
     WHERE a.fraccionamiento_id = $1 AND p.usuario_id = $2
     ORDER BY r.fecha DESC, r.hora_inicio`,
    [fraccionamientoId, usuarioId]
  )
  return rows
}

async function obtener(fraccionamientoId, id) {
  const { rows } = await pool.query(
    `${SELECT_RESERVA} WHERE r.id = $1 AND a.fraccionamiento_id = $2`,
    [id, fraccionamientoId]
  )
  if (!rows[0]) throw httpError(404, 'Reservación no encontrada')
  return rows[0]
}

async function resolverPropietario(fraccionamientoId, usuario, propietarioIdSolicitado) {
  // Solo el administrador puede reservar en nombre de otro.
  if (usuario.rol === 'admin' && propietarioIdSolicitado) {
    const { rows } = await pool.query(
      'SELECT id FROM propietarios WHERE id = $1 AND fraccionamiento_id = $2',
      [propietarioIdSolicitado, fraccionamientoId]
    )
    if (!rows[0]) throw httpError(404, 'Propietario no encontrado')
    return rows[0].id
  }

  const { rows } = await pool.query(
    'SELECT id FROM propietarios WHERE usuario_id = $1 AND fraccionamiento_id = $2',
    [usuario.sub, fraccionamientoId]
  )
  if (!rows[0]) throw httpError(400, 'Tu usuario no tiene ficha de propietario, no puede reservar')
  return rows[0].id
}

async function crear(fraccionamientoId, usuario, datos) {
  const { area_id, fecha, hora_inicio, hora_fin, propietario_id } = datos

  if (!area_id) throw httpError(400, 'El área es requerida')
  if (!fecha) throw httpError(400, 'La fecha es requerida')
  if (!hora_inicio || !hora_fin) throw httpError(400, 'La hora de inicio y de fin son requeridas')
  if (hora_fin <= hora_inicio) throw httpError(400, 'La hora de fin debe ser posterior a la de inicio')

  const propietarioId = await resolverPropietario(fraccionamientoId, usuario, propietario_id)

  const { rows: areas } = await pool.query(
    'SELECT id, nombre, activa FROM areas_comunes WHERE id = $1 AND fraccionamiento_id = $2',
    [area_id, fraccionamientoId]
  )
  if (!areas[0]) throw httpError(404, 'Área no encontrada')
  if (!areas[0].activa) throw httpError(409, `El área "${areas[0].nombre}" no está disponible para reservas`)

  // Sonda de solapamiento con el predicado literal del spec. Sirve para dar un
  // 409 que diga CON QUÉ choca; la garantía real es la restricción EXCLUDE.
  const { rows: choques } = await pool.query(
    `SELECT r.hora_inicio, r.hora_fin, p.nombre_completo
     FROM reservaciones r
     INNER JOIN propietarios p ON p.id = r.propietario_id
     WHERE r.area_id = $1 AND r.fecha = $2 AND r.estado <> 'cancelada'
       AND NOT (r.hora_fin <= $3 OR r.hora_inicio >= $4)
     LIMIT 1`,
    [area_id, fecha, hora_inicio, hora_fin]
  )
  if (choques[0]) {
    const c = choques[0]
    throw httpError(409, `El horario choca con una reserva de ${c.hora_inicio} a ${c.hora_fin}`)
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO reservaciones (area_id, propietario_id, fecha, hora_inicio, hora_fin)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [area_id, propietarioId, fecha, hora_inicio, hora_fin]
    )
    return obtener(fraccionamientoId, rows[0].id)
  } catch (err) {
    // 23P01 = exclusion_violation: otro usuario reservó el mismo hueco entre
    // nuestra sonda y este INSERT. Es la carrera que la sonda no puede evitar.
    if (err.code === '23P01') {
      throw httpError(409, 'Ese horario acaba de ser reservado por alguien más')
    }
    if (err.code === '23514') throw httpError(400, 'El horario indicado no es válido')
    throw err
  }
}

async function actualizarEstado(fraccionamientoId, id, estado) {
  if (!ESTADOS.includes(estado)) {
    throw httpError(400, `Estado inválido. Se admiten: ${ESTADOS.join(', ')}`)
  }

  try {
    const { rows } = await pool.query(
      `UPDATE reservaciones r SET estado = $3::estado_reservacion
       FROM areas_comunes a
       WHERE r.id = $1 AND a.id = r.area_id AND a.fraccionamiento_id = $2
       RETURNING r.id`,
      [id, fraccionamientoId, estado]
    )
    if (!rows[0]) throw httpError(404, 'Reservación no encontrada')
    return obtener(fraccionamientoId, id)
  } catch (err) {
    // Reactivar una reserva cancelada puede chocar si el hueco ya se ocupó.
    if (err.code === '23P01') {
      throw httpError(409, 'No se puede reactivar: el horario ya está ocupado')
    }
    throw err
  }
}

async function cancelar(fraccionamientoId, id, usuario) {
  const reserva = await obtener(fraccionamientoId, id)

  // Solo el dueño de la reserva o un administrador pueden cancelarla.
  if (usuario.rol !== 'admin' && reserva.usuario_id !== usuario.sub) {
    throw httpError(403, 'Solo puedes cancelar tus propias reservaciones')
  }
  if (reserva.estado === 'cancelada') {
    throw httpError(409, 'Esta reservación ya estaba cancelada')
  }

  await pool.query(`UPDATE reservaciones SET estado = 'cancelada' WHERE id = $1`, [id])
  return obtener(fraccionamientoId, id)
}

async function eliminar(fraccionamientoId, id) {
  const { rows } = await pool.query(
    `DELETE FROM reservaciones r USING areas_comunes a
     WHERE r.id = $1 AND a.id = r.area_id AND a.fraccionamiento_id = $2
     RETURNING r.id`,
    [id, fraccionamientoId]
  )
  if (!rows[0]) throw httpError(404, 'Reservación no encontrada')
}

module.exports = {
  listarAreas,
  crearArea,
  actualizarArea,
  eliminarArea,
  disponibilidad,
  listar,
  listarPropias,
  obtener,
  crear,
  actualizarEstado,
  cancelar,
  eliminar,
  ESTADOS,
}
