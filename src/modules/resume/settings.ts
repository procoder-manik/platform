import { z } from 'zod';
import { defineSettings } from '@/lib/settings/define';

const row = z.record(z.string(), z.unknown());

export const resumeSettings = defineSettings({
  key: 'resume',
  label: 'Resume',
  description: 'The printable resume page at /resume.',
  area: 'content',
  module: 'resume',
  schema: z.object({
    name: z.string().max(80), headline: z.string().max(140), summary: z.string().max(1200), photo: z.string().max(2000).nullable(),
    location: z.string().max(80), email: z.string().max(254), website: z.string().max(300),
    experience: z.array(row).max(30), education: z.array(row).max(20), skills: z.array(z.string()).max(60), certifications: z.array(row).max(30), languages: z.array(z.string()).max(20),
  }),
  defaults: { name: '', headline: '', summary: '', photo: null, location: '', email: '', website: '', experience: [], education: [], skills: [], certifications: [], languages: [] },
  fields: [
    { name: 'name', label: 'Name', type: 'text', maxLength: 80, width: 'half', tab: 'About', info: 'Your full name, the page heading.' },
    { name: 'headline', label: 'Headline', type: 'text', maxLength: 140, width: 'half', tab: 'About', info: 'For example "Full-stack developer".' },
    { name: 'summary', label: 'Summary', type: 'textarea', maxLength: 1200, tab: 'About', info: 'Three or four sentences about you.' },
    { name: 'photo', label: 'Photo', type: 'image', tab: 'About', info: 'Optional. Not printed.' },
    { name: 'location', label: 'Location', type: 'text', maxLength: 80, width: 'half', tab: 'About', info: 'City and country.' },
    { name: 'email', label: 'Email', type: 'text', maxLength: 254, width: 'half', tab: 'About', info: 'Shown on the resume. Leave empty to hide.' },
    { name: 'website', label: 'Website', type: 'text', maxLength: 300, tab: 'About', info: 'Shown on the printed copy.' },
    { name: 'experience', label: 'Role', type: 'repeater', tab: 'Experience', info: 'Most recent first.', fields: [
      { name: 'role', label: 'Role', type: 'text', required: true, maxLength: 100, width: 'half', info: 'Your job title.' },
      { name: 'company', label: 'Company', type: 'text', required: true, maxLength: 100, width: 'half', info: 'Where.' },
      { name: 'start', label: 'From', type: 'text', maxLength: 20, width: 'half', info: 'For example "2021".' },
      { name: 'end', label: 'To', type: 'text', maxLength: 20, width: 'half', info: 'For example "Present".' },
      { name: 'body', label: 'What you did', type: 'textarea', maxLength: 1000, info: 'Achievements, one per line.' },
    ] },
    { name: 'education', label: 'Education', type: 'repeater', tab: 'Education', info: 'Schools and degrees.', fields: [
      { name: 'school', label: 'School', type: 'text', required: true, maxLength: 120, width: 'half', info: 'Name of the school.' },
      { name: 'degree', label: 'Degree', type: 'text', maxLength: 120, width: 'half', info: 'What you studied.' },
      { name: 'years', label: 'Years', type: 'text', maxLength: 30, info: 'For example "2014 to 2018".' },
    ] },
    { name: 'skills', label: 'Skills', type: 'tags', tab: 'Skills', info: 'One skill per tag.' },
    { name: 'languages', label: 'Languages', type: 'tags', tab: 'Skills', info: 'For example "English (fluent)".' },
    { name: 'certifications', label: 'Certification', type: 'repeater', tab: 'Skills', info: 'Certificates and courses.', fields: [
      { name: 'name', label: 'Name', type: 'text', required: true, maxLength: 120, info: 'The certificate.' },
      { name: 'issuer', label: 'Issuer', type: 'text', maxLength: 120, width: 'half', info: 'Who issued it.' },
      { name: 'year', label: 'Year', type: 'text', maxLength: 10, width: 'half', info: 'When.' },
    ] },
  ],
});
