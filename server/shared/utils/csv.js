// Generación de CSV para las exportaciones (bitácora de accesos, etc.).
//
// Los dos detalles que siempre se olvidan y siempre acaban en un reporte de
// error están resueltos aquí: el BOM y la inyección de fórmulas.

function escapar(valor) {
  if (valor === null || valor === undefined) return ''
  const s = String(valor)

  // Excel y Google Sheets interpretan como fórmula cualquier celda que empiece
  // por = + - @ o un tabulador. Un visitante llamado "=1+1" acabaría
  // ejecutándose, y con =HYPERLINK() o =IMPORTXML() eso es exfiltración de
  // datos. El apóstrofo inicial fuerza a tratarlo como texto.
  const seguro = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s

  // Comillas dobles duplicadas y campo entrecomillado si contiene , " o salto.
  return /[",\n\r]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro
}

function aCsv(columnas, filas) {
  const encabezado = columnas.map(c => escapar(c.titulo)).join(',')
  const cuerpo = filas.map(f => columnas.map(c => escapar(f[c.campo])).join(','))

  // BOM UTF-8: sin él, Excel en Windows lee el archivo como Latin-1 y los
  // acentos salen destrozados ("Pérez" → "PÃ©rez"). Se escribe como escape y
  // no como carácter literal porque un BOM literal es invisible en el editor y
  // cualquiera podría borrarlo sin darse cuenta.
  return '\uFEFF' + [encabezado, ...cuerpo].join('\r\n') + '\r\n'
}

module.exports = { aCsv, escapar }
