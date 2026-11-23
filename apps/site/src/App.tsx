import { MotionConfig } from 'motion/react';
import { FinalCta, Faq, Footer } from './sections/closing';
import { DashboardPreview } from './sections/dashboard-preview';
import { Features, Industries, Outputs } from './sections/features';
import { Hero } from './sections/hero';
import { HowItWorks } from './sections/how-it-works';
import { Nav } from './sections/nav';
import { Problem, SourcesStrip } from './sections/problem';

/** The marketing website (D-101): one page, from the promise to the live WhatsApp demo. */
export function App() {
  return (
    <MotionConfig reducedMotion="user">
      <Nav />
      <main>
        <Hero />
        <SourcesStrip />
        <Problem />
        <HowItWorks />
        <DashboardPreview />
        <Features />
        <Industries />
        <Outputs />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </MotionConfig>
  );
}
