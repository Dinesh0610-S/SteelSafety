/**
 * SteelSafe Worker Safety & Compliance Service
 * Tracks individual plant workers, badge IDs, safety scores (0-100),
 * repeat violation counts, historical trend charts, and incident attribution.
 */

const STORAGE_WORKERS_KEY = 'steelsafe_plant_workers';

export const DEFAULT_WORKERS = [
  {
    id: 'wrk-101',
    badgeId: 'EMP-101',
    name: 'David Chen',
    role: 'Rolling Mill Senior Operator',
    department: 'Rolling Mill Line 02',
    shift: 'Morning',
    email: 'd.chen@steelsafe.ai',
    avatar: 'DC',
    joinedDate: '2024-03-12',
    weeklyTrend: [96, 92, 88, 85],
  },
  {
    id: 'wrk-102',
    badgeId: 'EMP-102',
    name: 'Amina Al-Mansoor',
    role: 'Heavy Gantry Crane Operator',
    department: 'Crane Runway & Slag Transport',
    shift: 'Morning',
    email: 'a.mansoor@steelsafe.ai',
    avatar: 'AA',
    joinedDate: '2023-11-05',
    weeklyTrend: [100, 100, 98, 98],
  },
  {
    id: 'wrk-103',
    badgeId: 'EMP-103',
    name: 'Rajesh Kumar',
    role: 'Blast Furnace Heat Technician',
    department: 'Furnace Smelting Bay',
    shift: 'Night',
    email: 'r.kumar@steelsafe.ai',
    avatar: 'RK',
    joinedDate: '2024-01-20',
    weeklyTrend: [84, 80, 74, 68],
  },
  {
    id: 'wrk-104',
    badgeId: 'EMP-104',
    name: 'Sarah Jenkins',
    role: 'Continuous Casting Specialist',
    department: 'Casting Bay Turret',
    shift: 'Afternoon',
    email: 's.jenkins@steelsafe.ai',
    avatar: 'SJ',
    joinedDate: '2024-05-18',
    weeklyTrend: [94, 96, 95, 96],
  },
  {
    id: 'wrk-105',
    badgeId: 'EMP-105',
    name: 'Vikram Patel',
    role: 'Raw Material Transit Driver',
    department: 'Raw Material Yard & Transit',
    shift: 'Afternoon',
    email: 'v.patel@steelsafe.ai',
    avatar: 'VP',
    joinedDate: '2023-08-14',
    weeklyTrend: [92, 90, 88, 90],
  },
  {
    id: 'wrk-106',
    badgeId: 'EMP-106',
    name: 'Mateo Rossi',
    role: 'Mechanical Maintenance Lead',
    department: 'Plant Machinery Maintenance',
    shift: 'Morning',
    email: 'm.rossi@steelsafe.ai',
    avatar: 'MR',
    joinedDate: '2023-04-10',
    weeklyTrend: [98, 98, 97, 98],
  },
  {
    id: 'wrk-107',
    badgeId: 'EMP-107',
    name: 'Olga Ivanova',
    role: 'Slag Treatment Operator',
    department: 'Slag Recycling Plant',
    shift: 'Night',
    email: 'o.ivanova@steelsafe.ai',
    avatar: 'OI',
    joinedDate: '2024-02-01',
    weeklyTrend: [90, 86, 84, 82],
  },
  {
    id: 'wrk-108',
    badgeId: 'EMP-108',
    name: 'Kwame Mensah',
    role: 'EHS Industrial Safety Auditor',
    department: 'Environmental Health & Safety',
    shift: 'Afternoon',
    email: 'k.mensah@steelsafe.ai',
    avatar: 'KM',
    joinedDate: '2023-02-15',
    weeklyTrend: [100, 100, 100, 100],
  },
];

class WorkerService {
  constructor() {
    this._initStorage();
  }

  _initStorage() {
    if (typeof localStorage === 'undefined') return;
    if (!localStorage.getItem(STORAGE_WORKERS_KEY)) {
      localStorage.setItem(STORAGE_WORKERS_KEY, JSON.stringify(DEFAULT_WORKERS));
    }
  }

  getWorkers() {
    try {
      const data = localStorage.getItem(STORAGE_WORKERS_KEY);
      return data ? JSON.parse(data) : DEFAULT_WORKERS;
    } catch {
      return DEFAULT_WORKERS;
    }
  }

  saveWorkers(workers) {
    try {
      localStorage.setItem(STORAGE_WORKERS_KEY, JSON.stringify(workers));
    } catch (e) {
      console.error('Failed to save workers to storage:', e);
    }
  }

