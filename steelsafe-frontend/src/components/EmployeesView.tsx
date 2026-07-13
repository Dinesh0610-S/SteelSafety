import { useState, useMemo } from 'react';
import {
  Users, UserCheck, ShieldAlert, BadgeInfo
} from 'lucide-react';
import type { PPEViolationEvent } from './CCTVPanel';
import {
  ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';

interface EmployeesViewProps {
  violations: PPEViolationEvent[];
  onSelectEmployee: (id: string) => void;
}

interface EmployeeItem {
  id: string;
  name: string;
  dept: string;
  status: 'Present' | 'Absent';
  baseSafetyScore: number;
  baseViolations: number;
  lastLoc: string;
}

export function EmployeesView({ violations, onSelectEmployee }: EmployeesViewProps) {
  // Mock roster of employees
  const [employeesList] = useState<EmployeeItem[]>([
    { id: 'WRK01', name: 'Raj', dept: 'Assembly Line', status: 'Present', baseSafetyScore: 98, baseViolations: 0, lastLoc: 'Assembly Line' },
    { id: 'WRK02', name: 'Priya', dept: 'Robot Zone', status: 'Present', baseSafetyScore: 88, baseViolations: 2, lastLoc: 'Robot Zone' },
    { id: 'WRK03', name: 'Arun', dept: 'Warehouse', status: 'Present', baseSafetyScore: 90, baseViolations: 1, lastLoc: 'Warehouse' },
    { id: 'WRK04', name: 'Karan', dept: 'Assembly Line', status: 'Present', baseSafetyScore: 91, baseViolations: 1, lastLoc: 'Assembly Line' },
    { id: 'WRK05', name: 'Mohan', dept: 'Boiler Room', status: 'Present', baseSafetyScore: 80, baseViolations: 3, lastLoc: 'Boiler Room' }
  ]);

  // Combine live violations with mock data for dynamic adjustments
  const dynamicEmployees = useMemo(() => {
    return employeesList.map(emp => {
      // Find open/resolved violations in this shift that match the employee's department/zone
      let liveViolationCount = 0;
      violations.forEach(v => {
        const isMatch = (emp.name === 'Raj' && v.zone_id === 'zone_gcm' && v.status === 'open') ||
                        (emp.name === 'Priya' && v.zone_id === 'zone_ca') ||
                        (emp.name === 'Arun' && v.zone_id === 'zone_qt') ||
                        (emp.name === 'Mohan' && v.zone_id === 'zone_cr');
        if (isMatch) {
          liveViolationCount++;
        }
      });

      const totalViolations = emp.baseViolations + liveViolationCount;
      const safetyScore = Math.max(50, emp.baseSafetyScore - (liveViolationCount * 8));

      return {
        ...emp,
        violationsCount: totalViolations,
        safetyScore
      };
    });
  }, [employeesList, violations]);

  // Attendance donut data
  const attendancePieData = [
    { name: 'Present', value: 132, color: '#10b981' },
    { name: 'Absent', value: 18, color: '#1f293d' }
  ];

  return (
    <div id="employees-view-container" className="flex flex-col gap-6 w-full text-theme-text">
      
      {/* Header Panel */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col leading-tight">
          <h2 className="text-xl font-black tracking-tight text-theme-text m-0">7. EMPLOYEES</h2>
          <p className="text-[11px] text-theme-text-muted font-bold mt-1.5">Manage and track all workers</p>
        </div>

        {/* Biometric Privacy Warning card */}
        <div className="bg-theme-well border border-theme-border p-4 rounded-2xl flex items-start gap-3 shadow-inner">
          <BadgeInfo className="h-5 w-5 text-sky-400 shrink-0 mt-0.5" />
          <div className="flex flex-col">
            <span className="text-[9.5px] font-black uppercase text-sky-400 tracking-wider">Demo Handover Roster</span>
            <p className="text-[10px] text-theme-text-secondary font-semibold leading-relaxed m-0 mt-1">
              Privacy Mode Active: Real-time CCTV vision models track targets anonymously to ensure employee biometric privacy. 
              The names and attendance totals below represent an illustrative demo roster integrated with active safety triggers.
            </p>
          </div>
        </div>
      </div>

      {/* Top Row: 4 Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        
        {/* Total Workers */}
        <div className="bg-theme-card border border-theme-border p-4 rounded-2xl flex flex-col justify-between shadow-sm relative group">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-black text-theme-text-muted uppercase tracking-widest">Total Workers</span>
            <div className="p-1.5 rounded-lg bg-theme-bg-alt border border-theme-border text-theme-text-muted">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <div className="flex flex-col mt-2">
            <span className="text-xl font-black text-theme-text leading-none">150</span>
            <span className="text-[7.5px] font-bold uppercase mt-1.5 text-theme-text-muted">Registered</span>
          </div>
        </div>

        {/* Present Today */}
        <div className="bg-theme-card border border-theme-border p-4 rounded-2xl flex flex-col justify-between shadow-sm relative group">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-black text-theme-text-muted uppercase tracking-widest">Present Today</span>
            <div className="p-1.5 rounded-lg bg-emerald-950/20 border border-emerald-500/20 text-emerald-400">
              <UserCheck className="h-4 w-4" />
            </div>
          </div>
          <div className="flex flex-col mt-2">
            <span className="text-xl font-black text-theme-text leading-none">132</span>
            <span className="text-[7.5px] font-bold uppercase mt-1.5 text-emerald-400">88% check-in rate</span>
          </div>
        </div>

        {/* Visitors */}
        <div className="bg-theme-card border border-theme-border p-4 rounded-2xl flex flex-col justify-between shadow-sm relative group">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-black text-theme-text-muted uppercase tracking-widest">Visitors</span>
            <div className="p-1.5 rounded-lg bg-theme-bg-alt border border-theme-border text-theme-text-muted">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <div className="flex flex-col mt-2">
            <span className="text-xl font-black text-theme-text leading-none">12</span>
            <span className="text-[7.5px] font-bold uppercase mt-1.5 text-theme-text-muted">Active passes</span>
          </div>
        </div>

        {/* Contract Workers */}
        <div className="bg-theme-card border border-theme-border p-4 rounded-2xl flex flex-col justify-between shadow-sm relative group">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-black text-theme-text-muted uppercase tracking-widest">Contract Workers</span>
            <div className="p-1.5 rounded-lg bg-amber-950/20 border border-amber-500/20 text-amber-400">
              <ShieldAlert className="h-4 w-4" />
            </div>
          </div>
          <div className="flex flex-col mt-2">
            <span className="text-xl font-black text-theme-text leading-none">28</span>
            <span className="text-[7.5px] font-bold uppercase mt-1.5 text-amber-400">On duty</span>
          </div>
        </div>

      </div>

      {/* All Employees Table */}
      <div className="bg-theme-card border border-theme-border rounded-3xl overflow-hidden shadow-md">
        <div className="p-5 border-b border-theme-border flex justify-between items-center bg-theme-bg-alt/10">
          <h3 className="text-xs uppercase font-extrabold tracking-widest text-theme-text-muted">All Employees</h3>
          <span className="text-[8px] font-black font-mono bg-sky-500/10 text-sky-400 border border-sky-500/20 px-2 py-0.5 rounded uppercase tracking-wider">
            Demo Mode Active
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-theme-border bg-theme-bg-alt text-[9px] font-black text-theme-text-muted uppercase tracking-widest">
                <th className="p-4 pl-6">ID</th>
                <th className="p-4">Name</th>
                <th className="p-4">Department</th>
                <th className="p-4">Today Status</th>
                <th className="p-4">Safety Score</th>
                <th className="p-4">Violations</th>
                <th className="p-4 pr-6">Last Location</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-theme-border text-xs font-semibold">
              {dynamicEmployees.map(emp => (
                <tr 
                  key={emp.id} 
                  onClick={() => onSelectEmployee(emp.id)}
                  className="hover:bg-theme-card-hover/20 transition-all cursor-pointer text-theme-text"
                >
                  <td className="p-4 pl-6 font-mono text-[10px] text-theme-text-muted">{emp.id}</td>
                  <td className="p-4 font-extrabold text-theme-text">{emp.name}</td>
                  <td className="p-4 text-theme-text-secondary">{emp.dept}</td>
                  <td className="p-4">
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[8.5px] font-black font-mono border bg-emerald-500/10 text-emerald-400 border-emerald-500/20 uppercase tracking-wider">
                      <span className="h-1 w-1 rounded-full bg-emerald-400 animate-pulse" />
                      {emp.status}
                    </span>
                  </td>
                  <td className="p-4 font-mono font-bold text-theme-text">
                    <span className={emp.safetyScore >= 90 ? 'text-emerald-400' : emp.safetyScore >= 80 ? 'text-amber-400' : 'text-red-400'}>
                      {emp.safetyScore}%
                    </span>
                  </td>
                  <td className="p-4 font-mono text-theme-text-secondary">{emp.violationsCount}</td>
                  <td className="p-4 pr-6 text-theme-text-muted">{emp.lastLoc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bottom Row: Top Safe Workers + Frequent Violators + Attendance Overview */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-stretch">
        
        {/* Top Safe Workers */}
        <div className="bg-theme-card border border-theme-border rounded-3xl p-5 flex flex-col gap-4 shadow-md text-theme-text">
          <h3 className="text-xs uppercase font-extrabold tracking-widest text-theme-text-muted">Top Safe Workers</h3>
          
          <div className="flex-1 flex flex-col gap-3.5 mt-1">
            {[
              { name: 'Raj', score: 98 },
              { name: 'Suresh', score: 97 },
              { name: 'Mohan', score: 95 }
            ].map(item => (
              <div key={item.name} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-[11px] font-bold text-theme-text-muted">
                  <span className="text-theme-text font-extrabold">{item.name}</span>
                  <span className="font-mono text-emerald-400">{item.score}%</span>
                </div>
                <div className="h-1.5 bg-theme-bg border border-theme-border rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${item.score}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Frequent Violators */}
        <div className="bg-theme-card border border-theme-border rounded-3xl p-5 flex flex-col gap-4 shadow-md text-theme-text">
          <h3 className="text-xs uppercase font-extrabold tracking-widest text-theme-text-muted">Frequent Violators</h3>
          
          <div className="flex-1 flex flex-col gap-3 mt-1">
            {[
              { name: 'Arun', count: 5 },
              { name: 'Priya', count: 4 },
              { name: 'Mohan', count: 3 }
            ].map(item => (
              <div key={item.name} className="flex items-center justify-between border-b border-theme-border pb-2.5 last:border-b-0 last:pb-0">
                <span className="text-xs font-black text-theme-text">{item.name}</span>
                <span className="text-xs font-mono font-black text-red-400">{item.count} warnings</span>
              </div>
            ))}
          </div>
        </div>

        {/* Attendance Overview donut */}
        <div className="bg-theme-card border border-theme-border rounded-3xl p-5 flex flex-col gap-4 shadow-md text-theme-text">
          <h3 className="text-xs uppercase font-extrabold tracking-widest text-theme-text-muted">Attendance Overview</h3>
          
          <div className="flex-1 flex items-center justify-between relative min-h-[120px] mt-1">
            
            <div className="h-24 w-24 relative shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={attendancePieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={26}
                    outerRadius={38}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {attendancePieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none">
                <span className="text-[6.5px] uppercase font-mono font-bold text-theme-text-muted">Present</span>
                <span className="text-sm font-black text-theme-text leading-none mt-0.5">88%</span>
              </div>
            </div>

            {/* Custom Legend */}
            <div className="flex flex-col gap-2 pl-4 w-full text-xs font-bold">
              <div className="flex items-center justify-between border-b border-theme-border pb-1.5">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded bg-emerald-500 shrink-0" />
                  <span className="text-theme-text-muted">Present</span>
                </div>
                <span className="text-theme-text font-mono">132 (88%)</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded bg-slate-700 shrink-0" />
                  <span className="text-theme-text-muted">Absent</span>
                </div>
                <span className="text-theme-text font-mono">18 (12%)</span>
              </div>
            </div>

          </div>
        </div>

      </div>

    </div>
  );
}
