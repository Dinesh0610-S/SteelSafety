import { useState, useEffect } from 'react';

export interface RiskStatus {
  zone_id: string;
  risk_score: number;
  risk_level: string;
  triggered_rules: string | null;
  explanation: string;
  timestamp: string;
  signal_snapshot?: string | null;
}

export interface CostImpact {
  headline: string;
  downtime_estimate: string;
  financial_exposure: string;
  impact_language: string;
  immediate_actions: string[];
  regulatory_citations: string[];
  illustrative_basis: string;
}

export interface ZoneDetail {
  sensor: {
    co_ppm: number;
    h2s_ppm: number;
    temperature_c: number;
    pressure_kpa: number;
    timestamp: string;
  } | null;
  activePermits: Array<{
    permit_ref: string;
    permit_type: string;
    issued_to: string;
    status: string;
    start_time: string;
    end_time: string;
  }>;
  workerCount: number;
  explanation: string;
  riskScore: number;
  riskLevel: string;
  triggeredRules: string | null;
  intervention: {
    action: string;
    projected_score: number;
    original_score: number;
    feasible: boolean;
  } | null;
  costImpact: CostImpact | null;
  signalSnapshot: {
    fatigue_hours_into_shift: number;
    fatigue_score_bump: number;
    fatigue_worker_count: number;
    knowledge_graph_matches: Array<{
      scenario_id: string;
      scenario_label: string;
      zone_id: string;
      is_near_miss: boolean;
      matched_on: string[];
      match_strength: number;
      description: string;
    }>;
    knowledge_graph_available: boolean;
  } | null;
}

export interface ComparisonRow {
  scenario_id: string;
  label: string;
  zone_id: string;
  is_near_miss: boolean;
  scenario_start: string;
  scenario_end: string;
  compound_first_flag: string | null;
  baseline_first_flag: string | null;
  lead_time_minutes: number | null;
  near_miss_result: {
    peak_score: number;
    peak_level: string;
    discipline_pass: boolean;
    compound_flagged: boolean;
    baseline_fired: boolean;
  } | null;
}

export interface ComparisonMetrics {
  t0: string;
  total_scenarios: number;
  incident_scenarios: number;
  near_miss_scenarios: number;
  comparison_rows: ComparisonRow[];
  aggregate: {
    avg_compound_lead_time_minutes: number | null;
    scenarios_compound_detected: number;
    scenarios_baseline_missed: number;
  };
  false_positive_summary: {
    safe_period_evaluations: number;
    compound_false_positives: number;
    baseline_false_positives: number;
    compound_fp_rate_pct: number;
    baseline_fp_rate_pct: number;
  };
  near_miss_discipline: Array<{
    peak_score: number;
    peak_level: string;
    discipline_pass: boolean;
    compound_flagged: boolean;
    baseline_fired: boolean;
  }>;
}

