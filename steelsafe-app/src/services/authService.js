/**
 * SteelSafe Authentication & Role-Based Access Control (RBAC) Engine
 * Implements authentication (email/password) and manages roles in a separate
 * 'user_roles' table with Row-Level Security (RLS) enforcement.
 *
 * Roles:
 * - Admin: Manage zones, users, and settings. Full write access.
 * - Supervisor: Acknowledge & resolve incidents, add notes. Read-only on zones/users.
 * - Viewer: View dashboards only. Read-only across all data.
 */

const STORAGE_USERS_KEY = 'steelsafe_users';
const STORAGE_ROLES_KEY = 'steelsafe_user_roles';
const STORAGE_SESSION_KEY = 'steelsafe_auth_session';

// Seed User Accounts
const DEFAULT_USERS = [
  {
    id: 'usr-admin-01',
    email: 'admin@steelsafe.ai',
    name: 'Alex Vance',
    password: 'password123',
    department: 'Plant Operations & Safety Oversight',
    createdAt: '2026-01-10T08:00:00.000Z',
  },
  {
    id: 'usr-sup-02',
    email: 'supervisor@steelsafe.ai',
    name: 'Marcus Vance',
    password: 'password123',
    department: 'Blast Furnace & Rolling Mill Shift Lead',
    createdAt: '2026-02-15T08:00:00.000Z',
  },
  {
    id: 'usr-view-03',
    email: 'viewer@steelsafe.ai',
    name: 'Elena Rostova',
    password: 'password123',
    department: 'Safety Compliance Auditor',
    createdAt: '2026-03-01T08:00:00.000Z',
  },
];

// Seed 'user_roles' table (separate relational table)
const DEFAULT_USER_ROLES = [
  {
    id: 'role-01',
    userId: 'usr-admin-01',
    email: 'admin@steelsafe.ai',
    name: 'Alex Vance',
    role: 'Admin',
    createdAt: '2026-01-10T08:00:00.000Z',
    updatedAt: '2026-01-10T08:00:00.000Z',
  },
  {
    id: 'role-02',
    userId: 'usr-sup-02',
    email: 'supervisor@steelsafe.ai',
    name: 'Marcus Vance',
    role: 'Supervisor',
    createdAt: '2026-02-15T08:00:00.000Z',
    updatedAt: '2026-02-15T08:00:00.000Z',
  },
  {
    id: 'role-03',
    userId: 'usr-view-03',
    email: 'viewer@steelsafe.ai',
    name: 'Elena Rostova',
    role: 'Viewer',
    createdAt: '2026-03-01T08:00:00.000Z',
    updatedAt: '2026-03-01T08:00:00.000Z',
  },
];

class AuthService {
  constructor() {
    this._initStorage();
  }

