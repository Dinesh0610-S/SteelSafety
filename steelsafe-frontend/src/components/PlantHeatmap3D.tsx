import { useRef, useState, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import * as THREE from 'three';
import { Layers } from 'lucide-react';
import { usePlant } from '../context/PlantContext';

interface RiskStatus {
  zone_id: string;
  risk_score: number;
  risk_level: string;
  triggered_rules: string | null;
  explanation: string;
  timestamp: string;
}

interface PlantHeatmap3DProps {
  currentRisks: Record<string, RiskStatus>;
  selectedZoneId: string | null;
  onSelectZone: (zoneId: string | null) => void;
}

interface CameraPreset {
  position: [number, number, number];
  target: [number, number, number];
}

const COKE_PRESETS: Record<string, CameraPreset> = {
  establishing: { position: [26, 20, 32], target: [0, 1.0, 0] },
  topdown: { position: [0, 38, 0.1], target: [0, 0, 0] },
  control_room: { position: [-13, 4.5, 3.5], target: [-13, 0.8, -5.0] },
  charging: { position: [-3.0, 6.0, -14.0], target: [-3.0, 1.5, -5.0] },
  battery: { position: [-3.0, 6.0, 15.0], target: [-3.0, 1.5, 5.0] },
  quench: { position: [12.0, 7.5, 15.0], target: [12.0, 2.0, 0] },
};

const ROLLING_PRESETS: Record<string, CameraPreset> = {
  establishing: { position: [35, 20, 35], target: [5, 1.0, -5] },
  topdown: { position: [5, 45, -5.0], target: [5, 0, -5] },
  furnace: { position: [-12, 8.0, 12.0], target: [-12, 1.5, 0] },
  rolling: { position: [0, 6.0, 12.0], target: [0, 1.5, 0] },
  cooling: { position: [12, 6.0, 12.0], target: [12, 1.5, 0] },
  finishing: { position: [24, 6.0, 12.0], target: [24, 1.5, 0] },
};


// ---------------------------------------------------------------------------
// Camera Transition Controller (Lerp Handler)
// ---------------------------------------------------------------------------
interface CameraControllerProps {
  presetName: string;
  controlsRef: React.RefObject<any>;
  presets: Record<string, CameraPreset>;
}

function CameraController({ presetName, controlsRef, presets }: CameraControllerProps) {
  const { camera } = useThree();
  const targetPos = useRef<THREE.Vector3>(new THREE.Vector3(26, 20, 32));
  const targetLook = useRef<THREE.Vector3>(new THREE.Vector3(0, 1.0, 0));

  useEffect(() => {
    const config = presets[presetName];
    if (config) {
      targetPos.current.set(...config.position);
      targetLook.current.set(...config.target);
    }
  }, [presetName, presets]);

  useFrame(() => {
    if (presetName === 'manual') return;

    const posDist = camera.position.distanceTo(targetPos.current);
    let lookDist = 0;
    if (controlsRef.current) {
      lookDist = controlsRef.current.target.distanceTo(targetLook.current);
    }

    if (posDist > 0.05 || lookDist > 0.05) {
      camera.position.lerp(targetPos.current, 0.08);

      if (controlsRef.current) {
        const currentTarget = new THREE.Vector3().copy(controlsRef.current.target);
        currentTarget.lerp(targetLook.current, 0.08);
        controlsRef.current.target.copy(currentTarget);
        controlsRef.current.update();
      }
    }
  });

  return null;
}

// ---------------------------------------------------------------------------
// Industrial Wall Component
// ---------------------------------------------------------------------------
interface WallProps {
  position: [number, number, number];
  args: [number, number, number];
  color?: string;
  opacity?: number;
}

function Wall({ position, args, color = '#475569', opacity = 1.0 }: WallProps) {
  return (
    <mesh position={position} castShadow receiveShadow>
      <boxGeometry args={args} />
      <meshStandardMaterial 
        color={color} 
        roughness={0.7} 
        metalness={0.2}
        transparent={opacity < 1.0}
        opacity={opacity}
      />
    </mesh>
  );
}

// ---------------------------------------------------------------------------
// Room Floor Component
// ---------------------------------------------------------------------------
interface RoomFloorProps {
  zoneId: string;
  name: string;
  position: [number, number, number];
  args: [number, number, number];
  riskLevel: string;
  isSelected: boolean;
  showLabel: boolean;
  onClick: () => void;
}

function RoomFloor({
  zoneId,
  name,
  position,
  args,
  riskLevel,
  isSelected,
  showLabel,
  onClick,
}: RoomFloorProps) {
  const meshRef = useRef<THREE.Mesh>(null);

  const getZoneColor = () => {
    if (riskLevel === 'critical') return '#ef4444';
    if (riskLevel === 'high') return '#f97316';
    if (riskLevel === 'medium') return '#eab308';

    const baseColors: Record<string, string> = {
      'zone_cr': '#2563eb',    // Blue
      'zone_ca': '#059669',    // Emerald
      'zone_cob1': '#4f46e5',  // Indigo
      'zone_qt': '#0d9488',    // Teal
      'zone_gcm': '#7c3aed',   // Violet
      
      'zone_cr2': '#2563eb',   // Blue (Mill Control)
      'zone_rhf': '#b91c1c',   // Red (Reheating Furnace)
      'zone_rs': '#64748b',    // Slate (Rolling Stand)
      'zone_cb': '#d97706',    // Amber (Cooling Bed)
      'zone_fl': '#15803d',    // Green (Finishing Line)
    };
    return baseColors[zoneId] || '#1e293b';
  };

  const baseColor = getZoneColor();

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const t = clock.getElapsedTime();

    if (meshRef.current.material) {
      const mat = meshRef.current.material as THREE.MeshStandardMaterial;
      if (riskLevel === 'critical' || riskLevel === 'high') {
        mat.emissive = new THREE.Color(baseColor);
        mat.emissiveIntensity = 0.5 + Math.sin(t * 8) * 0.4;
      } else {
        mat.emissive = new THREE.Color('#000000');
        mat.emissiveIntensity = 0;
      }
    }
  });

  return (
    <mesh
      ref={meshRef}
      position={position}
      receiveShadow
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <boxGeometry args={args} />
      <meshStandardMaterial
        color={baseColor}
        roughness={0.4}
        metalness={0.2}
        transparent
        opacity={isSelected ? 0.95 : 0.8}
        emissive={new THREE.Color(baseColor)}
        emissiveIntensity={0}
      />
      {showLabel && (
        <Html distanceFactor={18} position={[0, args[1]/2 + 0.2, 0]} center>
          <div
            onClick={(e) => {
              e.stopPropagation();
              onClick();
            }}
            className={`px-2 py-0.5 rounded border text-[8px] font-mono font-bold select-none cursor-pointer whitespace-nowrap shadow-2xl transition-all ${
              isSelected
                ? 'bg-theme-accent border-theme-accent text-white ring-2 ring-theme-accent/50 font-extrabold'
                : 'bg-theme-card/90 border-theme-border text-theme-text-muted hover:text-theme-text'
            }`}
          >
            {name} {riskLevel !== 'low' && `(${riskLevel.toUpperCase()})`}
          </div>
        </Html>
      )}
    </mesh>
  );
}

