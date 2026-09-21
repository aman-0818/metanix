import { ContactForm } from "@/components/contact-form";
import { pageMetadata } from "@/lib/metadata";
export const metadata = pageMetadata("Talk to Matenix AI", "Discuss an enterprise AI product, system integration or a custom automation use case with Matenix AI.", "/contact");
export default async function ContactPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const interest = typeof query.interest === "string" ? query.interest : "";
  const process = typeof query.process === "string" ? query.process.slice(0, 160) : "";
  const challenge = typeof query.challenge === "string" ? query.challenge : "";
  return <section className="container section contact-layout"><div className="contact-copy"><span className="eyebrow">LET’S TALK / MATENIX AI</span><h1 className="display">Start with<br/>the work.<br/><span className="text-secondary">We’ll talk AI.</span></h1><p className="body-large text-secondary">A practical conversation about your business challenge, the systems you use and the outcome you need.</p><p className="text-secondary">From a single AI use case to a wider enterprise approach, we’ll help identify where products, integration or custom automation make sense.</p><ol className="contact-steps"><li><span>01</span>Share the process you want to improve.</li><li><span>02</span>Explore the right capabilities and integration scope.</li><li><span>03</span>Define an approach with your people in control.</li></ol></div><ContactForm initialInterest={interest} initialChallenge={`${process ? `Business process: ${process}\n\n` : ""}${challenge}`}/></section>;
}
