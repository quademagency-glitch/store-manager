import LegalLayout, { Clause, Sub } from './LegalLayout';
import { ENTITY, PRIVACY_VERSION, EFFECTIVE_DATE } from '../legal/entity';

/**
 * NOTE FOR THE OPERATOR
 *
 * Structured the way a data protection notice under Ghana's Data Protection
 * Act, 2012 (Act 843) is normally structured: the controller identified, the
 * categories of data itemised, a lawful basis given for each purpose, the
 * recipients named, retention stated as periods rather than as "as long as
 * necessary", and the data subject's rights set out with a route to exercise
 * them and a route to complain.
 *
 * Every category below was written against the real schema and the real list
 * of third-party services. Two facts in here are load-bearing and were checked
 * rather than assumed:
 *
 *   • The database is in Supabase's eu-north-1 region (Stockholm). Ghanaian
 *     retailers' customer data does not sit in Ghana. Clause 8 says so.
 *   • Error reporting is wired but has no DSN configured, so nothing is sent.
 *     Clause 7 lists it as not in use rather than quietly omitting it. If a DSN
 *     is ever set, that row has to change on the same day.
 *
 * It is not legal advice and no lawyer has reviewed it. The cheapest thing you
 * can do to make it stronger is register as a data controller with the Data
 * Protection Commission and put the number in entity.js — see the note there.
 *
 * Keep this in step with the code. If a new sub-processor is added, a new
 * category of data is collected, or a retention period changes, this page is
 * part of that change, not a follow-up to it.
 */
