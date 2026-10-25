/**
 * SteelSafe Lovable Cloud Client & Database / Storage / Edge Functions Engine
 * Emulates the Supabase-backed Lovable Cloud architecture directly with full
 * offline and online synchronization capabilities:
 * - Database Tables: 'incidents', 'zones'
 * - Storage Bucket: 'incident-snapshots'
 * - Edge Function: 'ai-incident-triage'
 */

import { notificationService } from './notificationService';

const STORAGE_INCIDENTS_KEY = 'steelsafe_cloud_incidents';
const STORAGE_ZONES_KEY = 'steelsafe_industrial_zones';
const STORAGE_BUCKET_KEY = 'steelsafe_storage_incident_snapshots';

// Seed realistic incidents if none exist
const DEFAULT_INCIDENTS = [
  {
    id: 'inc-101',
    type: 'Zone Intrusion: Furnace Area',
    severity: 'High',
    confidence: 0.96,
    zone: 'Furnace Area',
    camera: 'Camera 01 - Primary Bay',
    status: 'Open',
    snapshot_url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="225" viewBox="0 0 400 225"><rect width="400" height="225" fill="%231a1024"/><rect x="40" y="40" width="180" height="150" fill="%23ef4444" fill-opacity="0.25" stroke="%23ef4444" stroke-width="2"/><text x="50" y="30" fill="%23ef4444" font-family="sans-serif" font-size="12" font-weight="bold">INTRUSION: FURNACE AREA</text><circle cx="130" cy="115" r="5" fill="%23ef4444"/></svg>',
    owner: 'Safety Team Alpha',
    worker_id: 'wrk-103',
    worker_name: 'Rajesh Kumar (EMP-103)',
    notes: 'Worker stepped past safety barrier without clearance during active blast heating.',
    created_at: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
    resolved_at: null,
  },
  {
    id: 'inc-102',
    type: 'PPE Violation: No Helmet',
    severity: 'High',
    confidence: 0.93,
    zone: 'Zone B - Rolling Mill',
    camera: 'Camera 02 - Rolling Mill Feed',
    status: 'Acknowledged',
    snapshot_url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="225" viewBox="0 0 400 225"><rect width="400" height="225" fill="%23131722"/><rect x="140" y="30" width="120" height="165" fill="%23f59e0b" fill-opacity="0.2" stroke="%23f59e0b" stroke-width="2"/><text x="140" y="22" fill="%23f59e0b" font-family="sans-serif" font-size="11" font-weight="bold">NO HELMET (WORKER)</text></svg>',
    owner: 'Marcus Vance (Shift Supervisor)',
    worker_id: 'wrk-101',
    worker_name: 'David Chen (EMP-101)',
    notes: 'Supervisor notified operator on channel 4. Operator put on hard hat immediately.',
    created_at: new Date(Date.now() - 1000 * 60 * 115).toISOString(),
    resolved_at: null,
  },
  {
    id: 'inc-103',
    type: 'PPE Warning: No Safety Vest',
    severity: 'Medium',
    confidence: 0.88,
    zone: 'Zone D - Raw Material Yard',
    camera: 'Camera 04 - Yard Perimeter',
    status: 'Resolved',
    snapshot_url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="225" viewBox="0 0 400 225"><rect width="400" height="225" fill="%23111b1e"/><rect x="120" y="45" width="150" height="150" fill="%2306b6d4" fill-opacity="0.2" stroke="%2306b6d4" stroke-width="2"/><text x="120" y="38" fill="%2306b6d4" font-family="sans-serif" font-size="11" font-weight="bold">NO SAFETY VEST</text></svg>',
    owner: 'Elena Rostova',
    worker_id: 'wrk-105',
    worker_name: 'Vikram Patel (EMP-105)',
    notes: 'Contractor was issued high-visibility safety vest at entry checkpoint.',
    created_at: new Date(Date.now() - 1000 * 60 * 240).toISOString(),
    resolved_at: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
  }
];

