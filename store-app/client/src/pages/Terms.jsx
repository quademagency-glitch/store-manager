import LegalLayout, { Clause, Sub, Defined } from './LegalLayout';
import { ENTITY, TERMS_VERSION, EFFECTIVE_DATE, JURISDICTION } from '../legal/entity';

/**
 * NOTE FOR THE OPERATOR
 *
 * This is drafted in the form a commercial agreement is normally drafted in:
 * defined terms, numbered clauses, and the risk-allocation clauses (warranties,
 * indemnity, liability, termination) stated explicitly rather than left to be
 * implied. Every commercial fact in it, the 30-day trial, what a lapsed
 * subscription still permits, the export route, how suspension behaves, was
 * checked against the code, not copied from a template. Where the product does
 * not do something, the clause says so instead of promising it.
 *
 * It is not legal advice and no lawyer has reviewed it. Two things matter more
 * than the wording, and neither costs a legal fee:
 *
 *   1. Fill in `src/legal/entity.js`. An agreement that cannot identify its
 *      own party is the weakest kind there is.
 *   2. Clause 19 caps liability, but a sole proprietorship has no corporate
 *      veil: see the note in entity.js. Incorporating is the cheapest real
 *      protection available.
 *
 * When the commercial terms change: price, trial length, what a lapsed
 * account can still reach: change the clause AND bump TERMS_VERSION, so the
 * version recorded against each account still means something.
 */
