import logo from '@/assets/logo.png';
import fairwayDark from '@/assets/fairway-studio-dark.png';
import fairwayLight from '@/assets/fairway-studio-light.png';
import { useTranslation } from 'react-i18next';


const Footer = () => {
  const { t } = useTranslation();
  return (
    <footer className="border-t border-border/40 bg-background">
      {/* Brand CTA */}
      {/* Removed per user request */}

      {/* Bottom bar */}
      <div className="container py-8 flex flex-col items-center justify-center gap-3 text-center">
        <img
          src={logo}
          alt="Gastronòmic Golf"
          className="h-7 w-auto opacity-40"
        />
        <p className="text-[10px] text-muted-foreground/60 tracking-[0.15em] uppercase">
          {t('footer.officialClassification')}
        </p>
      </div>

      {/* Powered by */}
      <div className="border-t border-border/30">
        <div className="container py-5 flex justify-center">
          <a
            href="https://www.fairwaystudio.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex items-center gap-2.5 opacity-60 transition-opacity hover:opacity-100"
          >
            <span className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">
              Powered by
            </span>
            <img src={fairwayDark} alt="" className="h-4 w-auto dark:hidden" />
            <img src={fairwayLight} alt="" className="h-4 w-auto hidden dark:block" />
            <span className="text-[11px] tracking-[0.2em] uppercase text-foreground/80">
              Fairway Studio
            </span>
          </a>
        </div>
      </div>
    </footer>

  );
};

export default Footer;
