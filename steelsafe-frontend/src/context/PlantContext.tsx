import React, { createContext, useContext, useState, useEffect } from 'react';

export interface Plant {
  plant_id: string;
  name: string;
  short_name: string;
  zone_count: number;
}

interface PlantContextType {
  activePlantId: string;
  setActivePlantId: (id: string) => void;
  plants: Plant[];
  activePlant: Plant | null;
  loading: boolean;
}

const PlantContext = createContext<PlantContextType | undefined>(undefined);

export const PlantProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activePlantId, setActivePlantId] = useState<string>('plant_coke_oven');
  const [plants, setPlants] = useState<Plant[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    fetch('/api/v1/plants')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setPlants(data);
        }
      })
      .catch((e) => console.error("Failed to fetch plants:", e))
      .finally(() => setLoading(false));
  }, []);

  const activePlant = plants.find((p) => p.plant_id === activePlantId) || null;

  return (
    <PlantContext.Provider value={{ activePlantId, setActivePlantId, plants, activePlant, loading }}>
      {children}
    </PlantContext.Provider>
  );
};

export const usePlant = () => {
  const context = useContext(PlantContext);
  if (!context) {
    throw new Error('usePlant must be used within a PlantProvider');
  }
  return context;
};
