import { Crown } from 'lucide-react';
import { Link } from 'react-router-dom';

export function Logo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const dims = { sm: 'h-8 w-8', md: 'h-9 w-9', lg: 'h-11 w-11' };
  const text = { sm: 'text-base', md: 'text-lg', lg: 'text-xl' };
  const icon = { sm: 'h-4 w-4', md: 'h-5 w-5', lg: 'h-6 w-6' };

  return (
    <Link to="/" className="flex items-center gap-2.5 group">
      <div
        className={`${dims[size]} rounded-xl gradient-brand flex items-center justify-center shadow-glow transition-transform group-hover:scale-105`}
      >
        <Crown className={`${icon[size]} text-white`} />
      </div>
      <div className="flex flex-col leading-none">
        <span className={`${text[size]} font-bold text-content-primary tracking-tight`}>
          LB Assist
        </span>
        <span className="text-[10px] font-medium text-content-secondary tracking-widest uppercase">
          Chess
        </span>
      </div>
    </Link>
  );
}
