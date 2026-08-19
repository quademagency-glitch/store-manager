import LegalLayout, { LegalSection } from './LegalLayout';

/**
 * NOTE FOR THE OPERATOR: written against how the product actually behaves —
 * the trial length, the suspension behaviour and the export route below all
 * match the code. It is not legal advice and has not been reviewed by a
 * lawyer. Have it reviewed before relying on it, and keep the commercial terms
 * in step with the billing logic if that changes.
 */
export default function Terms() {
  return (
    <LegalLayout title="Terms of Service" lastUpdated="19 August 2026">
      <p>
        These terms cover your use of QuadERP. By creating an account you agree to them. They are
        written plainly on purpose.
      </p>

      <LegalSection title="The service">
        <p>
          QuadERP provides point-of-sale, inventory, customer, staff and financial management
          software, delivered over the internet. We may add, change or remove features; if we
          remove something you rely on, we will give reasonable notice.
        </p>
      </LegalSection>

      <LegalSection title="Your account">
        <p>
          You are responsible for what happens under your account, including actions taken by
          staff you invite. Keep credentials secure and remove access promptly when someone
          leaves — you can suspend or delete a staff account at any time, and the change takes
          effect immediately.
        </p>
        <p>
          You must give accurate business details, and you must be entitled to act for the
          business you register.
        </p>
      </LegalSection>

      <LegalSection title="Trial and payment">
        <p>
          New businesses start on a 30-day free trial with no card required. After the trial you
          need an active subscription to keep using the service. Subscription fees are billed in
          advance for the period you choose, through Paystack.
        </p>
        <p>
          If a subscription lapses, your account narrows to sign-in, your billing page and your
          data export — deliberately, so you can always pay or retrieve your records. We do not
          delete your data when a subscription lapses.
        </p>
        <p>
          Fees are non-refundable except where required by law, or where we have clearly failed
          to provide the service.
        </p>
      </LegalSection>

      <LegalSection title="Your data">
        <p>
          Your business records remain yours. We store and process them to run the service and do
          not use them for any other purpose. You can export them at any time from the admin
          area, and we recommend doing so periodically regardless of your plans.
        </p>
        <p>
          You are responsible for the lawfulness of what you collect — in particular customer
          contact details and staff attendance records, including location data if you enable
          geofenced attendance. Tell your staff what you are recording.
        </p>
      </LegalSection>

      <LegalSection title="Acceptable use">
        <p>You agree not to:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>use the service unlawfully, or to store unlawfully obtained data</li>
          <li>attempt to access another business&apos;s data, or probe or disrupt the service</li>
          <li>resell or white-label the service without a written agreement</li>
          <li>automate access in a way that degrades the service for others</li>
        </ul>
        <p>
          We may suspend an account that is causing harm to the service or to others. Where
          circumstances allow, we will tell you first.
        </p>
      </LegalSection>

      <LegalSection title="Availability">
        <p>
          We aim to keep QuadERP available continuously, but we do not guarantee uninterrupted
          service. Maintenance, third-party outages and faults happen. We do not currently offer a
          contractual uptime guarantee; if you need one, talk to us.
        </p>
      </LegalSection>

      <LegalSection title="Liability">
        <p>
          The service is provided as is. To the extent the law allows, we are not liable for lost
          profits, lost sales or indirect losses, and our total liability in any 12-month period
          is limited to the fees you paid in that period.
        </p>
        <p>
          Nothing here limits liability for fraud, or for anything that cannot lawfully be
          limited.
        </p>
      </LegalSection>

      <LegalSection title="Ending the agreement">
        <p>
          You can stop using QuadERP and close your account at any time. Export your data first —
          once an account is deleted we cannot recover it. We may end the agreement for serious
          or repeated breach of these terms, or if fees remain unpaid after we have chased them.
        </p>
      </LegalSection>

      <LegalSection title="Changes to these terms">
        <p>
          We may update these terms. If a change materially affects you, we will notify account
          owners by email before it takes effect. Continuing to use the service after that means
          you accept the new version.
        </p>
      </LegalSection>

      <LegalSection title="Governing law">
        <p>
          These terms are governed by the laws of Ghana, and the courts of Ghana have
          jurisdiction over any dispute.
        </p>
      </LegalSection>

      <LegalSection title="Contact">
        <p>
          Questions about these terms can be sent to{' '}
          <a href="mailto:quadem.agency@gmail.com" className="text-indigo-400 hover:text-indigo-300">
            quadem.agency@gmail.com
          </a>.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
