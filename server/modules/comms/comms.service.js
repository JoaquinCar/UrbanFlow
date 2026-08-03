const pool = require('../../shared/db/pool')
const { httpError } = require('../../shared/utils/errors')
const email = require('../../shared/services/email')
const whatsapp = require('../../shared/services/whatsapp')

const SELECT_COMPLETO = `
  SELECT c.id, c.fraccionamiento_id, c.autor_id, c.titulo, c.cuerpo,
         c.canales, c.resultado_envio, c.enviado_at,
         u.nombre AS autor_nombre
  FROM comunicados c
  INNER JOIN usuarios u ON u.id = c.autor_id
`

async function listar(fraccionamientoId, filtros = {}) {
  const limit = Math.min(parseInt(filtros.limit, 10) || 50, 200)
  const offset = parseInt(filtros.offset, 10) || 0

  const { rows } = await pool.query(
    `${SELECT_COMPLETO}
     WHERE c.fraccionamiento_id = $1
     ORDER BY c.enviado_at DESC
     LIMIT $2 OFFSET $3`,
    [fraccionamientoId, limit, offset]
  )

  const { rows: conteo } = await pool.query(
    'SELECT COUNT(*)::int AS total FROM comunicados WHERE fraccionamiento_id = $1',
    [fraccionamientoId]
  )

  return { items: rows, total: conteo[0].total }
}

// Los residentes ven el tablón de avisos: título, cuerpo y fecha, sin los
// detalles de entrega, que solo le importan a quien administra.
async function listarParaResidentes(fraccionamientoId, filtros = {}) {
  const limit = Math.min(parseInt(filtros.limit, 10) || 50, 200)

  const { rows } = await pool.query(
    `SELECT c.id, c.titulo, c.cuerpo, c.enviado_at, u.nombre AS autor_nombre
     FROM comunicados c
     INNER JOIN usuarios u ON u.id = c.autor_id
     WHERE c.fraccionamiento_id = $1
     ORDER BY c.enviado_at DESC
     LIMIT $2`,
    [fraccionamientoId, limit]
  )
  return rows
}

async function obtener(fraccionamientoId, id) {
  const { rows } = await pool.query(
    `${SELECT_COMPLETO} WHERE c.id = $1 AND c.fraccionamiento_id = $2`,
    [id, fraccionamientoId]
  )
  if (!rows[0]) throw httpError(404, 'Comunicado no encontrado')
  return rows[0]
}

// Destinatarios: propietarios con usuario activo. Si se especifican ids, se
// filtra a esos; si no, van todos.
async function resolverDestinatarios(fraccionamientoId, ids) {
  const { rows } = await pool.query(
    `SELECT p.id, p.nombre_completo, p.whatsapp, u.email
     FROM propietarios p
     INNER JOIN usuarios u ON u.id = p.usuario_id
     WHERE p.fraccionamiento_id = $1
       AND u.activo
       AND ($2::uuid[] IS NULL OR p.id = ANY($2))
     ORDER BY p.nombre_completo`,
    [fraccionamientoId, Array.isArray(ids) && ids.length ? ids : null]
  )
  return rows
}

async function previsualizarDestinatarios(fraccionamientoId, ids) {
  const destinatarios = await resolverDestinatarios(fraccionamientoId, ids)
  return {
    total: destinatarios.length,
    con_email: destinatarios.filter(d => d.email).length,
    con_whatsapp: destinatarios.filter(d => d.whatsapp).length,
  }
}

async function crear(fraccionamientoId, autorId, datos) {
  const { titulo, cuerpo, canales, destinatarios: ids } = datos

  if (!titulo?.trim()) throw httpError(400, 'El título es requerido')
  if (!cuerpo?.trim()) throw httpError(400, 'El cuerpo del comunicado es requerido')

  const canalesFinal = {
    email: Boolean(canales?.email),
    whatsapp: Boolean(canales?.whatsapp),
  }

  const destinatarios = await resolverDestinatarios(fraccionamientoId, ids)
  if (destinatarios.length === 0) {
    throw httpError(409, 'No hay propietarios activos a quienes enviar el comunicado')
  }

  const { rows: fraccs } = await pool.query(
    'SELECT nombre FROM fraccionamientos WHERE id = $1',
    [fraccionamientoId]
  )
  const nombreFracc = fraccs[0]?.nombre ?? 'UrbanFlow'

  // El comunicado se registra ANTES de enviar. Si el SMTP falla a la mitad,
  // queda constancia de que se intentó y de a quién llegó; borrarlo con un
  // rollback perdería justo esa información.
  const { rows } = await pool.query(
    `INSERT INTO comunicados (fraccionamiento_id, autor_id, titulo, cuerpo, canales)
     VALUES ($1, $2, $3, $4, $5::jsonb)
     RETURNING id`,
    [fraccionamientoId, autorId, titulo.trim(), cuerpo.trim(), JSON.stringify(canalesFinal)]
  )
  const comunicadoId = rows[0].id

  const resultado = {}

  if (canalesFinal.email) {
    const correos = destinatarios.map(d => d.email).filter(Boolean)
    try {
      resultado.email = await email.enviarBatch(correos, {
        titulo: titulo.trim(),
        cuerpo: cuerpo.trim(),
        fraccionamiento: nombreFracc,
      })
    } catch (err) {
      // Un fallo de configuración no debe tumbar la petición entera: se
      // registra como resultado del canal y el otro canal sigue su curso.
      resultado.email = {
        intentados: correos.length, enviados: 0, fallidos: correos.length,
        errores: [{ to: '*', error: err.message }],
      }
    }
  }

  if (canalesFinal.whatsapp) {
    const numeros = destinatarios.map(d => d.whatsapp).filter(Boolean)
    try {
      // Los parámetros de plantilla de Meta no admiten saltos de línea: se
      // colapsan a espacio, si no Meta rechaza el envío con el error 132018.
      const textoWhatsapp = `${titulo.trim()}: ${cuerpo.trim()}`.replace(/\s*\n+\s*/g, ' ')
      resultado.whatsapp = await whatsapp.enviarBatch(numeros, textoWhatsapp)
    } catch (err) {
      resultado.whatsapp = {
        intentados: numeros.length, enviados: 0, fallidos: numeros.length,
        errores: [{ to: '*', error: err.message }],
      }
    }
  }

  await pool.query(
    'UPDATE comunicados SET resultado_envio = $2::jsonb WHERE id = $1',
    [comunicadoId, JSON.stringify(resultado)]
  )

  return { comunicado: await obtener(fraccionamientoId, comunicadoId), resultado }
}

async function eliminar(fraccionamientoId, id) {
  const { rowCount } = await pool.query(
    'DELETE FROM comunicados WHERE id = $1 AND fraccionamiento_id = $2',
    [id, fraccionamientoId]
  )
  if (rowCount === 0) throw httpError(404, 'Comunicado no encontrado')
}

// Estado de configuración de los proveedores, para que la interfaz avise antes
// de que el administrador escriba un comunicado que no se va a poder enviar.
function estadoCanales() {
  return {
    email: email.configurado(),
    whatsapp: whatsapp.configurado(),
    whatsapp_plantilla: Boolean(process.env.META_TEMPLATE_NAME),
  }
}

module.exports = {
  listar,
  listarParaResidentes,
  obtener,
  crear,
  eliminar,
  previsualizarDestinatarios,
  estadoCanales,
}