// ---------------------------------------------------------------------------
// 1. Coke Oven Battery 3D Sub-Tree
// ---------------------------------------------------------------------------
interface ModelProps {
  getRiskLevel: (zoneId: string) => string;
  selectedZoneId: string | null;
  onSelectZone: (zoneId: string | null) => void;
  showLabels: boolean;
  showRoof: boolean;
}

const CokeOvenModel: React.FC<ModelProps> = ({
  getRiskLevel,
  selectedZoneId,
  onSelectZone,
  showLabels,
  showRoof,
}) => {
  return (
    <>
      {/* Room Floors */}
      <RoomFloor
        zoneId="zone_cr"
        name="Control Room Office"
        position={[-13.0, 0.05, -5.0]}
        args={[6.0, 0.1, 6.0]}
        riskLevel={getRiskLevel('zone_cr')}
        isSelected={selectedZoneId === 'zone_cr'}
        showLabel={showLabels}
        onClick={() => onSelectZone('zone_cr')}
      />

      <RoomFloor
        zoneId="zone_ca"
        name="Charging Platform"
        position={[-3.0, 0.05, -5.0]}
        args={[12.0, 0.1, 8.0]}
        riskLevel={getRiskLevel('zone_ca')}
        isSelected={selectedZoneId === 'zone_ca'}
        showLabel={showLabels}
        onClick={() => onSelectZone('zone_ca')}
      />

      <RoomFloor
        zoneId="zone_cob1"
        name="Coke Oven Battery 1"
        position={[-3.0, 0.05, 5.0]}
        args={[12.0, 0.1, 8.0]}
        riskLevel={getRiskLevel('zone_cob1')}
        isSelected={selectedZoneId === 'zone_cob1'}
        showLabel={showLabels}
        onClick={() => onSelectZone('zone_cob1')}
      />

      <RoomFloor
        zoneId="zone_qt"
        name="Quenching Tower"
        position={[12.0, 0.05, 0]}
        args={[8.0, 0.1, 12.0]}
        riskLevel={getRiskLevel('zone_qt')}
        isSelected={selectedZoneId === 'zone_qt'}
        showLabel={showLabels}
        onClick={() => onSelectZone('zone_qt')}
      />

      <RoomFloor
        zoneId="zone_gcm"
        name="Gas Collection Main"
        position={[-3.0, 3.2, 5.0]}
        args={[12.0, 0.05, 2.0]}
        riskLevel={getRiskLevel('zone_gcm')}
        isSelected={selectedZoneId === 'zone_gcm'}
        showLabel={showLabels}
        onClick={() => onSelectZone('zone_gcm')}
      />

      {/* L-Walls */}
      <Wall position={[-16.0, 2.25, -5.0]} args={[0.4, 4.5, 6.0]} />
      <Wall position={[-13.0, 2.25, -8.0]} args={[6.0, 4.5, 0.4]} />
      <Wall position={[-9.0, 3.0, -5.0]} args={[0.4, 6.0, 8.0]} />
      <Wall position={[-3.0, 3.0, -9.0]} args={[12.0, 6.0, 0.4]} />
      <Wall position={[-3.0, 3.0, 9.0]} args={[12.0, 6.0, 0.4]} />
      <Wall position={[3.0, 3.0, 5.0]} args={[0.4, 6.0, 8.0]} />
      <Wall position={[16.0, 5.0, 0]} args={[0.4, 10.0, 12.0]} />
      <Wall position={[12.0, 5.0, 6.0]} args={[8.0, 10.0, 0.4]} />

      {/* Industrial Structures */}
      {/* Blast Furnace structure */}
      <group position={[7.0, 0, -4.0]}>
        <mesh position={[0, 1.75, 0]} castShadow>
          <boxGeometry args={[3.0, 3.5, 3.0]} />
          <meshStandardMaterial color="#991b1b" roughness={0.9} />
        </mesh>
        <mesh position={[0, 5.0, 0]} castShadow>
          <cylinderGeometry args={[1.2, 1.2, 3.0, 16]} />
          <meshStandardMaterial color="#1e293b" metalness={0.8} roughness={0.4} />
        </mesh>
        <mesh position={[0, 7.75, 0]} castShadow>
          <cylinderGeometry args={[0.8, 0.8, 2.5, 12]} />
          <meshStandardMaterial color="#991b1b" roughness={0.9} />
        </mesh>
        <mesh position={[0, 9.75, 0]} castShadow>
          <coneGeometry args={[0.5, 1.5, 12]} />
          <meshStandardMaterial color="#1e293b" metalness={0.8} />
        </mesh>
        <mesh position={[-2.0, 3.8, 0]} rotation={[0, 0, -Math.PI / 6]} castShadow>
          <boxGeometry args={[8.0, 0.2, 0.6]} />
          <meshStandardMaterial color="#475569" metalness={0.9} />
        </mesh>
      </group>

      {/* Chimney Stack 1 */}
      <group position={[-8.0, 0, -7.0]}>
        <mesh position={[0, 6.0, 0]} castShadow>
          <cylinderGeometry args={[0.4, 0.45, 12.0, 12]} />
          <meshStandardMaterial color="#7f1d1d" roughness={0.85} />
        </mesh>
        <mesh position={[0, 12.25, 0]} castShadow>
          <cylinderGeometry args={[0.2, 0.2, 0.5, 12]} />
          <meshStandardMaterial color="#1e293b" metalness={0.9} />
        </mesh>
      </group>

      {/* Chimney Stack 2 */}
      <group position={[15.0, 0, 5.0]}>
        <mesh position={[0, 5.0, 0]} castShadow>
          <cylinderGeometry args={[0.35, 0.4, 10.0, 12]} />
          <meshStandardMaterial color="#334155" metalness={0.7} roughness={0.4} />
        </mesh>
      </group>

      {/* Elevated Pipe Rack 1 */}
      <group position={[5.5, 0, 5.0]}>
        <mesh position={[0, 2.0, 0]} castShadow>
          <cylinderGeometry args={[0.12, 0.12, 4.0, 8]} />
          <meshStandardMaterial color="#1e293b" metalness={0.9} />
        </mesh>
        <mesh position={[0, 4.0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.25, 0.25, 5.0, 12]} />
          <meshStandardMaterial color="#4b5563" metalness={0.85} roughness={0.2} />
        </mesh>
      </group>

      {/* Walkway corridor from Office to Main building */}
      <group position={[-9.5, 0, -5.0]}>
        <mesh position={[0, 0.05, 0]} receiveShadow>
          <boxGeometry args={[1.0, 0.1, 1.6]} />
          <meshStandardMaterial color="#334155" />
        </mesh>
        <mesh position={[0, 2.05, 0]}>
          <boxGeometry args={[1.0, 0.1, 1.8]} />
          <meshStandardMaterial color="#1e293b" />
        </mesh>
      </group>

      {/* Set dressing: Control Room workstations */}
      <group position={[-13.0, 0.1, -5.0]} onClick={() => onSelectZone('zone_cr')}>
        <mesh position={[0, 0.4, 0]} castShadow>
          <boxGeometry args={[3.0, 0.8, 1.2]} />
          <meshStandardMaterial color="#576574" roughness={0.4} />
        </mesh>
      </group>

      {/* Set dressing: Charging Silo */}
      <group position={[-3.0, 0.1, -5.0]} onClick={() => onSelectZone('zone_ca')}>
        <mesh position={[-3.5, 2.25, -1.0]} castShadow>
          <cylinderGeometry args={[1.2, 1.2, 4.5, 24]} />
          <meshStandardMaterial color="#57606f" metalness={0.7} roughness={0.5} />
        </mesh>
      </group>

      {/* Set dressing: Coke Ovens */}
      <group position={[-3.0, 0.1, 5.0]} onClick={() => onSelectZone('zone_cob1')}>
        <mesh position={[0, 1.6, 0]} castShadow>
          <boxGeometry args={[9.0, 3.2, 3.6]} />
          <meshStandardMaterial color="#353b48" roughness={0.9} metalness={0.2} />
        </mesh>
      </group>

      {/* Set dressing: Gas Collection walkway main pipeline */}
      <group position={[-3.0, 4.0, 5.5]} onClick={() => onSelectZone('zone_gcm')}>
        <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.35, 0.35, 9.5, 24]} />
          <meshStandardMaterial color="#718093" metalness={0.8} roughness={0.3} />
        </mesh>
      </group>

      {/* Set dressing: Quench Tower */}
      <group position={[12.0, 0.1, 0]} onClick={() => onSelectZone('zone_qt')}>
        <mesh position={[0, 3.5, 0]} castShadow>
          <boxGeometry args={[5.5, 7.0, 6.5]} />
          <meshStandardMaterial color="#2f3542" roughness={0.8} metalness={0.2} />
        </mesh>
      </group>

      {/* Ceilings/Roofs */}
      {showRoof && (
        <>
          <mesh position={[-13.0, 4.5, -5.0]} castShadow>
            <boxGeometry args={[6.2, 0.1, 6.2]} />
            <meshStandardMaterial color="#334155" transparent opacity={0.85} />
          </mesh>
          <mesh position={[-3.0, 6.0, 0]} castShadow>
            <boxGeometry args={[12.2, 0.1, 18.2]} />
            <meshStandardMaterial color="#334155" transparent opacity={0.85} />
          </mesh>
          <mesh position={[12.0, 10.0, 0]} castShadow>
            <boxGeometry args={[8.2, 0.1, 12.2]} />
            <meshStandardMaterial color="#334155" transparent opacity={0.85} />
          </mesh>
        </>
      )}
    </>
  );
};


