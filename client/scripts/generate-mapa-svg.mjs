// Genera el SVG del mapa del fraccionamiento.
//
//   node scripts/generate-mapa-svg.mjs
//
// El proyecto no tiene un plano real, así que se dibuja una retícula: dos
// manzanas separadas por una calle, con un <path id="lote-A-01"> por lote. Ese
// id es exactamente lo que guarda lotes.svg_path_id, que es como el overlay de
// React conecta cada figura con su registro en la base de datos.
//
// Se genera con un script en vez de escribirlo a mano por dos razones: 40 paths
// a mano son 40 oportunidades de equivocarse en un id, y cuando el
// fraccionamiento crezca basta cambiar las constantes de aquí abajo.

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SALIDA = resolve(__dirname, '../public/assets/mapa-fraccionamiento.svg')

// Manzanas: prefijo, cuántos lotes, y en cuántas columnas se acomodan.
const MANZANAS = [
  { prefijo: 'A', cantidad: 15, columnas: 5, etiqueta: 'Etapa 1' },
  { prefijo: 'B', cantidad: 10, columnas: 5, etiqueta: 'Etapa 2' },
]

const LOTE_W = 96
const LOTE_H = 76
const SEPARACION = 8      // entre lotes
const CALLE = 74          // entre manzanas
const MARGEN = 28

function generar() {
  const paths = []
  const etiquetas = []
  const calles = []

  let y = MARGEN
  let anchoMax = 0

  for (const manzana of MANZANAS) {
    const filas = Math.ceil(manzana.cantidad / manzana.columnas)

    etiquetas.push(
      `  <text class="mapa-etapa" x="${MARGEN}" y="${y - 8}">${manzana.etiqueta}</text>`
    )

    for (let i = 0; i < manzana.cantidad; i++) {
      const col = i % manzana.columnas
      const fila = Math.floor(i / manzana.columnas)

      const x = MARGEN + col * (LOTE_W + SEPARACION)
      const yLote = y + fila * (LOTE_H + SEPARACION)
      const numero = `${manzana.prefijo}-${String(i + 1).padStart(2, '0')}`

      // Rectángulo como <path> para que el overlay trate todos los lotes igual.
      paths.push(
        `  <path id="lote-${numero}" class="mapa-lote" ` +
        `d="M ${x} ${yLote} h ${LOTE_W} v ${LOTE_H} h -${LOTE_W} Z" />\n` +
        `  <text class="mapa-numero" x="${x + LOTE_W / 2}" y="${yLote + LOTE_H / 2 + 5}">${numero}</text>`
      )

      anchoMax = Math.max(anchoMax, x + LOTE_W)
    }

    const altoManzana = filas * (LOTE_H + SEPARACION) - SEPARACION
    y += altoManzana

    // Calle entre manzanas
    if (manzana !== MANZANAS[MANZANAS.length - 1]) {
      calles.push(
        `  <rect class="mapa-calle" x="0" y="${y + CALLE / 2 - 16}" width="100%" height="32" />`
      )
      y += CALLE
    }
  }

  const ancho = anchoMax + MARGEN
  const alto = y + MARGEN

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ancho} ${alto}"
     class="mapa-svg" role="img" aria-label="Plano de lotes del fraccionamiento">
  <rect class="mapa-fondo" x="0" y="0" width="${ancho}" height="${alto}" />
${calles.join('\n')}
${etiquetas.join('\n')}
${paths.join('\n')}
</svg>
`
}

mkdirSync(dirname(SALIDA), { recursive: true })
writeFileSync(SALIDA, generar(), 'utf8')

const total = MANZANAS.reduce((n, m) => n + m.cantidad, 0)
console.log(`✓ ${SALIDA}`)
console.log(`  ${total} lotes: ${MANZANAS.map(m => `${m.prefijo}-01..${m.prefijo}-${String(m.cantidad).padStart(2, '0')}`).join(', ')}`)
