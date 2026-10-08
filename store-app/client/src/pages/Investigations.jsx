import { useState } from "react";
import { useAuthContext } from "../lib/AuthContext";
import { api } from "../lib/api";
import { useRecordedAction } from "../hooks/useRecordedAction";
import {
  WorkPage,
  Field,
  Badge,
  LoadState,
  Empty,
  ActionState,
  Evidence,
  stamp,
  useRecords,
} from "../features/operations/WorkSurface";
export default function Investigations() {
  const records = useRecords("/traceability/cases"),
    staff = useRecords("/traceability/staff"),
    labels = useRecords("/traceability/labels");
  const { hasPermission, user } = useAuthContext();
  const [selected, setSelected] = useState(null),
    [title, setTitle] = useState(""),
    [note, setNote] = useState(""),
    [assignee, setAssignee] = useState(""),
    [due, setDue] = useState(""),
    [status, setStatus] = useState("investigating");
  const [code, setCode] = useState(""),
    [newCode, setNewCode] = useState(""),
    [reason, setReason] = useState(""),
    [error, setError] = useState("");
  const action = useRecordedAction("investigation", () => {
    records.refresh();
    labels.refresh();
    setSelected(null);
    setTitle("");
    setNote("");
  });
  const locked = action.busy || !!action.pending || !action.ready;
  async function labelRequest(e) {
    e.preventDefault();
    setError("");
    try {
      const found = await api.get(
        `/traceability/lookup?code=${encodeURIComponent(code.trim())}`,
      );
      if (found.length !== 1)
        throw new Error("Scan a unique item code in this branch.");
      await action.run("/traceability/actions", {
        action: "request_label",
        unit_id: found[0].id,
        new_code: newCode.trim(),
        note: reason,
      });
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <WorkPage
      title="Review the evidence"
      description="Assign discrepancies, document findings and close investigations with a reviewed explanation."
    >
      <ActionState action={action} />
      <div className="work-columns">
        <section className="work-panel">
          <h2>Investigations</h2>
          <form
            className="work-search"
            onSubmit={(e) => {
              e.preventDefault();
              action.run("/traceability/actions", {
                action: "open_case",
                title,
              });
            }}
          >
            <Field label="New investigation">
              <input
                required
                className="form-input"
                maxLength={200}
                value={title}
                disabled={locked}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Describe the discrepancy"
              />
            </Field>
            <button className="btn btn-primary" disabled={locked}>
              Open case
            </button>
          </form>
          <LoadState resource={records} />
          {records.data?.length === 0 && (
            <Empty>No investigations in this branch.</Empty>
          )}
          {records.data?.map((row) => (
            <article className="work-row" key={row.id}>
              <div className="work-row-head">
                <strong>{row.title}</strong>
                <Badge>{row.status}</Badge>
              </div>
              <p>
                {row.assignee?.name || "Unassigned"} ·{" "}
                {row.due_date ? `Due ${row.due_date}` : "No deadline"}
              </p>
              <button
                className="btn btn-secondary"
                disabled={locked}
                onClick={() => {
                  setSelected(row);
                  setAssignee(row.assignee_id || "");
                  setDue(row.due_date || "");
                  setStatus(
                    row.status === "open" ? "investigating" : row.status,
                  );
                  setNote("");
                }}
              >
                Open evidence
              </button>
            </article>
          ))}
        </section>
        {selected && (
          <section className="work-panel">
            <h2>{selected.title}</h2>
            <ol className="work-timeline">
              {selected.notes?.map((row) => (
                <li key={row.id}>
                  <strong>{row.actor?.name || "Recorded staff member"}</strong>
                  <p>{row.note}</p>
                  <small>{stamp(row.created_at)}</small>
                </li>
              ))}
            </ol>
            {selected.status !== "resolved" ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  action.run("/traceability/actions", {
                    action: "update_case",
                    case_id: selected.id,
                    assignee_id: assignee || null,
                    due_date: due || null,
                    status,
                    note,
                  });
                }}
              >
                <fieldset className="workspace-fieldset" disabled={locked}>
                  <div className="work-form-grid">
                    <Field label="Assigned investigator">
                      <select
                        className="form-input"
                        value={assignee}
                        onChange={(e) => setAssignee(e.target.value)}
                      >
                        <option value="">Unassigned</option>
                        {staff.data?.map((row) => (
                          <option key={row.id} value={row.id}>
                            {row.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Review due">
                      <input
                        type="date"
                        className="form-input"
                        value={due}
                        onChange={(e) => setDue(e.target.value)}
                      />
                    </Field>
                    <Field label="Status">
                      <select
                        className="form-input"
                        value={status}
                        onChange={(e) => setStatus(e.target.value)}
                      >
                        <option value="open">Open</option>
                        <option value="investigating">Investigating</option>
                        {hasPermission("manage_business") && (
                          <option value="resolved">
                            Reviewed and resolved
                          </option>
                        )}
                      </select>
                    </Field>
                  </div>
                  <Field label="Evidence and findings">
                    <textarea
                      required
                      className="form-input"
                      maxLength={2000}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                  </Field>
                  <button className="btn btn-primary">Record findings</button>
                </fieldset>
              </form>
            ) : (
              <p className="work-notice">Resolved: {selected.resolution}</p>
            )}
            <Evidence key={selected.id} readOnly={selected.status==="resolved"} kind="case" id={selected.id} />
          </section>
        )}
      </div>
      <section className="work-panel">
        <h2>Tracking-label replacements</h2>
        <p className="workspace-status">
          The old code stays in the item history. Another business manager must
          approve each replacement.
        </p>
        {error && (
          <p role="alert" className="work-error">
            {error}
          </p>
        )}
        <form onSubmit={labelRequest}>
          <fieldset
            className="workspace-fieldset work-form-grid"
            disabled={locked}
          >
            <Field label="Current item code">
              <input
                required
                className="form-input"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </Field>
            <Field label="Unused replacement code">
              <input
                required
                className="form-input"
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
              />
            </Field>
            <Field label="Reason for replacement">
              <input
                required
                className="form-input"
                maxLength={2000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
            <button className="btn btn-secondary">Request replacement</button>
          </fieldset>
        </form>
        <LoadState resource={labels} />
        {labels.data?.map((row) => (
          <article className="work-row" key={row.id}>
            <div className="work-row-head">
              <strong>
                {row.old_code?.code} → {row.new_code?.code}
              </strong>
              <Badge>
                {row.approved_at ? "Replaced" : "Awaiting approval"}
              </Badge>
            </div>
            <p>
              {row.reason} · {row.requester?.name}
            </p>
            {!row.approved_at && hasPermission("manage_business") && row.requested_by === user?.id && (
              <p className="workspace-status">Waiting for another manager to approve.</p>
            )}
            {!row.approved_at && hasPermission("manage_business") && row.requested_by !== user?.id && (
              <button
                className="btn btn-secondary"
                disabled={locked}
                onClick={() =>
                  action.run("/traceability/actions", {
                    action: "approve_label",
                    label_id: row.id,
                  })
                }
              >
                Approve and replace label
              </button>
            )}
          </article>
        ))}
      </section>
    </WorkPage>
  );
}