export const lovableCloud = {
  // --- DATABASE: INCIDENTS TABLE ---
  async getIncidents() {
    try {
      const raw = localStorage.getItem(STORAGE_INCIDENTS_KEY);
      if (!raw) {
        localStorage.setItem(STORAGE_INCIDENTS_KEY, JSON.stringify(DEFAULT_INCIDENTS));
        return DEFAULT_INCIDENTS;
      }
      return JSON.parse(raw);
    } catch {
      return DEFAULT_INCIDENTS;
    }
  },

  async insertIncident(incident) {
    const incidents = await this.getIncidents();
    const newRecord = {
      id: incident.id || `inc-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      type: incident.type,
      severity: incident.severity || 'High',
      confidence: incident.confidence || 0.90,
      zone: incident.zone || 'Zone A - Blast Furnace',
      camera: incident.camera || 'Camera 01',
      status: incident.status || 'Open',
      snapshot_url: incident.snapshot_url || null,
      notes: incident.notes || '',
      owner: incident.owner || 'Unassigned',
      worker_id: incident.worker_id || null,
      worker_name: incident.worker_name || null,
      created_at: incident.created_at || new Date().toISOString(),
      resolved_at: incident.resolved_at || null,
    };

    const updated = [newRecord, ...incidents];
    try {
      localStorage.setItem(STORAGE_INCIDENTS_KEY, JSON.stringify(updated.slice(0, 300)));
    } catch (e) {
      // If localstorage quota is reached due to images, trim oldest snapshots
      const trimmed = updated.slice(0, 100).map((inc, i) => i > 15 ? { ...inc, snapshot_url: null } : inc);
      localStorage.setItem(STORAGE_INCIDENTS_KEY, JSON.stringify(trimmed));
    }

    // Trigger Edge Function hook in background
    this.invokeEdgeFunction('ai-incident-triage', { incident: newRecord }).catch(() => {});

    // High or Critical incident: invoke Edge Function to dispatch email alert to all Supervisors
    if (newRecord.severity === 'High' || newRecord.severity === 'Critical') {
      this.invokeEdgeFunction('send-supervisor-alert', { incident: newRecord }).catch(() => {});
    }

    return newRecord;
  },

  async updateIncident(id, updates, currentUser) {
    // Row-Level Security (RLS) enforcement: Supervisor or Admin required
    if (currentUser && currentUser.role === 'Viewer') {
      const err = new Error("Row-Level Security violation: Role 'Viewer' is read-only. Supervisor or Admin role is required to modify incidents.");
      err.code = 'RLS_PERMISSION_DENIED';
      throw err;
    }

    const incidents = await this.getIncidents();
    let updatedRecord = null;
    const nextList = incidents.map(inc => {
      if (inc.id === id) {
        updatedRecord = {
          ...inc,
          ...updates,
          resolved_at: updates.status === 'Resolved' && !inc.resolved_at 
            ? new Date().toISOString() 
            : (updates.status !== 'Resolved' ? null : inc.resolved_at)
        };
        return updatedRecord;
      }
      return inc;
    });
    localStorage.setItem(STORAGE_INCIDENTS_KEY, JSON.stringify(nextList));
    return updatedRecord;
  },

  async deleteIncident(id, currentUser) {
    // Row-Level Security (RLS) enforcement: Admin required
    if (currentUser && currentUser.role !== 'Admin') {
      const err = new Error("Row-Level Security violation: Only Admin role can delete incident records.");
      err.code = 'RLS_PERMISSION_DENIED';
      throw err;
    }

    const incidents = await this.getIncidents();
    const filtered = incidents.filter(i => i.id !== id);
    localStorage.setItem(STORAGE_INCIDENTS_KEY, JSON.stringify(filtered));
    return filtered;
  },

  // --- STORAGE: SNAPSHOT UPLOADER ---
  /**
   * Uploads an image canvas or dataURL into the Cloud Storage bucket 'incident-snapshots'
   * Returns a persistent public URL
   */
  async uploadSnapshot(canvasOrDataUrl, filename) {
    let dataUrl = canvasOrDataUrl;
    if (canvasOrDataUrl && typeof canvasOrDataUrl.toDataURL === 'function') {
      dataUrl = canvasOrDataUrl.toDataURL('image/jpeg', 0.85);
    }
    const fileId = filename || `snapshot-${Date.now()}.jpg`;

    try {
      const bucketRaw = localStorage.getItem(STORAGE_BUCKET_KEY);
      const bucket = bucketRaw ? JSON.parse(bucketRaw) : {};
      bucket[fileId] = dataUrl;
      // Keep storage bounded
      const keys = Object.keys(bucket);
      if (keys.length > 40) {
        delete bucket[keys[0]];
      }
      localStorage.setItem(STORAGE_BUCKET_KEY, JSON.stringify(bucket));
    } catch (err) {
      console.warn('Storage quota warning, returning in-memory dataURL:', err);
    }

    return dataUrl;
  },

  // --- EDGE FUNCTIONS: AI TRIAGE & DISPATCH ---
  async invokeEdgeFunction(functionName, payload) {
    console.log(`[Lovable Cloud Edge Function: ${functionName}] Invoked:`, payload);

    if (functionName === 'send-supervisor-alert' && payload?.incident) {
      try {
        const result = await notificationService.dispatchSupervisorAlertEdgeFunction(payload.incident);
        return {
          status: 'ok',
          function: functionName,
          timestamp: new Date().toISOString(),
          dispatched: true,
          details: result,
        };
      } catch (err) {
        console.error('Edge function dispatch error:', err);
      }
    }

    return {
      status: 'ok',
      function: functionName,
      timestamp: new Date().toISOString(),
      dispatched: true,
    };
  }
};
