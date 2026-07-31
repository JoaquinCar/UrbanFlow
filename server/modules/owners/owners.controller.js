const fs = require('fs')
const service = require('./owners.service')
const { httpError } = require('../../shared/utils/errors')
const { qrDataUrl, qrPngBuffer } = require('../../shared/utils/qr')

const fracc = (req) => req.user.fraccionamiento_id

// Un propietario solo puede consultar su propia ficha, sus documentos y su QR.
// El rol por sí solo no basta: 'propietario' es un rol compartido por todos los
// residentes, así que hay que comprobar que el recurso sea suyo.
async function exigirPropioSiEsPropietario(req, propietarioId) {
  if (req.user.rol !== 'propietario') return
  const mio = await service.obtenerPorUsuario(fracc(req), req.user.sub)
  if (!mio || mio.id !== propietarioId) throw httpError(403, 'Acceso denegado')
}

async function listar(req, res, next) {
  try {
    res.json(await service.listar(fracc(req), req.query))
  } catch (err) {
    next(err)
  }
}

async function obtenerPropio(req, res, next) {
  try {
    const mio = await service.obtenerPorUsuario(fracc(req), req.user.sub)
    if (!mio) throw httpError(404, 'Tu usuario no tiene ficha de propietario')
    res.json(await service.obtener(fracc(req), mio.id))
  } catch (err) {
    next(err)
  }
}

async function obtener(req, res, next) {
  try {
    await exigirPropioSiEsPropietario(req, req.params.id)
    res.json(await service.obtener(fracc(req), req.params.id))
  } catch (err) {
    next(err)
  }
}

async function crear(req, res, next) {
  try {
    res.status(201).json(await service.crear(fracc(req), req.body))
  } catch (err) {
    next(err)
  }
}

async function actualizar(req, res, next) {
  try {
    res.json(await service.actualizar(fracc(req), req.params.id, req.body))
  } catch (err) {
    next(err)
  }
}

async function eliminar(req, res, next) {
  try {
    await service.eliminar(fracc(req), req.params.id)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
}

async function obtenerQr(req, res, next) {
  try {
    await exigirPropioSiEsPropietario(req, req.params.id)
    const { qr_token, nombre_completo } = await service.obtenerQr(fracc(req), req.params.id)

    // ?format=png devuelve la imagen para imprimir; por defecto un data URL,
    // que es lo que consume el <img> del portal sin una petición extra.
    if (req.query.format === 'png') {
      const png = await qrPngBuffer(qr_token)
      res.setHeader('Content-Type', 'image/png')
      res.setHeader('Content-Disposition', `inline; filename="qr-${req.params.id}.png"`)
      return res.send(png)
    }

    res.json({ qr_token, nombre_completo, data_url: await qrDataUrl(qr_token) })
  } catch (err) {
    next(err)
  }
}

async function rotarQr(req, res, next) {
  try {
    const { qr_token } = await service.rotarQr(fracc(req), req.params.id)
    res.json({ qr_token, data_url: await qrDataUrl(qr_token) })
  } catch (err) {
    next(err)
  }
}

async function subirDocumento(req, res, next) {
  try {
    const doc = await service.agregarDocumento(fracc(req), req.params.id, req.body.tipo, req.file)
    res.status(201).json(doc)
  } catch (err) {
    next(err)
  }
}

async function listarDocumentos(req, res, next) {
  try {
    await exigirPropioSiEsPropietario(req, req.params.id)
    res.json(await service.listarDocumentos(fracc(req), req.params.id))
  } catch (err) {
    next(err)
  }
}

async function descargarDocumento(req, res, next) {
  try {
    const doc = await service.obtenerDocumento(fracc(req), req.params.docId)
    await exigirPropioSiEsPropietario(req, doc.propietario_id)

    res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream')
    // El nombre original se guardó aparte porque en disco el archivo tiene un
    // UUID. encodeURIComponent evita romper la cabecera con acentos o comillas.
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(doc.nombre_archivo)}`
    )

    const stream = fs.createReadStream(doc.ruta)
    stream.on('error', next)
    stream.pipe(res)
  } catch (err) {
    next(err)
  }
}

async function eliminarDocumento(req, res, next) {
  try {
    await service.eliminarDocumento(fracc(req), req.params.docId)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
}

module.exports = {
  listar,
  obtenerPropio,
  obtener,
  crear,
  actualizar,
  eliminar,
  obtenerQr,
  rotarQr,
  subirDocumento,
  listarDocumentos,
  descargarDocumento,
  eliminarDocumento,
}