export default function Terms() {
  return (
    <LegalLayout title="Terms of Service" version={TERMS_VERSION} effective={EFFECTIVE_DATE}>
      <p>
        These terms are a binding agreement. They set out what we owe you, what you owe us, and
        what happens when something goes wrong. Clauses <strong>17 to 19</strong> limit our
        liability to you and clause <strong>18</strong> asks you to cover certain claims. Please
        read those in particular.
      </p>

      <Clause n={1} title="Parties">
        <Sub n="1.1">
          This agreement is between <strong>{ENTITY.legalName}</strong>, a {ENTITY.type} registered
          in {ENTITY.country} under registration number {ENTITY.registrationNumber}, with its
          address at {ENTITY.address} (<strong>“we”</strong>, <strong>“us”</strong>,{' '}
          <strong>“our”</strong>), and the business that opens an account
          (<strong>“you”</strong>, <strong>“your”</strong>).
        </Sub>
        <Sub n="1.2">
          {ENTITY.product} is the name of the service. It is not a separate legal person, and
          nothing in this agreement is entered into with it.
        </Sub>
      </Clause>

      <Clause n={2} title="Definitions">
        <Sub n="2.1">In this agreement:</Sub>
        <Sub n="2.2">
          <dl>
            <Defined term="“Service”">
              the {ENTITY.product} software, made available over the internet, together with any
              documentation and support we provide with it.
            </Defined>
            <Defined term="“Your Data”">
              everything you or your Users put into the Service or generate through it: customer
              records, products, inventory, sales, returns, suppliers, purchase orders, invoices,
              staff records, attendance records and uploaded files.
            </Defined>
            <Defined term="“User”">
              a person you authorise to access the Service under your account, including your
              staff.
            </Defined>
            <Defined term="“Subscription”">
              a paid right to use the Service for a stated period.
            </Defined>
            <Defined term="“Subscription Period”">
              the period a Subscription is paid for in advance: monthly or annually, as selected.
            </Defined>
            <Defined term="“Personal Data”">
              has the meaning given in the Data Protection Act, 2012 (Act 843).
            </Defined>
            <Defined term="“Data Processing Agreement”">
              the terms at <a href="/dpa">/dpa</a>, which govern our handling of Personal Data
              contained in Your Data and form part of this agreement.
            </Defined>
          </dl>
        </Sub>
        <Sub n="2.3">
          Headings are for navigation and do not affect interpretation. “Including” means
          “including without limitation”. A reference to a statute includes any amendment or
          replacement of it.
        </Sub>
      </Clause>

      <Clause n={3} title="Acceptance and eligibility">
        <Sub n="3.1">
          You accept this agreement by creating an account or by using the Service. If you do not
          accept it, do not do either.
        </Sub>
        <Sub n="3.2">
          You confirm that you are at least 18 years old, that you are authorised to enter into
          this agreement on behalf of the business you register, and that the details you give us
          are accurate. If you register on behalf of a business, “you” means that business.
        </Sub>
        <Sub n="3.3">
          This agreement is concluded electronically. Under the Electronic Transactions Act, 2008
          (Act 772) an electronic record is not denied legal effect merely because it is
          electronic, and you agree not to dispute its validity on that ground.
        </Sub>
        <Sub n="3.4">
          We record the version of these terms in force when your account was created. That record
          is what determines which version applies to you.
        </Sub>
      </Clause>

      <Clause n={4} title="The Service and your right to use it">
        <Sub n="4.1">
          For as long as this agreement is in force and your account is in good standing, we grant
          you a non-exclusive, non-transferable, revocable right to access and use the Service for
          your own business purposes, subject to your plan’s limits.
        </Sub>
        <Sub n="4.2">
          That right is a right of access only. No software is sold or licensed to you for
          installation, and no rights are granted except those stated here.
        </Sub>
        <Sub n="4.3">
          You may not sub-license, resell, rent or white-label the Service, or make it available to
          anyone other than your Users, without our written agreement.
        </Sub>
      </Clause>

      <Clause n={5} title="Accounts, Users and security">
        <Sub n="5.1">
          You are responsible for everything done under your account, including everything done by
          your Users, whether or not you authorised it.
        </Sub>
        <Sub n="5.2">
          You must keep credentials confidential, must not share accounts between people, and must
          remove a User’s access promptly when they leave. You can suspend or delete a User at any
          time from the admin area and the change takes effect on their next request.
        </Sub>
        <Sub n="5.3">
          You must ensure your Users comply with this agreement. Anything this agreement requires
          of you applies equally to them.
        </Sub>
        <Sub n="5.4">
          Tell us without delay if you believe an account has been compromised.
        </Sub>
        <Sub n="5.5">
          The Service records an audit trail of security-relevant actions: sign-ins, permission
          changes, account suspensions, data imports and exports, including the network address
          the action came from. This exists so a disputed change can be traced, and the application
          cannot edit or delete it.
        </Sub>
      </Clause>

      <Clause n={6} title="Free trial">
        <Sub n="6.1">
          New businesses may use the Service free for 30 days. No payment details are required to
          start a trial.
        </Sub>
        <Sub n="6.2">
          A trial is provided as-is and without any warranty at all. Clause 17 applies to it in
          full, and our liability in respect of a trial is limited to the maximum extent the law
          allows.
        </Sub>
        <Sub n="6.3">
          At the end of the trial, access narrows as described in clause 9.2 unless you have
          started a Subscription. We do not charge you automatically when a trial ends, and we do
          not delete Your Data when it ends.
        </Sub>
        <Sub n="6.4">
          Trials are for evaluation by a business that has not used the Service before. We may
          withdraw a trial, or decline to offer one, where it is being used to avoid paying.
        </Sub>
      </Clause>

      <Clause n={7} title="Fees, taxes and payment">
        <Sub n="7.1">
          Fees are those shown for your plan when you subscribe. They are payable in advance for
          each Subscription Period and are charged in Ghana Cedis unless stated otherwise.
        </Sub>
        <Sub n="7.2">
          Fees are exclusive of value added tax and of any other levy, duty or withholding imposed
          by law on the supply. Where such an amount is chargeable, it is payable by you in
          addition to the fee.
        </Sub>
        <Sub n="7.3">
          Payments are processed by Paystack. Card and mobile money details are entered on
          Paystack’s systems and are never received or stored by us. Your use of that checkout is
          also subject to Paystack’s own terms.
        </Sub>
        <Sub n="7.4">
          Fees are non-refundable, including for a partly used Subscription Period. This does not
          apply where a refund is required by law, or where we have failed to provide the Service
          in a material respect and have not put it right within a reasonable time of you telling
          us.
        </Sub>
        <Sub n="7.5">
          If you believe an invoice is wrong, tell us within 30 days of its date. After that the
          invoice is treated as accepted, except for manifest error.
        </Sub>
      </Clause>

      <Clause n={8} title="Renewal, price changes and cancellation">
        <Sub n="8.1">
          A Subscription continues for successive Subscription Periods until cancelled.
        </Sub>
        <Sub n="8.2">
          You may cancel at any time from the billing area. Cancellation takes effect at the end of
          the Subscription Period you have already paid for; you keep access until then, and you
          are not charged again.
        </Sub>
        <Sub n="8.3">
          We may change our prices. We will give you at least 30 days’ notice by email before a
          change applies to you, and it will not take effect before the end of your current
          Subscription Period. If you do not accept the new price, you may cancel under clause 8.2
          before it takes effect.
        </Sub>
      </Clause>

      <Clause n={9} title="Non-payment, suspension and reduced access">
        <Sub n="9.1">
          We may suspend access where fees are unpaid, where your use is causing harm to the
          Service or to other customers, where we are required to by law, or where we reasonably
          suspect unauthorised or fraudulent use. Where circumstances allow, we will tell you
          first and give you a chance to put it right.
        </Sub>
        <Sub n="9.2">
          When a Subscription lapses or a trial ends without one, we do not lock you out. Your
          account narrows to sign-in, the billing area and the data export in clause 10.4, so that
          you can always either pay or retrieve your records. Suspension under clause 9.1 for
          harm, unlawfulness or fraud may be broader.
        </Sub>
        <Sub n="9.3">
          Suspension does not suspend your obligation to pay fees already due.
        </Sub>
        <Sub n="9.4">
          We do not delete Your Data because a Subscription has lapsed. Deletion happens only as
          described in clause 20.
        </Sub>
      </Clause>

      <Clause n={10} title="Your Data">
        <Sub n="10.1">
          Your Data is and remains yours. We claim no ownership of it.
        </Sub>
        <Sub n="10.2">
          You grant us a licence to host, copy, transmit, display and process Your Data strictly as
          needed to provide the Service, to keep it secure, to take backups, and to comply with the
          law. That licence is limited to those purposes, lasts as long as we hold the data, and
          ends when the data is deleted. We do not sell Your Data, and we do not use the contents of
          your business records to train models, to advertise, or for any purpose of our own.
        </Sub>
        <Sub n="10.3">
          You are responsible for Your Data: for having the right to collect it, for its accuracy,
          and for its lawfulness. This matters most for customer contact details, staff records and
          (where you enable geofenced attendance), the location recorded when staff clock in and
          out. Location data about an identifiable employee is Personal Data; you must have a lawful
          basis for collecting it and you must tell your staff you are doing so.
        </Sub>
        <Sub n="10.4">
          You can export Your Data at any time from the admin area, at any point in the life of your
          account, including after a Subscription has lapsed. Exports exclude credentials and
          secrets (manager PINs, API keys and payment gateway keys), which are stored in a form
          that cannot be reversed and are not recoverable by anyone, including us.
        </Sub>
        <Sub n="10.5">
          <strong>Keep your own copies.</strong> We take backups for our own operational recovery,
          and they are not a substitute for yours. We do not warrant that we can restore Your Data
          to a particular point in time, and clause 19 applies to any claim for lost data.
        </Sub>
      </Clause>

      <Clause n={11} title="Our intellectual property">
        <Sub n="11.1">
          The Service, and all intellectual property in it, belongs to us or to our licensors.
          Nothing in this agreement transfers any of it to you.
        </Sub>
        <Sub n="11.2">
          You may not copy, modify, translate, reverse engineer, decompile or attempt to derive the
          source code of the Service, except to the extent the law expressly permits despite this
          clause.
        </Sub>
        <Sub n="11.3">
          If you send us suggestions or feedback, we may use them without restriction and without
          owing you anything. You are not obliged to send us any.
        </Sub>
      </Clause>

      <Clause n={12} title="Acceptable use">
        <Sub n="12.1">You must not, and must not permit any User to:</Sub>
        <Sub n="12.2">
          <ul>
            <li>use the Service unlawfully, or to store or process unlawfully obtained data;</li>
            <li>
              access or attempt to access another customer’s data, or any part of the Service you
              have not been granted access to;
            </li>
            <li>
              probe, scan, penetration-test or otherwise test the security of the Service without
              our prior written consent;
            </li>
            <li>
              interfere with the Service, circumvent a rate limit or usage limit, or place a load on
              it that degrades it for others;
            </li>
            <li>
              upload malware, or content that is unlawful, defamatory, or infringes someone else’s
              rights;
            </li>
            <li>
              use the Service to send unsolicited marketing in breach of the Data Protection Act,
              2012 (Act 843) or the Electronic Communications Act, 2008 (Act 775);
            </li>
            <li>resell, rent or white-label the Service contrary to clause 4.3.</li>
          </ul>
        </Sub>
        <Sub n="12.3">
          We may apply technical limits (including rate limits) to protect the Service, and may
          act under clause 9.1 where this clause is breached.
        </Sub>
      </Clause>

      <Clause n={13} title="Third-party services">
        <Sub n="13.1">
          The Service depends on third parties, currently including Supabase (database, sign-in and
          file storage), Railway and Vercel (hosting), Paystack (payments) and Resend
          (transactional email). The current list is kept in the Privacy Policy.
        </Sub>
        <Sub n="13.2">
          We choose these providers with reasonable care and remain responsible to you for the
          Service as a whole, subject to clause 19. We are not responsible for a third-party
          service you connect to the Service yourself, or for the terms on which such a service is
          provided to you.
        </Sub>
        <Sub n="13.3">
          We may change provider. Where a change materially affects where Your Data is stored, we
          will update the Privacy Policy and tell account owners.
        </Sub>
      </Clause>

      <Clause n={14} title="Availability, support and changes to the Service">
        <Sub n="14.1">
          We aim to keep the Service available continuously, but we do not guarantee it and{' '}
          <strong>we do not currently offer a contractual uptime commitment</strong>. If you need
          one, contact us and we will discuss a separate agreement. Saying this plainly is more
          useful to you than a promise we have no monitoring in place to stand behind.
        </Sub>
        <Sub n="14.2">
          We may carry out maintenance. Where it is planned and likely to interrupt the Service, we
          will give reasonable notice.
        </Sub>
        <Sub n="14.3">
          Support is provided by email to {ENTITY.email.general} during normal business hours in{' '}
          {ENTITY.country}. No response time is guaranteed.
        </Sub>
        <Sub n="14.4">
          We may add, change or remove features. If we remove a feature you materially rely on, we
          will give at least 30 days’ notice, and if the removal materially reduces the Service’s
          value to you, you may cancel under clause 8.2 and receive a pro-rata refund of fees paid
          for the unused remainder of the Subscription Period.
        </Sub>
      </Clause>

      <Clause n={15} title="Data protection">
        <Sub n="15.1">
          Where Your Data contains Personal Data (your customers, your staff), you are the data
          controller and we are a data processor acting on your instructions, within the meaning of
          the Data Protection Act, 2012 (Act 843).
        </Sub>
        <Sub n="15.2">
          The <a href="/dpa">Data Processing Agreement</a> sets out how we handle that Personal
          Data, and forms part of this agreement. Where it conflicts with these terms in relation to
          Personal Data contained in Your Data, it prevails.
        </Sub>
        <Sub n="15.3">
          We are the data controller for your own account information: your business details,
          your Users’ identities, and your billing records. The{' '}
          <a href="/privacy">Privacy Policy</a> explains how we handle that.
        </Sub>
        <Sub n="15.4">
          If one of your customers or staff exercises a right under Act 843 against you, that
          request is yours to answer. We will give you reasonable assistance to find, correct,
          export or delete the data.
        </Sub>
      </Clause>

      <Clause n={16} title="Confidentiality">
        <Sub n="16.1">
          Each of us may learn confidential information about the other. Neither will disclose it,
          or use it other than for this agreement, without the other’s consent.
        </Sub>
        <Sub n="16.2">
          This does not apply to information that is public through no breach of this clause, that
          the recipient already had, that it develops independently, or that it is required by law
          or a regulator to disclose. Where disclosure is compelled, the recipient will tell the
          other party first if it is lawful to do so.
        </Sub>
        <Sub n="16.3">
          This clause continues for three years after this agreement ends.
        </Sub>
      </Clause>

      <Clause n={17} title="Warranties and disclaimers">
        <Sub n="17.1">
          We warrant that we will provide the Service with reasonable skill and care, and that we
          have the right to enter into this agreement.
        </Sub>
        <Sub n="17.2">
          Otherwise, and to the fullest extent the law allows, the Service is provided{' '}
          <strong>“as is”</strong> and <strong>“as available”</strong>, and we exclude all other
          warranties, conditions and terms, whether express, implied or statutory, including any
          implied warranty of merchantability, fitness for a particular purpose, or
          non-infringement.
        </Sub>
        <Sub n="17.3">
          In particular we do not warrant that the Service will be uninterrupted, timely, secure or
          error-free, that defects will be corrected, or that the Service will meet your
          requirements.
        </Sub>
        <Sub n="17.4">
          <strong>The Service is a business record-keeping tool, not professional advice.</strong>{' '}
          Its reports, ledgers, tax figures and stock valuations are calculated from what you
          enter. They are not accounting, tax or legal advice, and you remain responsible for your
          own statutory filings and for checking the figures before you rely on them.
        </Sub>
        <Sub n="17.5">
          Nothing in this clause excludes a warranty or condition that cannot lawfully be excluded.
        </Sub>
      </Clause>

      <Clause n={18} title="Indemnity">
        <Sub n="18.1">
          You will indemnify us against any claim brought against us by a third party, and any
          loss, damage, cost or expense we reasonably incur as a result, arising from:
          <ul>
            <li>Your Data, or our processing of it on your instructions;</li>
            <li>your or your Users’ breach of clause 12;</li>
            <li>your breach of the Data Protection Act, 2012 (Act 843) or of clause 10.3.</li>
          </ul>
        </Sub>
        <Sub n="18.2">
          This applies only if we tell you about the claim promptly, do not admit liability without
          your consent, and let you control the defence and settlement, provided that no
          settlement imposing a non-financial obligation on us is made without our consent, which
          will not be unreasonably withheld. We will give you reasonable assistance at your cost.
        </Sub>
      </Clause>

      <Clause n={19} title="Limitation of liability">
        <Sub n="19.1">
          Nothing in this agreement limits or excludes liability for death or personal injury
          caused by negligence, for fraud or fraudulent misrepresentation, or for anything else
          that cannot lawfully be limited or excluded. Clauses 19.2 to 19.4 are subject to this.
        </Sub>
        <Sub n="19.2">
          Neither of us is liable to the other for loss of profit, loss of revenue, loss of
          anticipated savings, loss of business or goodwill, or for any indirect or consequential
          loss, however caused.
        </Sub>
        <Sub n="19.3">
          <strong>
            Our total liability to you for all claims arising in any period of 12 consecutive
            months is limited to the total fees you paid us in that period.
          </strong>{' '}
          Where you are on a free trial and have paid nothing, our total liability is limited to
          GHS 500.
        </Sub>
        <Sub n="19.4">
          Clause 19.3 applies whether the claim is in contract, in tort (including negligence), for
          breach of statutory duty, or otherwise, and applies to all claims taken together rather
          than to each claim separately.
        </Sub>
        <Sub n="19.5">
          You must bring any claim within 12 months of becoming aware of the facts giving rise to
          it, to the extent the law permits a period to be agreed.
        </Sub>
        <Sub n="19.6">
          This clause allocates risk between us, and the fees reflect that allocation. It survives
          termination.
        </Sub>
      </Clause>

      <Clause n={20} title="Term, termination and what happens to your data">
        <Sub n="20.1">
          This agreement starts when you create an account and continues until ended under this
          clause.
        </Sub>
        <Sub n="20.2">
          You may end it at any time by cancelling under clause 8.2 and closing your account.
        </Sub>
        <Sub n="20.3">
          Either of us may end it immediately by written notice if the other commits a material
          breach that cannot be put right, or that can be but is not put right within 30 days of
          being asked in writing. We may also end it immediately if fees remain unpaid 30 days
          after we have asked for them.
        </Sub>
        <Sub n="20.4">
          On termination your right to use the Service ends and fees already due remain payable.
        </Sub>
        <Sub n="20.5">
          <strong>Export before you close your account.</strong> For 30 days after termination we
          will keep Your Data and let you export it on request. After that we delete it, and we
          delete it in any event within 90 days, except where we are required by law to keep
          particular records: principally financial records, which we keep for six years to
          meet the record-keeping obligations imposed by Ghanaian tax and company law. Deletion
          is not reversible.
        </Sub>
        <Sub n="20.6">
          Clauses 10.1, 11, 16, 17, 18, 19, 20.5, 23, 24 and 25 survive termination, together with
          any other clause that by its nature should.
        </Sub>
      </Clause>

      <Clause n={21} title="Force majeure">
        <Sub n="21.1">
          Neither of us is liable for failing to perform because of something beyond our reasonable
          control: including power or internet failure, the failure of a third-party provider
          named in clause 13.1, industrial action, government action, natural disaster or armed
          conflict. Payment obligations are not excused by this clause.
        </Sub>
        <Sub n="21.2">
          If such an event continues for more than 30 days, either of us may end this agreement by
          written notice, and we will refund fees paid for any period not provided.
        </Sub>
      </Clause>

      <Clause n={22} title="Changes to these terms">
        <Sub n="22.1">
          We may change these terms. The current version is always at{' '}
          <a href="/terms">/terms</a>, with its version number and effective date at the top.
        </Sub>
        <Sub n="22.2">
          If a change materially affects your rights or obligations, we will give account owners at
          least 30 days’ notice by email before it takes effect. Other changes take effect when
          published.
        </Sub>
        <Sub n="22.3">
          If you do not accept a material change, you may cancel under clause 8.2 before it takes
          effect. Continuing to use the Service after it takes effect means you accept it.
        </Sub>
        <Sub n="22.4">
          We will not apply a material change retrospectively to a Subscription Period you have
          already paid for.
        </Sub>
      </Clause>

      <Clause n={23} title="Notices">
        <Sub n="23.1">
          Notices to you are sent to the account owner’s email address. It is your responsibility
          to keep that address current, and a notice is treated as received on the day it is sent.
        </Sub>
        <Sub n="23.2">
          Notices to us are sent to {ENTITY.email.general}, or in writing to {ENTITY.address}. A
          notice ending this agreement or alleging a breach must also be sent in writing to that
          address.
        </Sub>
      </Clause>

      <Clause n={24} title="General">
        <Sub n="24.1">
          <strong>Assignment.</strong> You may not assign or transfer this agreement without our
          written consent, which we will not unreasonably withhold. We may assign it to a successor
          to our business, on notice to you.
        </Sub>
        <Sub n="24.2">
          <strong>Entire agreement.</strong> This agreement, the Data Processing Agreement and the
          Privacy Policy are the whole agreement between us and replace anything said or written
          before. Neither of us relies on any statement not set out in them. This does not limit
          liability for fraudulent misrepresentation.
        </Sub>
        <Sub n="24.3">
          <strong>Severability.</strong> If a clause is held unenforceable, it is modified to the
          least extent necessary to make it enforceable, or if that is not possible it is severed.
          The rest continues in force.
        </Sub>
        <Sub n="24.4">
          <strong>Waiver.</strong> A failure or delay in enforcing a right is not a waiver of it.
        </Sub>
        <Sub n="24.5">
          <strong>No partnership.</strong> Nothing here creates a partnership, joint venture,
          agency or employment relationship.
        </Sub>
        <Sub n="24.6">
          <strong>Third parties.</strong> Nobody other than you and us has any right to enforce
          this agreement.
        </Sub>
        <Sub n="24.7">
          <strong>Order of precedence.</strong> If there is a conflict, the Data Processing
          Agreement prevails on Personal Data contained in Your Data; otherwise these terms
          prevail.
        </Sub>
      </Clause>

      <Clause n={25} title="Governing law and disputes">
        <Sub n="25.1">
          This agreement, and any dispute arising out of it including a non-contractual one, is
          governed by the laws of {JURISDICTION}.
        </Sub>
        <Sub n="25.2">
          Before starting proceedings, each of us will try in good faith to resolve the dispute by
          negotiation for 30 days after one gives the other written notice of it. The parties may
          agree to refer the dispute to mediation under the Alternative Dispute Resolution Act,
          2010 (Act 798). This does not prevent either of us from seeking urgent injunctive relief
          at any time.
        </Sub>
        <Sub n="25.3">
          Subject to clause 25.2, the courts of {JURISDICTION} have exclusive jurisdiction.
        </Sub>
      </Clause>

      <Clause n={26} title="Contact">
        <Sub n="26.1">
          {ENTITY.legalName}, {ENTITY.address}, {ENTITY.country}.
        </Sub>
        <Sub n="26.2">
          Email{' '}
          <a href={`mailto:${ENTITY.email.general}`}>{ENTITY.email.general}</a> for questions about
          these terms, or{' '}
          <a href={`mailto:${ENTITY.email.billing}`}>{ENTITY.email.billing}</a> for billing.
        </Sub>
      </Clause>
    </LegalLayout>
  );
}