export default function Privacy() {
  return (
    <LegalLayout title="Privacy Policy" version={PRIVACY_VERSION} effective={EFFECTIVE_DATE}>
      <p>
        This notice explains what personal data we hold, why we hold it, who else sees it, how long
        we keep it, and what you can require us to do about it. It is given under the Data
        Protection Act, 2012 (Act 843).
      </p>

      <Clause n={1} title="Who we are">
        <Sub n="1.1">
          {ENTITY.legalName}, a {ENTITY.type} registered in {ENTITY.country} under registration
          number {ENTITY.registrationNumber}, of {ENTITY.address}, operates {ENTITY.product}.
        </Sub>
        <Sub n="1.2">
          Our registration with the Data Protection Commission is{' '}
          {ENTITY.dataControllerRegistration}.
        </Sub>
        <Sub n="1.3">
          For any question about this notice, or to exercise a right under clause 11, contact{' '}
          <a href={`mailto:${ENTITY.email.privacy}`}>{ENTITY.email.privacy}</a>.
        </Sub>
      </Clause>

      <Clause n={2} title="Two different relationships — and which one applies to you">
        <Sub n="2.1">
          This distinction decides who must answer a request about your data, so it comes first.
        </Sub>
        <Sub n="2.2">
          <strong>We are the data controller</strong> for the information belonging to the account
          itself: the business that subscribes, the people it invites as users, and its billing
          records. We decide how that is used, and this notice governs it.
        </Sub>
        <Sub n="2.3">
          <strong>We are a data processor</strong> for everything a subscribing business puts into
          the Service about other people — its customers, its staff, its suppliers. That business
          is the data controller. It decides what to collect and why; we store and process it on
          its instructions and for no purpose of our own.
        </Sub>
        <Sub n="2.4">
          So: if you are a shopper whose details a retailer recorded in {ENTITY.product},{' '}
          <strong>that retailer</strong> is who you ask, and who must answer you. We cannot lawfully
          decide on their behalf what happens to their records. We will help them find, correct,
          export or delete your data, and the{' '}
          <a href="/dpa">Data Processing Agreement</a> sets out what we are obliged to do.
        </Sub>
      </Clause>

      <Clause n={3} title="What we hold">
        <Sub n="3.1">
          As controller, for the account itself:
          <div className="legal-table-wrap">
            <table>
              <thead>
                <tr><th>Category</th><th>What it includes</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td>Business account</td>
                  <td>Business name, contact email and phone number, country, subscription plan and status.</td>
                </tr>
                <tr>
                  <td>Users</td>
                  <td>Name, email address, assigned role and permissions, assigned branches, and — where set — a manager PIN, stored only as an irreversible hash.</td>
                </tr>
                <tr>
                  <td>Billing</td>
                  <td>Invoices, payment references, subscription history. We do not hold card or mobile money numbers; those are entered on Paystack’s systems and never reach ours.</td>
                </tr>
                <tr>
                  <td>Security audit trail</td>
                  <td>Sign-ins and failed sign-ins, permission and role changes, account suspensions, data imports and exports — with the network (IP) address and browser the action came from.</td>
                </tr>
                <tr>
                  <td>Technical logs</td>
                  <td>Request and error logs used to keep the Service working and to diagnose faults, including IP address and request identifiers.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Sub>
        <Sub n="3.2">
          As processor, on behalf of a subscribing business: customer records (name, phone, email
          where recorded, purchase history, loyalty balance), product and inventory records, sales,
          returns, suppliers, purchase orders, invoices and payments, uploaded receipt images, and
          staff records including attendance.
        </Sub>
        <Sub n="3.3">
          <strong>Attendance and location.</strong> Where a business enables geofenced attendance,
          the Service records the location reported by the device at the moment a staff member
          clocks in or out, to check it falls within the branch’s radius. This is personal data
          about an identifiable employee. The employing business is the controller for it, is
          responsible for having a lawful basis, and should tell its staff. We do not use it for
          anything else and we do not track location continuously — only at those two moments.
        </Sub>
        <Sub n="3.4">
          We do not knowingly collect the special categories of personal data described in Act 843
          — such as data about health, ethnic origin, political opinion, religious belief or
          criminal record — and the Service provides no field for them. If a business enters such
          data into a free-text field, it does so as controller and on its own responsibility.
        </Sub>
      </Clause>

      <Clause n={4} title="Why we hold it, and our lawful basis">
        <Sub n="4.1">
          Act 843 requires processing to be justified. Ours is:
          <div className="legal-table-wrap">
            <table>
              <thead>
                <tr><th>Purpose</th><th>Basis under Act 843</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td>Providing the Service you subscribed to</td>
                  <td>Necessary for the performance of our contract with you</td>
                </tr>
                <tr>
                  <td>Taking payment and issuing invoices</td>
                  <td>Necessary for the performance of our contract with you</td>
                </tr>
                <tr>
                  <td>Keeping accounts secure; detecting and investigating misuse; the audit trail</td>
                  <td>Our legitimate interest in the security and integrity of the Service, and yours in the same</td>
                </tr>
                <tr>
                  <td>Diagnosing faults and keeping the Service working</td>
                  <td>Our legitimate interest in providing a functioning service</td>
                </tr>
                <tr>
                  <td>Service notices — billing, security, changes to these documents</td>
                  <td>Necessary for the performance of our contract with you</td>
                </tr>
                <tr>
                  <td>Keeping financial records</td>
                  <td>Compliance with a legal obligation</td>
                </tr>
                <tr>
                  <td>Processing customer, staff and supplier records held by a business</td>
                  <td>On the documented instructions of that business, as its processor</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Sub>
        <Sub n="4.2">
          <strong>We do not sell personal data.</strong> We do not use the contents of a business’s
          records for advertising, for profiling, or to train machine learning models. We do not
          share data between tenants.
        </Sub>
        <Sub n="4.3">
          Providing the information in clause 3.1 is a condition of having an account: without it
          we cannot create one, authenticate you, or bill you. Attendance location is optional and
          is collected only if the employing business turns geofencing on.
        </Sub>
      </Clause>

      <Clause n={5} title="The principles we apply">
        <Sub n="5.1">
          Act 843 sets out the principles a data controller must observe. In practice, for us, they
          mean: we take responsibility for the data we hold (<strong>accountability</strong>); we
          process it only where clause 4 gives us a basis (<strong>lawfulness</strong>); we collect
          it for the stated purposes only (<strong>specification of purpose</strong>); we do not
          later use it for something incompatible with those purposes
          (<strong>compatibility of further processing</strong>); we let you correct it and we act
          on corrections (<strong>quality of information</strong>); we publish this notice and keep
          it current (<strong>openness</strong>); we apply the measures in clause 10
          (<strong>data security safeguards</strong>); and we give you the rights in clause 11
          (<strong>data subject participation</strong>).
        </Sub>
      </Clause>

      <Clause n={6} title="Who sees it inside our organisation">
        <Sub n="6.1">
          Access within a subscribing business is controlled by role: a user sees only what their
          role permits, and role changes take effect on the next request.
        </Sub>
        <Sub n="6.2">
          On our side, access to production data is limited to the people who need it to operate
          and support the Service. Administrative actions are recorded in the audit trail described
          in clause 3.1, which the application itself cannot edit or delete.
        </Sub>
      </Clause>

      <Clause n={7} title="Who else processes it">
        <Sub n="7.1">
          These providers process data on our behalf so the Service can operate. Each is bound to
          process it only on our instructions.
          <div className="legal-table-wrap">
            <table>
              <thead>
                <tr><th>Provider</th><th>What it does</th><th>Where</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td>Supabase</td>
                  <td>Database, authentication, and storage of uploaded files</td>
                  <td>EU (Stockholm)</td>
                </tr>
                <tr>
                  <td>Railway</td>
                  <td>Hosting for the application servers</td>
                  <td>Outside Ghana</td>
                </tr>
                <tr>
                  <td>Vercel</td>
                  <td>Hosting and delivery of the web application</td>
                  <td>Global edge network</td>
                </tr>
                <tr>
                  <td>Paystack</td>
                  <td>Subscription payments. Receives your billing email and payment details, which you enter on its systems.</td>
                  <td>Nigeria / Ghana</td>
                </tr>
                <tr>
                  <td>Resend</td>
                  <td>Transactional email — invoices, account and security notices</td>
                  <td>Outside Ghana</td>
                </tr>
                <tr>
                  <td>Sentry</td>
                  <td>Error reporting. <strong>Not currently in use</strong> — the integration exists but is not enabled, and no data is sent to it. If we enable it we will update this table first.</td>
                  <td>—</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Sub>
        <Sub n="7.2">
          We will also disclose data where we are required to by law, by a court, or by a
          regulator; and to a buyer if the business is sold, in which case this notice continues to
          apply until the buyer gives you its own.
        </Sub>
      </Clause>

      <Clause n={8} title="Where your data is stored">
        <Sub n="8.1">
          <strong>Your data is not stored in Ghana.</strong> The database and uploaded files are
          held in Supabase’s European region, in Stockholm, Sweden. The application servers and
          email provider also operate outside Ghana.
        </Sub>
        <Sub n="8.2">
          We say this plainly because it is the sort of thing people assume the other way round.
          The practical effect is that your data is held in a jurisdiction with a comprehensive
          data protection regime of its own, and our providers are bound by it in addition to their
          contracts with us.
        </Sub>
        <Sub n="8.3">
          If we move data to a different region we will update this clause and tell account owners
          before the move.
        </Sub>
      </Clause>

      <Clause n={9} title="How long we keep it">
        <Sub n="9.1">
          Act 843 requires that data is not kept longer than necessary. Our periods:
          <div className="legal-table-wrap">
            <table>
              <thead>
                <tr><th>What</th><th>Kept for</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td>Business records held for a subscribing business</td>
                  <td>As long as the account is open. After termination, 30 days for retrieval, then deleted — and in any event within 90 days.</td>
                </tr>
                <tr>
                  <td>Security audit trail</td>
                  <td>400 days, so a full year plus an audit cycle can be reviewed, then deleted automatically.</td>
                </tr>
                <tr>
                  <td>Financial records — invoices, payments</td>
                  <td>Six years, to meet tax and company law record-keeping obligations. Kept even after an account closes.</td>
                </tr>
                <tr>
                  <td>Technical and request logs</td>
                  <td>Short-lived, retained only as long as needed to diagnose faults.</td>
                </tr>
                <tr>
                  <td>Backups</td>
                  <td>Deleted data persists in backups until they rotate out. Restoring a backup does not reinstate data that was deleted on request.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Sub>
      </Clause>

      <Clause n={10} title="Security">
        <Sub n="10.1">
          We apply, in particular: role-based access control, so a user reaches only what their
          role permits; tenant isolation enforced at the database level, so one business cannot
          read another’s records; encryption of data in transit; sign-in credentials handled by our
          authentication provider and never stored by us in readable form; manager PINs stored only
          as irreversible hashes; secrets and credentials excluded from exports and redacted from
          logs and the audit trail; and an append-only audit trail of administrative actions.
        </Sub>
        <Sub n="10.2">
          We take backups so the Service can be restored after a failure. Backups are subject to
          the same access controls.
        </Sub>
        <Sub n="10.3">
          No system is perfectly secure, and we do not claim otherwise.
        </Sub>
      </Clause>

      <Clause n={11} title="If there is a security compromise">
        <Sub n="11.1">
          If personal data we hold is accessed or acquired by someone not authorised to have it, we
          will notify the Data Protection Commission and the people affected, as Act 843 requires,
          as soon as reasonably practicable after we establish what has happened.
        </Sub>
        <Sub n="11.2">
          Our notice will describe what happened, what data was involved, what we have done, and
          what you should do. Where we act as processor for a business, we will tell that business
          without undue delay so that it can meet its own obligations, and we will not notify its
          customers or staff directly unless it asks us to or the law requires it.
        </Sub>
      </Clause>

      <Clause n={12} title="Your rights">
        <Sub n="12.1">
          Under Act 843 you may:
          <ul>
            <li>ask whether we hold personal data about you, and ask for a copy of it;</li>
            <li>ask us to correct data that is inaccurate or incomplete;</li>
            <li>ask us to delete or block data we no longer have a basis to hold;</li>
            <li>object to processing that is causing or likely to cause you damage or distress;</li>
            <li>require us to stop processing your data for direct marketing;</li>
            <li>complain to the Data Protection Commission; and</li>
            <li>seek compensation through the courts for damage caused by a breach of the Act.</li>
          </ul>
        </Sub>
        <Sub n="12.2">
          A business owner can export the account’s data at any time from the admin area, without
          asking us, including after a subscription has lapsed. Exports exclude credentials and
          secrets, which are stored irreversibly and cannot be produced by anyone.
        </Sub>
        <Sub n="12.3">
          For anything else, write to{' '}
          <a href={`mailto:${ENTITY.email.privacy}`}>{ENTITY.email.privacy}</a>. We will respond
          within 30 days. We may ask you to confirm your identity first — we will not hand personal
          data to someone who has not shown they are entitled to it. We do not charge for a request
          unless it is manifestly unfounded or repetitive.
        </Sub>
        <Sub n="12.4">
          If your data was entered by a retailer using {ENTITY.product}, see clause 2.4: the
          request goes to them, not to us.
        </Sub>
      </Clause>

      <Clause n={13} title="Automated decisions and marketing">
        <Sub n="13.1">
          We do not make decisions about you by automated means that produce legal effects for you
          or similarly significantly affect you. Where the Service suspends an account for
          non-payment, that follows directly from the contract and can be reversed by paying.
        </Sub>
        <Sub n="13.2">
          We send service messages — billing, security, changes to these documents — because they
          are necessary to the contract, and you cannot opt out of them while you hold an account.
          We will not send you marketing without your consent, and any marketing we do send will
          carry a way to stop it.
        </Sub>
      </Clause>

      <Clause n={14} title="Cookies and local storage">
        <Sub n="14.1">
          We use browser storage only to make the Service work: to keep you signed in, to remember
          preferences such as your theme, and to hold data offline so the point of sale keeps
          working when the connection drops. These are first-party and strictly functional.
        </Sub>
        <Sub n="14.2">
          <strong>We use no advertising or third-party tracking cookies, and no analytics that
          profile you.</strong> Clearing browser storage signs you out and discards unsynchronised
          offline data.
        </Sub>
      </Clause>

      <Clause n={15} title="Children">
        <Sub n="15.1">
          The Service is for businesses and is not directed at children. We do not knowingly
          collect data about a child as part of the account relationship. If a business records a
          child’s details as a customer, it does so as controller and on its own responsibility.
        </Sub>
      </Clause>

      <Clause n={16} title="Complaints">
        <Sub n="16.1">
          Please raise a concern with us first at{' '}
          <a href={`mailto:${ENTITY.email.privacy}`}>{ENTITY.email.privacy}</a> — most are resolved
          quickly.
        </Sub>
        <Sub n="16.2">
          You have the right to complain to the <strong>Data Protection Commission</strong> of
          Ghana at any time, whether or not you have contacted us first, and we will cooperate with
          any investigation.
        </Sub>
      </Clause>

      <Clause n={17} title="Changes to this notice">
        <Sub n="17.1">
          The current version is always at <a href="/privacy">/privacy</a>, with its version number
          and effective date at the top.
        </Sub>
        <Sub n="17.2">
          If a change materially affects how we handle your data — a new purpose, a new recipient,
          a longer retention period — we will notify account owners by email at least 30 days
          before it takes effect.
        </Sub>
      </Clause>
    </LegalLayout>
  );
}
