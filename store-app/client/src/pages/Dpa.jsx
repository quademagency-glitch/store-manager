import LegalLayout, { Clause, Sub } from './LegalLayout';
import { ENTITY, DPA_VERSION, EFFECTIVE_DATE, postalLine } from '../legal/entity';

/**
 * NOTE FOR THE OPERATOR
 *
 * The third document a business-to-business service needs, and the one most
 * often missing. The Terms govern the commercial deal; the Privacy Policy
 * covers data we control. This covers the much larger pile: the personal data
 * belonging to *our customers' customers and staff*, which we hold but do not
 * control.
 *
 * Why it is worth having rather than a nice-to-have: every subscribing business
 * is a data controller under the Data Protection Act, 2012 (Act 843), and the
 * Act requires a controller to have its processor bound in writing to process
 * only on its instructions and to keep the data secure. Without this document
 * every one of your customers is in breach the moment they sign up, and the
 * first customer with a compliance officer will ask for it. Publishing it and
 * incorporating it by reference into the Terms means it is already agreed,
 * rather than negotiated one customer at a time.
 *
 * The commitments here are real obligations. Clause 5's sub-processor list,
 * clause 7's security measures and clause 9's notification timing all describe
 * what the system actually does today. Do not strengthen the wording without
 * changing the system first — an undertaking you cannot meet is worse than a
 * modest one you can.
 *
 * It is not legal advice and no lawyer has reviewed it.
 */
