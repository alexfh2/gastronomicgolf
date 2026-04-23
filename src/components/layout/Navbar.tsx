import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet';
import LanguageSwitcher from './LanguageSwitcher';

const navItems = [
  { key: 'overview', path: '/' },
  { key: 'rankings', path: '/ranquings' },
  { key: 'rounds', path: '/jornades' },
  { key: 'players', path: '/jugadors' },
  { key: 'stats', path: '/estadistiques' },
  { key: 'news', path: '/noticies' },
] as const;

const Navbar = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  return (
    <header
      className="sticky top-0 left-0 right-0 z-50 backdrop-blur-md border-b border-white/[0.04]"
      style={{ background: 'linear-gradient(180deg, hsl(220 14% 4% / 0.85), hsl(220 14% 4% / 0.55))' }}
    >
      <div className="container flex h-[84px] items-center justify-between gap-6">
        {/* Brand: heraldic crest + name */}
        <Link to="/" className="flex items-center gap-3.5">
          <span className="crest crest-sm" aria-hidden />
          <span className="leading-none">
            <strong className="block font-display text-xl font-semibold tracking-tight">
              Gastronòmic Golf
            </strong>
            <span className="block mt-1.5 text-[11px] text-muted-foreground uppercase" style={{ letterSpacing: '0.18em' }}>
              circuit de golf
            </span>
          </span>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden lg:flex items-center gap-7">
          {navItems.map((item) => {
            const isActive =
              item.path === '/'
                ? location.pathname === '/'
                : location.pathname.startsWith(item.path);
            return (
              <Link
                key={item.key}
                to={item.path}
                className={`text-[13px] uppercase transition-all ${
                  isActive
                    ? 'text-[hsl(220_14%_5%)] font-semibold px-3.5 py-3 rounded-[10px] shadow-[0_8px_18px_hsl(36_32%_50%/0.18)]'
                    : 'text-cream-dark/85 hover:text-cream'
                }`}
                style={{
                  letterSpacing: '0.14em',
                  background: isActive
                    ? 'linear-gradient(180deg, hsl(36 35% 60%), hsl(36 32% 42%))'
                    : undefined,
                }}
              >
                {t(`nav.${item.key}`)}
              </Link>
            );
          })}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-3">
          <span
            className="hidden sm:inline-flex text-[12px] uppercase text-muted-foreground"
            style={{ letterSpacing: '0.24em' }}
          >
            Temporada 2026
          </span>
          <LanguageSwitcher />

          {/* Mobile menu */}
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild className="lg:hidden">
              <Button variant="ghost" size="icon" className="text-cream-dark hover:text-cream">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72 bg-background border-border">
              <SheetTitle className="flex items-center gap-3">
                <span className="crest crest-sm" aria-hidden />
                <span className="font-display text-lg font-semibold">Gastronòmic Golf</span>
              </SheetTitle>
              <nav className="mt-8 flex flex-col gap-1">
                {navItems.map((item) => {
                  const isActive =
                    item.path === '/'
                      ? location.pathname === '/'
                      : location.pathname.startsWith(item.path);
                  return (
                    <Link
                      key={item.key}
                      to={item.path}
                      onClick={() => setOpen(false)}
                      className={`px-4 py-3 text-xs uppercase transition-colors ${
                        isActive
                          ? 'text-accent border-l-2 border-accent'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                      style={{ letterSpacing: '0.15em' }}
                    >
                      {t(`nav.${item.key}`)}
                    </Link>
                  );
                })}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
};

export default Navbar;
