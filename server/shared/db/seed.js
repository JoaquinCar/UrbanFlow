require('dotenv').config()
const bcrypt = require('bcrypt')
const pool = require('./pool')

const SALT_ROUNDS = 12
const DEFAULT_PASSWORD = 'UrbanFlow2026!'

async function seed() {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // ── Fraccionamientos ─────────────────────────────────────────────────────
    const { rows: fraccs } = await client.query(`
      INSERT INTO fraccionamientos (nombre, direccion, config_mapa) VALUES
        ('Residencial Las Palmas',  'Av. Principal 100, Culiacán, Sinaloa',  '{"etapas": 2, "total_lotes": 40}'),
        ('Jardines del Sol',        'Blvd. Universitarios 250, Culiacán, Sinaloa', '{"etapas": 1, "total_lotes": 20}')
      ON CONFLICT DO NOTHING
      RETURNING id, nombre
    `)

    if (fraccs.length === 0) {
      console.log('Fraccionamientos ya existen — omitiendo seed de usuarios.')
      await client.query('ROLLBACK')
      return
    }

    const fracId1 = fraccs[0].id  // Las Palmas  — usuarios de prueba aquí
    const fracId2 = fraccs[1].id  // Jardines del Sol

    console.log(`Fraccionamiento 1: ${fraccs[0].nombre} (${fracId1})`)
    console.log(`Fraccionamiento 2: ${fraccs[1].nombre} (${fracId2})`)

    // ── Usuarios — 1 por rol en fraccionamiento 1 ────────────────────────────
    const hash = await bcrypt.hash(DEFAULT_PASSWORD, SALT_ROUNDS)

    const usuarios = [
      { nombre: 'Admin UrbanFlow',      email: 'admin@urbanflow.test',      rol: 'admin',       fracId: fracId1 },
      { nombre: 'Vigilante Caseta',     email: 'vigilante@urbanflow.test',  rol: 'vigilante',   fracId: fracId1 },
      { nombre: 'Juan Propietario',     email: 'propietario@urbanflow.test', rol: 'propietario', fracId: fracId1 },
      { nombre: 'Carlos Técnico',       email: 'tecnico@urbanflow.test',    rol: 'tecnico',     fracId: fracId1 },
      // Admin extra en fraccionamiento 2
      { nombre: 'Admin Jardines',       email: 'admin2@urbanflow.test',     rol: 'admin',       fracId: fracId2 },
    ]

    for (const u of usuarios) {
      const { rows } = await client.query(`
        INSERT INTO usuarios (fraccionamiento_id, nombre, email, password_hash, rol)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, email, rol
      `, [u.fracId, u.nombre, u.email, hash, u.rol])

      console.log(`  ✓ ${rows[0].rol.padEnd(12)} ${rows[0].email}`)
    }

    await client.query('COMMIT')
    console.log(`\nPassword para todos: ${DEFAULT_PASSWORD}`)
    console.log('Seed completado.')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
    await pool.end()
  }
}

seed().catch(err => {
  console.error('Seed failed:', err.message)
  process.exit(1)
})
