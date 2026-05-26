const crypto = require('crypto')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const pool = require('../../shared/db/pool')

// sha256 hash of refresh token stored in DB — fast, one-way, not the token itself
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

function generateAccessToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      rol: user.rol,
      fraccionamiento_id: user.fraccionamiento_id,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '15m' }
  )
}

function generateRefreshToken(user) {
  return jwt.sign(
    { sub: user.id },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
  )
}

// Precomputed: prevents timing-based user enumeration when email not found
const TIMING_SAFE_HASH = '$2b$12$GhvMmNVjRW29ulnudl.LbuAnUtN/LRfe1JsBm1Tj6CMDomtYl5O.'

async function login(email, password) {
  const { rows } = await pool.query(
    `SELECT id, fraccionamiento_id, nombre, email, password_hash, rol, activo
     FROM usuarios WHERE email = $1`,
    [email.toLowerCase().trim()]
  )

  const user = rows[0]
  // Always run bcrypt.compare — prevents timing attacks revealing whether email exists
  const hashToCompare = user ? user.password_hash : TIMING_SAFE_HASH
  const valid = await bcrypt.compare(password, hashToCompare)

  if (!user || !valid) {
    const err = new Error('Credenciales incorrectas')
    err.status = 401
    throw err
  }

  if (!user.activo) {
    const err = new Error('Cuenta desactivada')
    err.status = 403
    throw err
  }

  const accessToken = generateAccessToken(user)
  const refreshToken = generateRefreshToken(user)

  await pool.query(
    'UPDATE usuarios SET refresh_token = $1 WHERE id = $2',
    [hashToken(refreshToken), user.id]
  )

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      nombre: user.nombre,
      email: user.email,
      rol: user.rol,
      fraccionamiento_id: user.fraccionamiento_id,
    },
  }
}

async function refresh(incomingToken) {
  let payload
  try {
    payload = jwt.verify(incomingToken, process.env.JWT_REFRESH_SECRET)
  } catch {
    const err = new Error('Refresh token inválido o expirado')
    err.status = 401
    throw err
  }

  const { rows } = await pool.query(
    `SELECT id, fraccionamiento_id, nombre, email, rol, activo, refresh_token
     FROM usuarios WHERE id = $1`,
    [payload.sub]
  )

  const user = rows[0]

  // Token valid but not in DB (revoked via logout) or user disabled
  if (!user || !user.activo || user.refresh_token !== hashToken(incomingToken)) {
    const err = new Error('Refresh token revocado')
    err.status = 401
    throw err
  }

  // Rotate: issue new pair, invalidate old refresh token
  const accessToken = generateAccessToken(user)
  const newRefreshToken = generateRefreshToken(user)

  await pool.query(
    'UPDATE usuarios SET refresh_token = $1 WHERE id = $2',
    [hashToken(newRefreshToken), user.id]
  )

  return { accessToken, refreshToken: newRefreshToken }
}

async function logout(userId) {
  await pool.query('UPDATE usuarios SET refresh_token = NULL WHERE id = $1', [userId])
}

async function me(userId) {
  const { rows } = await pool.query(
    `SELECT id, fraccionamiento_id, nombre, email, rol, created_at
     FROM usuarios WHERE id = $1 AND activo = TRUE`,
    [userId]
  )
  if (!rows[0]) {
    const err = new Error('Usuario no encontrado')
    err.status = 404
    throw err
  }
  return rows[0]
}

module.exports = { login, refresh, logout, me }
