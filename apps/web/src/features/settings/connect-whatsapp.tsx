import { useState } from 'react';
import {
  type SignupConfig,
  signupConfigSchema,
  type SignupResult,
  signupResultSchema,
} from '@qualify/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleAlert, CircleCheck, Loader2, Plug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiSend, errorMessage, fetchJson } from '@/lib/api';
import { cn } from '@/lib/utils';

type Mode = 'coexistence' | 'cloud';

interface FacebookSdk {
  init(options: {
    appId: string;
    autoLogAppEvents: boolean;
    xfbml: boolean;
    version: string;
  }): void;
  login(
    callback: (response: { authResponse?: { code?: string } | null }) => void,
    options: Record<string, unknown>,
  ): void;
}

declare global {
  interface Window {
    FB?: FacebookSdk;
    fbAsyncInit?: () => void;
  }
}

let sdk: Promise<FacebookSdk> | null = null;

/** Loads Meta's JavaScript SDK once (only when someone connects a number). */
function loadFacebookSdk(config: SignupConfig): Promise<FacebookSdk> {
  sdk ??= new Promise<FacebookSdk>((resolve, reject) => {
    window.fbAsyncInit = () => {
      window.FB!.init({
        appId: config.appId!,
        autoLogAppEvents: true,
        xfbml: false,
        version: config.graphVersion,
      });
      resolve(window.FB!);
    };
    const script = document.createElement('script');
    script.src = 'https://connect.facebook.net/en_US/sdk.js';
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.onerror = () => {
      sdk = null;
      reject(new Error('Could not load Facebook. Check your connection or ad blocker.'));
    };
    document.body.appendChild(script);
  });
  return sdk;
}

interface SessionInfo {
  wabaId: string;
  phoneNumberId?: string;
}

/** Runs Embedded Signup v4 and resolves with the code and the account the customer picked. */
async function runSignup(
  config: SignupConfig,
  mode: Mode,
): Promise<{ code: string; session: SessionInfo }> {
  const facebook = await loadFacebookSdk(config);
  let session: SessionInfo | null = null;
  let failure: string | null = null;
  const onMessage = (event: MessageEvent) => {
    if (!event.origin.endsWith('facebook.com')) return;
    try {
      const data = JSON.parse(String(event.data)) as {
        type?: string;
        event?: string;
        data?: { waba_id?: string; phone_number_id?: string; error_message?: string };
      };
      if (data.type !== 'WA_EMBEDDED_SIGNUP') return;
      if (data.event?.startsWith('FINISH') && data.data?.waba_id) {
        session = {
          wabaId: data.data.waba_id,
          ...(data.data.phone_number_id ? { phoneNumberId: data.data.phone_number_id } : {}),
        };
      } else if (data.event === 'ERROR') {
        failure = data.data?.error_message ?? 'Meta reported an error';
      }
    } catch {
      // Other Facebook messages are not JSON.
    }
  };
  window.addEventListener('message', onMessage);
  try {
    const code = await new Promise<string>((resolve, reject) => {
      facebook.login(
        (response) => {
          const value = response.authResponse?.code;
          if (value) resolve(value);
          else reject(new Error(failure ?? 'The sign-up was closed before it finished.'));
        },
        {
          config_id: config.configId,
          response_type: 'code',
          override_default_response_type: true,
          extras:
            mode === 'coexistence'
              ? {
                  setup: {},
                  featureType: 'whatsapp_business_app_onboarding',
                  sessionInfoVersion: '3',
                }
              : { setup: {} },
        },
      );
    });
    // The account details can arrive just after the code.
    for (let wait = 0; !session && wait < 20; wait += 1) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (!session) throw new Error(failure ?? 'Meta did not say which WhatsApp account was picked.');
    return { code, session };
  } finally {
    window.removeEventListener('message', onMessage);
  }
}

