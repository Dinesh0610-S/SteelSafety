import React from 'react'
import {
  createBrowserRouter,
  RouterProvider,
  Navigate,
} from 'react-router-dom'
import { Layout } from './components/Layout'
import { AppProvider } from './context/AppContext'
import Home from './pages/Home'
import LiveMonitor from './pages/LiveMonitor'
import Incidents from './pages/Incidents'
import Workers from './pages/Workers'
import Analytics from './pages/Analytics'
import ModelPerformance from './pages/ModelPerformance'
import Settings from './pages/Settings'
import NotFound from './pages/NotFound'

const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true,                 element: <Home /> },
      { path: 'live',                element: <LiveMonitor /> },
      { path: 'incidents',           element: <Incidents /> },
      { path: 'workers',             element: <Workers /> },
      // Redirect legacy /results to /incidents
      { path: 'results',             element: <Navigate to="/incidents" replace /> },
      { path: 'analytics',           element: <Analytics /> },
      { path: 'model-performance',   element: <ModelPerformance /> },
      { path: 'performance',         element: <Navigate to="/model-performance" replace /> },
      { path: 'settings',            element: <Settings /> },
      { path: '*',                   element: <NotFound /> },
    ],
  },
])

export default function App() {
  return (
    <AppProvider>
      <RouterProvider router={router} />
    </AppProvider>
  )
}
