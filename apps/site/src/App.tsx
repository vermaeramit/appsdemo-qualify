import { MotionConfig } from 'motion/react';
import { industryPage } from './industries';
import { isIndustry, type PageId } from './pages';
import { FinalCta, Faq, Footer } from './sections/closing';
import { DashboardPreview } from './sections/dashboard-preview';
import { Features, Industries, Outputs } from './sections/features';
import { Hero } from './sections/hero';
import { HowItWorks } from './sections/how-it-works';
import { IndustryView, OtherIndustries } from './sections/industry';
import { Nav } from './sections/nav';
import { Problem, SourcesStrip } from './sections/problem';

/**
 * The marketing website (D-101): the home page, from the promise to the live WhatsApp demo, and
 * one page per industry (D-104).
 */
export function App({ page = 'home' }: { page?: PageId }) {
  return (
    <MotionConfig reducedMotion="user">
      {isIndustry(page) ? <IndustryPageLayout slug={page} /> : <HomePage />}
      <Footer demoMessage={isIndustry(page) ? industryPage(page).demoMessage : undefined} />
    </MotionConfig>
  );
}

function HomePage() {
  return (
    <>
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
    </>
  );
}

function IndustryPageLayout({ slug }: { slug: Parameters<typeof industryPage>[0] }) {
  const page = industryPage(slug);
  return (
    <>
      <Nav home={false} demoMessage={page.demoMessage} />
      <main>
        <IndustryView page={page} />
        <Outputs />
        <Faq items={page.faq} title={`${page.name}: questions, answered`} />
        <OtherIndustries current={page.slug} />
        <FinalCta demoMessage={page.demoMessage} />
      </main>
    </>
  );
}
