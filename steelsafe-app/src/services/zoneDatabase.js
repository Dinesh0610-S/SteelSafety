/**
 * SteelSafe Zone Database Service
 * Provides persistent storage for industrial safety zones & restricted areas.
 */

const STORAGE_KEY = 'steelsafe_industrial_zones';

// Default initial industrial zones (normalized 0.0 to 1.0 coordinates)
const DEFAULT_ZONES = [
  {
    id: 'zone-furnace-1',
    name: 'Furnace Area',
    riskLevel: 'High',
    color: '#ef4444', // Red
    restricted: true,
    points: [
      { x: 0.05, y: 0.15 },
      { x: 0.42, y: 0.15 },
      { x: 0.42, y: 0.85 },
      { x: 0.05, y: 0.85 },
    ],
    createdAt: new Date().toISOString(),
  },
  {
    id: 'zone-crane-2',
    name: 'Crane Runway Path',
    riskLevel: 'Critical',
    color: '#f59e0b', // Amber / Orange
    restricted: true,
    points: [
      { x: 0.60, y: 0.10 },
      { x: 0.95, y: 0.10 },
      { x: 0.95, y: 0.75 },
      { x: 0.60, y: 0.75 },
    ],
    createdAt: new Date().toISOString(),
  },
];

export const zoneDatabase = {
  getZones() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (!data) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_ZONES));
        return DEFAULT_ZONES;
      }
      return JSON.parse(data);
    } catch (e) {
      console.error('Failed to load zones from storage:', e);
      return DEFAULT_ZONES;
    }
  },

  saveZones(zones, currentUser) {
    if (currentUser && currentUser.role !== 'Admin') {
      const err = new Error("Row-Level Security violation: Only Admin can modify safety zones.");
      err.code = 'RLS_PERMISSION_DENIED';
      throw err;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(zones));
    } catch (e) {
      console.error('Failed to save zones to storage:', e);
    }
  },

  addZone(zone, currentUser) {
    if (currentUser && currentUser.role !== 'Admin') {
      const err = new Error("Row-Level Security violation: Only Admin can add safety zones.");
      err.code = 'RLS_PERMISSION_DENIED';
      throw err;
    }
    const zones = this.getZones();
    const newZone = {
      ...zone,
      id: zone.id || `zone-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    const updated = [...zones, newZone];
    this.saveZones(updated, currentUser);
    return newZone;
  },

  updateZone(id, updates, currentUser) {
    if (currentUser && currentUser.role !== 'Admin') {
      const err = new Error("Row-Level Security violation: Only Admin can update safety zones.");
      err.code = 'RLS_PERMISSION_DENIED';
      throw err;
    }
    const zones = this.getZones();
    const updated = zones.map(z => (z.id === id ? { ...z, ...updates } : z));
    this.saveZones(updated, currentUser);
    return updated.find(z => z.id === id);
  },

  deleteZone(id, currentUser) {
    if (currentUser && currentUser.role !== 'Admin') {
      const err = new Error("Row-Level Security violation: Only Admin can delete safety zones.");
      err.code = 'RLS_PERMISSION_DENIED';
      throw err;
    }
    const zones = this.getZones();
    const updated = zones.filter(z => z.id !== id);
    this.saveZones(updated, currentUser);
    return updated;
  },

  resetDefaults(currentUser) {
    if (currentUser && currentUser.role !== 'Admin') {
      const err = new Error("Row-Level Security violation: Only Admin can reset safety zones.");
      err.code = 'RLS_PERMISSION_DENIED';
      throw err;
    }
    this.saveZones(DEFAULT_ZONES, currentUser);
    return DEFAULT_ZONES;
  }
};

/**
 * Point-in-polygon ray-casting algorithm
 * Checks if point (normX, normY) is inside polygon of normalized vertices
 */
export function isPointInPolygon(point, polygon) {
  if (!polygon || polygon.length < 3) return false;
  const { x, y } = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersect = ((yi > y) !== (yj > y)) &&
      (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}
