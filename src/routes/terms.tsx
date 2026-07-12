// FILE: src/routes/terms.tsx
// Public page — no auth required. Keep in sync with docs/legal/terms-of-service.docx/.pdf.
import { createFileRoute, Link } from "@tanstack/react-router";
import { Bus, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service · Matu" },
      { name: "description", content: "The terms that govern your use of Matu." },
    ],
  }),
  component: TermsPage,
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

function TermsPage() {
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
        <h1 className="font-display text-3xl font-bold text-foreground">Terms of Service</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          These Terms govern your use of the Matu app, operated by Thamana Solutions ("Matu", "we",
          "us"). By creating an account or using Matu, you agree to these Terms. If you don't agree,
          please don't use the app.
        </p>

        <Section title="1. Who can use Matu">
          <p>
            You must be at least 18 years old, or the age of majority in your jurisdiction, to
            create a Matu account. By registering, you confirm the information you provide is
            accurate and that you'll keep it up to date.
          </p>
        </Section>

        <Section title="2. Accounts and roles">
          <p>
            A single account may hold one or more roles — passenger, driver, or SACCO admin. You're
            responsible for keeping your password confidential and for all activity under your
            account. Tell us immediately (via Support & complaints) if you suspect unauthorized
            access.
          </p>
        </Section>

        <Section title="3. Booking and fares">
          <p>
            Matu shows real-time seat availability and fares set by drivers/SACCOs for each trip.
            Fares shown at the time of booking are the fares charged. A reserved seat is held only
            until payment is completed or the trip departs, whichever comes first — Matu does not
            guarantee a seat stays reserved indefinitely.
          </p>
          <p>
            Matu is a booking and matching platform. The actual transport service is provided by
            independent drivers and SACCOs, not by Matu itself. We are not the carrier.
          </p>
        </Section>

        <Section title="4. Payments">
          <p>
            Payments are processed via M-Pesa. You authorize the charge shown at checkout by
            completing the Safaricom STK prompt on your own device. Matu never asks for your M-Pesa
            PIN in the app or in chat, including through the AI assistant — anyone asking you for it
            while claiming to represent Matu is not us.
          </p>
          <p>
            Refunds for cancelled or undelivered trips are handled case-by-case through Support &
            complaints, consistent with the circumstances of the specific trip.
          </p>
        </Section>

        <Section title="5. Driver and SACCO obligations">
          <p>
            Drivers and SACCOs using Matu are responsible for holding valid licenses, insurance, and
            roadworthy vehicles as required by Kenyan transport law (including NTSA and SACCO
            regulations), and for the safety and conduct of trips they operate. Matu may suspend or
            remove a driver or SACCO account for verified safety, fraud, or conduct violations.
          </p>
        </Section>

        <Section title="6. Passenger conduct">
          <p>
            Passengers agree to behave respectfully toward drivers and other passengers, to
            board/alight at the agreed stage, and not to use the platform for any unlawful purpose.
            Repeated no-shows or abuse reported through Support & complaints may result in account
            restrictions.
          </p>
        </Section>

        <Section title="7. The AI assistant">
          <p>
            Matu's in-app assistant can look up real routes, trips, and account information, and can
            book a seat or trigger a payment prompt on your behalf when you ask it to. It only acts
            using live data from the app — it does not invent routes, fares, or booking
            confirmations. You're responsible for reviewing what it books before confirming payment.
          </p>
        </Section>

        <Section title="8. Account deletion">
          <p>
            You may delete your account at any time from Account settings. This permanently removes
            your profile, bookings, and related records as described in our Privacy Policy, and
            cannot be undone.
          </p>
        </Section>

        <Section title="9. Limitation of liability">
          <p>
            Matu provides the platform "as is." To the maximum extent permitted by Kenyan law, Matu
            is not liable for the conduct of drivers, SACCOs, or passengers, for delays, missed
            connections, or losses arising from use of a third-party vehicle, or for indirect or
            consequential damages arising from use of the app. Nothing in these Terms limits
            liability that cannot be excluded under Kenyan law.
          </p>
        </Section>

        <Section title="10. Changes to the service or these Terms">
          <p>
            We may update Matu's features and these Terms over time. We'll update the "Last updated"
            date above, and notify you in-app for material changes. Continued use after a change
            means you accept the updated Terms.
          </p>
        </Section>

        <Section title="11. Governing law">
          <p>
            These Terms are governed by the laws of Kenya. Disputes will first be handled through
            Support & complaints; unresolved disputes are subject to the jurisdiction of the courts
            of Kenya.
          </p>
        </Section>

        <Section title="12. Contact us">
          <p>Thamana Solutions, Nairobi, Kenya</p>
          <p>
            Email:{" "}
            <a className="text-primary underline" href="mailto:emmanuelmakobiero@gmail.com">
              emmanuelmakobiero@gmail.com
            </a>
          </p>
        </Section>

        <div className="mt-10 flex gap-4 border-t border-border pt-6 text-sm">
          <Link to="/privacy" className="text-primary underline">
            Privacy Policy
          </Link>
          <Link to="/complaints" className="text-primary underline">
            Support & complaints
          </Link>
        </div>
      </main>
    </div>
  );
}