// ---------------------------------------------------------------------------
// 2. Rolling Mill Complex 3D Sub-Tree
// ---------------------------------------------------------------------------
const RollingMillModel: React.FC<ModelProps> = ({
  getRiskLevel,
  selectedZoneId,
  onSelectZone,
  showLabels,
  showRoof,
}) => {
  return (
    <>
      {/* Zone Floors - Laid out in a straight continuous mill line */}
      {/* Zone RHF: Reheating Furnace */}
      <RoomFloor
        zoneId="zone_rhf"
        name="Reheating Furnace"
        position={[-12.0, 0.05, 0.0]}
        args={[8.0, 0.1, 8.0]}
        riskLevel={getRiskLevel('zone_rhf')}
        isSelected={selectedZoneId === 'zone_rhf'}
        showLabel={showLabels}
        onClick={() => onSelectZone('zone_rhf')}
      />

      {/* Zone RS: Rolling Stand */}
      <RoomFloor
        zoneId="zone_rs"
        name="Rolling Stand"
        position={[0.0, 0.05, 0.0]}
        args={[10.0, 0.1, 8.0]}
        riskLevel={getRiskLevel('zone_rs')}
        isSelected={selectedZoneId === 'zone_rs'}
        showLabel={showLabels}
        onClick={() => onSelectZone('zone_rs')}
      />

      {/* Zone CB: Cooling Bed */}
      <RoomFloor
        zoneId="zone_cb"
        name="Cooling Bed"
        position={[12.0, 0.05, 0.0]}
        args={[10.0, 0.1, 8.0]}
        riskLevel={getRiskLevel('zone_cb')}
        isSelected={selectedZoneId === 'zone_cb'}
        showLabel={showLabels}
        onClick={() => onSelectZone('zone_cb')}
      />

      {/* Zone FL: Finishing Line */}
      <RoomFloor
        zoneId="zone_fl"
        name="Finishing Line"
        position={[24.0, 0.05, 0.0]}
        args={[10.0, 0.1, 8.0]}
        riskLevel={getRiskLevel('zone_fl')}
        isSelected={selectedZoneId === 'zone_fl'}
        showLabel={showLabels}
        onClick={() => onSelectZone('zone_fl')}
      />

      {/* Zone CR2: Elevated Mill Control Room overlooking the stand */}
      <RoomFloor
        zoneId="zone_cr2"
        name="Mill Control Room"
        position={[0.0, 3.2, 0.0]}
        args={[6.0, 0.05, 4.0]}
        riskLevel={getRiskLevel('zone_cr2')}
        isSelected={selectedZoneId === 'zone_cr2'}
        showLabel={showLabels}
        onClick={() => onSelectZone('zone_cr2')}
      />

      {/* L-Walls for interior visibility */}
      <Wall position={[-16.0, 3.0, 0]} args={[0.4, 6.0, 8.0]} />
      <Wall position={[-12.0, 3.0, -4.0]} args={[8.0, 6.0, 0.4]} />
      <Wall position={[0.0, 3.0, -4.0]} args={[10.0, 6.0, 0.4]} />
      <Wall position={[12.0, 3.0, 4.0]} args={[10.0, 6.0, 0.4]} />
      <Wall position={[24.0, 3.0, -4.0]} args={[10.0, 6.0, 0.4]} />
      <Wall position={[29.0, 3.0, 0.0]} args={[0.4, 6.0, 8.0]} />

      {/* Mill Control Room Walls */}
      <Wall position={[0.0, 4.7, -2.0]} args={[6.0, 3.0, 0.4]} />
      <Wall position={[-3.0, 4.7, 0.0]} args={[0.4, 3.0, 4.0]} />

      {/* Industrial Structures */}
      {/* Walking-Beam Kiln Furnace block */}
      <group position={[-12.0, 0.1, 0]}>
        <mesh position={[0, 1.8, 0]} castShadow>
          <boxGeometry args={[6.0, 3.5, 5.0]} />
          <meshStandardMaterial color="#7f1d1d" roughness={0.9} />
        </mesh>
        {/* Tall Chimney stack */}
        <mesh position={[-2.0, 5.5, -1.5]} castShadow>
          <cylinderGeometry args={[0.3, 0.35, 8.0, 12]} />
          <meshStandardMaterial color="#475569" metalness={0.7} />
        </mesh>
      </group>

      {/* Large Mill Rollers */}
      <group position={[0, 0.1, 0]}>
        {/* Base machinery */}
        <mesh position={[0, 1.2, 0]} castShadow>
          <boxGeometry args={[4.0, 2.2, 5.0]} />
          <meshStandardMaterial color="#334155" metalness={0.7} roughness={0.5} />
        </mesh>
        {/* Rolling Rollers cylinders */}
        <mesh position={[0, 2.5, 0.5]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.6, 0.6, 6.0, 16]} />
          <meshStandardMaterial color="#94a3b8" metalness={0.95} roughness={0.1} />
        </mesh>
      </group>

      {/* Cooling Bed Rails */}
      <group position={[12.0, 0.1, 0]}>
        <mesh position={[0, 0.3, 0]} receiveShadow>
          <boxGeometry args={[8.0, 0.6, 6.0]} />
          <meshStandardMaterial color="#475569" roughness={0.9} />
        </mesh>
        {/* Cooling pipes */}
        <mesh position={[0, 0.65, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.1, 0.1, 7.5, 8]} />
          <meshStandardMaterial color="#b45309" metalness={0.8} />
        </mesh>
      </group>

      {/* Finishing Line Shear Machinery */}
      <group position={[24.0, 0.1, 0]}>
        <mesh position={[0, 1.0, 0]} castShadow>
          <boxGeometry args={[5.0, 1.8, 5.0]} />
          <meshStandardMaterial color="#3f4857" metalness={0.8} />
        </mesh>
        <mesh position={[0, 2.2, 0]} castShadow>
          <boxGeometry args={[1.5, 0.8, 1.5]} />
          <meshStandardMaterial color="#1e293b" />
        </mesh>
      </group>

      {/* Elevated control room workstations */}
      <group position={[0.0, 3.25, 0.0]}>
        <mesh position={[0, 0.4, 0.8]} castShadow>
          <boxGeometry args={[2.0, 0.8, 0.8]} />
          <meshStandardMaterial color="#475569" />
        </mesh>
      </group>

      {/* Mill Gantries and Pipe Racks */}
      <group position={[18.0, 0, 5.0]}>
        <mesh position={[0, 2.0, 0]} castShadow>
          <cylinderGeometry args={[0.1, 0.1, 4.0, 8]} />
          <meshStandardMaterial color="#1e293b" />
        </mesh>
        <mesh position={[0, 4.0, -1.0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.2, 0.2, 10.0, 12]} />
          <meshStandardMaterial color="#737373" metalness={0.85} />
        </mesh>
      </group>

      {/* Ceilings/Roofs */}
      {showRoof && (
        <>
          <mesh position={[6.0, 6.0, 0]} castShadow>
            <boxGeometry args={[42.0, 0.1, 10.0]} />
            <meshStandardMaterial color="#334155" transparent opacity={0.85} />
          </mesh>
        </>
      )}
    </>
  );
};


