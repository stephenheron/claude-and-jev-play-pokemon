// Jev (TypeSafe's decision model) through OpenRouter's Decisions API: POST /api/alpha/decisions.
// The API key stays in the host; bots reach this only through the sandbox. Spending limits are set on the key in OpenRouter.

export type JevQuestion =
  | { type: 'choice'; instructions: unknown; criteria: Record<string, unknown> }
  | { type: 'noul'; instructions: unknown; criteria?: { true: unknown; false: unknown } }
  | { type: 'score'; instructions: unknown; criteria: unknown[] };

export type JevAnswer =
  | { type: 'choice'; choice: string; confidence?: number; probabilities?: Record<string, number> }
  | { type: 'noul'; noul: number }
  | { type: 'score'; score: number; confidence?: number; probabilities?: Record<string, number>; legend?: Record<string, unknown> };

export interface JevResponse {
  id?: string; model: string; provider?: string;
  answers: Record<string, JevAnswer>;
  usage: { cost?: number; input_tokens: number; output_tokens: number };
}

/** A refusal the bot should see (bad request, no key). */
export class JevError extends Error {}

const env = (name: string, dflt: number) => { const v = Number(process.env[name]); return Number.isFinite(v) && process.env[name] !== '' && process.env[name] !== undefined ? v : dflt; };

export class JevClient {
  readonly model = process.env.JEV_MODEL || 'typesafe/jev-1.13';
  readonly maxRequestBytes = 100_000; // Jev's context is 32k tokens; this keeps requests comfortably under it
  private url = `${process.env.JEV_BASE_URL || 'https://openrouter.ai'}/api/alpha/decisions`;
  private key = process.env.OPENROUTER_API_KEY;
  /** Calls and USD cost since the host started. */
  calls = 0;
  usd = 0;

  get available() { return !!this.key; }

  /** Ask Jev. `sessionId` groups a run's calls in OpenRouter's logs. */
  async decide(state: unknown, questions: Record<string, JevQuestion>, sessionId?: string): Promise<JevResponse> {
    if (!this.key) throw new JevError('Jev is not configured on this host (no OPENROUTER_API_KEY)');
    const body = JSON.stringify({ model: this.model, state, questions, ...(sessionId ? { session_id: sessionId } : {}), ...(process.env.JEV_ZDR === '1' ? { provider: { zdr: true } } : {}) });
    if (body.length > this.maxRequestBytes) throw new JevError(`Jev request is too big (${body.length} bytes, max ${this.maxRequestBytes})`);

    // retry rate limits, upstream errors and timeouts; a 4xx is the request's fault and goes back to the bot
    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await fetch(this.url, {
          method: 'POST',
          headers: { authorization: `Bearer ${this.key}`, 'content-type': 'application/json' },
          body,
          signal: AbortSignal.timeout(env('JEV_TIMEOUT_MS', 15_000)),
        });
      } catch (e) {
        if (attempt < 2) { await sleep(500 * 2 ** attempt); continue; }
        throw new Error(`Jev request failed: ${(e as Error).message}`);
      }
      const text = await res.text();
      if (res.ok) {
        const data = JSON.parse(text) as JevResponse;
        this.calls++;
        this.usd += data.usage?.cost ?? 0;
        return data;
      }
      const msg = (() => { try { return JSON.parse(text).error?.message ?? text; } catch { return text; } })();
      if ((res.status === 429 || res.status >= 500) && attempt < 2) { await sleep(1000 * 2 ** attempt); continue; }
      if (res.status === 401 || res.status === 402 || res.status === 403) throw new Error(`Jev: OpenRouter refused the host's key (${res.status}: ${msg})`);
      throw new JevError(`Jev: ${res.status} ${String(msg).slice(0, 300)}`);
    }
  }

}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
