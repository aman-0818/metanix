export const contactInterests = ["AI products", "M-VCARA", "M-RESORA", "M-ORDENA", "System integration", "AI automation", "AI governance", "Help me identify the right approach"] as const;
export type ContactData = { name: string; email: string; company: string; role: string; industry: string; interest: string; challenge: string; acknowledged: boolean };
export type ContactErrors = Partial<Record<keyof ContactData, string>>;
export const emptyContact: ContactData = { name: "", email: "", company: "", role: "", industry: "", interest: "", challenge: "", acknowledged: false };
export function validateContact(data: ContactData): ContactErrors {
  const errors: ContactErrors = {};
  for (const key of ["name", "company", "role", "industry", "interest"] as const) {
    if (!data[key].trim()) errors[key] = `Please ${key === "industry" || key === "interest" ? "choose" : "enter"} your ${key === "interest" ? "area of interest" : key}.`;
    else if (data[key].length > 160) errors[key] = "Please use 160 characters or fewer.";
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim()) || data.email.length > 254) errors.email = "Please enter a valid work email address.";
  if (data.challenge.trim().length < 20) errors.challenge = "Please describe your challenge in at least 20 characters.";
  else if (data.challenge.length > 4000) errors.challenge = "Please use 4,000 characters or fewer.";
  if (!data.acknowledged) errors.acknowledged = "Please acknowledge the demonstration notice.";
  return errors;
}
export function parseContact(value: unknown): ContactData | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const keys = ["name", "email", "company", "role", "industry", "interest", "challenge"] as const;
  if (keys.some(key => typeof input[key] !== "string") || typeof input.acknowledged !== "boolean") return null;
  return { name: input.name as string, email: input.email as string, company: input.company as string, role: input.role as string, industry: input.industry as string, interest: input.interest as string, challenge: input.challenge as string, acknowledged: input.acknowledged as boolean };
}
