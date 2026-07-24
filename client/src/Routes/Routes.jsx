import { Routes, Route } from 'react-router-dom';
import Onboarding from '../screens/Onboarding';
import CreateAccount from '../screens/CreateAccount';
import Login from '../screens/Login';
import NewAccount from '../screens/NewAccount';
import LostPassword from '../screens/LostPassword';
import Dashboard from '../screens/Dashboard';
import Access from '../screens/Access';
import Notifications from '../screens/Notifications';
import Owners from '../screens/Owners';
import Payments from '../screens/Payments';
import Settings from '../screens/Settings';

function AppRoutes() {
  return (
    <Routes>
      <Route path="/"               element={<Onboarding />} />
      <Route path="/CreateAccount"  element={<CreateAccount />} />
      <Route path="/Login"          element={<Login />} />
      <Route path="/NewAccount"     element={<NewAccount />} />
      <Route path="/LostPassword"   element={<LostPassword />} />
      <Route path="/dashboard"      element={<Dashboard />} />
      <Route path="/access"         element={<Access />} />
      <Route path="/notifications"  element={<Notifications />} />
      <Route path="/owners"         element={<Owners />} />
      <Route path="/payments"       element={<Payments />} />
      <Route path="/settings"       element={<Settings />} />
    </Routes>
  );
}

export default AppRoutes;
