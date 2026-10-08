import { useState } from "react";
import { api } from "../../lib/api";
import { useRecordedAction } from "../../hooks/useRecordedAction";
import { Field, ActionState } from "./WorkSurface";

const CHANNEL = { sms: "SMS", email: "email", whatsapp: "WhatsApp" };
const MAX_PER_REQUEST = 500;

/** Phone-like entries from pasted text or a CSV: any cell with 7+ digits. */
function phoneEntries(text) {
  const seen = new Set();
  for (const cell of text.split(/[\n\r,;\t]+/)) {
    const value = cell.trim().replace(/^"|"$/g, "");
    if ((value.match(/\d/g) || []).length >= 7) seen.add(value);
  }
  return [...seen];
}

/**
 * Record one contact permission for many customers: either the ticked rows on
 * the current page, or customers matched from a pasted or uploaded list of
 * phone numbers. Nothing is recorded until the matches are reviewed, and each
 * request is journalled with how the permission was obtained.
 */
export default function BulkConsent({ channel, selected, onClearSelection, onRecorded }) {
  const [mode, setMode] = useState(null);
  const [allowed, setAllowed] = useState(true);
  const [source, setSource] = useState("");
  const [list, setList] = useState("");
  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [done, setDone] = useState(null);
  const action = useRecordedAction("customer-consent", (data) => {
    setDone(data);
    setMode(null);
    setPreview(null);
    setList("");
    setSource("");
    onClearSelection();
    onRecorded();
  });
  const locked = action.busy || !!action.pending || !action.ready;
  const ids = mode === "import" ? preview?.matched.map((c) => c.id) || [] : selected.map((row) => row.id);
  const label = CHANNEL[channel] || channel;

  async function runPreview() {
    const phones = phoneEntries(list);
    setPreview(null);
    setPreviewError("");
    if (!phones.length) return setPreviewError("Paste or upload at least one phone number.");
    if (phones.length > 2000) return setPreviewError("Import up to 2,000 phone numbers at a time.");
    setPreviewing(true);
    try {
      setPreview(await api.post("/operations/customers/consent-preview", { phones }));
    } catch (err) {
      setPreviewError(err.message);
    } finally {
      setPreviewing(false);
    }
  }

  async function readFile(file) {
    if (!file) return;
    if (file.size > 250_000) return setPreviewError("Use a file under 250 KB.");
    setList(await file.text());
    setPreview(null);
  }

  const tooMany = ids.length > MAX_PER_REQUEST;
  return (
    <div className="work-divider">
      <div className="work-inline">
        <button
          type="button"
          className="btn btn-secondary"
          disabled={!selected.length || locked}
          onClick={() => { setMode("selected"); setDone(null); }}
        >
          Record permission for {selected.length} selected
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={locked}
          onClick={() => { setMode("import"); setDone(null); }}
        >
          Import a permission list
        </button>
      </div>
      <ActionState action={action} />
      {done && (
        <p role="status" className="workspace-status">
          Recorded {label} {done.allowed ? "permission" : "opt-out"} for {done.recorded} customer
          {done.recorded === 1 ? "" : "s"}.
        </p>
      )}
      {mode === "import" && (
        <div className="work-stack">
          <Field label="Phone numbers, one per line or as a CSV column">
            <textarea
              className="form-input"
              rows={5}
              value={list}
              onChange={(e) => { setList(e.target.value); setPreview(null); }}
              placeholder={"024 123 4567\n+233 55 999 9999"}
            />
          </Field>
          <Field label="Or upload a CSV or text file">
            <input className="form-input" type="file" accept=".csv,.txt,text/csv,text/plain" onChange={(e) => readFile(e.target.files?.[0])} />
          </Field>
          <button type="button" className="btn btn-secondary" disabled={previewing || !list.trim()} onClick={runPreview}>
            {previewing ? "Matching…" : "Match to customers"}
          </button>
          {previewError && <p role="alert" className="work-error">{previewError}</p>}
          {preview && (
            <div role="status" className="workspace-status">
              <p>
                <strong>{preview.matched.length}</strong> matched ·{" "}
                <strong>{preview.unmatched.length}</strong> not found ·{" "}
                <strong>{preview.invalid.length}</strong> not a valid number
              </p>
              {preview.unmatched.length + preview.invalid.length > 0 && (
                <details>
                  <summary>Numbers that will be skipped</summary>
                  <p>{[...preview.unmatched, ...preview.invalid].slice(0, 200).join(", ")}</p>
                </details>
              )}
            </div>
          )}
        </div>
      )}
      {(mode === "selected" || (mode === "import" && preview?.matched.length > 0)) && (
        <form
          className="work-stack"
          onSubmit={(e) => {
            e.preventDefault();
            if (!ids.length || tooMany) return;
            action.run("/operations/customers/consent", { customer_ids: ids, channel, allowed, source });
          }}
        >
          <h3>
            {label} permission for {ids.length} customer{ids.length === 1 ? "" : "s"}
          </h3>
          <Field label="Permission to contact">
            <select className="form-input" value={allowed ? "allowed" : "excluded"} onChange={(e) => setAllowed(e.target.value === "allowed")}>
              <option value="allowed">These customers allow this channel</option>
              <option value="excluded">Do not contact these customers</option>
            </select>
          </Field>
          <Field label="How and when this permission was obtained">
            <textarea
              required
              className="form-input"
              maxLength={1000}
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="e.g. Signed paper forms at the Osu shop, September 2026"
            />
          </Field>
          <p className="workspace-status">
            Record only permission these customers actually gave. This note is kept as your evidence.
          </p>
          {tooMany && <p role="alert" className="work-error">Record up to {MAX_PER_REQUEST} customers at a time. Split the list and import the rest separately.</p>}
          <button className="btn btn-primary" disabled={locked || !ids.length || tooMany}>
            Record for {ids.length} customer{ids.length === 1 ? "" : "s"}
          </button>
        </form>
      )}
    </div>
  );
}
