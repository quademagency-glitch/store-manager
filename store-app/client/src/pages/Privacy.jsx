import LegalLayout, { LegalSection } from './LegalLayout';

/**
 * NOTE FOR THE OPERATOR: this describes what the software actually does with
 * data — the categories below were written against the real schema and the
 * real list of third-party services, not from a template. It is not legal
 * advice, and it has not been reviewed by a lawyer. Have it reviewed before
 * relying on it, and keep it in step with the code: if a new sub-processor is
 * added or a new category of data is collected, this page has to change too.
 */
export default function Privacy() {
  return (
    <LegalLayout title="Privacy Policy" lastUpdated="19 August 2026">
      <p>
        QuadERP is a business management platform for retailers. This policy explains what
        information we hold, why, and what you can do about it. It is written to be read, not
        to be impressive.
      </p>

      <LegalSection title="Who is responsible for what">
        <p>
          There are two different relationships here, and the distinction matters.
        </p>
        <p>
          <strong className="text-slate-100">For your business account</strong> — the people you
          invite, your subscription, your billing — QuadERP decides how that information is used,
          and is responsible for it.
        </p>
        <p>
          <strong className="text-slate-100">For the data you put into QuadERP</strong> — your
          customers, your products, your sales, your staff records — <em>your business</em> decides
          what to collect and why. QuadERP stores and processes it on your instruction. If one of
          your customers asks what you hold about them, that request is yours to answer; we will
          help you extract the data, but we will not make decisions about it on your behalf.
        </p>
      </LegalSection>

      <LegalSection title="What we hold">
        <ul className="list-disc pl-6 space-y-2">
          <li>
            <strong className="text-slate-100">Account and staff</strong> — business name, contact
            email and phone, country, and for each staff member their name, email, role,
            assigned branches, and a manager PIN where one is set. PINs are stored hashed, never
            in readable form.
          </li>
          <li>
            <strong className="text-slate-100">Business records you enter</strong> — customers
            (name, phone, email where you record it, purchase history, loyalty balance),
            products, inventory, sales, returns, suppliers, purchase orders, invoices and
            payments, and uploaded receipt images.
          </li>
          <li>
            <strong className="text-slate-100">Staff attendance</strong> — clock-in and clock-out
            times, and where your business enables geofenced attendance, the location recorded at
            those moments. This is staff personal data and is worth telling your team about.
          </li>
          <li>
            <strong className="text-slate-100">Security records</strong> — an audit trail of
            sign-ins, permission changes, account suspensions and data exports, including the IP
            address and browser the action came from. This exists so that a disputed or
            unauthorised change can be traced.
          </li>
          <li>
            <strong className="text-slate-100">Technical logs</strong> — request logs and error
            reports used to keep the service working and to diagnose faults.
          </li>
        </ul>
        <p>
          We do not hold card numbers. Card details are entered on Paystack&apos;s own checkout
          and never reach our servers.
        </p>
      </LegalSection>

      <LegalSection title="Why we hold it">
        <p>
          To run the service you have asked for; to take payment for it; to keep your account
          secure and investigate misuse; and to meet record-keeping obligations. We do not sell
          your data, and we do not use the contents of your business records for advertising.
        </p>
      </LegalSection>

      <LegalSection title="Who else processes it">
        <p>These providers process data on our behalf so the service can operate:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li><strong className="text-slate-100">Supabase</strong> — database, sign-in, and file storage</li>
          <li><strong className="text-slate-100">Railway</strong> — hosting for the application servers</li>
          <li><strong className="text-slate-100">Vercel</strong> — hosting and delivery of the web app</li>
          <li><strong className="text-slate-100">Paystack</strong> — subscription payments</li>
          <li><strong className="text-slate-100">Resend</strong> — transactional email such as invoices and account notices</li>
        </ul>
        <p>
          Some of these operate outside Ghana, which means your data may be stored or processed
          abroad.
        </p>
      </LegalSection>

      <LegalSection title="How long we keep it">
        <p>
          Your business records are kept for as long as your account is active. Security audit
          records are kept for approximately 400 days, so that a full year plus an audit cycle
          can be reviewed. If you close your account, we delete your data within 90 days except
          where we are required to retain financial records for longer.
        </p>
      </LegalSection>

      <LegalSection title="Your rights">
        <p>
          Under Ghana&apos;s Data Protection Act, 2012 (Act 843) you may ask for a copy of the
          personal data we hold about you, ask us to correct it, or ask us to delete it. Business
          owners can export their account&apos;s data at any time from the admin area. To make any
          other request, or to complain, contact us using the details below. You also have the
          right to complain to the Data Protection Commission of Ghana.
        </p>
      </LegalSection>

      <LegalSection title="Security">
        <p>
          Access is controlled by role, so staff see only what their role permits. Data is
          encrypted in transit. Sign-in credentials are handled by Supabase and never stored by
          us in readable form. Administrative actions are recorded in an audit trail that the
          application itself cannot edit or delete. No system is perfectly secure, and we will
          tell affected customers promptly if we become aware of a breach involving their data.
        </p>
      </LegalSection>

      <LegalSection title="Contact">
        <p>
          Questions about this policy, or about data we hold, can be sent to{' '}
          <a href="mailto:quadem.agency@gmail.com" className="text-indigo-400 hover:text-indigo-300">
            quadem.agency@gmail.com
          </a>.
        </p>
      </LegalSection>

      <LegalSection title="Changes">
        <p>
          If this policy changes materially we will notify account owners by email before the
          change takes effect. The date at the top always reflects the current version.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
