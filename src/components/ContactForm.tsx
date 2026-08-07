"use client";

import { useState, type FormEvent } from "react";
import { Loader2, Mail, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const CONTACT_EMAIL = "kumardevanshu3001@gmail.com";
const APP_NAME = "SeenTube";

const buildPlainMessage = (name: string, email: string, subject: string, message: string) =>
  [
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "  ARIGATO LABS · CONTACT",
    `  Product: ${APP_NAME}`,
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "",
    `From:     ${name}`,
    `Email:    ${email}`,
    `Subject:  ${subject}`,
    "",
    "Message",
    "-------",
    message,
    "",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    `Sent from ${APP_NAME} contact form`,
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  ].join("\n");

const buildHtmlMessage = (name: string, email: string, subject: string, message: string) => {
  const escape = (value: string) =>
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  return `
    <div style="font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#222;line-height:1.5">
      <p style="margin:0 0 4px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#FF385C;font-weight:700">Arigato Labs · Contact</p>
      <h1 style="margin:0 0 16px;font-size:22px">Product: ${escape(APP_NAME)}</h1>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr><td style="padding:8px 0;color:#717171;width:88px">From</td><td style="padding:8px 0;font-weight:600">${escape(name)}</td></tr>
        <tr><td style="padding:8px 0;color:#717171">Email</td><td style="padding:8px 0"><a href="mailto:${escape(email)}">${escape(email)}</a></td></tr>
        <tr><td style="padding:8px 0;color:#717171">Subject</td><td style="padding:8px 0;font-weight:600">${escape(subject)}</td></tr>
      </table>
      <div style="margin-top:18px;padding:14px 16px;border:1px solid #EBEBEB;border-radius:12px;background:#F7F7F7;white-space:pre-wrap">${escape(message)}</div>
      <p style="margin:18px 0 0;font-size:12px;color:#717171">Sent from the ${escape(APP_NAME)} contact form</p>
    </div>
  `.trim();
};

export default function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const accessKey = import.meta.env.PUBLIC_WEB3FORMS_KEY as string | undefined;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const trimmedSubject = subject.trim();
    const trimmedMessage = message.trim();
    if (!trimmedName || !trimmedEmail || !trimmedSubject || !trimmedMessage) {
      setError("Please fill in every field.");
      return;
    }

    if (!accessKey) {
      setError("Contact form is not configured yet. Email us directly instead.");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("https://api.web3forms.com/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          access_key: accessKey,
          subject: `[${APP_NAME}] ${trimmedSubject}`,
          from_name: `Arigato Labs · ${APP_NAME}`,
          name: trimmedName,
          email: trimmedEmail,
          replyto: trimmedEmail,
          message: buildPlainMessage(trimmedName, trimmedEmail, trimmedSubject, trimmedMessage),
          html: buildHtmlMessage(trimmedName, trimmedEmail, trimmedSubject, trimmedMessage),
        }),
      });
      const result = await response.json().catch(() => ({})) as { success?: boolean; message?: string };
      if (!response.ok || result.success === false) {
        throw new Error(result.message || "Could not send your message.");
      }
      setSent(true);
      setName("");
      setEmail("");
      setSubject("");
      setMessage("");
      toast.success("Message sent");
    } catch (caught) {
      const text = caught instanceof Error ? caught.message : "Could not send your message.";
      setError(text);
      toast.error("Message failed — please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <div className="rounded-xl border border-border bg-white p-6 sm:p-8">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
          <Mail className="h-5 w-5" />
        </div>
        <h2 className="mt-4 text-2xl font-bold">Message sent</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground sm:text-base">
          We’ll get back to you by email. You can also write anytime to{" "}
          <a className="font-semibold text-primary hover:underline" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>.
        </p>
        <Button type="button" className="mt-6" variant="outline" onClick={() => setSent(false)}>
          Send another message
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-border bg-white p-5 sm:p-7">
      <div className="space-y-1.5">
        <label htmlFor="contact-name" className="text-sm font-semibold">Name</label>
        <Input
          id="contact-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Your name"
          autoComplete="name"
          required
          disabled={submitting}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="contact-email" className="text-sm font-semibold">Email</label>
        <Input
          id="contact-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          required
          disabled={submitting}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="contact-subject" className="text-sm font-semibold">Subject</label>
        <Input
          id="contact-subject"
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          placeholder="How can we help?"
          required
          disabled={submitting}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="contact-message" className="text-sm font-semibold">Message</label>
        <textarea
          id="contact-message"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Tell us what’s on your mind…"
          rows={6}
          required
          disabled={submitting}
          className="flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>

      {error && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive" role="alert">
          {error}
        </p>
      )}

      {!accessKey && (
        <p className="rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-muted-foreground">
          Form delivery needs <code className="text-foreground">PUBLIC_WEB3FORMS_KEY</code> in env.
          Until then, email{" "}
          <a className="font-semibold text-primary hover:underline" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>.
        </p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <a
          href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(`SeenTube contact`)}`}
          className="text-sm font-medium text-muted-foreground hover:text-primary"
        >
          Or email {CONTACT_EMAIL}
        </a>
        <Button type="submit" disabled={submitting || !accessKey}>
          {submitting ? <Loader2 className="animate-spin" /> : <Send />}
          {submitting ? "Sending…" : "Send message"}
        </Button>
      </div>
    </form>
  );
}
