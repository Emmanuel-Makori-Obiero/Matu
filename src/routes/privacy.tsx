// FILE: src/routes/privacy.tsx
// Public page — no auth required. Kenya Data Protection Act, 2019 (Act No. 24 of 2019)
// aligned. Keep this in sync with docs/legal/privacy-policy.docx / .pdf (same content,
// generated for download) whenever this changes.
import { createFileRoute, Link } from "@tanstack/react-router";
import { Bus, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy · Matu" },
      { name: "description", content: "How Matu collects, uses, and protects your data." },
    ],
  }),
  component: PrivacyPage,
});

const LAST_UPDATED = "13 July 2026";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="font-display text-lg font-semibold text-foreground">{title}</h2>
      <div className="mt-2 space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <Link to="/" className="flex items-center gap-2">
            <Bus className="size-5 text-primary" />
            <span className="font-display text-lg font-bold">Matu</span>
          </Link>
          <Link
            to="/"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" /> Back
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="font-display text-3xl font-bold text-foreground">Privacy Policy</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          Matu ("Matu", "we", "us") is operated by Thamana Solutions. This policy explains what
          personal data we collect from passengers, drivers, and SACCO admins on the Matu app, why
          we collect it, and the rights you have over it under Kenya's Data Protection Act, 2019. By
          using Matu, you agree to the collection and use of information as described here.
        </p>

        <Section title="1. Data we collect">
          <p>
            <strong>Account data:</strong> name, phone number, email, password (stored hashed),
            profile photo, and the role(s) on your account (passenger, driver, SACCO admin).
          </p>
          <p>
            <strong>Location data:</strong> your device's live location while booking a ride or, for
            drivers, while a trip is active. This is used to show nearby matatus, calculate ETAs,
            and match pickup stages. Drivers' location is only shared with passengers while a trip
            is in progress.
          </p>
          <p>
            <strong>Trip and booking data:</strong> routes searched, trips booked, seats reserved,
            pickup/dropoff stages, fares, and trip history.
          </p>
          <p>
            <strong>Payment data:</strong> M-Pesa transaction references, amounts, and status. Matu
            never receives, stores, or has access to your M-Pesa PIN. That is entered directly on
            your phone through Safaricom's own prompt, entirely outside the app.
          </p>
          <p>
            <strong>Vehicle and SACCO data (drivers/admins):</strong> vehicle registration,
            capacity, route assignments, and SACCO membership/commission records.
          </p>
          <p>
            <strong>Support data:</strong> messages you send through Support & complaints, and
            conversations with the in-app AI assistant.
          </p>
          <p>
            <strong>Device and usage data:</strong> device type, app version, and basic diagnostic
            logs used to fix bugs.
          </p>
        </Section>

        <Section title="2. Why we collect it">
          <p>
            We use your data to: operate core booking and payment features; show live vehicle
            locations and ETAs; verify identity and prevent fraud; process M-Pesa payments; respond
            to support requests and complaints; improve the app; and meet legal obligations (e.g.
            transport sector recordkeeping).
          </p>
        </Section>

        <Section title="3. Who we share it with">
          <p>We share data only where necessary to run the service:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>Safaricom M-Pesa</strong>: to process payments (transaction reference and
              amount only; never your PIN).
            </li>
            <li>
              <strong>Supabase</strong>: our database and backend infrastructure provider, which
              stores account, trip, and booking data securely.
            </li>
            <li>
              <strong>Mapbox and OpenStreetMap</strong>: for maps, routing, and place lookups. Only
              the location needed for that specific request is sent.
            </li>
            <li>
              <strong>Google (Gemini API)</strong>: powers the in-app AI assistant. Messages you
              send it are processed to generate a reply; the assistant only acts through verified
              app data, never external data about you.
            </li>
            <li>
              <strong>SACCOs</strong>: a SACCO admin can see trip, vehicle, and revenue data for
              vehicles registered under their SACCO, but not a passenger's personal account details
              beyond what's needed for a specific booking dispute.
            </li>
          </ul>
          <p>
            We do not sell personal data to third parties, and do not share it with advertisers.
          </p>
        </Section>

        <Section title="4. Data retention">
          <p>
            We retain account and trip data for as long as your account is active, and for a
            reasonable period after account deletion where required for legal, tax, or
            dispute-resolution purposes. When you delete your account, your profile, bookings, and
            related records are permanently deleted as described in Section 7. Some anonymized
            transaction records may be retained for financial recordkeeping as required by Kenyan
            law.
          </p>
        </Section>

        <Section title="5. Your rights">
          <p>
            Under the Data Protection Act, 2019, you have the right to: access the personal data we
            hold about you; request correction of inaccurate data; request deletion of your data
            (see Section 7); object to or restrict certain processing; and lodge a complaint with
            the Office of the Data Protection Commissioner (ODPC) Kenya if you believe your data has
            been mishandled.
          </p>
          <p>
            To exercise any of these rights, use Support & complaints in the app, or email us at the
            address in Section 9.
          </p>
        </Section>

        <Section title="6. Data security">
          <p>
            We use industry-standard safeguards: encrypted connections (HTTPS), access-controlled
            databases, and row-level security on account data, to protect your information. No
            system is 100% secure, and we encourage you to use a strong, unique password and never
            share your M-Pesa PIN with anyone, including anyone claiming to represent Matu.
          </p>
        </Section>

        <Section title="7. Deleting your account">
          <p>
            You can permanently delete your account from Account settings at any time. Deleting your
            account removes your profile, roles, bookings, payment references, and favorite routes.
            If you own a SACCO, deleting your account also deletes that SACCO and its vehicles. If
            you drive your own independently-registered vehicle, that vehicle record is deleted too.
            This action cannot be undone.
          </p>
        </Section>

        <Section title="8. Children">
          <p>
            Matu is not directed at children under 18. We do not knowingly collect data from anyone
            under 18. If you believe a minor has provided us data, contact us and we will delete it.
          </p>
        </Section>

        <Section title="9. Contact us">
          <p>Thamana Solutions, Nairobi, Kenya</p>
          <p>
            Email:{" "}
            <a className="text-primary underline" href="mailto:emmanuelmakobiero@gmail.com">
              emmanuelmakobiero@gmail.com
            </a>
          </p>
        </Section>

        <Section title="10. Changes to this policy">
          <p>
            We may update this policy as Matu's features change. We'll update the "Last updated"
            date above, and where changes are material, notify you in-app.
          </p>
        </Section>

        <div className="mt-10 flex gap-4 border-t border-border pt-6 text-sm">
          <Link to="/terms" className="text-primary underline">
            Terms of Service
          </Link>
          <Link to="/complaints" className="text-primary underline">
            Support & complaints
          </Link>
        </div>
      </main>
    </div>
  );
}
