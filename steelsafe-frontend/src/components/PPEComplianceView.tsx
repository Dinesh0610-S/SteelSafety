import { useState, useMemo } from 'react';
import {
  RefreshCw, User
} from 'lucide-react';
import type { PPEViolationEvent } from './CCTVPanel';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip
} from 'recharts';

interface PPEComplianceViewProps {
  violations: PPEViolationEvent[];
  onRefresh: () => void;
}

// Custom inline SVGs for 5 PPE items
function BootIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 18h12a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3L8 12H4a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2z"/>
    </svg>
  );
}

function VestIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3h12l3 5v13H3V8z"/>
      <path d="M9 3v18M15 3v18"/>
      <path d="M3 8h18"/>
    </svg>
  );
}

function HelmetIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12a10 10 0 0 1 20 0v2H2z"/>
      <path d="M12 2v10"/>
    </svg>
  );
}

function GlovesIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v4"/>
      <path d="M14 10V5a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v5"/>
      <path d="M10 10V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8a5 5 0 0 0 5 5h3a5 5 0 0 0 5-5v-3"/>
    </svg>
  );
}

function MaskIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="6" width="16" height="12" rx="3"/>
      <path d="M4 8l8 4 8-4M4 16l8-4 8 4"/>
    </svg>
  );
}

interface GaugeCardProps {
  title: string;
  percent: number;
  icon: any;
  color?: string;
  isAudit?: boolean;
}

function GaugeCard({ title, percent, icon: Icon, color = 'stroke-emerald-500', isAudit = false }: GaugeCardProps) {
  const radius = 22;
  const strokeWidth = 4;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percent / 100) * circumference;

  return (
    <div className="bg-[#111622]/60 border border-[#1f293d] p-4 rounded-2xl flex flex-col gap-3 flex-1 min-w-[160px] shadow-sm relative group">
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{title}</span>
        {isAudit && (
          <span className="text-[7px] font-mono font-bold text-slate-500 px-1 border border-slate-800 rounded bg-slate-900/40">AUDIT</span>
        )}
      </div>
      <div className="flex items-center gap-4 mt-0.5">
        <div className="relative h-12 w-12 flex items-center justify-center shrink-0">
          <svg className="absolute inset-0 w-full h-full transform -rotate-90">
            <circle
              cx="24"
              cy="24"
              r={radius}
              className="stroke-[#161c28] fill-transparent"
              strokeWidth={strokeWidth}
            />
            <circle
              cx="24"
              cy="24"
              r={radius}
              className={`fill-transparent transition-all duration-500 ${color}`}
              strokeWidth={strokeWidth}
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
            />
          </svg>
          <div className="z-10 text-slate-200">
            <Icon className="h-4.5 w-4.5" />
          </div>
        </div>
        <div className="flex flex-col justify-center">
          <span className="text-xl font-black text-white leading-none">{percent}%</span>
          <span className="text-[7.5px] font-bold text-slate-500 uppercase mt-1">Status: Active</span>
        </div>
      </div>
    </div>
  );
}

