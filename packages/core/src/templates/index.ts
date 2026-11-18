import type { PlaybookConfig } from '@qualify/shared';
import { CLINIC_TEMPLATE_KEY, clinicPlaybookTemplate } from './clinic.ts';
import { EDUCATION_TEMPLATE_KEY, educationPlaybookTemplate } from './education.ts';
import { GENERAL_TEMPLATE_KEY, generalPlaybookTemplate } from './general.ts';
import { REAL_ESTATE_TEMPLATE_KEY, realEstatePlaybookTemplate } from './real-estate.ts';
import { TRAVEL_TEMPLATE_KEY, travelPlaybookTemplate } from './travel.ts';

export * from './clinic.ts';
export * from './education.ts';
export * from './general.ts';
export * from './real-estate.ts';
export * from './travel.ts';

/** A ready-made playbook for a kind of business. Industry knowledge lives only here. */
export interface PlaybookTemplate {
  key: string;
  name: string;
  description: string;
  build: (businessName: string) => PlaybookConfig;
}

export const PLAYBOOK_TEMPLATES: readonly PlaybookTemplate[] = [
  {
    key: GENERAL_TEMPLATE_KEY,
    name: 'Any business',
    description: 'What the lead needs, when, budget and city. A starting point for any business.',
    build: generalPlaybookTemplate,
  },
  {
    key: TRAVEL_TEMPLATE_KEY,
    name: 'Travel packages',
    description: 'Destination, travel month, travellers, departure city, budget, passport.',
    build: travelPlaybookTemplate,
  },
  {
    key: REAL_ESTATE_TEMPLATE_KEY,
    name: 'Real estate',
    description: 'Buy, rent or invest, property type, location, budget, timeline, site visit.',
    build: realEstatePlaybookTemplate,
  },
  {
    key: EDUCATION_TEMPLATE_KEY,
    name: 'Education and coaching',
    description: 'Course, current level, online or classroom, start time, demo class.',
    build: educationPlaybookTemplate,
  },
  {
    key: CLINIC_TEMPLATE_KEY,
    name: 'Clinic and healthcare',
    description: 'Concern, preferred visit, location, first visit. Never gives medical advice.',
    build: clinicPlaybookTemplate,
  },
];

export const DEFAULT_TEMPLATE_KEY = GENERAL_TEMPLATE_KEY;

/** The template for a key, or the "any business" one. */
export function findTemplate(key: string | null | undefined): PlaybookTemplate {
  return (
    PLAYBOOK_TEMPLATES.find((template) => template.key === key) ??
    PLAYBOOK_TEMPLATES.find((template) => template.key === DEFAULT_TEMPLATE_KEY)!
  );
}
