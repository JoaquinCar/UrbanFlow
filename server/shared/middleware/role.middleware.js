// Usage: requireRole(['admin', 'vigilante'])
function requireRole(roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'No autorizado' })
    if (!roles.includes(req.user.rol)) {
      return res.status(403).json({ error: 'Acceso denegado para este rol' })
    }
    next()
  }
}

module.exports = { requireRole }