export function PlantHeatmap3D({ currentRisks, selectedZoneId, onSelectZone }: PlantHeatmap3DProps) {
  const controlsRef = useRef<any>(null);
  const [activePreset, setActivePreset] = useState<string>('establishing');
  const [showRoof, setShowRoof] = useState<boolean>(false);
  const [showLabels, setShowLabels] = useState<boolean>(true);
  const [isDark, setIsDark] = useState<boolean>(
    document.documentElement.classList.contains('dark')
  );

  const { activePlantId } = usePlant();
  const isCokeOven = activePlantId === 'plant_coke_oven';

  const getRiskLevel = (zoneId: string) => {
    return currentRisks[zoneId]?.risk_level || 'low';
  };

  // Sync camera preset with selected zone
  useEffect(() => {
    if (isCokeOven) {
      if (selectedZoneId === 'zone_cr') setActivePreset('control_room');
      else if (selectedZoneId === 'zone_ca') setActivePreset('charging');
      else if (selectedZoneId === 'zone_cob1') setActivePreset('battery');
      else if (selectedZoneId === 'zone_qt') setActivePreset('quench');
      else if (selectedZoneId === 'zone_gcm') setActivePreset('battery');
    } else {
      if (selectedZoneId === 'zone_cr2') setActivePreset('rolling');
      else if (selectedZoneId === 'zone_rhf') setActivePreset('furnace');
      else if (selectedZoneId === 'zone_rs') setActivePreset('rolling');
      else if (selectedZoneId === 'zone_cb') setActivePreset('cooling');
      else if (selectedZoneId === 'zone_fl') setActivePreset('finishing');
    }
  }, [selectedZoneId, isCokeOven]);

  // When plantId changes, reset camera preset to establishing
  useEffect(() => {
    setActivePreset('establishing');
  }, [activePlantId]);

  // Listen to document.documentElement class mutations to update gridHelper colors dynamically
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  const gridColor1 = isDark ? '#334155' : '#cbd5e1';
  const gridColor2 = isDark ? '#1e293b' : '#f1f5f9';

  return (
    <div className="bg-theme-card border border-theme-border rounded-xl p-5 shadow-2xl backdrop-blur-md flex flex-col h-[560px] relative animate-fadeIn">
      {/* 3D Visualizer Header */}
      <div className="flex justify-between items-center mb-2">
        <div>
          <h3 className="text-xs font-bold text-theme-text tracking-wide uppercase flex items-center gap-1.5">
            <Layers className="h-4 w-4 text-theme-accent" />
            {isCokeOven ? 'Integrated Coke Battery 3D' : 'Rolling Mill Complex 3D'}
          </h3>
          <p className="text-[9px] text-theme-text-muted font-mono">Free orbit/pan/zoom controls active | Click zones to inspect</p>
        </div>
        
        {/* Roof Toggle */}
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-[9px] font-mono text-theme-text-muted cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showRoof}
              onChange={(e) => setShowRoof(e.target.checked)}
              className="rounded bg-theme-bg border-theme-border text-theme-accent focus:ring-0 focus:ring-offset-0 h-3 w-3"
            />
            <span>Show Roofs</span>
          </label>
          <div className="text-[8px] bg-theme-bg border border-theme-border-muted px-2 py-0.5 rounded font-mono text-theme-text-muted">
            THREE.JS ACTIVE
          </div>
        </div>
      </div>

      {/* Legend & Camera Action Control bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-2 bg-theme-bg-alt/45 p-2 rounded-lg border border-theme-border">
        {/* Color Legend - Dynamic per plant */}
        {isCokeOven ? (
          <div className="flex flex-wrap gap-2.5 items-center">
            <span className="text-[8px] font-mono font-bold text-theme-text-muted uppercase">Zones:</span>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-sm bg-blue-600 border border-blue-400"></div>
              <span className="text-[8px] font-mono text-theme-text-secondary">Control Room</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-sm bg-emerald-600 border border-emerald-400"></div>
              <span className="text-[8px] font-mono text-theme-text-secondary">Charging</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-sm bg-indigo-600 border border-indigo-400"></div>
              <span className="text-[8px] font-mono text-theme-text-secondary">Battery</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-sm bg-teal-600 border border-teal-400"></div>
              <span className="text-[8px] font-mono text-theme-text-secondary">Quench Tower</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-sm bg-violet-600 border border-violet-400"></div>
              <span className="text-[8px] font-mono text-theme-text-secondary">Gas Main</span>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2.5 items-center">
            <span className="text-[8px] font-mono font-bold text-theme-text-muted uppercase">Zones:</span>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-sm bg-red-600 border border-red-400"></div>
              <span className="text-[8px] font-mono text-theme-text-secondary">Reheating Furnace</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-sm bg-slate-500 border border-slate-400"></div>
              <span className="text-[8px] font-mono text-theme-text-secondary">Rolling Stand</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-sm bg-amber-600 border border-amber-400"></div>
              <span className="text-[8px] font-mono text-theme-text-secondary">Cooling Bed</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-sm bg-emerald-700 border border-emerald-500"></div>
              <span className="text-[8px] font-mono text-theme-text-secondary">Finishing Line</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-sm bg-blue-600 border border-blue-400"></div>
              <span className="text-[8px] font-mono text-theme-text-secondary">Control Room</span>
            </div>
          </div>
        )}

        {/* Action Controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActivePreset('establishing')}
            className="px-2 py-0.5 text-[8px] font-mono font-bold rounded border bg-theme-bg border-theme-border text-theme-text-secondary hover:text-theme-text transition-all hover:bg-theme-card-hover"
          >
            Reset View
          </button>
          <button
            onClick={() => setActivePreset('topdown')}
            className="px-2 py-0.5 text-[8px] font-mono font-bold rounded border bg-theme-bg border-theme-border text-theme-text-secondary hover:text-theme-text transition-all hover:bg-theme-card-hover"
          >
            Top View
          </button>
          <button
            onClick={() => setShowLabels(!showLabels)}
            className={`px-2 py-0.5 text-[8px] font-mono font-bold rounded border transition-all ${
              showLabels
                ? 'bg-theme-accent/20 border-theme-accent/50 text-theme-accent hover:bg-theme-accent/30'
                : 'bg-theme-bg border-theme-border text-theme-text-secondary hover:text-theme-text hover:bg-theme-card-hover'
            }`}
          >
            {showLabels ? 'Hide Labels' : 'Show Labels'}
          </button>
        </div>
      </div>

      {/* R3F Canvas Container */}
      <div className="flex-1 rounded-lg bg-theme-bg-alt/80 border border-theme-border overflow-hidden relative">
        <Canvas
          camera={{ position: [26, 20, 32], fov: 45 }}
          shadows
        >
          {/* Lighting */}
          <ambientLight intensity={1.6} />
          <directionalLight 
            position={[15, 25, 12]} 
            intensity={2.5} 
            castShadow 
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
          />
          <pointLight position={[-13, 4, -5]} intensity={1.5} color="#60a5fa" />
          <pointLight position={[12, 6, 0]} intensity={1.5} color="#2dd4bf" />

          {/* Preset Camera controller */}
          <CameraController 
            presetName={activePreset} 
            controlsRef={controlsRef} 
            presets={isCokeOven ? COKE_PRESETS : ROLLING_PRESETS}
          />

          {/* Large Yard Grid */}
          <gridHelper args={[48, 48, gridColor1, gridColor2]} position={[0, -0.01, 0]} />

          {/* Conditional model rendering based on active plant */}
          {isCokeOven ? (
            <CokeOvenModel
              getRiskLevel={getRiskLevel}
              selectedZoneId={selectedZoneId}
              onSelectZone={onSelectZone}
              showLabels={showLabels}
              showRoof={showRoof}
            />
          ) : (
            <RollingMillModel
              getRiskLevel={getRiskLevel}
              selectedZoneId={selectedZoneId}
              onSelectZone={onSelectZone}
              showLabels={showLabels}
              showRoof={showRoof}
            />
          )}

          {/* Orbit Controls */}
          <OrbitControls
            ref={controlsRef}
            enablePan={true}
            enableZoom={true}
            minDistance={4}
            maxDistance={52}
            minPolarAngle={0}
            maxPolarAngle={Math.PI}
            onChange={() => {
              if (activePreset !== 'manual') {
                setActivePreset('manual');
              }
            }}
          />
        </Canvas>

        {/* Info overlay */}
        <div className="absolute bottom-3 left-3 bg-theme-card/90 border border-theme-border px-3 py-1.5 rounded text-[8px] font-mono text-theme-text-muted pointer-events-none select-none">
          {isCokeOven 
            ? '🏗️ Coke Oven Battery Layout: Ovens standpipes, gas collection walkway, quench tower.'
            : '🏗️ Hot Rolling Mill Layout: Reheating kiln furnace, roll stands machinery, cooling bed rails.'}
        </div>
      </div>
    </div>
  );
}
