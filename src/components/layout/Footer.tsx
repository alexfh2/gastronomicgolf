import logo from '@/assets/logo.png';
import { useTranslation } from 'react-i18next';

const Footer = () => {
  const { t } = useTranslation();
  return (
    <footer className="border-t border-border/40 bg-background">
      {/* Brand CTA */}
      {/* Removed per user request */}

      {/* Bottom bar */}
      <div className="container py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
        <img
          src={logo}
          alt="Gastronòmic Golf"
          className="h-7 w-auto opacity-40"
        />
        <p className="text-[10px] text-muted-foreground/60 tracking-[0.15em] uppercase">
          {t('footer.officialClassification')}
        </p>
        <p className="text-[10px] text-muted-foreground/40">
          © {new Date().getFullYear()}
        </p>
      </div>
    </footer>
  );
};

export default Footer;