  addWorker(worker) {
    const workers = this.getWorkers();
    const newWorker = {
      ...worker,
      id: worker.id || `wrk-${Date.now()}`,
      badgeId: worker.badgeId || `EMP-${Math.floor(100 + Math.random() * 900)}`,
      avatar: worker.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase(),
      joinedDate: worker.joinedDate || new Date().toISOString().split('T')[0],
      weeklyTrend: [100, 100, 100, 100],
    };
    const updated = [...workers, newWorker];
    this.saveWorkers(updated);
    return newWorker;
  }

  /**
   * Calculates safety score, repeat violations, and attached incident history
   * for all workers given the active incidents list.
   */
  computeWorkerLeaderboard(incidents = []) {
    const workers = this.getWorkers();

    return workers.map(worker => {
      // Find all incidents tagged to this worker (by worker_id or name/badge)
      const taggedIncidents = incidents.filter(inc => {
        if (!inc) return false;
        if (inc.worker_id && inc.worker_id === worker.id) return true;
        if (inc.worker_name && (
          inc.worker_name.toLowerCase().includes(worker.name.toLowerCase()) ||
          inc.worker_name.toLowerCase().includes(worker.badgeId.toLowerCase())
        )) return true;
        return false;
      });

      // Calculate deductions
      let deduction = 0;
      let repeatCount = taggedIncidents.length;

      taggedIncidents.forEach(inc => {
        let weight = 8;
        if (inc.severity === 'Critical') weight = 20;
        else if (inc.severity === 'High') weight = 12;
        else if (inc.severity === 'Medium') weight = 6;
        else if (inc.severity === 'Low') weight = 2;

        // Give partial credit back if incident was resolved
        if (inc.status === 'Resolved') weight = Math.max(2, weight - 4);
        else if (inc.status === 'Acknowledged') weight = Math.max(3, weight - 2);

        deduction += weight;
      });

      // Compute final score out of 100
      const score = Math.max(25, Math.min(100, 100 - deduction));

      // Calculate trend progression: [3 wks ago, 2 wks ago, 1 wk ago, current]
      const baseTrend = worker.weeklyTrend || [95, 95, 95, 95];
      const trend = [
        baseTrend[0],
        baseTrend[1],
        baseTrend[2],
        score, // current score
      ];

      // Safety Tier
      let tier = 'Gold'; // 95-100
      let tierColor = 'emerald';
      if (score < 75) {
        tier = 'Critical Caution';
        tierColor = 'red';
      } else if (score < 90) {
        tier = 'Standard Caution';
        tierColor = 'amber';
      } else if (score < 96) {
        tier = 'Silver Safe';
        tierColor = 'cyan';
      }

      return {
        ...worker,
        safetyScore: score,
        repeatViolations: repeatCount,
        taggedIncidents,
        tier,
        tierColor,
        trend,
        hasRepeatViolation: repeatCount >= 2,
      };
    }).sort((a, b) => b.safetyScore - a.safetyScore); // Sort by highest safety score first
  }

  /**
   * Calculates overall plant-wide weekly safety score out of 100
   */
  calculatePlantWeeklySafetyScore(incidents = []) {
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const weeklyIncidents = incidents.filter(i => {
      const t = new Date(i.created_at).getTime();
      return t >= oneWeekAgo;
    });

    if (weeklyIncidents.length === 0) {
      return {
        score: 96,
        grade: 'Grade A+',
        status: 'Superior Safety Performance',
        incidentsThisWeek: 0,
        unresolvedCount: 0,
        compliancePct: 98,
      };
    }

    let penalty = 0;
    let unresolved = 0;

    weeklyIncidents.forEach(inc => {
      if (inc.severity === 'Critical') penalty += 8;
      else if (inc.severity === 'High') penalty += 5;
      else if (inc.severity === 'Medium') penalty += 2.5;
      else penalty += 1;

      if (inc.status === 'Open') {
        penalty += 3; // Extra penalty for open unresolved items
        unresolved++;
      }
    });

    const finalScore = Math.max(45, Math.min(99, Math.round(100 - penalty)));
    let grade = 'Grade A';
    let status = 'High Compliance Operations';

    if (finalScore >= 95) {
      grade = 'Grade A+';
      status = 'Exemplary Plant Safety';
    } else if (finalScore >= 88) {
      grade = 'Grade A';
      status = 'High Compliance Operations';
    } else if (finalScore >= 78) {
      grade = 'Grade B';
      status = 'Moderate Caution Advisable';
    } else {
      grade = 'Grade C';
      status = 'Immediate EHS Intervention Required';
    }

    return {
      score: finalScore,
      grade,
      status,
      incidentsThisWeek: weeklyIncidents.length,
      unresolvedCount: unresolved,
      compliancePct: Math.round(Math.max(75, 100 - (penalty * 0.75))),
    };
  }
}

export const workerService = new WorkerService();
