const pool = require('../../shared/db/pool')
const { httpError } = require('../../shared/utils/errors')
const { generarCuotasMensuales } = require('../../shared/jobs/cuota-cron')
const mp = require('./payments.stripe')

const METODOS_MANUALES = ['efectivo', 'transferencia']

// Una cuota está vencida cuando sigue pendiente y su mes ya pasó. Se calcula en
// la consulta en vez de depender de que un job voltee el enum a tiempo: así el
// dato es correcto aunque el cron no haya corrido.
const ESTADO_CALCULADO = `
  CASE WHEN c.estado = 'pendiente' AND c.mes_anio < date_trunc('month', CURRENT_DATE)
       THEN 'vencido' ELSE c.estado::text END AS estado_actual
`

const CAMPOS_CUOTA = `
  c.id, c.fraccionamiento_id, c.propietario_id, c.tipo, c.monto,
  c.mes_anio, c.estado, c.concepto, c.created_at
`

// pagos no tiene fraccionamiento_id: el aislamiento va SIEMPRE por este JOIN.
const JOIN_PAGO_TENANT = `
  FROM pagos pg
  INNER JOIN cuotas c ON c.id = pg.cuota_id
`

// ── Cuotas ──────────────────────────────────────────────────────────────────

async function listarCuotas(fraccionamientoId, filtros = {}) {
  const { estado, mes, propietario_id } = filtros
  const limit = Math.min(parseInt(filtros.limit, 10) || 100, 500)
  const offset = parseInt(filtros.offset, 10) || 0

  const params = [fraccionamientoId, estado ?? null, mes ?? null, propietario_id ?? null]
  const where = `
    WHERE c.fraccionamiento_id = $1
      AND ($2::estado_cuota IS NULL OR c.estado = $2)
      AND ($3::date          IS NULL OR c.mes_anio = $3)
      AND ($4::uuid          IS NULL OR c.propietario_id = $4)
  `

  const { rows } = await pool.query(
    `SELECT ${CAMPOS_CUOTA}, ${ESTADO_CALCULADO}, p.nombre_completo AS propietario_nombre
     FROM cuotas c
     INNER JOIN propietarios p ON p.id = c.propietario_id
     ${where}
     ORDER BY c.mes_anio DESC, p.nombre_completo
     LIMIT $5 OFFSET $6`,
    [...params, limit, offset]
  )

  const { rows: resumen } = await pool.query(
    // "Pendiente" agrupa pendiente y vencido: para el administrador ambas son
    // dinero por cobrar, y la distinción ya la da la columna de estado.
    `SELECT
       COUNT(*)::int AS total,
       COALESCE(SUM(c.monto) FILTER (WHERE c.estado IN ('pendiente', 'vencido')), 0) AS monto_pendiente,
       COALESCE(SUM(c.monto) FILTER (WHERE c.estado = 'pagado'), 0)                  AS monto_cobrado
     FROM cuotas c ${where}`,
    params
  )

  return { items: rows, total: resumen[0].total, resumen: resumen[0] }
}

async function estadoDeCuenta(fraccionamientoId, propietarioId) {
  const { rows: props } = await pool.query(
    `SELECT p.id, p.nombre_completo, u.email
     FROM propietarios p
     INNER JOIN usuarios u ON u.id = p.usuario_id
     WHERE p.id = $1 AND p.fraccionamiento_id = $2`,
    [propietarioId, fraccionamientoId]
  )
  if (!props[0]) throw httpError(404, 'Propietario no encontrado')

  const { rows: cuotas } = await pool.query(
    `SELECT ${CAMPOS_CUOTA}, ${ESTADO_CALCULADO},
            pg.id AS pago_id, pg.fecha_pago, pg.metodo
     FROM cuotas c
     LEFT JOIN LATERAL (
       SELECT id, fecha_pago, metodo FROM pagos
       WHERE cuota_id = c.id ORDER BY fecha_pago DESC LIMIT 1
     ) pg ON TRUE
     WHERE c.propietario_id = $1 AND c.fraccionamiento_id = $2
     ORDER BY c.mes_anio DESC`,
    [propietarioId, fraccionamientoId]
  )

  const totales = cuotas.reduce((acc, c) => {
    const monto = Number(c.monto)
    acc[c.estado_actual] = (acc[c.estado_actual] ?? 0) + monto
    return acc
  }, { pendiente: 0, pagado: 0, vencido: 0 })

  totales.adeudo = totales.pendiente + totales.vencido

  return { propietario: props[0], cuotas, totales }
}

