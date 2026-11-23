import { appHref, demoHref, site } from './config';
import { FAQ, FEATURES, INDUSTRIES, OUTPUTS, SETUP, STEPS } from './content';
import { INDUSTRY_PAGES } from './industries';
import { LONG_DESCRIPTION, SECTION_IDS } from './meta';

/**
 * /llms.txt (llmstxt.org, D-103): the website in plain Markdown for AI assistants. Built from the
 * same content as the page, so the two never disagree.
 */
export function renderLlmsTxt(): string {
  const home = `${site.url}/`;
  const absolute = (href: string) => (/^https?:\/\//.test(href) ? href : `${site.url}${href}`);
  const section = (id: string) => `${home}#${id}`;

  return [
    `# ${site.productName}`,
    '',
    `> ${LONG_DESCRIPTION}`,
    '',
    `${site.productName} is a lead qualification engine, not a CRM. It works for any business that gets leads from ads or forms: the questions, scoring rules and wording are set per business. Results go to Excel, a CRM through webhooks, scheduled e-mail reports or a REST API.`,
    '',
    '## Pages',
    '',
    `- [Website](${home}): what it does, how it works, features, industries and FAQ`,
    `- [How it works](${section(SECTION_IDS.howItWorks)}): from a new lead to a scored lead in five steps`,
    `- [Features](${section(SECTION_IDS.features)})`,
    `- [Industries](${section(SECTION_IDS.industries)}): ready-made agents and the questions they ask`,
    `- [FAQ](${section(SECTION_IDS.faq)})`,
    ...INDUSTRY_PAGES.map(
      (page) =>
        `- [${page.title}](${absolute(`/${page.slug}`)}): the ready-made ${page.agentNoun} agent's questions, scoring and rules`,
    ),
    `- [Live demo on WhatsApp](${demoHref()}): chat with ${site.productName}'s own AI agent`,
    `- [Sign up](${absolute(appHref('/signup'))})`,
    '',
    '## How it works',
    '',
    ...STEPS.map((step, index) => `${index + 1}. **${step.title}.** ${step.body}`),
    '',
    '## Features',
    '',
    ...FEATURES.map((feature) => `- **${feature.title}:** ${feature.body}`),
    '',
    '## Ready-made agents (examples)',
    '',
    ...INDUSTRIES.map((industry) => `- **${industry.name}:** ${industry.questions.join(' ')}`),
    '',
    '## Where results go',
    '',
    ...OUTPUTS.map((output) => `- **${output.title}:** ${output.body}`),
    '',
    '## Getting started',
    '',
    ...SETUP.map((step, index) => `${index + 1}. **${step.title}.** ${step.body}`),
    '',
    '## FAQ',
    '',
    ...FAQ.flatMap((item) => [`### ${item.question}`, '', item.answer, '']),
  ].join('\n');
}
