import Link from "@/components/site-link";
import { ArrowUpRight } from "lucide-react";
import { Brand } from "@/components/brand";

const groups = [
  { title: "Capabilities", links: [["AI products", "/products"], ["System integration", "/system-integration"], ["AI automation", "/ai-automation"], ["AI governance", "/enterprise-ai-governance"]] },
  { title: "Products", links: [["M-VCARA", "/products/m-vcara"], ["M-RESORA", "/products/m-resora"], ["M-ORDENA", "/products/m-ordena"]] },
  { title: "Matenix AI", links: [["Company", "/company"], ["Industries", "/industries"], ["Resources", "/resources"], ["Insights", "/insights"], ["Contact", "/contact"]] },
];
export function SiteFooter() {
  return <footer className="site-footer"><div className="container">
    <div className="footer-top"><div className="footer-brand"><Brand /><p>Enterprise AI.<br />Built for real work.</p><Link className="text-link" href="/contact">Let’s start a conversation <ArrowUpRight size={16} aria-hidden="true" /></Link></div>
      {groups.map(group => <div className="footer-group" key={group.title}><h2>{group.title}</h2><ul>{group.links.map(([label, href]) => <li key={href}><Link href={href}>{label}</Link></li>)}</ul></div>)}
    </div>
    <div className="footer-bottom"><span>© {new Date().getFullYear()} Matenix AI. All rights reserved.</span><div><Link href="/privacy">Privacy policy</Link><Link href="/terms">Terms</Link><Link href="/design-system">Design system</Link></div><span className="footer-signoff"><span className="status-dot" /> Intelligence, with intent.</span></div>
  </div></footer>;
}
