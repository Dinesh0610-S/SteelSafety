import React, { useState } from 'react'
import {
  Users, Shield, ShieldCheck, ShieldAlert, X,
  UserPlus, CheckCircle2, Lock, Key
} from 'lucide-react'
import { Button } from './ui/Button'
import { Badge } from './ui/Badge'
import { useApp } from '../context/AppContext'
import { clsx } from 'clsx'

const ROLE_BADGE = {
  Admin: 'primary',
  Supervisor: 'warning',
  Viewer: 'sky',
}

export function UserManagementModal() {
  const {
    currentUser,
    userRoles,
    updateUserRole,
    userMgmtModalOpen,
    setUserMgmtModalOpen,
    signup,
  } = useApp()

  const [showAddForm, setShowAddForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('password123')
  const [newRole, setNewRole] = useState('Viewer')
  const [addLoading, setAddLoading] = useState(false)

  if (!userMgmtModalOpen) return null

  const isAdmin = currentUser?.role === 'Admin'

  const handleRoleChange = (userId, targetRole) => {
    updateUserRole(userId, targetRole)
  }

  const handleCreateUser = async (e) => {
    e.preventDefault()
    setAddLoading(true)
    try {
      await signup({
        name: newName,
        email: newEmail,
        password: newPassword,
        role: newRole,
        department: 'Operations & Maintenance',
      })
      setShowAddForm(false)
      setNewName('')
      setNewEmail('')
    } catch {
      // toast shown by signup
    } finally {
      setAddLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md animate-in fade-in">
      <div className="glass w-full max-w-2xl rounded-2xl border border-border p-6 shadow-2xl relative">
        {/* Close Button */}
        <button
          onClick={() => setUserMgmtModalOpen(false)}
          className="absolute right-4 top-4 grid size-8 place-items-center rounded-lg border border-border hover:bg-accent text-muted-foreground hover:text-foreground transition"
        >
          <X className="size-4" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-border mb-4">
          <div className="flex items-center gap-3">
            <div className="bg-brand grid size-10 place-items-center rounded-xl shadow-glow text-white">
              <Users className="size-5" />
            </div>
            <div>
              <h2 className="font-display text-lg font-bold text-foreground">
                Access Control & User Roles
              </h2>
              <p className="text-xs text-muted-foreground">
                Relational <code className="text-primary font-mono">user_roles</code> table with Row-Level Security
              </p>
            </div>
          </div>

          {isAdmin && (
            <Button
              size="sm"
              onClick={() => setShowAddForm(!showAddForm)}
              className="gap-1.5 text-xs shadow-glow"
            >
              <UserPlus className="size-3.5" />
              {showAddForm ? 'Cancel' : 'Add Operator'}
            </Button>
          )}
        </div>

        {/* RLS Security Banner */}
        <div className="mb-4 flex items-center justify-between rounded-xl border border-primary/30 bg-primary/10 px-3.5 py-2 text-xs">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-primary shrink-0" />
            <span className="font-medium text-foreground">
              Row-Level Security Active: Only <strong>Admin</strong> users can mutate <code className="text-primary font-mono">user_roles</code>.
            </span>
          </div>
          <span className="rounded bg-primary/20 px-2 py-0.5 text-[10px] font-bold text-primary">
            RLS ENFORCED
          </span>
        </div>

        {!isAdmin ? (
          <div className="p-6 text-center">
            <ShieldAlert className="size-10 text-warning mx-auto mb-2" />
            <p className="font-bold text-foreground">Admin Access Required</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
              Your current role is <strong className="text-warning">{currentUser?.role || 'Guest'}</strong>.
              Only users with the Admin role can modify plant operator permissions.
            </p>
          </div>
        ) : (
          <>
            {/* Add User Inline Form */}
            {showAddForm && (
              <form onSubmit={handleCreateUser} className="mb-4 p-4 rounded-xl border border-border bg-card/60 flex flex-col gap-3">
                <h3 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <UserPlus className="size-3.5 text-primary" /> Create New Plant Account
                </h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <input
                    type="text"
                    required
                    placeholder="Full Name"
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    className="glass rounded-xl px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <input
                    type="email"
                    required
                    placeholder="Work Email"
                    value={newEmail}
                    onChange={e => setNewEmail(e.target.value)}
                    className="glass rounded-xl px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <input
                    type="password"
                    required
                    placeholder="Password"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    className="glass rounded-xl px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <select
                    value={newRole}
                    onChange={e => setNewRole(e.target.value)}
                    className="glass rounded-xl px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="Viewer">Viewer (Dashboard Read-Only)</option>
                    <option value="Supervisor">Supervisor (Acknowledge & Resolve)</option>
                    <option value="Admin">Admin (Full Control)</option>
                  </select>
                </div>
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="outline" type="button" onClick={() => setShowAddForm(false)}>
                    Cancel
                  </Button>
                  <Button size="sm" type="submit" disabled={addLoading} className="shadow-glow">
                    {addLoading ? 'Creating...' : 'Save User & Assign Role'}
                  </Button>
                </div>
              </form>
            )}

            {/* User Roles Table */}
            <div className="overflow-x-auto rounded-xl border border-border bg-card/40">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-border bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="py-2.5 px-3 font-semibold">User</th>
                    <th className="py-2.5 px-3 font-semibold">Email</th>
                    <th className="py-2.5 px-3 font-semibold">Assigned Role</th>
                    <th className="py-2.5 px-3 font-semibold">Permissions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {userRoles.map(u => (
                    <tr key={u.id || u.userId} className="hover:bg-accent/40 transition">
                      <td className="py-2.5 px-3 font-bold text-foreground">
                        {u.name}
                        {u.userId === currentUser?.id && (
                          <span className="ml-2 text-[9px] rounded bg-primary/20 text-primary px-1.5 py-0.2">
                            YOU
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-muted-foreground font-mono">
                        {u.email}
                      </td>
                      <td className="py-2.5 px-3">
                        <select
                          value={u.role}
                          onChange={e => handleRoleChange(u.userId, e.target.value)}
                          className={clsx(
                            'rounded-lg border px-2 py-1 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer',
                            u.role === 'Admin'
                              ? 'border-primary/50 bg-primary/10 text-primary'
                              : u.role === 'Supervisor'
                              ? 'border-warning/50 bg-warning/10 text-warning'
                              : 'border-sky/50 bg-sky/10 text-sky'
                          )}
                        >
                          <option value="Admin" className="bg-background text-foreground">Admin</option>
                          <option value="Supervisor" className="bg-background text-foreground">Supervisor</option>
                          <option value="Viewer" className="bg-background text-foreground">Viewer</option>
                        </select>
                      </td>
                      <td className="py-2.5 px-3 text-[11px] text-muted-foreground">
                        {u.role === 'Admin' && 'Zones, Users, Settings, Full Write'}
                        {u.role === 'Supervisor' && 'Acknowledge & Resolve Incidents'}
                        {u.role === 'Viewer' && 'Read-Only Dashboards'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
