/**
 * Vercel Edge / Next.js App Router webhook handler.
 * Drop into app/api/threetone/webhook/route.ts:
 */
import { verifyWebhook } from '../src/webhooks.js';

export const runtime = 'edge';

export async function POST(req: Request): Promise<Response> {
  try {
    const event = await verifyWebhook({
      payload: await req.text(),
      signature: req.headers.get('x-threetone-signature') ?? '',
      secret: process.env.THREETONE_WEBHOOK_SECRET ?? '',
    });

    switch (event.event) {
      case 'call_started':
        // handle new call
        break;
      case 'call_ended':
        // handle completion
        break;
      case 'call_transferred':
        break;
      case 'escalation_triggered':
        // route to a human agent
        break;
      case 'conversation_ended':
        break;
      default:
        // ignore unknown event names
        break;
    }
    return new Response('ok');
  } catch (err) {
    return new Response((err as Error).message, { status: 400 });
  }
}
