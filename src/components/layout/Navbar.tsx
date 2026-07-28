import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet';
import LanguageSwitcher from './LanguageSwitcher';
import ThemeToggle from './ThemeToggle';
import logo from '@/assets/logo.png';

const navItems = [
  { key: 'rankings', path: '/ranquings' },
  { key: 'rounds', path: '/resultats' },
  { key: 'players', path: '/jugadors' },
  { key: 'stats', path: '/estadistiques' },
  { key: 'news', path: '/noticies' },
  { key: 'calendar', path: '/calendari' },
] as const;


const Navbar = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const isHome = location.pathname === '/';

  return (
    <header
      className={`${
        isHome ? 'absolute' : 'sticky'
      } top-0 left-0 right-0 z-50 transition-colors duration-300 ${
        isHome
          ? 'bg-transparent'
          : 'bg-background/95 backdrop-blur border-b border-border/40'
      }`}
    >
      <div className="container flex h-14 sm:h-16 lg:h-[72px] items-center justify-between gap-3">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2.5 shrink-0">
          <img
            src={logo}
            alt="Gastronòmic Golf"
            className="h-7 sm:h-9 lg:h-10 w-auto opacity-90 dark:brightness-0 dark:invert"
          />
        </Link>


        {/* Desktop Nav */}
        <nav className="hidden lg:flex items-center gap-0.5">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.key}
                to={item.path}
                aria-current={isActive ? 'page' : undefined}
                className={`relative px-4 py-2.5 text-[15px] font-body font-semibold uppercase tracking-[0.08em] leading-[1.3] rounded-sm transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${
                  isActive
                    ? 'text-foreground bg-accent/10'
                    : 'text-muted-foreground hover:text-foreground hover:bg-surface-hover/60'
                }`}
              >
                {t(`nav.${item.key}`)}
                {isActive && (
                  <span aria-hidden className="absolute inset-x-3 -bottom-px h-[2px] bg-accent" />
                )}
              </Link>
            );
          })}
        </nav>


        {/* Right side */}
        <div className="flex items-center gap-0.5 sm:gap-2 shrink-0 -mr-2 sm:mr-0">

          <LanguageSwitcher />
          <ThemeToggle isHome={isHome} />

          {/* Mobile menu */}
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild className="lg:hidden">
              <Button variant="ghost" size="icon" className={isHome ? 'text-foreground/70 hover:text-foreground' : ''}>
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72 bg-background border-border">
              <SheetTitle className="flex items-center gap-2">
                <img src={logo} alt="Gastronòmic Golf" className="h-8 w-auto" />
              </SheetTitle>
              <nav className="mt-8 flex flex-col gap-0.5">
                {navItems.map((item) => {
                  const isActive = location.pathname === item.path;
                  return (
                    <Link
                      key={item.key}
                      to={item.path}
                      onClick={() => setOpen(false)}
                      aria-current={isActive ? 'page' : undefined}
                      className={`px-4 py-3 min-h-[44px] flex items-center text-[15px] font-body font-semibold uppercase tracking-[0.08em] leading-[1.3] transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${
                        isActive
                          ? 'text-foreground bg-accent/10 border-l-2 border-accent'
                          : 'text-muted-foreground hover:text-foreground hover:bg-surface-hover/60'
                      }`}
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
