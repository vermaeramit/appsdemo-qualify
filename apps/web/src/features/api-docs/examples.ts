import type { CreateLeadRequest, PlaybookConfig, PlaybookField } from '@qualify/shared';

/** Next month as YYYY-MM (the format month questions accept). */
function nextMonth(now: Date = new Date()): string {
  const date = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** What the API accepts for a question, in words. */
export function acceptedValues(field: PlaybookField): string {
  switch (field.type) {
    case 'choice':
      return `${(field.options ?? []).join(' · ')}${field.allowOther ? ' (or any other text)' : ''}`;
    case 'yes_no':
      return 'yes / no (also haan / nahi)';
    case 'number':
      return 'A number, e.g. 5';
    case 'date_month':
      return `Month as YYYY-MM, e.g. ${nextMonth()}, or "flexible"`;
    case 'range':
      return 'Free text, e.g. 50000-80000';
    case 'text':
      return 'Free text (up to 160 characters)';
  }
}

export function sampleAnswer(field: PlaybookField): string {
  switch (field.type) {
    case 'choice':
      return field.options?.[0] ?? 'Option';
    case 'yes_no':
      return 'yes';
    case 'number':
      return '5';
    case 'date_month':
      return nextMonth();
    case 'range':
      return '50000-80000';
    case 'text':
      return `Sample ${field.label.toLowerCase()}`;
  }
}

/** A realistic request body: two answers the lead "already gave" on the form. */
export function exampleLead(config: PlaybookConfig | undefined): CreateLeadRequest {
  const questions = config?.fields ?? [];
  const preferred = questions.filter((field) => field.type !== 'text').slice(0, 2);
  const chosen = preferred.length ? preferred : questions.slice(0, 1);
  return {
    phone: '+91 98123 45678',
    name: 'Rahul Sharma',
    source: 'meta_form',
    campaign: 'Summer campaign',
    ...(chosen.length
      ? { fields: Object.fromEntries(chosen.map((field) => [field.key, sampleAnswer(field)])) }
      : {}),
  };
}

const json = (value: unknown) => JSON.stringify(value, null, 2);

export function curlExample(baseUrl: string, body: CreateLeadRequest): string {
  return [
    `curl -X POST "${baseUrl}/v1/leads" \\`,
    '  -H "Authorization: Bearer $QUALIFY_API_KEY" \\',
    '  -H "Content-Type: application/json" \\',
    `  -d '${json(body).replace(/'/g, "'\\''")}'`,
  ].join('\n');
}

export function fetchExample(baseUrl: string, body: CreateLeadRequest): string {
  return `const response = await fetch('${baseUrl}/v1/leads', {
  method: 'POST',
  headers: {
    Authorization: \`Bearer \${process.env.QUALIFY_API_KEY}\`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(${json(body).replace(/\n/g, '\n  ')}),
});
const result = await response.json(); // { leadId, isNewLead, status: 'queued', ignoredFields }`;
}

/** Postman v2.1 collection with this workspace's base URL, questions and configuration. */
export function postmanCollection(baseUrl: string, config: PlaybookConfig | undefined) {
  const request = (method: string, path: string, body?: unknown, description?: string) => ({
    method,
    header: body === undefined ? [] : [{ key: 'Content-Type', value: 'application/json' }],
    url: {
      raw: `{{baseUrl}}/${path}`,
      host: ['{{baseUrl}}'],
      path: path.split('/'),
    },
    ...(body === undefined
      ? {}
      : { body: { mode: 'raw', raw: json(body), options: { raw: { language: 'json' } } } }),
    ...(description ? { description } : {}),
  });
  const lead = { ...exampleLead(config), phone: '{{myPhone}}' };

  return {
    info: {
      name: 'AppsDemo Qualify API',
      description:
        'Set the apiKey variable (Settings → API keys) and myPhone (your WhatsApp number with country code).',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    auth: { type: 'bearer', bearer: [{ key: 'token', value: '{{apiKey}}', type: 'string' }] },
    variable: [
      { key: 'baseUrl', value: baseUrl },
      { key: 'apiKey', value: '' },
      { key: 'myPhone', value: '+91XXXXXXXXXX' },
    ],
    item: [
      {
        name: 'Create lead (like a lead form)',
        request: request(
          'POST',
          'v1/leads',
          lead,
          'Creates or updates a lead and queues the WhatsApp opening. Returns 202.',
        ),
      },
      {
        name: 'Create lead (minimal)',
        request: request('POST', 'v1/leads', { phone: '{{myPhone}}', name: 'Rahul Sharma' }),
      },
      { name: 'Get agent configuration', request: request('GET', 'v1/playbook') },
      ...(config
        ? [
            {
              name: 'Publish agent configuration',
              request: request(
                'PUT',
                'v1/playbook',
                config,
                'Send the full configuration. Publishes a new version.',
              ),
            },
          ]
        : []),
    ],
  };
}

export function downloadJson(filename: string, data: unknown): void {
  const url = URL.createObjectURL(new Blob([json(data)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
