const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const multer = require('multer')
const { httpError } = require('../utils/errors')

// Subida de documentos de propietarios a disco local.
//
// Limitación conocida: en Railway/Render el sistema de archivos es efímero y
// estos archivos se pierden en cada despliegue. Para el proyecto escolar es
// aceptable; el paso a S3 solo cambiaría este archivo y documentos.url_archivo,
// porque el resto del código nunca toca rutas directamente.

const UPLOAD_DIR = path.resolve(process.cwd(), process.env.UPLOAD_DIR || './uploads')
const MAX_MB = parseInt(process.env.MAX_UPLOAD_MB, 10) || 5

// Lista blanca: lo que tiene sentido para una escritura, un INE o un
// comprobante. Nada ejecutable.
const MIMES_PERMITIDOS = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
])

fs.mkdirSync(UPLOAD_DIR, { recursive: true })

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    // Nombre aleatorio en disco: el nombre original lo manda el cliente y no es
    // de fiar (path traversal, colisiones, caracteres raros). El original se
    // guarda en la columna nombre_archivo para poder devolverlo al descargar.
    const ext = path.extname(file.originalname).slice(0, 10)
    cb(null, `${crypto.randomUUID()}${ext}`)
  },
})

const upload = multer({
  storage,
  limits: { fileSize: MAX_MB * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!MIMES_PERMITIDOS.has(file.mimetype)) {
      return cb(httpError(400, `Tipo de archivo no permitido: ${file.mimetype}. Se aceptan PDF, JPG, PNG y WEBP.`))
    }
    cb(null, true)
  },
})

// Traduce los errores de multer al formato del proyecto ({ error: mensaje }).
// Sin esto, superar el límite devuelve un 500 con "File too large" en inglés.
function subirDocumento(req, res, next) {
  upload.single('archivo')(req, res, (err) => {
    if (!err) return next()
    if (err.code === 'LIMIT_FILE_SIZE') {
      return next(httpError(413, `El archivo supera el límite de ${MAX_MB} MB`))
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return next(httpError(400, "El archivo debe enviarse en el campo 'archivo'"))
    }
    next(err)
  })
}

module.exports = { subirDocumento, UPLOAD_DIR, MAX_MB, MIMES_PERMITIDOS }
