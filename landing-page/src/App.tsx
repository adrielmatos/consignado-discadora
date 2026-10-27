import { useState } from "react";
import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import MetricsBar from "@/components/MetricsBar";
import RoiCalculator from "@/components/RoiCalculator";
import FeaturesGrid from "@/components/FeaturesGrid";
import ComparisonTable from "@/components/ComparisonTable";
import Pricing from "@/components/Pricing";
import FaqAccordion from "@/components/FaqAccordion";
import Footer from "@/components/Footer";
import DemoModal from "@/components/DemoModal";

export default function App() {
  const [isDemoModalOpen, setIsDemoModalOpen] = useState(false);
  const [modalDefaultMessage, setModalDefaultMessage] = useState<string | undefined>();

  const handleOpenDemoModal = (customMessage?: string) => {
    setModalDefaultMessage(customMessage);
    setIsDemoModalOpen(true);
  };

  const handleCloseDemoModal = () => {
    setIsDemoModalOpen(false);
    setModalDefaultMessage(undefined);
  };

  return (
    <main className="min-h-screen bg-navy-950 text-slate-100 flex flex-col justify-between selection:bg-amber-400 selection:text-slate-950">
      <Navbar onOpenDemoModal={() => handleOpenDemoModal()} />
      
      <div className="flex-1">
        <Hero onOpenDemoModal={() => handleOpenDemoModal()} />
        <MetricsBar />
        <RoiCalculator onOpenDemoModal={handleOpenDemoModal} />
        <FeaturesGrid onOpenDemoModal={() => handleOpenDemoModal()} />
        <ComparisonTable onOpenDemoModal={() => handleOpenDemoModal()} />
        <Pricing onOpenDemoModal={handleOpenDemoModal} />
        <FaqAccordion onOpenDemoModal={() => handleOpenDemoModal()} />
      </div>

      <Footer />

      <DemoModal
        isOpen={isDemoModalOpen}
        onClose={handleCloseDemoModal}
        defaultMessage={modalDefaultMessage}
      />
    </main>
  );
}
