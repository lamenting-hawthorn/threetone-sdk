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

    switch (event.type) {
      case 'call.completed':
        // handle completion
        break;
      case 'call.failed':
        // handle failure
        break;
      default:
        // ignore unknown event types
        break;
    }
    return new Response('ok');
  } catch (err) {
    return new Response((err as Error).message, { status: 400 });
  }
}