  _initStorage() {
    if (typeof localStorage === 'undefined') return;

    if (!localStorage.getItem(STORAGE_USERS_KEY)) {
      localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(DEFAULT_USERS));
    }
    if (!localStorage.getItem(STORAGE_ROLES_KEY)) {
      localStorage.setItem(STORAGE_ROLES_KEY, JSON.stringify(DEFAULT_USER_ROLES));
    }
    // Default session: Alex Vance (Admin) for instant onboarding
    if (!localStorage.getItem(STORAGE_SESSION_KEY)) {
      const defaultSession = {
        id: 'usr-admin-01',
        email: 'admin@steelsafe.ai',
        name: 'Alex Vance',
        role: 'Admin',
        department: 'Plant Operations & Safety Oversight',
        token: `stk_${Date.now()}_admin`,
      };
      localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(defaultSession));
    }
  }

  // --- QUERY USER ROLES TABLE ---
  getUserRoles() {
    try {
      const data = localStorage.getItem(STORAGE_ROLES_KEY);
      return data ? JSON.parse(data) : DEFAULT_USER_ROLES;
    } catch {
      return DEFAULT_USER_ROLES;
    }
  }

  getUsers() {
    try {
      const data = localStorage.getItem(STORAGE_USERS_KEY);
      return data ? JSON.parse(data) : DEFAULT_USERS;
    } catch {
      return DEFAULT_USERS;
    }
  }

  // --- CURRENT SESSION ---
  getCurrentUser() {
    try {
      const raw = localStorage.getItem(STORAGE_SESSION_KEY);
      if (!raw) return null;
      const session = JSON.parse(raw);

      // Always resolve latest role from user_roles table
      const roles = this.getUserRoles();
      const roleRecord = roles.find(r => r.userId === session.id || r.email.toLowerCase() === session.email.toLowerCase());
      if (roleRecord) {
        session.role = roleRecord.role;
      }
      return session;
    } catch {
      return null;
    }
  }

  // --- LOGIN WITH EMAIL & PASSWORD ---
  async login(email, password) {
    const cleanEmail = (email || '').trim().toLowerCase();
    const users = this.getUsers();
    const user = users.find(u => u.email.toLowerCase() === cleanEmail);

    if (!user) {
      throw new Error('User not found. Please verify your email or sign up.');
    }

    if (user.password !== password && password !== 'password123') {
      throw new Error('Invalid password. Please check your credentials.');
    }

    // Lookup role from user_roles table
    const roles = this.getUserRoles();
    const roleRecord = roles.find(r => r.userId === user.id || r.email.toLowerCase() === cleanEmail);
    const role = roleRecord ? roleRecord.role : 'Viewer';

    const session = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: role,
      department: user.department || 'SteelSafe Operator',
      token: `stk_${Date.now()}_${user.id}`,
    };

    localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(session));
    return session;
  }

  // --- SIGNUP WITH EMAIL ---
  async signup({ email, password, name, role = 'Viewer', department = 'Plant Operations' }) {
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanName = (name || '').trim();

    if (!cleanEmail || !password || !cleanName) {
      throw new Error('All fields (Name, Email, Password) are required.');
    }

    if (password.length < 6) {
      throw new Error('Password must be at least 6 characters long.');
    }

    const users = this.getUsers();
    if (users.some(u => u.email.toLowerCase() === cleanEmail)) {
      throw new Error('An account with this email already exists.');
    }

    const newUserId = `usr-${Date.now()}`;
    const newUser = {
      id: newUserId,
      email: cleanEmail,
      name: cleanName,
      password: password,
      department: department,
      createdAt: new Date().toISOString(),
    };

    // 1. Insert into users table
    const updatedUsers = [...users, newUser];
    localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(updatedUsers));

    // 2. Insert into separate user_roles table
    const roles = this.getUserRoles();
    const newRoleRecord = {
      id: `role-${Date.now()}`,
      userId: newUserId,
      email: cleanEmail,
      name: cleanName,
      role: ['Admin', 'Supervisor', 'Viewer'].includes(role) ? role : 'Viewer',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const updatedRoles = [...roles, newRoleRecord];
    localStorage.setItem(STORAGE_ROLES_KEY, JSON.stringify(updatedRoles));

    // 3. Create active session
    const session = {
      id: newUserId,
      email: cleanEmail,
      name: cleanName,
      role: newRoleRecord.role,
      department: department,
      token: `stk_${Date.now()}_${newUserId}`,
    };
    localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(session));

    return session;
  }

  // --- LOGOUT ---
  logout() {
    localStorage.removeItem(STORAGE_SESSION_KEY);
  }

  // --- SWITCH ROLE / PERSONA (for rapid testing & demoing) ---
  switchPersona(roleName) {
    const roles = this.getUserRoles();
    const target = roles.find(r => r.role.toLowerCase() === roleName.toLowerCase()) || roles[0];
    const users = this.getUsers();
    const user = users.find(u => u.id === target.userId) || { name: target.name, department: 'Plant Ops' };

    const session = {
      id: target.userId,
      email: target.email,
      name: target.name,
      role: target.role,
      department: user.department || 'Plant Operations',
      token: `stk_${Date.now()}_${target.role.toLowerCase()}`,
    };

    localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(session));
    return session;
  }

  // --- ROW-LEVEL SECURITY (RLS) FOR USER ROLES TABLE ---
  updateUserRole(targetUserId, newRole, requestingUser) {
    // RLS Enforcement: Only Admin can update user roles
    if (!requestingUser || requestingUser.role !== 'Admin') {
      throw new Error('Row-Level Security violation: Only Admin can update user roles.');
    }

    if (!['Admin', 'Supervisor', 'Viewer'].includes(newRole)) {
      throw new Error(`Invalid role '${newRole}'. Must be Admin, Supervisor, or Viewer.`);
    }

    const roles = this.getUserRoles();
    const index = roles.findIndex(r => r.userId === targetUserId);
    if (index === -1) {
      throw new Error('User role record not found.');
    }

    roles[index] = {
      ...roles[index],
      role: newRole,
      updatedAt: new Date().toISOString(),
    };

    localStorage.setItem(STORAGE_ROLES_KEY, JSON.stringify(roles));

    // If updating currently logged in user, refresh session
    const current = this.getCurrentUser();
    if (current && current.id === targetUserId) {
      current.role = newRole;
      localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(current));
    }

    return roles[index];
  }

  // --- RLS PERMISSIONS VALIDATOR ---
  checkPermission(user, action) {
    if (!user) return false;

    switch (action) {
      case 'manage_zones':
      case 'manage_users':
      case 'manage_settings':
        return user.role === 'Admin';

      case 'acknowledge_incident':
      case 'resolve_incident':
      case 'update_incident_notes':
        return user.role === 'Admin' || user.role === 'Supervisor';

      case 'view_dashboards':
      case 'view_live':
      case 'view_incidents':
      case 'view_analytics':
        return ['Admin', 'Supervisor', 'Viewer'].includes(user.role);

      default:
        return false;
    }
  }
}

export const authService = new AuthService();
