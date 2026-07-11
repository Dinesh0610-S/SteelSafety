import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceArea,
} from 'recharts';

interface RiskTimelineChartProps {
  selectedZoneId: string | null;
  selectedZoneName: string;
  history: Array<{
    time: string;
    score: number;
    level: string;
    rawTime: number;
  }>;
  t0: Date | null;
}

export function RiskTimelineChart({ selectedZoneId, selectedZoneName, history, t0 }: RiskTimelineChartProps) {
  
  const getScenarioWindow = () => {
    if (!t0 || !selectedZoneId) return null;

    let startOffsetMin = 0;
    let endOffsetMin = 0;
    let title = '';

    if (selectedZoneId === 'zone_gcm') {
      startOffsetMin = 120; // T+2h
      endOffsetMin = 165;   // T+2h45m
      title = 'Scenario 1: Gas Main Leak';
    } else if (selectedZoneId === 'zone_cob1') {
      startOffsetMin = 270; // T+4h30m
      endOffsetMin = 315;   // T+5h15m
      title = 'Scenario 2: Standpipe H2S Build-up';
    } else if (selectedZoneId === 'zone_ca') {
      startOffsetMin = 375; // T+6h15m
      endOffsetMin = 420;   // T+7h
      title = 'Scenario 3: Larry Car CO Build-up';
    } else {
      return null;
    }

    const startMs = t0.getTime() + startOffsetMin * 60 * 1000;
    const endMs = t0.getTime() + endOffsetMin * 60 * 1000;

    const formatTime = (ms: number) => {
      return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    return {
      startTimeStr: formatTime(startMs),
      endTimeStr: formatTime(endMs),
      label: title,
    };
  };

  const scenario = getScenarioWindow();

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-theme-card border border-theme-border p-3 rounded-2xl shadow-lg text-xs text-theme-text">
          <p className="font-bold text-theme-text-muted mb-1">Time: {data.time}</p>
          <p className="text-theme-text font-mono text-sm font-bold">
            Risk Score: <span className="text-theme-accent font-black">{data.score}</span>
          </p>
          <p className="capitalize text-theme-text-secondary font-bold">Band: {data.level}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="card-soft-base bg-theme-card border border-theme-border p-6 animate-fadeIn">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xs font-bold text-theme-text-muted tracking-wider uppercase flex items-center gap-2">
            Risk History Timeline
          </h2>
          <p className="text-xs text-theme-text-secondary font-semibold mt-1">
            Plotting cumulative risk score for <span className="text-theme-accent font-bold">{selectedZoneName}</span>.
          </p>
        </div>
        
        {scenario && (
          <div className="text-[9px] bg-theme-risk-crit-bg border border-theme-risk-crit-border px-3 py-1 rounded-full text-theme-risk-crit-text font-bold animate-pulse">
            🔥 {scenario.label} active: {scenario.startTimeStr} – {scenario.endTimeStr}
          </div>
        )}
      </div>

      <div className="h-[220px] w-full">
        {history.length === 0 ? (
          <div className="h-full flex items-center justify-center text-theme-text-muted text-xs italic">
            No history recorded yet for this zone in this simulation shift.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={history} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--theme-border-muted)" />
              <XAxis 
                dataKey="time" 
                stroke="var(--theme-text-muted)" 
                tick={{ fontSize: 10 }}
                dy={5}
              />
              <YAxis 
                domain={[0, 100]} 
                stroke="var(--theme-text-muted)" 
                tick={{ fontSize: 10 }}
                dx={-5}
              />
              <Tooltip content={<CustomTooltip />} />
              
              {scenario && (
                <ReferenceArea 
                  x1={scenario.startTimeStr} 
                  x2={scenario.endTimeStr} 
                  fill="var(--theme-risk-crit-bg)" 
                  stroke="var(--theme-risk-crit-border)"
                  strokeDasharray="3 3"
                />
              )}

              {/* Critical Risk threshold line */}
              <ReferenceLine 
                y={70} 
                stroke="var(--theme-risk-crit)" 
                strokeDasharray="4 4" 
                label={{ 
                  value: 'CRITICAL (70)', 
                  position: 'insideBottomRight', 
                  fill: 'var(--theme-risk-crit)',
                  fontSize: 9,
                  fontWeight: 'bold',
                  dy: -2
                }} 
              />

              <Line
                type="monotone"
                dataKey="score"
                stroke="var(--theme-accent)"
                strokeWidth={3}
                dot={false}
                activeDot={{ r: 5, strokeWidth: 0, fill: 'var(--theme-accent)' }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
