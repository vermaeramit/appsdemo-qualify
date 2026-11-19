// Why a WhatsApp message failed, in words the team can act on. The status webhook stores
// { errors: [{ code, title }] }; a send that failed at once stores { message }.

const KNOWN: Record<number, string> = {
  131026: 'Not delivered: this number may not be on WhatsApp, or its WhatsApp app needs an update.',
  131047: 'Not delivered: the 24-hour window is closed, so only an approved template can be sent.',
  131049: 'Not delivered: Meta is limiting marketing messages to this person for now.',
  131042:
    'Not delivered: Meta could not charge for messages. Check the payment method, credit line and tax details in Billing Hub.',
};

export function deliveryErrorMessage(error: Record<string, unknown> | null): string {
  if (typeof error?.message === 'string') return error.message;
  const first: unknown = Array.isArray(error?.errors) ? error.errors[0] : undefined;
  if (first && typeof first === 'object') {
    const { code, title } = first as { code?: unknown; title?: unknown };
    if (typeof code === 'number' && KNOWN[code]) return KNOWN[code];
    if (typeof title === 'string' && title) {
      return `Not delivered: ${title}${typeof code === 'number' ? ` (Meta ${code})` : ''}`;
    }
  }
  return 'Not delivered';
}