export default function Dpa() {
  return (
    <LegalLayout title="Data Processing Agreement" version={DPA_VERSION} effective={EFFECTIVE_DATE}>
      <p>
        This agreement governs our handling of personal data that you put into {ENTITY.product}{' '}
        about other people: your customers, your staff, your suppliers. It forms part of the{' '}
        <a href="/terms">Terms of Service</a> and applies automatically to every account. You do not
        need to sign it separately.
      </p>
      <p>
        Terms defined in the Terms of Service have the same meaning here. “<strong>Act 843</strong>”
        means the Data Protection Act, 2012.
      </p>

      <Clause n={1} title="Roles">
        <Sub n="1.1">
          <strong>You are the data controller.</strong> You decide what personal data to collect
          about your customers and staff, and why. You are responsible for having a lawful basis
          for it, for telling those people what you collect, and for answering them when they ask.
        </Sub>
        <Sub n="1.2">
          <strong>We are the data processor.</strong> We hold and process that data on your
          instructions and for no purpose of our own.
        </Sub>
        <Sub n="1.3">
          Where we process data about your account and your users (who you are, who you invited,
          what you paid), we act as controller, and the{' '}
          <a href="/privacy">Privacy Policy</a> governs that instead.
        </Sub>
      </Clause>

      <Clause n={2} title="What is being processed">
        <Sub n="2.1">
          Act 843 expects the processing to be specified rather than described in general terms, so:
          <div className="legal-table-wrap">
            <table>
              <tbody>
                <tr>
                  <th>Subject matter</th>
                  <td>Providing the {ENTITY.product} service to you.</td>
                </tr>
                <tr>
                  <th>Duration</th>
                  <td>For as long as your account is open, plus the deletion period in clause 10.</td>
                </tr>
                <tr>
                  <th>Nature and purpose</th>
                  <td>Storage, retrieval, organisation, alteration, backup and deletion, so that you can run point of sale, inventory, customer, supplier, staff and financial management.</td>
                </tr>
                <tr>
                  <th>Types of personal data</th>
                  <td>Names; phone numbers; email addresses; purchase and returns history; loyalty balances; supplier contacts; staff names, roles and assigned branches; staff attendance times; and where you enable geofenced attendance, the device location recorded at clock-in and clock-out.</td>
                </tr>
                <tr>
                  <th>Categories of data subject</th>
                  <td>Your customers, your staff, and your suppliers’ contacts.</td>
                </tr>
                <tr>
                  <th>Special categories</th>
                  <td>None. The Service provides no field for the special categories described in Act 843, and we do not ask for them.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Sub>
      </Clause>

      <Clause n={3} title="Our obligations">
        <Sub n="3.1">
          We will process the data only on your documented instructions. Your use of the Service,
          and the Terms of Service, are your instructions. We will process it otherwise only where
          the law requires us to, in which case we will tell you first unless the law forbids that.
        </Sub>
        <Sub n="3.2">
          We will not use the data for any purpose of our own. We will not sell it, use it for
          advertising or profiling, use it to train machine learning models, or disclose it to
          another customer.
        </Sub>
        <Sub n="3.3">
          We will ensure that everyone we allow to access the data is bound by a duty of
          confidentiality.
        </Sub>
        <Sub n="3.4">
          If we consider an instruction from you to breach Act 843, we will tell you. We are not
          obliged to carry it out while that is unresolved.
        </Sub>
      </Clause>

      <Clause n={4} title="Your obligations">
        <Sub n="4.1">
          You warrant that you have a lawful basis under Act 843 for the data you put into the
          Service, and that you have given the people concerned whatever notice the Act requires.
        </Sub>
        <Sub n="4.2">
          You are responsible for the accuracy of the data, for who you grant access to, and for
          removing access when someone leaves.
        </Sub>
        <Sub n="4.3">
          <strong>Geofenced attendance in particular.</strong> Recording an identifiable employee’s
          location is processing of personal data, and enabling that feature is your decision, not
          ours. You must have a basis for it and you must tell your staff. We record location only
          at clock-in and clock-out, never continuously.
        </Sub>
      </Clause>

      <Clause n={5} title="Sub-processors">
        <Sub n="5.1">
          You authorise us to engage sub-processors. Each is bound by written terms no less
          protective than these, and we remain responsible to you for what they do.
        </Sub>
        <Sub n="5.2">
          Our current sub-processors are Supabase (database, authentication and file storage),
          Railway (application hosting), Vercel (web application hosting and delivery) and Resend
          (transactional email). Paystack processes your own billing data but does not process the
          data covered by this agreement.
        </Sub>
        <Sub n="5.3">
          We will give you at least 30 days’ notice by email before adding or replacing a
          sub-processor. If you reasonably object on data protection grounds within that period,
          we will discuss it with you; if we cannot resolve it, you may terminate the affected
          Subscription and we will refund fees paid for the unused remainder of the Subscription
          Period.
        </Sub>
      </Clause>

      <Clause n={6} title="Where the data is held">
        <Sub n="6.1">
          The database and uploaded files are held in the European Union, in Supabase’s Stockholm
          region. Application hosting and email are also outside Ghana.
        </Sub>
        <Sub n="6.2">
          You should assume, and tell your own customers and staff where you are required to, that
          their data leaves Ghana. We will tell you before we move it to a different region.
        </Sub>
      </Clause>

      <Clause n={7} title="Security">
        <Sub n="7.1">
          We maintain the measures described in the Privacy Policy, which as at the date of this
          version means in particular:
          <ul>
            <li>role-based access control, with changes taking effect on the next request;</li>
            <li>
              tenant isolation enforced in the database itself, so one business cannot read
              another’s records even if the application is wrong;
            </li>
            <li>encryption of data in transit;</li>
            <li>
              authentication credentials handled by our authentication provider and never stored by
              us in readable form; manager PINs stored only as irreversible hashes;
            </li>
            <li>
              secrets and credentials excluded from data exports and redacted from logs and the
              audit trail;
            </li>
            <li>an append-only audit trail of administrative actions that the application cannot alter;</li>
            <li>rate limiting and request size limits;</li>
            <li>regular backups, held under the same access controls.</li>
          </ul>
        </Sub>
        <Sub n="7.2">
          We may change these measures, provided the level of protection is not reduced.
        </Sub>
      </Clause>

      <Clause n={8} title="Helping you meet your obligations">
        <Sub n="8.1">
          If one of your customers or staff exercises a right under Act 843, that request is yours
          to answer. If they contact us directly we will not respond substantively; we will tell
          them to contact you, and tell you promptly.
        </Sub>
        <Sub n="8.2">
          We will give you reasonable assistance to answer such a request. In practice the Service
          already lets you do most of it yourself: you can search, correct and delete records
          directly, and export your account’s data at any time from the admin area without asking
          us.
        </Sub>
        <Sub n="8.3">
          We will give you reasonable assistance with a data protection impact assessment, or with
          a query from the Data Protection Commission, so far as it relates to our processing and
          the information is available to us.
        </Sub>
      </Clause>

      <Clause n={9} title="Security compromise">
        <Sub n="9.1">
          If we become aware that personal data we process for you has been accessed or acquired by
          someone not authorised to have it, we will tell you without undue delay, and in any event
          within 72 hours of establishing that it has happened.
        </Sub>
        <Sub n="9.2">
          We will tell you what happened, which categories of data and roughly how many records
          were involved, what we have done, and what we recommend you do, and we will keep you
          updated as we learn more, rather than waiting until we know everything.
        </Sub>
        <Sub n="9.3">
          Notifying the affected people and the Data Protection Commission is your decision and
          your obligation, since you are the controller. We will not notify them directly unless
          you ask us to or the law requires it, and we will give you the information you need to do
          it.
        </Sub>
      </Clause>

      <Clause n={10} title="Return and deletion">
        <Sub n="10.1">
          You can export your data at any time from the admin area, including after a subscription
          has lapsed. That is the return mechanism, and it does not depend on us doing anything.
        </Sub>
        <Sub n="10.2">
          After your account is terminated we keep the data for 30 days so you can still retrieve
          it, then delete it, and in any event within 90 days, except where the law requires us to
          keep particular records, principally financial records.
        </Sub>
        <Sub n="10.3">
          Deleted data persists in backups until those backups rotate out in the ordinary course.
          We do not restore deleted data from a backup, and it stays subject to clause 7 until it
          is gone.
        </Sub>
      </Clause>

      <Clause n={11} title="Audit">
        <Sub n="11.1">
          On reasonable written request, and no more than once in any 12 months unless a security
          compromise or a regulator requires otherwise, we will give you the information reasonably
          necessary to show we are meeting this agreement.
        </Sub>
        <Sub n="11.2">
          <strong>We do not offer on-site inspection of a shared, multi-tenant system</strong>, and
          you should be sceptical of a provider our size that says it does: letting one customer
          into an environment holding every other customer’s data would breach our obligations to
          them. We will answer a security questionnaire and provide what documentation we have.
        </Sub>
      </Clause>

      <Clause n={12} title="Liability and duration">
        <Sub n="12.1">
          The limits and exclusions in clause 19 of the Terms of Service apply to this agreement,
          and to both documents taken together rather than to each separately.
        </Sub>
        <Sub n="12.2">
          This agreement lasts as long as we process personal data for you. Clauses 3.2, 9, 10 and
          11 survive its end.
        </Sub>
        <Sub n="12.3">
          If this agreement conflicts with the Terms of Service on personal data covered by clause
          1.1, this agreement prevails.
        </Sub>
      </Clause>

      <Clause n={13} title="Contact">
        <Sub n="13.1">
          Data protection queries:{' '}
          <a href={`mailto:${ENTITY.email.privacy}`}>{ENTITY.email.privacy}</a>. {postalLine()}.
        </Sub>
      </Clause>
    </LegalLayout>
  );
}
