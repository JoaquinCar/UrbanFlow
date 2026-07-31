import React from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Spinner } from '../Components/Spinner'
import { homeForRole } from '../config/nav'

// Guard de rutas como layout route:
//
//   <Route element={<RequireAuth allow={['admin']} />}>
//     <Route path="/lotes" element={<Lotes />} />
//   </Route>
//
// Mientras el AuthProvider está resolviendo la sesión muestra un spinner. Si
// redirigiera durante 'cargando', un F5 sacaría al usuario de la app.
export function RequireAuth({ allow }) {
  const { status, rol } = useAuth()
  const location = useLocation()

  if (status === 'cargando') {
    return (
      <div className="page-loading">
        <Spinner />
      </div>
    )
  }

  if (status !== 'autenticado') {
    // `state.from` permite volver a donde iba después de iniciar sesión.
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  // Autenticado pero sin permiso: se manda a su propia home, no al login, que
  // sería confuso (ya inició sesión correctamente).
  if (allow && !allow.includes(rol)) {
    return <Navigate to={homeForRole(rol)} replace />
  }

  return <Outlet />
}

// Inverso: las pantallas públicas (login, onboarding) no tienen sentido si ya
// hay sesión. Sin esto, volver a /login estando dentro deja al usuario en un
// formulario que no necesita.
export function SoloAnonimo() {
  const { status, rol } = useAuth()

  if (status === 'cargando') {
    return (
      <div className="page-loading">
        <Spinner />
      </div>
    )
  }

  if (status === 'autenticado') {
    return <Navigate to={homeForRole(rol)} replace />
  }

  return <Outlet />
}
