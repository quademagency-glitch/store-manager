import { useState } from "react";
import { Link } from "react-router-dom";
import { useRecordedAction } from "../hooks/useRecordedAction";
import BulkConsent from "../features/operations/BulkConsent";
import {
  WorkPage,
  Field,
  Badge,
  LoadState,
  Empty,
  ActionState,
  stamp,
  useRecords,
} from "../features/operations/WorkSurface";
const initial = { search: "", category: "", min_spend: 0, inactive_days: 0 };
export default function CustomerSegments() {
  const [filters, setFilters] = useState(initial),
    [applied, setApplied] = useState(initial),
    [channel, setChannel] = useState("sms"),
    [offset, setOffset] = useState(0);
  const audience = useRecords(
      `/operations/customers/segment?${new URLSearchParams({ ...applied, channel, offset })}`,
    ),
    campaigns = useRecords("/operations/customers/campaigns"),
    history = useRecords("/operations/customers/followups");
  const [campaign, setCampaign] = useState(null),
    [name, setName] = useState(""),
    [subject, setSubject] = useState(""),
    [message, setMessage] = useState(""),
    [preference, setPreference] = useState(null),
    [source, setSource] = useState(""),
    [allowed, setAllowed] = useState(false);
  const [followup, setFollowup] = useState(null),
    [followupCampaign, setFollowupCampaign] = useState(""),
    [result, setResult] = useState("planned"),
    [reference, setReference] = useState(""),
    [note, setNote] = useState("");
  const action = useRecordedAction("customer-work", (data, request) => {
    audience.refresh();
    campaigns.refresh();
    history.refresh();
    setPreference(null);
    setFollowup(null);
    if (["campaign", "review_campaign"].includes(request.body.action))
      setCampaign(data);
  });
  const locked = action.busy || !!action.pending || !action.ready;
  // Ticked rows belong to one page of one audience; changing the page,
  // channel or filters starts a fresh selection.
  const pageKey = `${channel}|${offset}|${JSON.stringify(applied)}`;
  const [picked, setPicked] = useState({ key: "", rows: {} });
  const selectedRows = picked.key === pageKey ? Object.values(picked.rows) : [];
  const pageRows = audience.data?.rows || [];
  const allPicked = pageRows.length > 0 && selectedRows.length === pageRows.length;
  const toggleRow = (row) =>
    setPicked((p) => {
      const rows = p.key === pageKey ? { ...p.rows } : {};
      if (rows[row.id]) delete rows[row.id];
      else rows[row.id] = row;
      return { key: pageKey, rows };
    });
  function edit(row) {
    setCampaign(row);
    setName(row.name);
    setChannel(row.channel);
    setSubject(row.subject);
    setMessage(row.message);
    setFilters({ ...initial, ...row.criteria });
    setApplied({ ...initial, ...row.criteria });
    setOffset(0);
  }
  return (
    <WorkPage
      title="Customers who may buy again"
      description="Build relevant follow-ups from purchase history and recorded contact preferences across this business."
      action={
        <Link className="btn btn-secondary" to="/crm-communications">
          Communication settings
        </Link>
      }
    >
      <ActionState action={action} />
      <section className="work-panel">
        <form
          className="work-form-grid"
          onSubmit={(e) => {
            e.preventDefault();
            setApplied(filters);
            setOffset(0);
          }}
        >
          <Field label="Customer name">
            <input
              className="form-input"
              value={filters.search}
              onChange={(e) =>
                setFilters({ ...filters, search: e.target.value })
              }
            />
          </Field>
          <Field label="Purchased category">
            <input
              className="form-input"
              placeholder="All categories"
              value={filters.category}
              onChange={(e) =>
                setFilters({ ...filters, category: e.target.value })
              }
            />
          </Field>
          <Field label="Minimum recorded spend">
            <input
              className="form-input"
              type="number"
              min="0"
              step="0.01"
              value={filters.min_spend}
              onChange={(e) =>
                setFilters({ ...filters, min_spend: Number(e.target.value) })
              }
            />
          </Field>
          <Field label="No purchase in this many days">
            <input
              className="form-input"
              type="number"
              min="0"
              max="3650"
              value={filters.inactive_days}
              onChange={(e) =>
                setFilters({
                  ...filters,
                  inactive_days: Number(e.target.value),
                })
              }
            />
          </Field>
          <button className="btn btn-secondary">Apply filters</button>
        </form>
      </section>
      <div className="work-columns">
        <section className="work-panel">
          <div className="work-row-head">
            <h2>Customer audience</h2>
            <Field label="Contact channel">
              <select
                className="form-input"
                value={channel}
                onChange={(e) => {
                  setChannel(e.target.value);
                  setOffset(0);
                }}
              >
                <option value="sms">SMS</option>
                <option value="email">Email</option>
                <option value="whatsapp">WhatsApp</option>
              </select>
            </Field>
          </div>
          <LoadState resource={audience} />
          {audience.data && (
            <>
              <div className="work-metrics">
                <div>
                  <strong>{audience.data.eligible}</strong>
                  <small>Eligible contacts</small>
                </div>
                <div>
                  <strong>
                    {audience.data.total - audience.data.eligible}
                  </strong>
                  <small>Excluded by preferences or contact details</small>
                </div>
              </div>
              <div className="work-table-wrap">
                <table className="work-table">
                  <thead>
                    <tr>
                      <th>
                        <span className="work-pick">
                          <input
                            type="checkbox"
                            aria-label="Select all customers on this page"
                            checked={allPicked}
                            disabled={!pageRows.length}
                            onChange={(e) =>
                              setPicked({
                                key: pageKey,
                                rows: e.target.checked ? Object.fromEntries(pageRows.map((r) => [r.id, r])) : {},
                              })
                            }
                          />
                          Customer
                        </span>
                      </th>
                      <th>Last purchase</th>
                      <th>Permission</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!audience.data.rows.length&&<tr className="empty-state-row"><td colSpan={4}><Empty>No customers match these filters.</Empty></td></tr>}
                    {audience.data.rows.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <span className="work-pick">
                            <input
                              type="checkbox"
                              aria-label={`Select ${row.name}`}
                              checked={!!(picked.key === pageKey && picked.rows[row.id])}
                              onChange={() => toggleRow(row)}
                            />
                            <span>
                              <strong>{row.name}</strong>
                              <small>
                                {Number(row.spent).toFixed(2)} recorded spend
                              </small>
                            </span>
                          </span>
                        </td>
                        <td>
                          {row.last_purchase
                            ? new Date(row.last_purchase).toLocaleDateString()
                            : "No completed purchase"}
                        </td>
                        <td>
                          <Badge>{row.preference}</Badge>
                        </td>
                        <td>
                          <div className="work-inline">
                            <button
                              className="btn btn-secondary"
                              disabled={locked}
                              aria-label={`Record ${channel} contact permission for ${row.name}`}
                              onClick={() => {
                                setPreference(row);
                                setAllowed(row.allowed);
                                setSource("");
                              }}
                            >
                              Record permission
                            </button>
                            <button
                              className="btn btn-secondary"
                              disabled={locked}
                              onClick={() => {
                                setFollowup(row);
                                setFollowupCampaign("");
                                setResult(
                                  row.eligible ? "planned" : "opted_out",
                                );
                                setReference("");
                                setNote("");
                              }}
                            >
                              Record follow-up
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="work-actions">
                <button
                  className="btn btn-secondary"
                  disabled={!offset}
                  onClick={() => setOffset(Math.max(0, offset - 100))}
                >
                  Previous
                </button>
                <span>
                  {audience.data.rows.length?offset + 1:0}–{offset + audience.data.rows.length} of{" "}
                  {audience.data.total}
                </span>
                <button
                  className="btn btn-secondary"
                  disabled={offset + 100 >= audience.data.total}
                  onClick={() => setOffset(offset + 100)}
                >
                  Next
                </button>
              </div>
            </>
          )}
          <BulkConsent
            channel={channel}
            selected={selectedRows}
            onClearSelection={() => setPicked({ key: "", rows: {} })}
            onRecorded={() => audience.refresh()}
          />
          {preference && (
            <form
              className="work-divider"
              onSubmit={(e) => {
                e.preventDefault();
                action.run("/operations/customers/actions", {
                  action: "preference",
                  customer_id: preference.id,
                  channel,
                  allowed,
                  source,
                });
              }}
            >
              <h3>
                {preference.name} · {channel} preference
              </h3>
              <Field label="Permission to contact">
                <select
                  className="form-input"
                  value={allowed ? "allowed" : "excluded"}
                  onChange={(e) => setAllowed(e.target.value === "allowed")}
                >
                  <option value="excluded">Do not contact</option>
                  <option value="allowed">Customer allows this channel</option>
                </select>
              </Field>
              <Field label="How and when this preference was obtained">
                <textarea
                  required
                  className="form-input"
                  maxLength={1000}
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                />
              </Field>
              <button className="btn btn-primary" disabled={locked}>
                Save preference
              </button>
            </form>
          )}
        </section>
        <section className="work-panel">
          <h2>Message draft</h2>
          {channel === "whatsapp" ? (
            <p className="workspace-status">
              WhatsApp permission is used for automatic receipts and payment reminders, set up in{" "}
              <Link to="/crm-communications">Marketing &amp; Comms, WhatsApp tab</Link>. Campaign drafts are for SMS and email.
            </p>
          ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              action.run("/operations/customers/actions", {
                action: "campaign",
                ...(campaign
                  ? { campaign_id: campaign.id, version: campaign.version }
                  : {}),
                name,
                subject,
                message,
                channel,
                criteria: applied,
              });
            }}
          >
            <fieldset className="workspace-fieldset" disabled={locked}>
              <Field label="Campaign name">
                <input
                  required
                  className="form-input"
                  maxLength={150}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </Field>
              {channel === "email" && (
                <Field label="Subject">
                  <input
                    className="form-input"
                    maxLength={200}
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                  />
                </Field>
              )}
              <Field label="Message">
                <textarea
                  required
                  className="form-input"
                  rows={7}
                  maxLength={5000}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Write a useful, relevant follow-up…"
                />
              </Field>
              <h3>Preview</h3>
              <div className="work-message-preview">
                {message || "Your message preview appears here."}
              </div>
              <p className="workspace-status">
                Saving or reviewing a campaign does not send it. Recheck current
                preferences before contacting customers.
              </p>
              <div className="work-actions">
                <button className="btn btn-primary">Save draft</button>
                {campaign?.status === "draft" && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() =>
                      action.run("/operations/customers/actions", {
                        action: "review_campaign",
                        campaign_id: campaign.id,
                        version: campaign.version,
                      })
                    }
                  >
                    Mark saved draft reviewed
                  </button>
                )}
              </div>
              {campaign && <Badge>{campaign.status}</Badge>}
            </fieldset>
          </form>
          )}
        </section>
      </div>
      {followup && (
        <section className="work-panel">
          <h2>Record follow-up · {followup.name}</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              action.run("/operations/customers/actions", {
                action: "followup",
                customer_id: followup.id,
                campaign_id: followupCampaign,
                status: result,
                provider_reference: reference,
                note,
              });
            }}
          >
            <fieldset disabled={locked} className="workspace-fieldset">
              <div className="work-form-grid">
                <Field label="Campaign">
                  <select
                    required
                    className="form-input"
                    value={followupCampaign}
                    onChange={(e) => setFollowupCampaign(e.target.value)}
                  >
                    <option value="">Choose campaign</option>
                    {campaigns.data?.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.name} · {row.channel}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Reported status">
                  <select
                    className="form-input"
                    value={result}
                    onChange={(e) => setResult(e.target.value)}
                  >
                    <option value="planned">Planned</option>
                    <option value="accepted">Provider accepted</option>
                    <option value="delivered">
                      Provider reports delivered
                    </option>
                    <option value="unconfirmed">Unconfirmed</option>
                    <option value="failed">Failed</option>
                    <option value="opted_out">Opted out</option>
                  </select>
                </Field>
                <Field label="Provider reference">
                  <input
                    required={["accepted", "delivered"].includes(result)}
                    className="form-input"
                    maxLength={250}
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                  />
                </Field>
              </div>
              <Field label="Source and evidence for this status">
                <textarea
                  required
                  className="form-input"
                  maxLength={2000}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </Field>
              <button className="btn btn-primary">
                Record reported result
              </button>
            </fieldset>
          </form>
          <p className="workspace-status">
            These are staff-recorded results. This action neither sends a
            message nor independently confirms delivery.
          </p>
        </section>
      )}
      <div className="work-columns">
        <section className="work-panel">
          <h2>Saved campaigns</h2>
          <LoadState resource={campaigns} />
          {campaigns.data?.map((row) => (
            <article className="work-row" key={row.id}>
              <div className="work-row-head">
                <strong>{row.name}</strong>
                <Badge>{row.status}</Badge>
              </div>
              <p>
                {row.channel} · {stamp(row.updated_at)}
              </p>
              <button
                className="btn btn-secondary"
                disabled={locked}
                onClick={() => edit(row)}
              >
                Open draft
              </button>
            </article>
          ))}
        </section>
        <section className="work-panel">
          <h2>Follow-up history</h2>
          <LoadState resource={history} />
          {history.data?.length === 0 && <Empty>No follow-ups recorded.</Empty>}
          {history.data?.map((row) => (
            <article className="work-row" key={row.id}>
              <strong>
                {row.customer?.name} · {row.campaign?.name}
              </strong>
              <p>
                <Badge>{row.status}</Badge> · {stamp(row.created_at)}
              </p>
              <p>{row.note}</p>
              {row.provider_reference && (
                <small>Provider reference: {row.provider_reference}</small>
              )}
            </article>
          ))}
        </section>
      </div>
    </WorkPage>
  );
}
