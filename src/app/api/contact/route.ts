import { NextResponse } from "next/server";
import { parseContact, validateContact } from "@/lib/contact";

/** DEMONSTRATION STUB. Validates only; never stores, logs or sends contact data.
 * Connect a real delivery provider/CRM and update the UI/privacy copy before launch.
 */
export async function POST(request: Request) {
  if (!request.headers.get("content-type")?.includes("application/json")) return NextResponse.json({ error: "Please send a JSON request." }, { status: 415 });
  const body = await request.text();
  if (body.length > 16_000) return NextResponse.json({ error: "This enquiry is too large." }, { status: 413 });
  let value: unknown;
  try { value = JSON.parse(body); } catch { return NextResponse.json({ error: "The request could not be read." }, { status: 400 }); }
  const data = parseContact(value);
  if (!data) return NextResponse.json({ error: "Please complete all enquiry fields." }, { status: 400 });
  const errors = validateContact(data);
  if (Object.keys(errors).length) return NextResponse.json({ errors }, { status: 422 });
  return NextResponse.json({ demo: true, sent: false, message: "Your enquiry passed validation. This is a demonstration: no message has been sent or saved." }, { headers: { "Cache-Control": "no-store" } });
}