export function usePlantData(
  virtualTime: Date | null, 
  selectedZoneId: string | null, 
  plantId: string = 'plant_coke_oven'
) {
  const [t0Str, setT0Str] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Latest risk status per zone
  const [currentRisks, setCurrentRisks] = useState<Record<string, RiskStatus>>({});
  // Selected zone history list (for Recharts)
  const [selectedZoneHistory, setSelectedZoneHistory] = useState<any[]>([]);
  // Clicked zone details
  const [zoneDetail, setZoneDetail] = useState<ZoneDetail | null>(null);
  // Comparison metrics (compound vs. baseline)
  const [comparisonMetrics, setComparisonMetrics] = useState<ComparisonMetrics | null>(null);
  // Dynamic zones name mapping
  const [zoneNames, setZoneNames] = useState<Record<string, string>>({});

  // Fetch dynamic zones mapping from API
  useEffect(() => {
    if (!plantId) return;
    fetch(`/api/v1/zones?plant_id=${plantId}`)
      .then((r) => {
        if (!r.ok) throw new Error("Failed to fetch zones list.");
        return r.json();
      })
      .then((data: any[]) => {
        const mapping: Record<string, string> = {};
        data.forEach((z) => {
          mapping[z.zone_id] = z.name;
        });
        setZoneNames(mapping);
      })
      .catch((e) => console.warn("Failed to load dynamic zones mapping:", e));
  }, [plantId]);

  // Fetch initial T0 string from health check or sensors when plantId changes
  useEffect(() => {
    setLoading(true);
    fetch('/api/v1/')
      .then((r) => r.json())
      .then(() => {
        return fetch(`/api/v1/sensors/history?limit=1&plant_id=${plantId}`);
      })
      .then((r) => r.json())
      .then((data) => {
        if (data && data.length > 0) {
          setT0Str(data[0].timestamp);
          setError(null);
        } else {
          setError(`Database empty for plant '${plantId}'. Try resetting simulation.`);
        }
      })
      .catch(() => setError("Cannot connect to backend server. Verify port 8000 is open."))
      .finally(() => setLoading(false));
  }, [plantId]);

  // Fetch comparison metrics when plantId changes
  useEffect(() => {
    if (loading || error) return;
    fetch(`/api/v1/metrics/comparison?plant_id=${plantId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && !data.error) {
          setComparisonMetrics(data);
        }
      })
      .catch(() => {
        // Fail silently — metrics panel will show loading state
      });
  }, [loading, error, plantId]);

  // Fetch risk history sweep whenever virtualTime ticks
  useEffect(() => {
    if (!virtualTime) return;

    const isoStr = virtualTime.toISOString();

    fetch(`/api/v1/risk/history?plant_id=${plantId}&end=${encodeURIComponent(isoStr)}&limit=2000`)
      .then((res) => {
        if (!res.ok) throw new Error("History fetch failed");
        return res.json();
      })
      .then((data: any[]) => {
        const latestByZone: Record<string, RiskStatus> = {};
        data.forEach((item) => {
          const zone = item.zone_id;
          const current = latestByZone[zone];
          if (!current || new Date(item.timestamp) > new Date(current.timestamp)) {
            latestByZone[zone] = item;
          }
        });
        setCurrentRisks(latestByZone);

        if (selectedZoneId) {
          const history = data
            .filter((item) => item.zone_id === selectedZoneId)
            .map((item) => ({
              time: new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              score: item.risk_score,
              level: item.risk_level,
              rawTime: new Date(item.timestamp).getTime(),
            }))
            .sort((a, b) => a.rawTime - b.rawTime);
          setSelectedZoneHistory(history);
        }
      })
      .catch(() => {
        // Safe fail-silent during reset / play transitions
      });
  }, [virtualTime, selectedZoneId, plantId]);

  // Fetch clicked zone details (active permits, worker count, sensor snapshot, cost impact)
  useEffect(() => {
    if (!virtualTime || !selectedZoneId) {
      setZoneDetail(null);
      return;
    }

    const isoStr = virtualTime.toISOString();
    const fiveMinAgoStr = new Date(virtualTime.getTime() - 5 * 60 * 1000).toISOString();

    // 1. Fetch sensor detail
    const sensorPromise = fetch(`/api/v1/sensors/history?zone_id=${selectedZoneId}&end=${encodeURIComponent(isoStr)}&limit=1&plant_id=${plantId}`)
      .then((r) => r.ok ? r.json() : [])
      .then((data) => data.length > 0 ? data[0] : null);

    // 2. Fetch active permits (overlaps virtualTime)
    const permitsPromise = fetch(`/api/v1/permits?zone_id=${selectedZoneId}&start=${encodeURIComponent(isoStr)}&end=${encodeURIComponent(isoStr)}&plant_id=${plantId}`)
      .then((r) => r.ok ? r.json() : []);

    // 3. Fetch workers in zone (last 5 min)
    const workersPromise = fetch(`/api/v1/workers/locations?zone_id=${selectedZoneId}&start=${encodeURIComponent(fiveMinAgoStr)}&end=${encodeURIComponent(isoStr)}&limit=50&plant_id=${plantId}`)
      .then((r) => r.ok ? r.json() : []);

    // 4. Fetch counterfactual intervention recommendations
    const interventionPromise = fetch(`/api/v1/risk/intervention/${selectedZoneId}?timestamp=${encodeURIComponent(isoStr)}`)
      .then((r) => r.ok ? r.json() : null)
      .catch(() => null);

    // 5. Fetch zone risk detail with cost_impact
    const zoneRiskPromise = fetch(`/api/v1/risk/zone/${selectedZoneId}`)
      .then((r) => r.ok ? r.json() : null)
      .catch(() => null);

    Promise.all([sensorPromise, permitsPromise, workersPromise, interventionPromise, zoneRiskPromise])
      .then(([sensor, permits, workers, intervention, zoneRisk]) => {
        const uniqueWorkers = new Set(workers.map((w: any) => w.worker_id));

        const risk = currentRisks[selectedZoneId] || {
          risk_score: 0.0,
          risk_level: 'low',
          triggered_rules: null,
          explanation: "No active risk calculations found."
        };

        setZoneDetail({
          sensor,
          activePermits: permits,
          workerCount: uniqueWorkers.size,
          explanation: risk.explanation,
          riskScore: risk.risk_score,
          riskLevel: risk.risk_level,
          triggeredRules: risk.triggered_rules,
          intervention,
          costImpact: zoneRisk?.cost_impact ?? null,
          signalSnapshot: (() => {
            const raw = zoneRisk?.signal_snapshot;
            if (!raw) return null;
            try { return typeof raw === 'string' ? JSON.parse(raw) : raw; }
            catch { return null; }
          })(),
        });
      })
      .catch((e) => console.warn("Failed detail lookup", e));

  }, [virtualTime, selectedZoneId, currentRisks, plantId]);

  return {
    t0Str,
    loading,
    error,
    currentRisks,
    selectedZoneHistory,
    zoneDetail,
    comparisonMetrics,
    zoneNames,
    setT0Str,
    setError,
  };
}