export function PPEComplianceView({
  violations,
  onRefresh
}: PPEComplianceViewProps) {
  const [trendRange, setTrendRange] = useState<'Daily' | 'Weekly' | 'Monthly'>('Daily');

  // Compute dynamic gauge compliance percentages based on current violations
  const dynamicMetrics = useMemo(() => {
    // Check missing items counts
    let missingHelmets = 0;
    let missingVests = 0;

    violations.forEach(v => {
      if (v.status === 'open') {
        if (v.ppe_items_missing.includes('hard_hat') || v.ppe_items_missing.includes('helmet')) {
          missingHelmets++;
        }
        if (v.ppe_items_missing.includes('safety_vest') || v.ppe_items_missing.includes('vest')) {
          missingVests++;
        }
      }
    });

    // Helmet: 95% baseline, decreases with active violations
    const helmetVal = Math.max(70, 95 - missingHelmets * 5);
    // Vest: 92% baseline, decreases with active violations
    const vestVal = Math.max(70, 92 - missingVests * 4);

    return {
      helmet: helmetVal,
      vest: vestVal,
      shoes: 96,
      gloves: 89,
      mask: 90
    };
  }, [violations]);

  // Worker Compliance Grid List
  const workerComplianceList = useMemo(() => {
    // Mapped worker list
    const workers = [
      { name: 'Raj', dept: 'Assembly Line', helmet: true, vest: true, shoes: true, gloves: true, mask: true, missing: '-', time: '10:30 AM', comp: 98 },
      { name: 'Priya', dept: 'Robot Zone', helmet: true, vest: true, shoes: true, gloves: false, mask: true, missing: 'Gloves', time: '10:29 AM', comp: 82 },
      { name: 'Arun', dept: 'Warehouse', helmet: false, vest: true, shoes: true, gloves: true, mask: true, missing: 'Helmet', time: '10:28 AM', comp: 81 },
      { name: 'Karan', dept: 'Assembly Line', helmet: true, vest: false, shoes: true, gloves: true, mask: true, missing: 'Vest', time: '10:27 AM', comp: 81 },
      { name: 'Mohan', dept: 'Boiler Room', helmet: true, vest: true, shoes: true, gloves: true, mask: false, missing: 'Mask', time: '10:26 AM', comp: 83 }
    ];

    // If there are real-time violations in the queue, dynamic override for the matching workers
    violations.forEach(v => {
      if (v.status === 'open') {
        const isHelmet = v.ppe_items_missing.includes('hard_hat') || v.ppe_items_missing.includes('helmet');
        const isVest = v.ppe_items_missing.includes('safety_vest') || v.ppe_items_missing.includes('vest');

        if (isHelmet) {
          // Find Arun or update him
          const target = workers.find(w => w.name === 'Arun');
          if (target) {
            target.helmet = false;
            target.missing = 'Helmet';
            target.comp = 81;
          }
        }
        if (isVest) {
          const target = workers.find(w => w.name === 'Karan');
          if (target) {
            target.vest = false;
            target.missing = 'Vest';
            target.comp = 81;
          }
        }
      }
    });

    return workers;
  }, [violations]);

  // Compliance Trend Chart Data
  const trendChartData = useMemo(() => {
    const daily = [
      { date: '04 Jul', Rate: 74 },
      { date: '05 Jul', Rate: 78 },
      { date: '06 Jul', Rate: 70 },
      { date: '07 Jul', Rate: 82 },
      { date: '08 Jul', Rate: 73 },
      { date: '09 Jul', Rate: 85 },
      { date: '10 Jul', Rate: 92 }
    ];
    const weekly = [
      { date: 'Wk 24', Rate: 75 },
      { date: 'Wk 25', Rate: 81 },
      { date: 'Wk 26', Rate: 79 },
      { date: 'Wk 27', Rate: 84 },
      { date: 'Wk 28', Rate: 89 }
    ];
    const monthly = [
      { date: 'Apr', Rate: 72 },
      { date: 'May', Rate: 80 },
      { date: 'Jun', Rate: 84 },
      { date: 'Jul', Rate: 89 }
    ];

    if (trendRange === 'Weekly') return weekly;
    if (trendRange === 'Monthly') return monthly;
    return daily;
  }, [trendRange]);

  // Recent Violations card images / badges mapping
  const recentViolations = useMemo(() => {
    return [
      { worker: 'Arun', cam: 'CAM 03', time: '10:28 AM', type: 'No Helmet', color: 'border-red-500/80 text-red-400' },
      { worker: 'Karan', cam: 'CAM 04', time: '10:27 AM', type: 'No Vest', color: 'border-red-500/80 text-red-400' },
      { worker: 'Priya', cam: 'CAM 02', time: '10:29 AM', type: 'No Gloves', color: 'border-amber-500/80 text-amber-400' },
      { worker: 'Mohan', cam: 'CAM 05', time: '10:26 AM', type: 'No Mask', color: 'border-amber-500/80 text-amber-400' }
    ];
  }, []);

  return (
    <div id="ppe-compliance-container" className="flex flex-col gap-6 w-full text-slate-100">
      
      {/* Header Panel */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col leading-tight">
          <h2 className="text-xl font-black tracking-tight text-white m-0">3. PPE COMPLIANCE</h2>
          <p className="text-[11px] text-slate-400 font-bold mt-1.5">Track and monitor personal protective equipment usage</p>
        </div>

        <div className="flex items-center gap-3">
          {/* Refresh button */}
          <button
            onClick={onRefresh}
            className="p-2 rounded-xl border border-slate-700 bg-transparent hover:bg-slate-800 text-slate-300 hover:text-white transition-all shadow-sm"
            title="Refresh statistics"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Top row: 5 circular gauges */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <GaugeCard title="Helmet Compliance" percent={dynamicMetrics.helmet} icon={HelmetIcon} color="stroke-emerald-500" />
        <GaugeCard title="Vest Compliance" percent={dynamicMetrics.vest} icon={VestIcon} color="stroke-emerald-500" />
        <GaugeCard title="Safety Shoes" percent={dynamicMetrics.shoes} icon={BootIcon} color="stroke-emerald-500" isAudit />
        <GaugeCard title="Gloves Compliance" percent={dynamicMetrics.gloves} icon={GlovesIcon} color="stroke-emerald-500" isAudit />
        <GaugeCard title="Mask Compliance" percent={dynamicMetrics.mask} icon={MaskIcon} color="stroke-emerald-500" isAudit />
      </div>

      {/* Middle row: Table + Trend Chart */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-stretch">
        
        {/* Left Column: Worker Compliance Table */}
        <div className="xl:col-span-2 bg-[#111622] border border-[#1f293d] rounded-3xl p-5 flex flex-col gap-4 shadow-md">
          <h3 className="text-xs uppercase font-extrabold tracking-widest text-slate-400">Worker Compliance</h3>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#1f293d] bg-[#141c2d]/50 text-slate-400 text-[10px] font-extrabold uppercase tracking-wider">
                  <th className="px-5 py-3">Worker</th>
                  <th className="px-5 py-3">Department</th>
                  <th className="px-5 py-3 text-center">Current PPE</th>
                  <th className="px-5 py-3">Missing PPE</th>
                  <th className="px-5 py-3">Last Seen</th>
                  <th className="px-5 py-3 text-center">Compliance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {workerComplianceList.map((worker) => (
                  <tr key={worker.name} className="hover:bg-[#141b2c]/40 transition-colors text-xs font-semibold text-white">
                    {/* Worker Avatar & Name */}
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-6 w-6 rounded-full bg-slate-800 flex items-center justify-center shrink-0 border border-slate-700">
                          <User className="h-3 w-3 text-slate-400" />
                        </div>
                        <span className="text-white font-bold">{worker.name}</span>
                      </div>
                    </td>

                    {/* Department */}
                    <td className="px-5 py-3 text-slate-300">{worker.dept}</td>

                    {/* 5 PPE compliance status icons */}
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-center gap-2">
                        {/* Boot */}
                        <span className={`p-1 rounded ${worker.shoes ? 'text-emerald-400 bg-emerald-500/5' : 'text-red-400 bg-red-500/5'}`}>
                          <BootIcon className="h-3 w-3" />
                        </span>
                        {/* Vest */}
                        <span className={`p-1 rounded ${worker.vest ? 'text-emerald-400 bg-emerald-500/5' : 'text-red-400 bg-red-500/5'}`}>
                          <VestIcon className="h-3 w-3" />
                        </span>
                        {/* Helmet */}
                        <span className={`p-1 rounded ${worker.helmet ? 'text-emerald-400 bg-emerald-500/5' : 'text-red-400 bg-red-500/5'}`}>
                          <HelmetIcon className="h-3 w-3" />
                        </span>
                        {/* Gloves */}
                        <span className={`p-1 rounded ${worker.gloves ? 'text-emerald-400 bg-emerald-500/5' : 'text-red-400 bg-red-500/5'}`}>
                          <GlovesIcon className="h-3 w-3" />
                        </span>
                        {/* Mask */}
                        <span className={`p-1 rounded ${worker.mask ? 'text-emerald-400 bg-emerald-500/5' : 'text-red-400 bg-red-500/5'}`}>
                          <MaskIcon className="h-3 w-3" />
                        </span>
                      </div>
                    </td>

                    {/* Missing PPE label */}
                    <td className="px-5 py-3">
                      {worker.missing === '-' ? (
                        <span className="text-slate-500 font-normal">-</span>
                      ) : (
                        <span className="text-red-400 font-bold font-mono text-[10px] uppercase">
                          {worker.missing}
                        </span>
                      )}
                    </td>

                    {/* Last Seen time */}
                    <td className="px-5 py-3 font-mono text-slate-400">{worker.time}</td>

                    {/* Compliance badge */}
                    <td className="px-5 py-3 text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-black font-mono ${
                        worker.comp >= 95 ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                        'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      }`}>
                        {worker.comp}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Column: Compliance Trend Chart */}
        <div className="bg-[#111622] border border-[#1f293d] rounded-3xl p-5 flex flex-col gap-4 shadow-md">
          <div className="flex items-center justify-between">
            <h3 className="text-xs uppercase font-extrabold tracking-widest text-slate-400">Compliance Trend</h3>
            
            {/* Daily/Weekly/Monthly Toggle buttons */}
            <div className="flex items-center gap-1 bg-[#151d30] border border-[#25324c] p-0.5 rounded-xl">
              {(['Daily', 'Weekly', 'Monthly'] as const).map(range => (
                <button
                  key={range}
                  onClick={() => setTrendRange(range)}
                  className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${
                    trendRange === range ? 'bg-emerald-500 text-black' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {range}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 w-full h-[180px] mt-1 relative">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendChartData} margin={{ top: 10, right: 5, left: -25, bottom: 0 }}>
                <XAxis dataKey="date" stroke="#475569" fontSize={8} tickLine={false} axisLine={false} />
                <YAxis domain={[0, 100]} stroke="#475569" fontSize={8} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', fontSize: '9px', color: '#fff' }} />
                <Line type="monotone" dataKey="Rate" stroke="#10b981" strokeWidth={2.5} dot={{ r: 3, fill: '#10b981' }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
            <div className="absolute right-2 top-2 bg-[#10b981]/10 border border-[#10b981]/25 px-2 py-0.5 rounded-lg text-[9px] font-mono font-black text-emerald-400">
              Avg: 82%
            </div>
          </div>
        </div>

      </div>

      {/* Bottom Row: Recent Violations Snapshots */}
      <div className="bg-[#111622] border border-[#1f293d] rounded-3xl p-5 flex flex-col gap-4 shadow-md">
        <h3 className="text-xs uppercase font-extrabold tracking-widest text-slate-400">Recent Violations</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {recentViolations.map((viol, index) => (
            <div key={index} className="bg-[#151d30] border border-[#25324c] rounded-2xl overflow-hidden shadow-sm relative group flex flex-col">
              
              {/* Card Photo overlay */}
              <div className="relative aspect-video w-full bg-slate-950 flex items-center justify-center overflow-hidden border-b border-[#25324c]/60">
                {/* Simulated background grids / security layout */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/20 z-10" />
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-900/10 via-slate-950/80 to-slate-950 z-0" />
                
                {/* Security camera details scan line effect */}
                <div className="absolute inset-x-0 h-[1px] bg-red-500/40 top-[40%] animate-pulse z-10" />

                {/* Simulated Bounding Box */}
                <div className="absolute left-[35%] top-[25%] w-[30%] h-[55%] border-2 border-red-500 rounded flex flex-col justify-between p-1 bg-black/10 backdrop-blur-[0.5px]">
                  <span className="text-[7px] font-bold font-mono px-1 rounded bg-red-600 text-white truncate max-w-full leading-none w-fit">
                    {viol.type}
                  </span>
                </div>

                <span className="text-[9px] font-mono font-bold text-slate-500 z-10 uppercase tracking-widest">
                  Live Stream Snapshot
                </span>
              </div>

              {/* Card Body details */}
              <div className="p-3 flex flex-col gap-1.5 bg-[#111622]/40 z-10">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-white">{viol.worker}</span>
                  <span className={`inline-flex px-1.5 py-0.5 rounded text-[8px] font-black font-mono border ${viol.color}`}>
                    {viol.type}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[9px] font-mono text-slate-500">
                  <span>Camera: {viol.cam}</span>
                  <span>Time: {viol.time}</span>
                </div>
              </div>

            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
