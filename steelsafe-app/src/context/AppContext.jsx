import React, { createContext, useContext, useState, useEffect } from 'react'
import { lovableCloud } from '../services/lovableCloud'
import { authService } from '../services/authService'
import { notificationService } from '../services/notificationService'

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const [incidents, setIncidents] = useState([])
  const [toasts, setToasts] = useState([])
  const [currentUser, setCurrentUser] = useState(() => authService.getCurrentUser())
  const [userRoles, setUserRoles] = useState(() => authService.getUserRoles())
  const [notifications, setNotifications] = useState(() => notificationService.getNotifications())
  const [userSettings, setUserSettings] = useState(() =>
    notificationService.getUserSettings(authService.getCurrentUser()?.id || 'default')
  )
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [authModalMode, setAuthModalMode] = useState('login') // 'login' | 'signup'
  const [userMgmtModalOpen, setUserMgmtModalOpen] = useState(false)

  const [dark, setDark] = useState(() => {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('ss-theme')
      if (saved) return saved === 'dark'
    }
    return true
  })

  // Load cloud incidents on startup
  useEffect(() => {
    lovableCloud.getIncidents().then(data => {
      setIncidents(data)
    })
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('ss-theme', dark ? 'dark' : 'light')
  }, [dark])

  const toggleDark = () => setDark(d => !d)

  // Show Toast Notification
  const showToast = (toast) => {
    const id = toast.id || `toast-${Date.now()}`
    const item = { ...toast, id }
    setToasts(prev => [item, ...prev].slice(0, 4))
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 4500)
  }

  // --- AUTHENTICATION ACTIONS ---
  const login = async (email, password) => {
    try {
      const user = await authService.login(email, password)
      setCurrentUser(user)
      setUserRoles(authService.getUserRoles())
      setAuthModalOpen(false)
      showToast({
        title: 'Signed In Successfully',
        message: `Welcome back, ${user.name} (${user.role})`,
        variant: 'default',
      })
      return user
    } catch (err) {
      showToast({
        title: 'Authentication Failed',
        message: err.message,
        variant: 'destructive',
      })
      throw err
    }
  }

  const signup = async ({ email, password, name, role }) => {
    try {
      const user = await authService.signup({ email, password, name, role })
      setCurrentUser(user)
      setUserRoles(authService.getUserRoles())
      setAuthModalOpen(false)
      showToast({
        title: 'Account Created',
        message: `Welcome to SteelSafe, ${user.name} (${user.role})`,
        variant: 'default',
      })
      return user
    } catch (err) {
      showToast({
        title: 'Registration Failed',
        message: err.message,
        variant: 'destructive',
      })
      throw err
    }
  }

  const logout = () => {
    authService.logout()
    setCurrentUser(null)
    showToast({
      title: 'Signed Out',
      message: 'You have been logged out of SteelSafe Intelligence.',
      variant: 'default',
    })
  }

  // Fast Persona / Role Switcher for instant testing
  const switchPersona = (roleName) => {
    const user = authService.switchPersona(roleName)
    setCurrentUser(user)
    setUserRoles(authService.getUserRoles())
    showToast({
      title: 'Switched Active Role',
      message: `Active persona is now ${user.name} (${user.role})`,
      variant: 'default',
    })
    return user
  }

  // Manage User Role (Admin only with RLS)
  const updateUserRole = (targetUserId, newRole) => {
    try {
      const updated = authService.updateUserRole(targetUserId, newRole, currentUser)
      setUserRoles(authService.getUserRoles())
      setCurrentUser(authService.getCurrentUser())
      showToast({
        title: 'Role Updated (user_roles)',
        message: `${updated.name}'s role updated to ${newRole}`,
        variant: 'default',
      })
      return updated
    } catch (err) {
      showToast({
        title: 'Row-Level Security Error',
        message: err.message,
        variant: 'destructive',
      })
      throw err
    }
  }

  // Permissions helper
  const can = (action) => authService.checkPermission(currentUser, action)

  // Sync user settings on user login/change
  useEffect(() => {
    setUserSettings(notificationService.getUserSettings(currentUser?.id || 'default'))
  }, [currentUser])

  // In-App Notification Actions
  const markNotificationAsRead = (id) => {
    const updated = notificationService.markAsRead(id)
    setNotifications(updated)
  }

  const markAllNotificationsAsRead = () => {
    const updated = notificationService.markAllAsRead()
    setNotifications(updated)
    showToast({
      title: 'Notifications Cleared',
      message: 'All notifications marked as read.',
      variant: 'default',
    })
  }

  const clearNotifications = () => {
    const updated = notificationService.clearNotifications()
    setNotifications(updated)
  }

  const saveUserSettings = (newSettings) => {
    const saved = notificationService.saveUserSettings(currentUser?.id || 'default', newSettings)
    setUserSettings(saved)
    showToast({
      title: 'Settings Saved',
      message: 'Notification preferences & quiet hours updated.',
      variant: 'default',
    })
    return saved
  }

  const unreadNotificationsCount = notifications.filter(n => !n.read).length

  // Insert Incident to Lovable Cloud and Local State
  const addIncident = async (incident) => {
    const saved = await lovableCloud.insertIncident(incident)
    setIncidents(prev => [saved, ...prev])
    // Refresh notifications after Edge Function triggers
    setTimeout(() => {
      setNotifications(notificationService.getNotifications())
    }, 150)
    return saved
  }

  // Update Incident in Lovable Cloud (RLS enforced)
  const updateIncident = async (id, updates) => {
    try {
      const updated = await lovableCloud.updateIncident(id, updates, currentUser)
      if (updated) {
        setIncidents(prev => prev.map(inc => (inc.id === id ? updated : inc)))
      }
      return updated
    } catch (err) {
      showToast({
        title: 'Permission Denied',
        message: err.message,
        variant: 'destructive',
      })
      throw err
    }
  }

  // Delete Incident in Lovable Cloud (RLS enforced)
  const deleteIncident = async (id) => {
    try {
      const updated = await lovableCloud.deleteIncident(id, currentUser)
      setIncidents(updated)
      return updated
    } catch (err) {
      showToast({
        title: 'Permission Denied',
        message: err.message,
        variant: 'destructive',
      })
      throw err
    }
  }

  // Backward-compatibility alias for detections
  const detections = incidents.map(inc => ({
    id: inc.id,
    type: inc.type,
    severity: inc.severity,
    confidence: inc.confidence,
    camera: inc.camera,
    zone: inc.zone,
    time: new Date(inc.created_at),
  }))

  return (
    <AppContext.Provider
      value={{
        currentUser,
        userRoles,
        login,
        signup,
        logout,
        switchPersona,
        updateUserRole,
        can,
        authModalOpen,
        setAuthModalOpen,
        authModalMode,
        setAuthModalMode,
        userMgmtModalOpen,
        setUserMgmtModalOpen,
        incidents,
        setIncidents,
        addIncident,
        updateIncident,
        deleteIncident,
        notifications,
        unreadNotificationsCount,
        markNotificationAsRead,
        markAllNotificationsAsRead,
        clearNotifications,
        userSettings,
        saveUserSettings,
        detections,
        toasts,
        showToast,
        dark,
        toggleDark,
      }}
    >
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside AppProvider')
  return ctx
}
