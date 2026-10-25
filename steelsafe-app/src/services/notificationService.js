/**
 * SteelSafe Notification & Edge Function Email Dispatch Service
 * Handles:
 * 1. User Notification Settings (Severity triggers & Quiet Hours)
 * 2. Edge Function Supervisor Email Dispatch on High/Critical Incidents
 * 3. In-App Notification Store with Unread Tracking
 */

import { authService } from './authService';

const STORAGE_NOTIFICATIONS_KEY = 'steelsafe_in_app_notifications';
const STORAGE_EMAILS_KEY = 'steelsafe_dispatched_emails';

export const DEFAULT_USER_SETTINGS = {
  severities: {
    Critical: true,
    High: true,
    Medium: true,
    Low: false,
  },
  emailAlerts: true,
  inAppAlerts: true,
  soundAlerts: true,
  quietHours: {
    enabled: false,
    start: '22:00', // 10:00 PM
    end: '06:00',   // 6:00 AM
    allowCritical: true, // Critical alerts bypass quiet hours
  },
};

// Seed notifications
const DEFAULT_NOTIFICATIONS = [
  {
    id: 'notif-1',
    incidentId: 'inc-101',
    title: 'Zone Intrusion: Furnace Area',
    message: 'Worker stepped past safety barrier without clearance during blast heating.',
    severity: 'High',
    zone: 'Furnace Area',
    time: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
    snapshot_url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="225" viewBox="0 0 400 225"><rect width="400" height="225" fill="%231a1024"/><rect x="40" y="40" width="180" height="150" fill="%23ef4444" fill-opacity="0.25" stroke="%23ef4444" stroke-width="2"/><text x="50" y="30" fill="%23ef4444" font-family="sans-serif" font-size="12" font-weight="bold">INTRUSION: FURNACE AREA</text><circle cx="130" cy="115" r="5" fill="%23ef4444"/></svg>',
    read: false,
  },
  {
    id: 'notif-2',
    incidentId: 'inc-102',
    title: 'PPE Violation: No Helmet',
    message: 'Operator detected without protective hard hat in Rolling Mill corridor.',
    severity: 'High',
    zone: 'Zone B - Rolling Mill',
    time: new Date(Date.now() - 1000 * 60 * 115).toISOString(),
    snapshot_url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="225" viewBox="0 0 400 225"><rect width="400" height="225" fill="%23131722"/><rect x="140" y="30" width="120" height="165" fill="%23f59e0b" fill-opacity="0.2" stroke="%23f59e0b" stroke-width="2"/><text x="140" y="22" fill="%23f59e0b" font-family="sans-serif" font-size="11" font-weight="bold">NO HELMET</text></svg>',
    read: false,
  },
  {
    id: 'notif-3',
    incidentId: 'inc-103',
    title: 'PPE Warning: No Safety Vest',
    message: 'Contractor missing high-visibility apparel at transit perimeter.',
    severity: 'Medium',
    zone: 'Zone D - Raw Material Yard',
    time: new Date(Date.now() - 1000 * 60 * 240).toISOString(),
    snapshot_url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="225" viewBox="0 0 400 225"><rect width="400" height="225" fill="%23111b1e"/><rect x="120" y="45" width="150" height="150" fill="%2306b6d4" fill-opacity="0.2" stroke="%2306b6d4" stroke-width="2"/><text x="120" y="38" fill="%2306b6d4" font-family="sans-serif" font-size="11" font-weight="bold">NO SAFETY VEST</text></svg>',
    read: true,
  },
];

class NotificationService {
  constructor() {
    this._initStorage();
  }

  _initStorage() {
    if (typeof localStorage === 'undefined') return;
    if (!localStorage.getItem(STORAGE_NOTIFICATIONS_KEY)) {
      localStorage.setItem(STORAGE_NOTIFICATIONS_KEY, JSON.stringify(DEFAULT_NOTIFICATIONS));
    }
    if (!localStorage.getItem(STORAGE_EMAILS_KEY)) {
      localStorage.setItem(STORAGE_EMAILS_KEY, JSON.stringify([]));
    }
  }

  // --- USER SETTINGS ---
  getUserSettings(userId = 'default') {
    try {
      const key = `steelsafe_settings_${userId}`;
      const saved = localStorage.getItem(key);
      if (saved) {
        return { ...DEFAULT_USER_SETTINGS, ...JSON.parse(saved) };
      }
      return DEFAULT_USER_SETTINGS;
    } catch {
      return DEFAULT_USER_SETTINGS;
    }
  }

  saveUserSettings(userId = 'default', settings) {
    try {
      const key = `steelsafe_settings_${userId}`;
      localStorage.setItem(key, JSON.stringify(settings));
      return settings;
    } catch (e) {
      console.error('Failed to save notification settings:', e);
      return settings;
    }
  }

  // Check if quiet hours are currently in effect
  isQuietHoursActive(quietHoursConfig) {
    if (!quietHoursConfig?.enabled) return false;
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    const [startH, startM] = (quietHoursConfig.start || '22:00').split(':').map(Number);
    const [endH, endM] = (quietHoursConfig.end || '06:00').split(':').map(Number);

    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    if (startMinutes > endMinutes) {
      // Overnight window (e.g. 22:00 to 06:00)
      return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    } else {
      // Same-day window
      return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    }
  }