async function obtenerPropietarioDeUsuario(fraccionamientoId, usuarioId) {
  const { rows } = await pool.query(
    'SELECT id FROM propietarios WHERE usuario_id = $1 AND fraccionamiento_id = $2',
    [usuarioId, fraccionamientoId]
  )
  if (!rows[0]) throw httpError(404, 'Tu usuario no tiene ficha de propietario')
  return rows[0].id
}

// Cuota extraordinaria: a un propietario concreto o a todos de golpe.
async function crearCuotaExtraordinaria(fraccionamientoId, datos) {
  const { propietario_id, monto, mes_anio, concepto } = datos

  if (!monto || Number(monto) <= 0) throw httpError(400, 'El monto debe ser mayor a cero')
  if (!concepto?.trim()) throw httpError(400, 'El concepto es requerido')

  // Sin mes se usa el mes en curso, normalizado al día 1 como manda el esquema.
  const mes = mes_anio || new Date().toISOString().slice(0, 7) + '-01'

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    let destinatarios
    if (!propietario_id || propietario_id === 'todos') {
      // Solo a quienes tienen lote vendido: es la misma regla que usa el cron
      // para decidir quién paga.
      const { rows } = await client.query(
        `SELECT DISTINCT p.id FROM propietarios p
         INNER JOIN lotes l ON l.propietario_id = p.id
         WHERE p.fraccionamiento_id = $1 AND l.estado = 'vendido'`,
        [fraccionamientoId]
      )
      destinatarios = rows.map(r => r.id)
    } else {
      const { rows } = await client.query(
        'SELECT id FROM propietarios WHERE id = $1 AND fraccionamiento_id = $2',
        [propietario_id, fraccionamientoId]
      )
      if (!rows[0]) throw httpError(404, 'Propietario no encontrado')
      destinatarios = [rows[0].id]
    }

    if (destinatarios.length === 0) {
      throw httpError(409, 'No hay propietarios con lote vendido a quienes asignar la cuota')
    }

    // El índice único de cuotas mensuales es parcial (WHERE tipo='mensual'), así
    // que las extraordinarias no chocan entre sí: se pueden crear varias del
    // mismo mes con conceptos distintos.
    for (const id of destinatarios) {
      await client.query(
        `INSERT INTO cuotas (fraccionamiento_id, propietario_id, tipo, monto, mes_anio, estado, concepto)
         VALUES ($1, $2, 'extraordinaria', $3, $4, 'pendiente', $5)`,
        [fraccionamientoId, id, monto, mes, concepto.trim()]
      )
    }

    await client.query('COMMIT')
    return { creadas: destinatarios.length, mes_anio: mes }
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

async function actualizarCuota(fraccionamientoId, id, datos) {
  const { monto, concepto, estado } = datos
  const { rows } = await pool.query(
    `UPDATE cuotas SET
       monto    = COALESCE($3, monto),
       concepto = COALESCE($4, concepto),
       estado   = COALESCE($5::estado_cuota, estado)
     WHERE id = $1 AND fraccionamiento_id = $2
     RETURNING ${CAMPOS_CUOTA.replace(/c\./g, '')}`,
    [id, fraccionamientoId, monto ?? null, concepto ?? null, estado ?? null]
  )
  if (!rows[0]) throw httpError(404, 'Cuota no encontrada')
  return rows[0]
}

async function eliminarCuota(fraccionamientoId, id) {
  const { rows } = await pool.query(
    'SELECT COUNT(*)::int AS n FROM pagos WHERE cuota_id = $1',
    [id]
  )
  if (rows[0].n > 0) {
    throw httpError(409, 'La cuota tiene pagos registrados y no puede eliminarse')
  }

  const { rowCount } = await pool.query(
    'DELETE FROM cuotas WHERE id = $1 AND fraccionamiento_id = $2',
    [id, fraccionamientoId]
  )
  if (rowCount === 0) throw httpError(404, 'Cuota no encontrada')
}

// Dispara a mano lo que el cron hace el día 1. Sirve para la demostración y
// para las pruebas, y de paso sincroniza el enum de las vencidas.
async function generarMensuales(fraccionamientoId, mesAnio) {
  const insertadas = await generarCuotasMensuales(mesAnio ? new Date(mesAnio) : undefined)

  const { rowCount } = await pool.query(
    `UPDATE cuotas SET estado = 'vencido'
     WHERE fraccionamiento_id = $1
       AND estado = 'pendiente'
       AND mes_anio < date_trunc('month', CURRENT_DATE)`,
    [fraccionamientoId]
  )

  return { insertadas, marcadas_vencidas: rowCount }
}

async function listarMorosos(fraccionamientoId) {
  const { rows } = await pool.query(
    `SELECT p.id AS propietario_id, p.nombre_completo, p.telefono, p.whatsapp, u.email,
            COUNT(*)::int AS cuotas_vencidas,
            SUM(c.monto)  AS monto_adeudado,
            MIN(c.mes_anio) AS desde
     FROM cuotas c
     INNER JOIN propietarios p ON p.id = c.propietario_id
     INNER JOIN usuarios u     ON u.id = p.usuario_id
     WHERE c.fraccionamiento_id = $1
       -- Se incluyen ambos estados a propósito. Una cuota atrasada puede estar
       -- todavía como 'pendiente' (si el job no ha corrido) o ya como
       -- 'vencido' (si sí corrió). Filtrar solo por 'pendiente' vaciaba este
       -- reporte justo después de generar las cuotas del mes.
       AND c.estado IN ('pendiente', 'vencido')
       AND c.mes_anio < date_trunc('month', CURRENT_DATE)
     GROUP BY p.id, p.nombre_completo, p.telefono, p.whatsapp, u.email
     ORDER BY SUM(c.monto) DESC`,
    [fraccionamientoId]
  )
  return rows
}

// ── Pagos ───────────────────────────────────────────────────────────────────

async function obtenerCuotaPagable(fraccionamientoId, cuotaId) {
  const { rows } = await pool.query(
    `SELECT ${CAMPOS_CUOTA}, p.nombre_completo, p.usuario_id, u.email
     FROM cuotas c
     INNER JOIN propietarios p ON p.id = c.propietario_id
     INNER JOIN usuarios u     ON u.id = p.usuario_id
     WHERE c.id = $1 AND c.fraccionamiento_id = $2`,
    [cuotaId, fraccionamientoId]
  )
  const cuota = rows[0]
  if (!cuota) throw httpError(404, 'Cuota no encontrada')
  if (cuota.estado === 'pagado') throw httpError(409, 'Esta cuota ya está pagada')
  return cuota
}

async function crearPreferencia(fraccionamientoId, cuotaId, usuarioSolicitante) {
  const cuota = await obtenerCuotaPagable(fraccionamientoId, cuotaId)

  // Un propietario solo puede pagar sus propias cuotas.
  if (usuarioSolicitante.rol === 'propietario' && cuota.usuario_id !== usuarioSolicitante.sub) {
    throw httpError(403, 'Solo puedes pagar tus propias cuotas')
  }

  return mp.crearPreferencia({
    cuota,
    propietario: { nombre_completo: cuota.nombre_completo, email: cuota.email },
  })
}

async function registrarPagoManual(fraccionamientoId, datos) {
  const { cuota_id, monto_pagado, metodo, referencia } = datos

  if (!METODOS_MANUALES.includes(metodo)) {
    throw httpError(400, `Método inválido. Se admiten: ${METODOS_MANUALES.join(', ')}`)
  }

  const cuota = await obtenerCuotaPagable(fraccionamientoId, cuota_id)
  const monto = monto_pagado ?? cuota.monto

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const { rows } = await client.query(
      `INSERT INTO pagos (cuota_id, monto_pagado, metodo, referencia_mp)
       VALUES ($1, $2, $3::metodo_pago, $4)
       RETURNING id, cuota_id, monto_pagado, metodo, referencia_mp, fecha_pago`,
      [cuota_id, monto, metodo, referencia ?? null]
    )

    await client.query(`UPDATE cuotas SET estado = 'pagado' WHERE id = $1`, [cuota_id])

    await client.query('COMMIT')
    return rows[0]
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

// Webhook de Stripe (validación directa con la API de Stripe).
async function procesarWebhook(req) {
  const event = mp.validarWebhookStripe(req)

  // Solo nos interesan los pagos completados
  if (event.type !== 'checkout.session.completed' && event.type !== 'payment_intent.payment_succeeded') {
    return { ignorado: true, motivo: `tipo ${event.type}` }
  }

  const session = event.data.object

  // El cuota_id viene en client_reference_id (lo pasamos al crear la sesión)
  const cuotaId = session.client_reference_id
    || session.metadata?.cuota_id
  if (!cuotaId) return { ignorado: true, motivo: 'sin client_reference_id' }

  const paymentId = session.payment_intent || session.id
  const montoPagado = session.amount_total || session.amount || 0

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const { rows: cuotas } = await client.query('SELECT id FROM cuotas WHERE id = $1', [cuotaId])
    if (!cuotas[0]) {
      await client.query('ROLLBACK')
      return { ignorado: true, motivo: 'cuota inexistente' }
    }

    const { rowCount } = await client.query(
      `INSERT INTO pagos (cuota_id, monto_pagado, metodo, referencia_mp)
       VALUES ($1, $2, 'online', $3)
       ON CONFLICT (referencia_mp) WHERE referencia_mp IS NOT NULL AND metodo = 'online'
       DO NOTHING`,
      [cuotaId, montoPagado / 100, String(paymentId)]
    )

    await client.query(`UPDATE cuotas SET estado = 'pagado' WHERE id = $1`, [cuotaId])
    await client.query('COMMIT')

    return { registrado: rowCount > 0, duplicado: rowCount === 0, cuota_id: cuotaId }
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

async function listarPagos(fraccionamientoId, filtros = {}) {
  const { desde, hasta, metodo } = filtros
  const limit = Math.min(parseInt(filtros.limit, 10) || 100, 500)
  const offset = parseInt(filtros.offset, 10) || 0

  const { rows } = await pool.query(
    `SELECT pg.id, pg.cuota_id, pg.monto_pagado, pg.metodo, pg.referencia_mp, pg.fecha_pago,
            c.mes_anio, c.concepto, c.tipo,
            p.nombre_completo AS propietario_nombre
     ${JOIN_PAGO_TENANT}
     INNER JOIN propietarios p ON p.id = c.propietario_id
     WHERE c.fraccionamiento_id = $1
       AND ($2::timestamp IS NULL OR pg.fecha_pago >= $2)
       AND ($3::timestamp IS NULL OR pg.fecha_pago <= $3)
       AND ($4::metodo_pago IS NULL OR pg.metodo = $4)
     ORDER BY pg.fecha_pago DESC
     LIMIT $5 OFFSET $6`,
    [fraccionamientoId, desde || null, hasta || null, metodo || null, limit, offset]
  )
  return { items: rows, total: rows.length }
}

// Datos que necesita el recibo. Incluye usuario_id para poder comprobar que
// quien lo descarga es el dueño.
async function obtenerPagoParaRecibo(fraccionamientoId, pagoId) {
  const { rows } = await pool.query(
    `SELECT pg.id AS pago_id, pg.monto_pagado, pg.metodo, pg.referencia_mp, pg.fecha_pago,
            c.mes_anio, c.concepto, c.tipo,
            p.nombre_completo AS propietario, p.usuario_id,
            f.nombre AS fraccionamiento,
            (SELECT string_agg(l.numero, ', ' ORDER BY l.numero)
             FROM lotes l WHERE l.propietario_id = p.id) AS lotes
     ${JOIN_PAGO_TENANT}
     INNER JOIN propietarios p    ON p.id = c.propietario_id
     INNER JOIN fraccionamientos f ON f.id = c.fraccionamiento_id
     WHERE pg.id = $1 AND c.fraccionamiento_id = $2`,
    [pagoId, fraccionamientoId]
  )
  if (!rows[0]) throw httpError(404, 'Pago no encontrado')

  const datos = rows[0]
  if (!datos.concepto) {
    datos.concepto = datos.tipo === 'mensual' ? 'Cuota de mantenimiento mensual' : 'Cuota extraordinaria'
  }
  return datos
}

module.exports = {
  listarCuotas,
  estadoDeCuenta,
  obtenerPropietarioDeUsuario,
  crearCuotaExtraordinaria,
  actualizarCuota,
  eliminarCuota,
  generarMensuales,
  listarMorosos,
  crearPreferencia,
  registrarPagoManual,
  procesarWebhook,
  listarPagos,
  obtenerPagoParaRecibo,
  mpConfigurado: mp.configurado,
}
