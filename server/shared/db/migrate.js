require('dotenv').config()
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const pool = require('./pool')

// Migraciones que se aplicaron antes de que existiera el ledger. Si la base ya
// las tiene pero schema_migrations está vacía, se marcan como aplicadas en vez
// de volver a correrlas (CREATE TYPE no admite IF NOT EXISTS y reventaría).
const MIGRACIONES_PREVIAS = [
  '001_initial.sql',
  '002_lotes_propietarios.sql',
  '003_cuotas_pagos.sql',
]

function checksum(sql) {
  return crypto.createHash('sha256').update(sql).digest('hex')
}

function leerMigracion(file) {
  return fs.readFileSync(path.join(__dirname, 'migrations', file), 'utf8')
}

async function crearLedger() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   VARCHAR(255) PRIMARY KEY,
      checksum   CHAR(64) NOT NULL,
      applied_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `)
}

// Detecta una base creada antes del ledger: las tablas existen pero no hay
// ningún registro. Sin esto, migrate reventaría en la primera corrida tras
// actualizar el repo.
async function adoptarBasePrevia(archivos) {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM schema_migrations')
  if (rows[0].n > 0) return

  const { rows: probe } = await pool.query(`SELECT to_regclass('public.usuarios') AS tabla`)
  if (!probe[0].tabla) return

  console.log('Base previa al ledger detectada — adoptando migraciones ya aplicadas:')
  for (const file of archivos) {
    if (!MIGRACIONES_PREVIAS.includes(file)) continue
    await pool.query(
      'INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [file, checksum(leerMigracion(file))]
    )
    console.log(`  · ${file} — adoptada`)
  }
}

async function migrate() {
  const migrationsDir = path.join(__dirname, 'migrations')
  const archivos = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort()

  await crearLedger()
  await adoptarBasePrevia(archivos)

  const { rows } = await pool.query('SELECT filename, checksum FROM schema_migrations')
  const aplicadas = new Map(rows.map(r => [r.filename, r.checksum]))

  let nuevas = 0

  for (const file of archivos) {
    const sql = leerMigracion(file)
    const hash = checksum(sql)

    if (aplicadas.has(file)) {
      if (aplicadas.get(file) !== hash) {
        throw new Error(
          `La migración ${file} ya fue aplicada pero su contenido cambió.\n` +
          '  Las migraciones son inmutables: crea un archivo nuevo en vez de editar este.'
        )
      }
      console.log(`  · ${file} — ya aplicada`)
      continue
    }

    // Una transacción por archivo: si falla a la mitad no deja objetos sueltos
    // ni una entrada mentirosa en el ledger.
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(sql)
      await client.query(
        'INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)',
        [file, hash]
      )
      await client.query('COMMIT')
      console.log(`  ✓ ${file} — aplicada`)
      nuevas++
    } catch (err) {
      await client.query('ROLLBACK')
      throw new Error(`Falló la migración ${file}: ${err.message}`)
    } finally {
      client.release()
    }
  }

  console.log(nuevas === 0 ? 'Sin migraciones pendientes.' : `${nuevas} migración(es) aplicada(s).`)
  await pool.end()
}

migrate().catch(async err => {
  console.error('Migración fallida:', err.message)
  await pool.end().catch(() => {})
  process.exit(1)
})
