const fs = require('fs')
const path = require('path')
const bcrypt = require('bcrypt')
const pool = require('../../shared/db/pool')
const { httpError } = require('../../shared/utils/errors')
const { generarQrToken } = require('../../shared/utils/qr')
const { UPLOAD_DIR } = require('../../shared/middleware/upload.middleware')

const SALT_ROUNDS = 12

const CAMPOS = `
  p.id, p.fraccionamiento_id, p.usuario_id, p.nombre_completo,
  p.telefono, p.whatsapp, p.curp, p.num_escritura, p.created_at
`

// documentos no tiene fraccionamiento_id (igual que en db-schema.md): el
// aislamiento se hace SIEMPRE con este JOIN contra propietarios.
const JOIN_DOC_TENANT = `
  FROM documentos d
  INNER JOIN propietarios p ON p.id = d.propietario_id
`

async function listar(fraccionamientoId, filtros = {}) {
  const { q } = filtros
  const limit = Math.min(parseInt(filtros.limit, 10) || 50, 200)
  const offset = parseInt(filtros.offset, 10) || 0

  const params = [fraccionamientoId, q ? `%${q}%` : null]
  const where = `
    WHERE p.fraccionamiento_id = $1
      AND ($2::varchar IS NULL OR p.nombre_completo ILIKE $2 OR u.email ILIKE $2 OR p.telefono ILIKE $2)
  `

  // Los lotes se agregan como JSON para no hacer una consulta por propietario.
  const { rows } = await pool.query(
    `SELECT ${CAMPOS}, u.email, u.activo,
            COALESCE(
              (SELECT json_agg(json_build_object('id', l.id, 'numero', l.numero) ORDER BY l.numero)
               FROM lotes l WHERE l.propietario_id = p.id),
              '[]'::json
            ) AS lotes
     FROM propietarios p
     INNER JOIN usuarios u ON u.id = p.usuario_id
     ${where}
     ORDER BY p.nombre_completo
     LIMIT $3 OFFSET $4`,
    [...params, limit, offset]
  )

  const { rows: conteo } = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM propietarios p
     INNER JOIN usuarios u ON u.id = p.usuario_id
     ${where}`,
    params
  )

  return { items: rows, total: conteo[0].total }
}

async function obtener(fraccionamientoId, id) {
  const { rows } = await pool.query(
    `SELECT ${CAMPOS}, u.email, u.activo,
            COALESCE(
              (SELECT json_agg(json_build_object('id', l.id, 'numero', l.numero, 'estado', l.estado) ORDER BY l.numero)
               FROM lotes l WHERE l.propietario_id = p.id),
              '[]'::json
            ) AS lotes
     FROM propietarios p
     INNER JOIN usuarios u ON u.id = p.usuario_id
     WHERE p.id = $1 AND p.fraccionamiento_id = $2`,
    [id, fraccionamientoId]
  )
  if (!rows[0]) throw httpError(404, 'Propietario no encontrado')
  return rows[0]
}

// Resuelve el propietario a partir del usuario autenticado. Lo usan tanto
// GET /me como las comprobaciones de "es suyo".
async function obtenerPorUsuario(fraccionamientoId, usuarioId) {
  const { rows } = await pool.query(
    `SELECT ${CAMPOS} FROM propietarios p
     WHERE p.usuario_id = $1 AND p.fraccionamiento_id = $2`,
    [usuarioId, fraccionamientoId]
  )
  return rows[0] ?? null
}

// Crear un propietario crea también su usuario: son 1:1 y no tiene sentido un
// propietario sin acceso al portal. Va en transacción para que no quede un
// usuario huérfano si falla el segundo INSERT.
async function crear(fraccionamientoId, datos) {
  const { nombre_completo, email, password, telefono, whatsapp, curp, num_escritura } = datos

  if (!nombre_completo) throw httpError(400, 'El nombre completo es requerido')
  if (!email) throw httpError(400, 'El email es requerido')

  const passwordFinal = password || process.env.SEED_PASSWORD || 'UrbanFlow2026!'
  const hash = await bcrypt.hash(passwordFinal, SALT_ROUNDS)

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const { rows: usuarios } = await client.query(
      `INSERT INTO usuarios (fraccionamiento_id, nombre, email, password_hash, rol)
       VALUES ($1, $2, $3, $4, 'propietario')
       RETURNING id, email`,
      [fraccionamientoId, nombre_completo, email.toLowerCase().trim(), hash]
    )
    const usuario = usuarios[0]

    const { rows: props } = await client.query(
      `INSERT INTO propietarios
         (fraccionamiento_id, usuario_id, nombre_completo, telefono, whatsapp, curp, num_escritura)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING ${CAMPOS.replace(/p\./g, '')}`,
      [
        fraccionamientoId, usuario.id, nombre_completo,
        telefono ?? null, whatsapp ?? null, curp ?? null, num_escritura ?? null,
      ]
    )

    // El QR se genera al alta: el propietario lo necesita desde el primer día.
    const qrToken = generarQrToken(usuario.id, fraccionamientoId)
    await client.query('UPDATE usuarios SET qr_token = $1 WHERE id = $2', [qrToken, usuario.id])

    await client.query('COMMIT')
    return { ...props[0], email: usuario.email, activo: true, lotes: [] }
  } catch (err) {
    await client.query('ROLLBACK')
    if (err.code === '23505') throw httpError(409, 'Ya existe un usuario con ese email')
    throw err
  } finally {
    client.release()
  }
}

async function actualizar(fraccionamientoId, id, datos) {
  const { nombre_completo, telefono, whatsapp, curp, num_escritura } = datos

  const { rows } = await pool.query(
    `UPDATE propietarios SET
       nombre_completo = COALESCE($3, nombre_completo),
       telefono        = COALESCE($4, telefono),
       whatsapp        = COALESCE($5, whatsapp),
       curp            = COALESCE($6, curp),
       num_escritura   = COALESCE($7, num_escritura)
     WHERE id = $1 AND fraccionamiento_id = $2
     RETURNING ${CAMPOS.replace(/p\./g, '')}`,
    [
      id, fraccionamientoId, nombre_completo ?? null, telefono ?? null,
      whatsapp ?? null, curp ?? null, num_escritura ?? null,
    ]
  )
  if (!rows[0]) throw httpError(404, 'Propietario no encontrado')
  return rows[0]
}

// Elimina al propietario y a su usuario. Los lotes NO se borran: su
// propietario_id es ON DELETE SET NULL, pero hay que devolverlos a
// 'disponible' a mano o quedarían vendidos sin dueño y el cron les cobraría.
async function eliminar(fraccionamientoId, id) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const { rows } = await client.query(
      'SELECT usuario_id FROM propietarios WHERE id = $1 AND fraccionamiento_id = $2',
      [id, fraccionamientoId]
    )
    if (!rows[0]) throw httpError(404, 'Propietario no encontrado')

    await client.query(
      `UPDATE lotes SET estado = 'disponible'
       WHERE propietario_id = $1 AND fraccionamiento_id = $2`,
      [id, fraccionamientoId]
    )

    // Borrar el usuario arrastra al propietario por ON DELETE CASCADE, y a sus
    // documentos por la cascada de propietarios.
    await client.query('DELETE FROM usuarios WHERE id = $1', [rows[0].usuario_id])

    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

// ── QR ──────────────────────────────────────────────────────────────────────

async function obtenerQr(fraccionamientoId, id) {
  const { rows } = await pool.query(
    `SELECT u.id AS usuario_id, u.qr_token, p.nombre_completo
     FROM propietarios p
     INNER JOIN usuarios u ON u.id = p.usuario_id
     WHERE p.id = $1 AND p.fraccionamiento_id = $2`,
    [id, fraccionamientoId]
  )
  if (!rows[0]) throw httpError(404, 'Propietario no encontrado')

  // Los propietarios sembrados antes de este módulo no tienen QR: se genera
  // al primer acceso en vez de obligar a un script de migración de datos.
  let token = rows[0].qr_token
  if (!token) {
    token = generarQrToken(rows[0].usuario_id, fraccionamientoId)
    await pool.query('UPDATE usuarios SET qr_token = $1 WHERE id = $2', [token, rows[0].usuario_id])
  }

  return { qr_token: token, nombre_completo: rows[0].nombre_completo }
}

// Invalida el QR anterior al instante: la validación en caseta compara el
// token escaneado contra usuarios.qr_token, así que el viejo deja de servir.
async function rotarQr(fraccionamientoId, id) {
  const { rows } = await pool.query(
    `SELECT u.id AS usuario_id FROM propietarios p
     INNER JOIN usuarios u ON u.id = p.usuario_id
     WHERE p.id = $1 AND p.fraccionamiento_id = $2`,
    [id, fraccionamientoId]
  )
  if (!rows[0]) throw httpError(404, 'Propietario no encontrado')

  const token = generarQrToken(rows[0].usuario_id, fraccionamientoId)
  await pool.query('UPDATE usuarios SET qr_token = $1 WHERE id = $2', [token, rows[0].usuario_id])
  return { qr_token: token }
}

// ── Documentos ──────────────────────────────────────────────────────────────

async function agregarDocumento(fraccionamientoId, propietarioId, tipo, archivo) {
  if (!archivo) throw httpError(400, 'No se recibió ningún archivo')
  if (!tipo) throw httpError(400, 'El tipo de documento es requerido')

  // Se valida el propietario ANTES de dejar el archivo registrado; si no
  // pertenece a este fraccionamiento se borra lo que multer ya escribió.
  const { rows } = await pool.query(
    'SELECT id FROM propietarios WHERE id = $1 AND fraccionamiento_id = $2',
    [propietarioId, fraccionamientoId]
  )
  if (!rows[0]) {
    await fs.promises.unlink(archivo.path).catch(() => {})
    throw httpError(404, 'Propietario no encontrado')
  }

  const { rows: docs } = await pool.query(
    `INSERT INTO documentos
       (propietario_id, tipo, nombre_archivo, url_archivo, mime_type, tamano_bytes)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, propietario_id, tipo, nombre_archivo, mime_type, tamano_bytes, created_at`,
    [
      propietarioId, tipo, archivo.originalname,
      path.basename(archivo.path), archivo.mimetype, archivo.size,
    ]
  )
  return docs[0]
}

async function listarDocumentos(fraccionamientoId, propietarioId) {
  const { rows } = await pool.query(
    `SELECT d.id, d.propietario_id, d.tipo, d.nombre_archivo,
            d.mime_type, d.tamano_bytes, d.created_at
     ${JOIN_DOC_TENANT}
     WHERE d.propietario_id = $1 AND p.fraccionamiento_id = $2
     ORDER BY d.created_at DESC`,
    [propietarioId, fraccionamientoId]
  )
  return rows
}

// Devuelve los metadatos y la ruta absoluta en disco, para que el controlador
// haga el streaming. El servicio no toca res: sigue siendo agnóstico de HTTP.
async function obtenerDocumento(fraccionamientoId, docId) {
  const { rows } = await pool.query(
    `SELECT d.id, d.propietario_id, d.tipo, d.nombre_archivo, d.url_archivo,
            d.mime_type, d.tamano_bytes, p.usuario_id
     ${JOIN_DOC_TENANT}
     WHERE d.id = $1 AND p.fraccionamiento_id = $2`,
    [docId, fraccionamientoId]
  )
  const doc = rows[0]
  if (!doc) throw httpError(404, 'Documento no encontrado')

  // basename() bloquea cualquier intento de path traversal desde la columna.
  const ruta = path.join(UPLOAD_DIR, path.basename(doc.url_archivo))
  if (!fs.existsSync(ruta)) {
    throw httpError(410, 'El archivo ya no está disponible en el servidor')
  }

  return { ...doc, ruta }
}

async function eliminarDocumento(fraccionamientoId, docId) {
  const { rows } = await pool.query(
    `SELECT d.id, d.url_archivo
     ${JOIN_DOC_TENANT}
     WHERE d.id = $1 AND p.fraccionamiento_id = $2`,
    [docId, fraccionamientoId]
  )
  if (!rows[0]) throw httpError(404, 'Documento no encontrado')

  await pool.query('DELETE FROM documentos WHERE id = $1', [docId])

  // El archivo se borra después del registro y sin bloquear: si falla, queda
  // un huérfano en disco, que es mucho menos grave que una fila apuntando a
  // un archivo inexistente.
  const ruta = path.join(UPLOAD_DIR, path.basename(rows[0].url_archivo))
  await fs.promises.unlink(ruta).catch(err => {
    console.error(`[owners] no se pudo borrar ${ruta}: ${err.message}`)
  })
}

module.exports = {
  listar,
  obtener,
  obtenerPorUsuario,
  crear,
  actualizar,
  eliminar,
  obtenerQr,
  rotarQr,
  agregarDocumento,
  listarDocumentos,
  obtenerDocumento,
  eliminarDocumento,
}
