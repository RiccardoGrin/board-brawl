import { useMemo } from 'react';
import { 
  Dices, 
  Coins, 
  Sword, 
  Shield, 
  Gem, 
  Heart, 
  FlaskConical, 
  Crown, 
  Trophy, 
  Map, 
  Scroll,
  TowerControl as Tower,
  Axe,
  Hammer,
  Key,
  Gamepad2,
  Puzzle
} from 'lucide-react';

const ORNAMENTS = [
  { Icon: Trophy, top: '6%', left: '12%', size: 110, rotate: -12 },
  { Icon: Gamepad2, top: '22%', left: '71%', size: 115, rotate: 18 },
  { Icon: Dices, top: '65%', left: '10%', size: 140, rotate: 36 },
  { Icon: Shield, top: '82%', left: '70%', size: 110, rotate: -8 },
  { Icon: Gem, top: '46%', left: '70%', size: 120, rotate: 30 },
  { Icon: Puzzle, top: '82%', left: '42%', size: 100, rotate: -22 },
  { Icon: Crown, top: '15%', left: '32%', size: 105, rotate: -18 },
  { Icon: Sword, top: '72%', left: '28%', size: 135, rotate: 10 },
  { Icon: Heart, top: '5%', left: '70%', size: 90, rotate: -5 },
  { Icon: FlaskConical, top: '55%', left: '92%', size: 125, rotate: 14 },
  { Icon: Map, top: '40%', left: '3%', size: 110, rotate: -36 },
  { Icon: Scroll, top: '80%', left: '88%', size: 120, rotate: 6 },
  { Icon: Tower, top: '35%', left: '15%', size: 95, rotate: 18 },
  { Icon: Axe, top: '60%', left: '80%', size: 115, rotate: -12 },
  { Icon: Hammer, top: '20%', left: '90%', size: 95, rotate: 18 },
  { Icon: Key, top: '50%', left: '20%', size: 105, rotate: -28 },
  { Icon: Coins, top: '68%', left: '55%', size: 105, rotate: 12 },
];

export function BackgroundOrnaments() {
  const ornaments = useMemo(() => ORNAMENTS, []);

  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden select-none opacity-[0.06]">
      {ornaments.map((orn, i) => (
        <div
          key={i}
          className="absolute text-gold transition-opacity duration-1000"
          style={{
            top: orn.top,
            left: orn.left,
            transform: `rotate(${orn.rotate}deg)`,
            strokeWidth: 1.5
          }}
        >
          <orn.Icon size={orn.size} />
        </div>
      ))}
    </div>
  );
}
