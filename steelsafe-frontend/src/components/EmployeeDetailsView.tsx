import { useState, useMemo } from 'react';
import {
  User, Calendar, Clock, CheckCircle2, ChevronRight, Award, ShieldCheck
} from 'lucide-react';
import type { PPEViolationEvent } from './CCTVPanel';

interface EmployeeDetailsViewProps {
  employeeId: string;
  violations: PPEViolationEvent[];
  onBack: () => void;
}

interface EmployeeProfile {
  id: string;
  name: string;
  dept: string;
  status: 'Present' | 'Absent';
  joinDate: string;
  phone: string;
  email: string;
  shift: string;
  bloodGroup: string;
  emergencyContact: string;
  baseSafetyScore: number;
  baseViolations: number;
}

const EMPLOYEE_PROFILES: Record<string, EmployeeProfile> = {
  'WRK01': {
    id: 'WRK01',
    name: 'Raj',
    dept: 'Assembly Line',
    status: 'Present',
    joinDate: '15 Jan 2024',
    phone: '+91 9876543210',
    email: 'raj@steel.com',
    shift: 'Morning Shift',
    bloodGroup: 'O+',
    emergencyContact: 'Ramesh (Father) 9876543211',
    baseSafetyScore: 98,
    baseViolations: 0
  },
  'WRK02': {
    id: 'WRK02',
    name: 'Priya',
    dept: 'Robot Zone',
    status: 'Present',
    joinDate: '20 Feb 2024',
    phone: '+91 9876543212',
    email: 'priya@steel.com',
    shift: 'General Shift',
    bloodGroup: 'A+',
    emergencyContact: 'Sita (Mother) 9876543213',
    baseSafetyScore: 88,
    baseViolations: 2
  },
  'WRK03': {
    id: 'WRK03',
    name: 'Arun',
    dept: 'Warehouse',
    status: 'Present',
    joinDate: '10 Mar 2024',
    phone: '+91 9876543214',
    email: 'arun@steel.com',
    shift: 'Night Shift',
    bloodGroup: 'B+',
    emergencyContact: 'Kishore (Brother) 9876543215',
    baseSafetyScore: 90,
    baseViolations: 1
  },
  'WRK04': {
    id: 'WRK04',
    name: 'Karan',
    dept: 'Assembly Line',
    status: 'Present',
    joinDate: '05 Apr 2024',
    phone: '+91 9876543216',
    email: 'karan@steel.com',
    shift: 'Morning Shift',
    bloodGroup: 'AB+',
    emergencyContact: 'Sunita (Wife) 9876543217',
    baseSafetyScore: 91,
    baseViolations: 1
  },
  'WRK05': {
    id: 'WRK05',
    name: 'Mohan',
    dept: 'Boiler Room',
    status: 'Present',
    joinDate: '22 May 2024',
    phone: '+91 9876543218',
    email: 'mohan@steel.com',
    shift: 'General Shift',
    bloodGroup: 'O-',
    emergencyContact: 'Devi (Sister) 9876543219',
    baseSafetyScore: 80,
    baseViolations: 3
  }
};