const MODES: { value: Mode; title: string; description: string }[] = [
  {
    value: 'coexistence',
    title: 'My WhatsApp Business app number (recommended)',
    description:
      'Keep using the app on your phone. Your team can still reply there; the AI pauses for a lead when they do. Contacts and recent chats are synced.',
  },
  {
    value: 'cloud',
    title: 'A number only for the API',
    description:
      'A number not used in any WhatsApp app. It is registered with a 6-digit PIN that protects it.',
  },
];

/** Connect the workspace's own WhatsApp number with Meta's Embedded Signup (owners, managers). */
export function ConnectWhatsApp() {
  const queryClient = useQueryClient();
  const config = useQuery({
    queryKey: ['whatsapp', 'signup-config'],
    queryFn: () => fetchJson('/api/whatsapp/onboarding/config', signupConfigSchema),
  });
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('coexistence');
  const [pin, setPin] = useState('');
  const [result, setResult] = useState<SignupResult | null>(null);

  const connect = useMutation({
    mutationFn: async () => {
      const { code, session } = await runSignup(config.data!, mode);
      return apiSend(
        'POST',
        '/api/whatsapp/onboarding/complete',
        { code, mode, ...session, ...(mode === 'cloud' ? { pin } : {}) },
        signupResultSchema,
      );
    },
    onSuccess: async (connected) => {
      setResult(connected);
      await queryClient.invalidateQueries({ queryKey: ['whatsapp'] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  if (!config.data?.enabled) {
    return (
      <p className="text-xs text-muted-foreground">
        Connecting from here needs Meta&apos;s sign-up to be configured on the server
        (META_ES_CONFIG_ID). Until then, AppsDemo connects the number for you.
      </p>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          connect.reset();
          setResult(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <Plug data-icon="inline-start" />
          Connect WhatsApp
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Connect your WhatsApp number</DialogTitle>
          <DialogDescription>
            A Facebook window opens: sign in, pick your business and number, and allow access. The
            AI agent then answers your leads from this number.
          </DialogDescription>
        </DialogHeader>
        {result ? (
          <div className="space-y-3">
            <p className="flex items-center gap-2 text-sm font-medium text-success">
              <CircleCheck className="size-4" />
              Connected {result.displayPhone}
              {result.verifiedName ? ` (${result.verifiedName})` : ''}
            </p>
            <ul className="space-y-1 text-sm">
              {result.steps.map((step) => (
                <li key={step.name} className="flex items-start gap-2">
                  {step.ok ? (
                    <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" />
                  ) : (
                    <CircleAlert className="mt-0.5 size-4 shrink-0 text-grade-warm" />
                  )}
                  <span>
                    {step.name}
                    {!step.ok && step.detail && (
                      <span className="block text-xs text-muted-foreground">{step.detail}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex justify-end">
              <Button onClick={() => setOpen(false)}>Done</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2" role="radiogroup" aria-label="Which number">
              {MODES.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={mode === option.value}
                  onClick={() => setMode(option.value)}
                  className={cn(
                    'w-full rounded-lg border p-3 text-left transition-colors',
                    mode === option.value ? 'border-primary bg-primary/5' : 'hover:bg-muted/60',
                  )}
                >
                  <span className="block text-sm font-medium">{option.title}</span>
                  <span className="block text-xs text-muted-foreground">{option.description}</span>
                </button>
              ))}
            </div>
            {mode === 'cloud' && (
              <div className="space-y-1.5">
                <Label htmlFor="whatsapp-pin">6-digit PIN for the number</Label>
                <Input
                  id="whatsapp-pin"
                  inputMode="numeric"
                  maxLength={6}
                  value={pin}
                  onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))}
                />
                <p className="text-xs text-muted-foreground">
                  Keep it safe: WhatsApp asks for it if the number is registered again.
                </p>
              </div>
            )}
            {connect.isError && (
              <p className="text-sm text-destructive">
                {errorMessage(connect.error, 'Could not connect the number.')}
              </p>
            )}
            <div className="flex justify-end">
              <Button
                disabled={connect.isPending || (mode === 'cloud' && pin.length !== 6)}
                onClick={() => connect.mutate()}
              >
                {connect.isPending && <Loader2 className="animate-spin" data-icon="inline-start" />}
                Continue with Facebook
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
