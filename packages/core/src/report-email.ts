/**
 * The scheduled e-mail report (FR-8.2, D-088): subject, HTML and plain text. Pure, so the worker
 * only gathers the numbers. Every value that comes from a lead or a user is escaped.
 */

export interface ReportLeadLine {
  name: string | null;
  phone: string;
  grade: string | null;
  score: number | null;
  /** The conversation summary, else the score reason. */
  note: string | null;
  origin: string | null;
  url: string;
}

export interface ReportEmailInput {
  productName: string;
  workspaceName: string;
  reportName: string;
  /** Local days, inclusive (YYYY-MM-DD). */
  period: { from: string; to: string };
  /** Which leads the report covers, e.g. "Hot and Warm leads · Premium agent"; null = all. */
  scope: string | null;
  summary: {
    total: number;
    hot: number;
    warm: number;
    cold: number;
    disqualified: number;
    unscored: number;
    qualified: number;
    handoffs: number;
  };
  /** Highest scores first (a few). */
  topLeads: readonly ReportLeadLine[];
  /** The dashboard's leads list for the same days. */
  leadsUrl: string;
  /** The Excel attached, or null when there are no leads. */
  attachment: { rows: number; capped: boolean } | null;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const GRADE_STYLE: Record<string, { label: string; color: string }> = {
  hot: { label: 'Hot', color: '#dc2626' },
  warm: { label: 'Warm', color: '#d97706' },
  cold: { label: 'Cold', color: '#2563eb' },
  disqualified: { label: 'Not a fit', color: '#6b7280' },
};

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Only http(s) links go into the e-mail. */
function safeUrl(url: string): string {
  return /^https?:\/\//i.test(url) ? url : '#';
}

const truncate = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;

const asDate = (day: string) => new Date(`${day}T00:00:00Z`);
const format = (day: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', ...options }).format(asDate(day));

/** "Tue, 17 Nov 2026", "16–22 Nov 2026", "November 2026" or "28 Oct – 3 Nov 2026". */
export function periodLabel(period: { from: string; to: string }): string {
  const { from, to } = period;
  if (from === to) {
    return format(from, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  }
  const start = asDate(from);
  const end = asDate(to);
  const nextDay = new Date(end.getTime() + 86_400_000);
  if (
    start.getUTCDate() === 1 &&
    nextDay.getUTCDate() === 1 &&
    from.slice(0, 7) === to.slice(0, 7)
  ) {
    return format(from, { month: 'long', year: 'numeric' });
  }
  if (from.slice(0, 7) === to.slice(0, 7)) {
    return `${start.getUTCDate()}–${format(to, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  }
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  return `${format(from, sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' })} – ${format(to, { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

const plural = (count: number, one: string, many: string) =>
  `${count.toLocaleString('en-IN')} ${count === 1 ? one : many}`;

export function renderReportEmail(input: ReportEmailInput): RenderedEmail {
  const when = periodLabel(input.period);
  const { summary } = input;
  const subject =
    summary.total === 0
      ? `${input.reportName}: no new leads · ${when}`
      : `${input.reportName}: ${plural(summary.total, 'new lead', 'new leads')}, ${summary.hot} Hot · ${when}`;

  const tiles: [string, number, string | null][] = [
    ['New leads', summary.total, null],
    ['Hot', summary.hot, GRADE_STYLE.hot!.color],
    ['Warm', summary.warm, GRADE_STYLE.warm!.color],
    ['Cold', summary.cold, GRADE_STYLE.cold!.color],
    ['Qualified', summary.qualified, null],
    ['Handed off', summary.handoffs, null],
  ];
  const tile = ([label, value, color]: [string, number, string | null]) =>
    `<td width="33%" style="padding:6px"><div style="border:1px solid #e5e7eb;border-radius:10px;padding:12px 14px">` +
    `<div style="font-size:12px;color:#6b7280">${escapeHtml(label)}</div>` +
    `<div style="font-size:24px;font-weight:700;color:${color ?? '#111827'}">${value.toLocaleString('en-IN')}</div>` +
    `</div></td>`;
  const tileRows = [tiles.slice(0, 3), tiles.slice(3)]
    .map((row) => `<tr>${row.map(tile).join('')}</tr>`)
    .join('');

  const leadRows = input.topLeads
    .map((lead) => {
      const grade = lead.grade ? GRADE_STYLE[lead.grade] : undefined;
      const badge = grade
        ? `<span style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:12px;font-weight:600;color:${grade.color};background:${grade.color}1a">${grade.label}${lead.score !== null ? ` · ${lead.score}` : ''}</span>`
        : `<span style="font-size:12px;color:#6b7280">Not scored</span>`;
      const note = lead.note
        ? `<div style="font-size:13px;color:#374151;margin-top:4px">${escapeHtml(truncate(lead.note, 180))}</div>`
        : '';
      const origin = lead.origin
        ? `<div style="font-size:12px;color:#6b7280;margin-top:2px">${escapeHtml(truncate(lead.origin, 80))}</div>`
        : '';
      return (
        `<tr><td style="padding:12px 0;border-top:1px solid #e5e7eb;vertical-align:top">` +
        `<a href="${escapeHtml(safeUrl(lead.url))}" style="font-weight:600;color:#111827;text-decoration:none">${escapeHtml(lead.name || lead.phone)}</a>` +
        (lead.name
          ? `<span style="font-size:13px;color:#6b7280"> · ${escapeHtml(lead.phone)}</span>`
          : '') +
        `${note}${origin}` +
        `</td><td style="padding:12px 0 12px 12px;border-top:1px solid #e5e7eb;vertical-align:top;text-align:right;white-space:nowrap">${badge}</td></tr>`
      );
    })
    .join('');

  const attachmentNote = input.attachment
    ? input.attachment.capped
      ? `The attached Excel has the first ${input.attachment.rows.toLocaleString('en-IN')} leads. Open the dashboard for the rest.`
      : `Every lead from this period is in the attached Excel (${plural(input.attachment.rows, 'row', 'rows')}): answers, score, summary and source.`
    : 'No new leads came in during this period.';

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:14px;padding:24px">
<tr><td>
<div style="font-size:12px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:#4f46e5">${escapeHtml(input.workspaceName)}</div>
<h1 style="margin:6px 0 2px;font-size:22px;line-height:1.3">${escapeHtml(input.reportName)}</h1>
<div style="font-size:14px;color:#6b7280">${escapeHtml(when)}${input.scope ? ` · ${escapeHtml(input.scope)}` : ''}</div>
</td></tr>
<tr><td style="padding-top:16px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 -6px">${tileRows}</table></td></tr>
${
  leadRows
    ? `<tr><td style="padding-top:20px"><div style="font-size:15px;font-weight:600;margin-bottom:4px">Top leads</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${leadRows}</table></td></tr>`
    : ''
}
<tr><td style="padding-top:20px;font-size:14px;color:#374151">${escapeHtml(attachmentNote)}</td></tr>
<tr><td style="padding-top:16px"><a href="${escapeHtml(safeUrl(input.leadsUrl))}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 18px;border-radius:8px">Open leads in the dashboard</a></td></tr>
</table>
<div style="max-width:600px;font-size:12px;color:#9ca3af;padding:14px 8px;line-height:1.5">
You receive this because ${escapeHtml(input.workspaceName)} added you to the report “${escapeHtml(input.reportName)}” in ${escapeHtml(input.productName)}. Ask them to change the recipients if you no longer need it.
</div>
</td></tr></table>
</body></html>`;

  const textLines = [
    `${input.reportName} · ${input.workspaceName}`,
    `${when}${input.scope ? ` · ${input.scope}` : ''}`,
    '',
    ...tiles.map(([label, value]) => `${label}: ${value}`),
    '',
    ...(input.topLeads.length
      ? [
          'Top leads',
          ...input.topLeads.map((lead) => {
            const grade = lead.grade
              ? (GRADE_STYLE[lead.grade]?.label ?? lead.grade)
              : 'Not scored';
            const score = lead.score !== null ? ` ${lead.score}` : '';
            const note = lead.note ? `\n  ${truncate(lead.note, 180)}` : '';
            const who = lead.name ? `${lead.name} (${lead.phone})` : lead.phone;
            return `- ${who} · ${grade}${score}${note}\n  ${lead.url}`;
          }),
          '',
        ]
      : []),
    attachmentNote,
    `Open leads: ${input.leadsUrl}`,
    '',
    `You receive this because ${input.workspaceName} added you to the report "${input.reportName}" in ${input.productName}.`,
  ];

  return { subject, html, text: textLines.join('\n') };
}
