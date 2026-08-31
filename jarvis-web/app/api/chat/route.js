import { NextResponse } from 'next/server';
import { runAgent } from '@/lib/agent';

export async function POST(req) {
  try {
    const { history } = await req.json();
    if (!Array.isArray(history) || history.length === 0) {
      return NextResponse.json({ error: 'Messaggio mancante.' }, { status: 400 });
    }
    const result = await runAgent(history);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  }
}
