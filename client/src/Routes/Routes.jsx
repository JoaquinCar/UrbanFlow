import { Routes, Route, Navigate } from 'react-router-dom';
import { RequireAuth, SoloAnonimo } from './RequireAuth';
import Onboarding from '../screens/Onboarding';
import Login from '../screens/Login';
import LostPassword from '../screens/LostPassword';
import Dashboard from '../screens/Dashboard';
import Access from '../screens/Access';
import Notifications from '../screens/Notifications';
import Owners from '../screens/Owners';
import Settings from '../screens/Settings';
import NotFound from '../screens/NotFound';
import Lotes from '../screens/admin/Lotes';
import Mapa from '../screens/admin/Mapa';
import Caseta from '../screens/caseta/Caseta';
import Bitacora from '../screens/caseta/Bitacora';
import Cuotas from '../screens/admin/Cuotas';
import EstadoCuenta from '../screens/portal/EstadoCuenta';
import PaymentResult from '../screens/PaymentResult';

// Las rutas internas van en minúsculas. Las variantes en PascalCase que usaban
// las pantallas viejas se redirigen para no romper enlaces existentes.
//
// No hay registro público: en este producto el admin da de alta a los
// propietarios (POST /api/propietarios crea también su usuario). Por eso
// /CreateAccount y /NewAccount redirigen al login.
function AppRoutes() {
  return (
    <Routes>
      {/* Públicas */}
      <Route element={<SoloAnonimo />}>
        <Route path="/"              element={<Onboarding />} />
        <Route path="/login"         element={<Login />} />
        <Route path="/lost-password" element={<LostPassword />} />
      </Route>

      {/* Compatibilidad con las rutas PascalCase anteriores */}
      <Route path="/Login"          element={<Navigate to="/login" replace />} />
      <Route path="/LostPassword"   element={<Navigate to="/lost-password" replace />} />
      <Route path="/CreateAccount"  element={<Navigate to="/login" replace />} />
      <Route path="/NewAccount"     element={<Navigate to="/login" replace />} />

      {/* Cualquier sesión iniciada */}
      <Route element={<RequireAuth />}>
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/settings"      element={<Settings />} />
      </Route>

      <Route element={<RequireAuth allow={['admin', 'propietario']} />}>
        <Route path="/dashboard" element={<Dashboard />} />
      </Route>

      <Route element={<RequireAuth allow={['admin']} />}>
        <Route path="/owners" element={<Owners />} />
        <Route path="/lotes"  element={<Lotes />} />
        <Route path="/mapa"   element={<Mapa />} />
        <Route path="/cuotas" element={<Cuotas />} />
      </Route>

      <Route element={<RequireAuth allow={['vigilante', 'admin']} />}>
        <Route path="/caseta"   element={<Caseta />} />
        <Route path="/bitacora" element={<Bitacora />} />
      </Route>

      <Route element={<RequireAuth allow={['propietario']} />}>
        <Route path="/payments" element={<EstadoCuenta />} />
        <Route path="/access"   element={<Access />} />
      </Route>

      {/* Retorno de MercadoPago: /pagos/exito, /pagos/error, /pagos/pendiente */}
      <Route element={<RequireAuth />}>
        <Route path="/pagos/:estado" element={<PaymentResult />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default AppRoutes;