  // Determine if user should receive notification based on severity and quiet hours
  shouldNotifyUser(user, incident) {
    const settings = this.getUserSettings(user?.id || user?.userId || 'default');

    // 1. Check if severity is enabled by user
    if (!settings.severities?.[incident.severity]) {
      return false;
    }

    // 2. Check Quiet Hours
    if (this.isQuietHoursActive(settings.quietHours)) {
      // If critical is allowed to bypass quiet hours
      if (settings.quietHours.allowCritical && incident.severity === 'Critical') {
        return true;
      }
      // Suppressed during quiet hours
      return false;
    }

    return true;
  }

  // --- IN-APP NOTIFICATIONS STORE ---
  getNotifications() {
    try {
      const raw = localStorage.getItem(STORAGE_NOTIFICATIONS_KEY);
      return raw ? JSON.parse(raw) : DEFAULT_NOTIFICATIONS;
    } catch {
      return DEFAULT_NOTIFICATIONS;
    }
  }

  addNotification(notification) {
    const notifications = this.getNotifications();
    const item = {
      id: notification.id || `notif-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      incidentId: notification.incidentId || null,
      title: notification.title,
      message: notification.message || '',
      severity: notification.severity || 'High',
      zone: notification.zone || 'Industrial Facility',
      time: notification.time || new Date().toISOString(),
      snapshot_url: notification.snapshot_url || null,
      read: false,
    };

    const updated = [item, ...notifications].slice(0, 50);
    localStorage.setItem(STORAGE_NOTIFICATIONS_KEY, JSON.stringify(updated));
    return item;
  }

  markAsRead(notificationId) {
    const notifications = this.getNotifications();
    const updated = notifications.map(n =>
      n.id === notificationId ? { ...n, read: true } : n
    );
    localStorage.setItem(STORAGE_NOTIFICATIONS_KEY, JSON.stringify(updated));
    return updated;
  }

  markAllAsRead() {
    const notifications = this.getNotifications();
    const updated = notifications.map(n => ({ ...n, read: true }));
    localStorage.setItem(STORAGE_NOTIFICATIONS_KEY, JSON.stringify(updated));
    return updated;
  }

  clearNotifications() {
    localStorage.setItem(STORAGE_NOTIFICATIONS_KEY, JSON.stringify([]));
    return [];
  }

  getUnreadCount() {
    const notifications = this.getNotifications();
    return notifications.filter(n => !n.read).length;
  }

  // --- EDGE FUNCTION: SEND SUPERVISOR EMAIL ALERT ---
  async dispatchSupervisorAlertEdgeFunction(incident) {
    // Only send for High or Critical incidents as requested
    if (incident.severity !== 'High' && incident.severity !== 'Critical') {
      return null;
    }

    console.log(`[Edge Function: send-supervisor-alert] Triggered for ${incident.severity} incident ${incident.id}`);

    // Query all supervisors from user_roles
    const allRoles = authService.getUserRoles();
    const supervisors = allRoles.filter(r => r.role === 'Supervisor' || r.role === 'Admin');

    const dispatchedEmails = [];
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173';
    const incidentLink = `${origin}/incidents?id=${incident.id}`;

    supervisors.forEach(sup => {
      // Evaluate per-user notification settings and quiet hours
      const shouldSend = this.shouldNotifyUser(sup, incident);

      const emailPayload = {
        id: `email-${Date.now()}-${sup.userId}`,
        to: sup.email,
        recipientName: sup.name,
        recipientRole: sup.role,
        subject: `🚨 [${incident.severity.toUpperCase()} ALERT] ${incident.type} in ${incident.zone}`,
        incidentId: incident.id,
        incidentType: incident.type,
        severity: incident.severity,
        zone: incident.zone,
        time: incident.created_at || new Date().toISOString(),
        snapshot_url: incident.snapshot_url || null,
        incidentUrl: incidentLink,
        quietHoursSuppressed: !shouldSend,
        status: shouldSend ? 'Delivered' : 'Suppressed (Quiet Hours / Settings)',
        dispatchedAt: new Date().toISOString(),
      };

      dispatchedEmails.push(emailPayload);
    });

    // Save dispatched emails audit log to storage
    try {
      const existingRaw = localStorage.getItem(STORAGE_EMAILS_KEY);
      const existing = existingRaw ? JSON.parse(existingRaw) : [];
      const updated = [...dispatchedEmails, ...existing].slice(0, 100);
      localStorage.setItem(STORAGE_EMAILS_KEY, JSON.stringify(updated));
    } catch (e) {
      console.warn('Could not save email dispatch log:', e);
    }

    // Automatically create an In-App Notification
    this.addNotification({
      incidentId: incident.id,
      title: `${incident.severity} Alert: ${incident.type}`,
      message: `Supervisor email alert dispatched to ${supervisors.map(s => s.name).join(', ')} for breach in ${incident.zone}.`,
      severity: incident.severity,
      zone: incident.zone,
      time: incident.created_at || new Date().toISOString(),
      snapshot_url: incident.snapshot_url,
    });

    return {
      success: true,
      incidentId: incident.id,
      emailsDispatched: dispatchedEmails.filter(e => e.status === 'Delivered').length,
      supervisorsNotified: supervisors.map(s => ({ email: s.email, name: s.name })),
      payload: dispatchedEmails,
    };
  }

  getDispatchedEmails() {
    try {
      const raw = localStorage.getItem(STORAGE_EMAILS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }
}

export const notificationService = new NotificationService();
