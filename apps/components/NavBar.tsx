'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { GamepadIcon, CameraIcon, UserIcon, LogIcon } from './icons';

const tabs = [
  { href: '/', label: 'Play', Icon: GamepadIcon },
  { href: '/contribute', label: 'Contribute', Icon: CameraIcon },
  { href: '/activity', label: 'Activity', Icon: LogIcon },
  { href: '/profile', label: 'Profile', Icon: UserIcon },
];

export default function NavBar() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-bg-card/95 backdrop-blur-xl border-t border-black/5">
      <div className="max-w-md mx-auto flex justify-around py-2 pb-safe">
        {tabs.map(({ href, label, Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center gap-0.5 px-5 py-1 text-xs transition-colors ${
                active ? 'text-primary' : 'text-text-secondary'
              }`}
            >
              <Icon className="w-6 h-6" />
              <span className={`font-sans ${active ? 'font-semibold' : 'font-medium'}`}>
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
