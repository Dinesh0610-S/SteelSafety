import React, { useState } from 'react';
import { usePlant } from '../context/PlantContext';
import { Factory, ChevronDown } from 'lucide-react';

interface PlantSwitcherProps {
  onSwitch?: () => void;
}

export const PlantSwitcher: React.FC<PlantSwitcherProps> = ({ onSwitch }) => {
  const { plants, activePlantId, setActivePlantId, activePlant } = usePlant();
  const [isOpen, setIsOpen] = useState(false);

  const handleSelect = (plantId: string) => {
    setActivePlantId(plantId);
    setIsOpen(false);
    if (onSwitch) {
      onSwitch();
    }
  };

  if (plants.length === 0) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2.5 bg-theme-card hover:bg-theme-card-hover border border-theme-border px-4 py-2.5 rounded-2xl text-xs font-bold font-mono tracking-tight text-theme-text transition-all shadow-sm active:scale-[0.98]"
      >
        <Factory className="h-4 w-4 text-theme-accent" />
        <span className="max-w-[200px] truncate">
          {activePlant ? activePlant.name : 'Select Plant'}
        </span>
        <ChevronDown className="h-3 w-3 text-theme-text-muted transition-transform duration-200" style={{ transform: isOpen ? 'rotate(180deg)' : 'none' }} />
      </button>

      {isOpen && (
        <>
          {/* Backdrop to close dropdown */}
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setIsOpen(false)}
          />
          
          <div className="absolute right-0 mt-2 w-64 bg-theme-card border border-theme-border rounded-2xl shadow-xl z-50 overflow-hidden animate-fadeIn py-1">
            <div className="px-3.5 py-2 border-b border-theme-border-muted">
              <span className="text-[9px] font-black text-theme-text-muted font-mono tracking-widest uppercase">
                Switch Facility
              </span>
            </div>
            
            {plants.map((p) => (
              <button
                key={p.plant_id}
                onClick={() => handleSelect(p.plant_id)}
                className={`w-full text-left px-4 py-3 text-xs flex flex-col gap-1 transition-all ${
                  p.plant_id === activePlantId
                    ? 'bg-theme-accent-bg text-theme-accent border-l-2 border-theme-accent font-bold'
                    : 'text-theme-text-secondary hover:bg-theme-card-hover hover:text-theme-text border-l-2 border-transparent'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="font-sans font-semibold text-[12px]">{p.name}</span>
                  <span className="text-[8px] font-mono bg-theme-bg px-1.5 py-0.5 rounded text-theme-text-muted font-bold">
                    {p.short_name}
                  </span>
                </div>
                <span className="text-[10px] text-theme-text-muted font-mono">
                  {p.zone_count} Active Monitoring Zones
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