export function EmployeeDetailsView({ employeeId, violations, onBack }: EmployeeDetailsViewProps) {
  const [activeTab, setActiveTab] = useState('Overview');

  const profile = useMemo(() => {
    return EMPLOYEE_PROFILES[employeeId] || EMPLOYEE_PROFILES['WRK01'];
  }, [employeeId]);

  // Dynamically calculate violations and safety scores for this employee from active live violations
  const computedMetrics = useMemo(() => {
    let liveViolationCount = 0;
    violations.forEach(v => {
      const isMatch = (profile.name === 'Raj' && v.zone_id === 'zone_gcm' && v.status === 'open') ||
                      (profile.name === 'Priya' && v.zone_id === 'zone_ca') ||
                      (profile.name === 'Arun' && v.zone_id === 'zone_qt') ||
                      (profile.name === 'Mohan' && v.zone_id === 'zone_cr');
      if (isMatch) {
        liveViolationCount++;
      }
    });

    const totalViolations = profile.baseViolations + liveViolationCount;
    const safetyScore = Math.max(50, profile.baseSafetyScore - (liveViolationCount * 8));
    const ppeCompliance = Math.max(60, 100 - (totalViolations * 5));

    return {
      totalViolations,
      safetyScore,
      ppeCompliance
    };
  }, [profile, violations]);

  // PPE item status deck mapping
  const ppeStatusItems = useMemo(() => {
    // If they have base violations or live violations, flag corresponding items as missing
    const hasViolations = computedMetrics.totalViolations > 0;
    
    return [
      { name: 'Helmet', wearing: !hasViolations || profile.name === 'Raj', label: 'Helmet' },
      { name: 'Safety Vest', wearing: !hasViolations || profile.name !== 'Raj', label: 'Safety Vest' },
      { name: 'Safety Shoes', wearing: true, label: 'Safety Shoes' },
      { name: 'Gloves', wearing: profile.name !== 'Mohan', label: 'Gloves' },
      { name: 'Mask', wearing: true, label: 'Mask' }
    ];
  }, [computedMetrics.totalViolations, profile.name]);

  return (
    <div id="employee-details-view" className="flex flex-col gap-6 w-full text-theme-text">
      
      {/* Breadcrumbs Navigation Header */}
      <div className="flex items-center gap-1.5 text-[10px] font-bold text-theme-text-muted uppercase tracking-wider">
        <button onClick={onBack} className="hover:text-emerald-400 transition-all cursor-pointer">
          Employees
        </button>
        <ChevronRight className="h-3 w-3" />
        <span className="text-theme-text-secondary">{profile.name} ({profile.id})</span>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 items-stretch">
        
        {/* Left Employee Profile Sidebar */}
        <div className="xl:col-span-1 bg-theme-card border border-theme-border p-5 rounded-3xl flex flex-col items-center gap-6 shadow-sm">
          
          {/* Avatar frame */}
          <div className="relative h-28 w-28 rounded-2xl bg-theme-bg-alt border border-theme-border flex items-center justify-center text-theme-text-muted shadow-inner group">
            <User className="h-14 w-14 text-theme-text-muted group-hover:scale-105 transition-all" />
            <span className="absolute bottom-2 right-2 h-3.5 w-3.5 rounded-full bg-emerald-500 border-2 border-theme-border shadow" />
          </div>

          <div className="text-center">
            <h3 className="text-base font-black text-theme-text m-0">{profile.name}</h3>
            <span className="text-[10px] font-bold text-theme-text-muted uppercase tracking-widest block mt-1.5">ID: {profile.id}</span>
            <span className="text-[9px] font-mono text-theme-text-muted block mt-1">{profile.dept}</span>
          </div>

          {/* Profile metadata rows */}
          <div className="w-full flex flex-col gap-3.5 border-t border-theme-border pt-5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-bold text-theme-text-muted uppercase tracking-wider">Status</span>
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[8.5px] font-black font-mono border bg-emerald-500/10 text-emerald-400 border-emerald-500/20 uppercase tracking-wider">
                Present
              </span>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-bold text-theme-text-muted uppercase tracking-wider">Join Date</span>
              <span className="font-mono text-theme-text-secondary">{profile.joinDate}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[9px] font-bold text-theme-text-muted uppercase tracking-wider">Phone</span>
              <span className="font-mono text-theme-text-secondary">{profile.phone}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[9px] font-bold text-theme-text-muted uppercase tracking-wider">Email</span>
              <span className="font-mono text-theme-text-secondary">{profile.email}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[9px] font-bold text-theme-text-muted uppercase tracking-wider">Shift</span>
              <span className="text-theme-text-secondary font-semibold">{profile.shift}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[9px] font-bold text-theme-text-muted uppercase tracking-wider">Blood Group</span>
              <span className="font-mono text-theme-text-secondary">{profile.bloodGroup}</span>
            </div>

            <div className="flex flex-col gap-1 border-t border-theme-border pt-3">
              <span className="text-[9px] font-bold text-theme-text-muted uppercase tracking-wider">Emergency Contact</span>
              <span className="text-[10px] text-theme-text-secondary font-semibold leading-relaxed mt-0.5">
                {profile.emergencyContact}
              </span>
            </div>
          </div>

        </div>

        {/* Right Content pane */}
        <div className="xl:col-span-3 flex flex-col gap-6">
          
          {/* Navigation Tabs bar */}
          <div className="flex flex-wrap items-center gap-1 border-b border-theme-border pb-2">
            {[
              'Overview',
              'Attendance',
              'Violations',
              'PPE History',
              'Certificates',
              'Medical',
              'Alerts'
            ].map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-xs font-bold transition-all relative border-b-2 ${
                  activeTab === tab
                    ? 'text-emerald-400 border-emerald-500'
                    : 'text-theme-text-muted border-transparent hover:text-theme-text'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {activeTab !== 'Overview' ? (
            <div className="bg-theme-card border border-theme-border rounded-3xl p-12 text-center text-theme-text-muted text-xs font-semibold leading-relaxed border-dashed flex flex-col items-center gap-2">
              <Calendar className="h-6 w-6 text-theme-text-muted animate-pulse" />
              <span>The detailed "{activeTab}" log is archived in the main plant office database.</span>
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              
              {/* Top stats row: 4 cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                
                {/* Safety Score */}
                <div className="bg-theme-card border border-theme-border p-4 rounded-2xl flex flex-col justify-between shadow-sm relative">
                  <span className="text-[8.5px] font-bold text-theme-text-muted uppercase tracking-wider">Safety Score</span>
                  <div className="flex items-baseline gap-1 mt-2">
                    <span className="text-xl font-black text-theme-text">{computedMetrics.safetyScore}%</span>
                    <span className="text-[8px] font-black uppercase text-emerald-400">Excellent</span>
                  </div>
                </div>

                {/* Total Violations */}
                <div className="bg-theme-card border border-theme-border p-4 rounded-2xl flex flex-col justify-between shadow-sm relative">
                  <span className="text-[8.5px] font-bold text-theme-text-muted uppercase tracking-wider">Total Violations</span>
                  <div className="flex items-baseline gap-1 mt-2">
                    <span className="text-xl font-black text-theme-text">{computedMetrics.totalViolations}</span>
                  </div>
                </div>

                {/* PPE Compliance */}
                <div className="bg-theme-card border border-theme-border p-4 rounded-2xl flex flex-col justify-between shadow-sm relative">
                  <span className="text-[8.5px] font-bold text-theme-text-muted uppercase tracking-wider">PPE Compliance</span>
                  <div className="flex items-baseline gap-1 mt-2">
                    <span className="text-xl font-black text-theme-text">{computedMetrics.ppeCompliance}%</span>
                  </div>
                </div>

                {/* Attendance */}
                <div className="bg-theme-card border border-theme-border p-4 rounded-2xl flex flex-col justify-between shadow-sm relative">
                  <span className="text-[8.5px] font-bold text-theme-text-muted uppercase tracking-wider">Attendance (This Month)</span>
                  <div className="flex items-baseline gap-1 mt-2">
                    <span className="text-xl font-black text-theme-text">100%</span>
                  </div>
                </div>

              </div>

              {/* Middle section: Recent activity + Snapshots */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
                
                {/* Recent Activity */}
                <div className="bg-theme-card border border-theme-border rounded-3xl p-5 flex flex-col gap-4 shadow-md text-theme-text">
                  <h4 className="text-xs uppercase font-extrabold tracking-widest text-theme-text-muted">Recent Activity</h4>
                  
                  <div className="flex-1 flex flex-col gap-4 mt-2">
                    {[
                      { time: '10 Jul 10:30 AM', event: 'Helmet Detected', icon: CheckCircle2, iconColor: 'text-emerald-400' },
                      { time: '10 Jul 09:22 AM', event: 'Completed Safety Training', icon: Award, iconColor: 'text-blue-400' },
                      { time: '09 Jul 10:15 AM', event: 'PPE Warning: Missing Helmet (Resolved)', icon: CheckCircle2, iconColor: 'text-emerald-400' },
                      { time: '09 Jul 10:13 AM', event: 'Shift Briefing check-in', icon: Clock, iconColor: 'text-theme-text-muted' },
                      { time: '08 Jul 10:05 AM', event: 'Zone check-in: Assembly Line', icon: Clock, iconColor: 'text-theme-text-muted' }
                    ].map((item, idx) => {
                      const Icon = item.icon;
                      return (
                        <div key={idx} className="flex items-start gap-3">
                          <Icon className={`h-4.5 w-4.5 shrink-0 mt-0.5 ${item.iconColor}`} />
                          <div className="flex flex-col">
                            <span className="text-xs font-black text-theme-text">{item.event}</span>
                            <span className="text-[8.5px] font-mono text-theme-text-muted mt-0.5">{item.time}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Recent Snapshots (Placeholder Camera Frames representing privacy) */}
                <div className="bg-theme-card border border-theme-border rounded-3xl p-5 flex flex-col gap-4 shadow-md text-theme-text">
                  <h4 className="text-xs uppercase font-extrabold tracking-widest text-theme-text-muted">Recent Snapshots</h4>
                  
                  <div className="flex-1 grid grid-cols-2 gap-4 mt-2">
                    <div className="bg-theme-well border border-theme-border rounded-2xl flex flex-col items-center justify-center p-4 relative group overflow-hidden">
                      <div className="absolute inset-2 border-2 border-emerald-500/30 rounded flex items-center justify-center pointer-events-none">
                        <span className="absolute top-1 left-1 text-[6px] font-mono text-emerald-400 uppercase tracking-widest">CAM 02</span>
                        <span className="absolute bottom-1 right-1 text-[6.5px] font-mono text-emerald-400">95% Person</span>
                      </div>
                      <ShieldCheck className="h-8 w-8 text-emerald-500/20 group-hover:scale-105 transition-all" />
                      <span className="text-[7.5px] font-mono text-theme-text-muted mt-2">Inspected Compliant</span>
                    </div>

                    <div className="bg-theme-well border border-theme-border rounded-2xl flex flex-col items-center justify-center p-4 relative group overflow-hidden">
                      <div className="absolute inset-2 border-2 border-emerald-500/30 rounded flex items-center justify-center pointer-events-none">
                        <span className="absolute top-1 left-1 text-[6px] font-mono text-emerald-400 uppercase tracking-widest">CAM 02</span>
                        <span className="absolute bottom-1 right-1 text-[6.5px] font-mono text-emerald-400">98% Person</span>
                      </div>
                      <ShieldCheck className="h-8 w-8 text-emerald-500/20 group-hover:scale-105 transition-all" />
                      <span className="text-[7.5px] font-mono text-theme-text-muted mt-2">Inspected Compliant</span>
                    </div>
                  </div>
                </div>

              </div>

              {/* Bottom PPE Status deck */}
              <div className="bg-theme-card border border-theme-border rounded-3xl p-5 flex flex-col gap-4 shadow-md text-theme-text">
                <h4 className="text-xs uppercase font-extrabold tracking-widest text-theme-text-muted">PPE Status</h4>
                
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mt-2">
                  {ppeStatusItems.map(item => (
                    <div key={item.name} className="bg-theme-bg-alt/60 border border-theme-border p-3.5 rounded-2xl flex flex-col items-center gap-2 text-center">
                      <div className={`p-2 rounded-xl border ${item.wearing ? 'bg-emerald-950/20 border-emerald-500/20 text-emerald-400' : 'bg-red-950/20 border-red-500/20 text-red-400'}`}>
                        {item.name === 'Helmet' || item.name === 'Safety Vest' ? (
                          <ShieldCheck className="h-4.5 w-4.5" />
                        ) : (
                          <CheckCircle2 className="h-4.5 w-4.5" />
                        )}
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] font-extrabold text-theme-text">{item.label}</span>
                        <span className={`text-[8px] font-black uppercase tracking-wider ${item.wearing ? 'text-emerald-400' : 'text-red-400'}`}>
                          {item.wearing ? 'Wearing' : 'Missing'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          )}

        </div>

      </div>

    </div>
  );
}
