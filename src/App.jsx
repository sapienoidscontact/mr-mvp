import { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation, NavLink } from 'react-router-dom';
import Login from './pages/Login.jsx';
import SignUp from './pages/SignUp.jsx';
import Home from './pages/Home.jsx';
import VisitForm from './pages/VisitForm.jsx';
import History from './pages/History.jsx';
import DailySummary from './pages/DailySummary.jsx';
import { start, stop } from './lib/syncEngine.js';

function getAuth() {
  try { return JSON.parse(localStorage.getItem('mr_session') || 'null'); } catch { return null; }
}

function ProtectedRoute({ children }) {
  const auth = getAuth();
  if (!auth?.mr_id) return <Navigate to="/login" replace />;
  return children;
}

function BottomNav() {
  const location = useLocation();
  const hideOn = ['/login', '/signup', '/visit-form'];
  if (hideOn.some(p => location.pathname.startsWith(p))) return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 border-t-2 border-gray-100 dark:border-gray-800 flex z-20 shadow-2xl safe-area-inset-bottom">
      {[
        { to: '/home', icon: '🏠', label: 'Home' },
        { to: '/history', icon: '📋', label: 'History' },
        { to: '/summary', icon: '📊', label: 'Summary' }
      ].map(({ to, icon, label }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `flex-1 flex flex-col items-center justify-center py-2 min-h-[60px] transition-colors touch-manipulation
            ${isActive
              ? 'text-green-600 dark:text-green-400 font-semibold'
              : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400'}`
          }
        >
          <span className="text-xl">{icon}</span>
          <span className="text-xs mt-0.5">{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

export default function App() {
  useEffect(() => {
    // Apply persisted dark mode before React paints
    const isDark = localStorage.getItem('darkMode') === 'true' ||
      (localStorage.getItem('darkMode') === null && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', isDark);

    const auth = getAuth();
    if (auth?.mr_id) {
      start();
      return () => stop();
    }
  }, []);

  return (
    <div className="font-sans antialiased">
      <Routes>
        <Route path="/" element={<Navigate to={getAuth()?.mr_id ? '/home' : '/login'} replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/home" element={<ProtectedRoute><Home /></ProtectedRoute>} />
        <Route path="/visit-form" element={<ProtectedRoute><VisitForm /></ProtectedRoute>} />
        <Route path="/history" element={<ProtectedRoute><History /></ProtectedRoute>} />
        <Route path="/summary" element={<ProtectedRoute><DailySummary /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <BottomNav />
    </div>
  );
}
