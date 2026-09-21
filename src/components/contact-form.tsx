"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "@/components/site-link";
import { ArrowUpRight, LoaderCircle } from "lucide-react";
import { Button, Input, Select, Textarea } from "@/components/ui";
import { industries } from "@/content/site";
import { contactInterests, emptyContact, validateContact, type ContactData, type ContactErrors } from "@/lib/contact";

export function ContactForm({ initialInterest = "", initialChallenge = "" }: { initialInterest?: string; initialChallenge?: string }) {
  const matchedInterest = contactInterests.find(item => item.toLowerCase() === initialInterest.toLowerCase()) || "";
  const [data, setData] = useState<ContactData>({ ...emptyContact, interest: matchedInterest, challenge: initialChallenge.slice(0, 4000) });
  const [errors, setErrors] = useState<ContactErrors>({});
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; error: boolean } | null>(null);
  const form = useRef<HTMLFormElement>(null);
  function update<K extends keyof ContactData>(key: K, value: ContactData[K]) { setData(current => ({ ...current, [key]: value })); setErrors(current => ({ ...current, [key]: undefined })); setFeedback(null); }
  async function submit(event: FormEvent) {
    event.preventDefault(); setFeedback(null);
    const validation = validateContact(data); setErrors(validation);
    if (Object.keys(validation).length) { document.getElementById(`contact-${Object.keys(validation)[0]}`)?.focus(); return; }
    setPending(true);
    try {
      const response = await fetch("/api/contact", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      const result = await response.json();
      if (!response.ok) { setErrors(result.errors || {}); setFeedback({ message: result.error || "Please check the highlighted fields and try again.", error: true }); }
      else setFeedback({ message: result.message, error: false });
    } catch { setFeedback({ message: "We couldn’t check your enquiry. Your text is still here; please try again.", error: true }); }
    finally { setPending(false); }
  }
  return <div className="contact-form"><div className="form-demo-note"><strong>Demonstration form.</strong> You can review an enquiry here. Messages are not delivered or saved until the contact service is connected. Please use sample information.</div>
    <form ref={form} onSubmit={submit} noValidate aria-label="Enterprise consultation enquiry">
      <div className="grid-2"><Input id="contact-name" label="Full name" autoComplete="name" required maxLength={160} value={data.name} onChange={e => update("name", e.target.value)} error={errors.name} placeholder="Your name"/><Input id="contact-email" label="Work email" type="email" autoComplete="email" required maxLength={254} value={data.email} onChange={e => update("email", e.target.value)} error={errors.email} placeholder="you@company.com"/></div>
      <div className="grid-2"><Input id="contact-company" label="Company" autoComplete="organization" required maxLength={160} value={data.company} onChange={e => update("company", e.target.value)} error={errors.company} placeholder="Organisation name"/><Input id="contact-role" label="Role" autoComplete="organization-title" required maxLength={160} value={data.role} onChange={e => update("role", e.target.value)} error={errors.role} placeholder="Your role"/></div>
      <div className="grid-2"><Select id="contact-industry" label="Industry" required value={data.industry} onChange={e => update("industry", e.target.value)} error={errors.industry}><option value="">Select your industry</option>{industries.map(industry => <option key={industry.slug}>{industry.name}</option>)}<option>Another industry</option></Select><Select id="contact-interest" label="Area of interest" required value={data.interest} onChange={e => update("interest", e.target.value)} error={errors.interest}><option value="">Choose an area</option>{contactInterests.map(interest => <option key={interest}>{interest}</option>)}</Select></div>
      <Textarea id="contact-challenge" label="What challenge would you like to solve?" helper="Tell us about your process, systems, repetitive tasks and desired outcome. 20–4,000 characters." required minLength={20} maxLength={4000} rows={5} value={data.challenge} onChange={e => update("challenge", e.target.value)} error={errors.challenge} placeholder="Start with the work you want to improve…"/>
      <div><label className="form-consent"><input id="contact-acknowledged" type="checkbox" checked={data.acknowledged} onChange={e => update("acknowledged", e.target.checked)} aria-invalid={!!errors.acknowledged} aria-describedby={errors.acknowledged ? "consent-error" : undefined}/><span>I understand this is a demonstration and my enquiry will not be delivered. <Link href="/privacy">Privacy information</Link></span></label>{errors.acknowledged && <p className="consent-error" id="consent-error">{errors.acknowledged}</p>}</div>
      <div className="form-submit-row"><Button type="submit" disabled={pending} icon={pending ? <LoaderCircle aria-hidden="true"/> : <ArrowUpRight aria-hidden="true"/>}>{pending ? "Checking enquiry…" : "Review enquiry"}</Button><span>All fields are required.</span></div>
      <div aria-live="polite" aria-atomic="true">{feedback && <p className={`form-feedback${feedback.error ? " form-feedback--error" : ""}`}>{feedback.message}</p>}</div>
    </form>
  </div>;
}
