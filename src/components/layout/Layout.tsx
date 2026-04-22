import { Outlet } from 'react-router-dom';
import Navbar from './Navbar';
import Footer from './Footer';
import sponsors from '@/assets/sponsors-row.png';

const Layout = () => {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1 pb-14">
        <Outlet />
      </main>
      <Footer />
      {/* Fixed sponsors bar at the bottom */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-background/80 backdrop-blur-md border-t border-border/30">
        <div className="container py-2">
          <img
            src={sponsors}
            alt="Patrocinadors"
            className="max-w-3xl w-full mx-auto opacity-50"
          />
        </div>
      </div>
    </div>
  );
};

export default Layout;
