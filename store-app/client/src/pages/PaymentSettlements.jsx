import { useState } from "react";
import { api } from "../lib/api";
import { useRecordedAction } from "../hooks/useRecordedAction";
import {
  WorkPage,
  Field,
  Badge,
  LoadState,
  Empty,
  ActionState,
  useRecords,
} from "../features/operations/WorkSurface";

// Returns carry no number of their own; the original receipt is what staff
// and customers will recognise.
const refundLabel = (r) =>
  `Refund for ${r.original_sale?.receipt_number || `sale ${r.original_sale_id?.slice(0, 8)}`}`;
export default function PaymentSettlements() {
  const records = useRecords("/operations/statements");
  const [provider, setProvider] = useState(""),
    [account, setAccount] = useState(""),
    [method, setMethod] = useState("mobile"),
    [preview, setPreview] = useState(null),
    [error, setError] = useState(""),
    [selected, setSelected] = useState(null),
    [target, setTarget] = useState(""),
    [note, setNote] = useState(""),
    [busy, setBusy] = useState(false);
  const action = useRecordedAction("provider-statements", () => {
    records.refresh();
    setPreview(null);
    setSelected(null);
  });
  const locked = action.busy || !!action.pending || !action.ready;
  async function read(file) {
    if (!file) return;
    setError("");
    setPreview(null);
    setBusy(true);
    try {
      if (file.size > 250000)
        throw new Error(
          "Use a CSV file under 250 KB, with no more than 500 rows.",
        );
      const result = await api.post("/operations/statements/preview", {
        csv: await file.text(),
      });
      setPreview(result.lines);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const lines = records.data?.lines || [],
    sales = records.data?.sales || [],
    refunds = records.data?.refunds || [];
  const matchedSales = new Set(
      lines.map((r) => r.matched_sale_id).filter(Boolean),
    ),
    matchedRefunds = new Set(
      lines.map((r) => r.matched_return_id).filter(Boolean),
    );
  const candidates = selected
    ? selected.direction === "payment"
      ? sales.filter(
          (r) =>
            !matchedSales.has(r.id) &&
            r.payment_method === selected.payment_method &&
            Number(r.amount_paid) === Number(selected.gross),
        )
      : refunds.filter(
          (r) =>
            !matchedRefunds.has(r.id) &&
            r.refund_method === selected.payment_method &&
            Number(r.payment_refund_amount) === Number(selected.gross),
        )
    : [];
  return (
    <WorkPage
      title="Match the money received"
      description="Compare uploaded provider statements with recorded card and MoMo payments. Review fees and refunds separately."
    >
      <ActionState action={action} />
      <section className="work-panel">
        <h2>Import a provider statement</h2>
        <p className="workspace-status">
          CSV columns: reference, date (YYYY-MM-DD), direction (payment or
          refund), currency, gross, fee, net. Amounts are positive magnitudes;
          net must equal gross less fee.
        </p>
        <div className="work-form-grid">
          <Field label="Provider">
            <input
              className="form-input"
              maxLength={80}
              value={provider}
              disabled={locked}
              onChange={(e) => setProvider(e.target.value)}
            />
          </Field>
          <Field label="Merchant account label">
            <input
              className="form-input"
              maxLength={80}
              placeholder="A name, not credentials"
              value={account}
              disabled={locked}
              onChange={(e) => setAccount(e.target.value)}
            />
          </Field>
          <Field label="Payment channel">
            <select
              className="form-input"
              value={method}
              disabled={locked}
              onChange={(e) => setMethod(e.target.value)}
            >
              <option value="mobile">MoMo</option>
              <option value="card">Card</option>
            </select>
          </Field>
          <Field label="CSV statement">
            <input
              type="file"
              accept=".csv,text/csv"
              disabled={locked || busy}
              onChange={(e) => read(e.target.files?.[0])}
            />
          </Field>
        </div>
        {error && (
          <p role="alert" className="work-error">
            {error}
          </p>
        )}
        {busy && <p role="status">Reading statement…</p>}
        {preview && (
          <>
            <p className="work-notice">
              {preview.length} valid rows. Review the first five below, then
              import. Identical references are skipped; changed duplicates
              reject the import.
            </p>
            <div className="work-table-wrap">
              <table className="work-table">
                <thead>
                  <tr>
                    <th>Reference</th>
                    <th>Date</th>
                    <th>Direction</th>
                    <th>Gross</th>
                    <th>Fee</th>
                    <th>Net</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.slice(0, 5).map((r, i) => (
                    <tr key={i}>
                      <td>{r.reference}</td>
                      <td>{r.date}</td>
                      <td>{r.direction}</td>
                      <td>
                        {r.currency} {r.gross.toFixed(2)}
                      </td>
                      <td>{r.fee.toFixed(2)}</td>
                      <td>{r.net.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              className="btn btn-primary"
              disabled={locked || !provider.trim() || !account.trim()}
              onClick={() =>
                action.run("/operations/statements/actions", {
                  action: "import",
                  provider: provider.trim(),
                  account_label: account.trim(),
                  payment_method: method,
                  lines: preview,
                })
              }
            >
              Import reviewed statement
            </button>
          </>
        )}
      </section>
      <LoadState resource={records} />
      {records.data && (
        <>
          <section className="work-panel">
            <h2>Reconciliation review</h2>
            <div className="work-metrics">
              <div>
                <strong>{lines.filter((r) => !r.matched_at).length}</strong>
                <small>Unmatched statement lines</small>
              </div>
              <div>
                <strong>
                  {sales.filter((r) => !matchedSales.has(r.id)).length}
                </strong>
                <small>Payments without a match</small>
              </div>
              <div>
                <strong>
                  {refunds.filter((r) => !matchedRefunds.has(r.id)).length}
                </strong>
                <small>Refunds without confirmation</small>
              </div>
            </div>
            <p className="workspace-status">
              Showing up to 500 recent records per list. A match records your
              review of the uploaded statement; it does not independently verify
              the provider.
            </p>
            <div className="work-table-wrap">
              <table className="work-table">
                <thead>
                  <tr>
                    <th>Reference</th>
                    <th>Provider / account</th>
                    <th>Direction</th>
                    <th>Gross</th>
                    <th>Fee</th>
                    <th>Net</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {!lines.length&&<tr className="empty-state-row"><td colSpan={7}><Empty>No provider statements imported.</Empty></td></tr>}
                  {lines.map((row) => (
                    <tr key={row.id}>
                      <td>
                        {row.reference}
                        <small>{row.statement_date}</small>
                      </td>
                      <td>
                        {row.provider}
                        <small>{row.account_label}</small>
                      </td>
                      <td>{row.direction}</td>
                      <td>
                        {row.currency} {Number(row.gross).toFixed(2)}
                      </td>
                      <td>{Number(row.fee).toFixed(2)}</td>
                      <td>{Number(row.net).toFixed(2)}</td>
                      <td>
                        {row.matched_at ? (
                          <Badge>Matched</Badge>
                        ) : (
                          <button
                            className="btn btn-secondary"
                            disabled={locked}
                            onClick={() => {
                              setSelected(row);
                              setTarget("");
                              setNote("");
                            }}
                          >
                            Review match
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

          </section>
          {selected && (
            <section className="work-panel">
              <h2>Review {selected.reference}</h2>
              <p>
                Compare the receipt and provider reference before confirming.
                Amount alone is not evidence of a match.
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  action.run("/operations/statements/actions", {
                    action: "match",
                    line_id: selected.id,
                    target_id: target,
                    note,
                  });
                }}
              >
                <fieldset className="workspace-fieldset" disabled={locked}>
                  <Field label="Recorded payment or refund with the same amount and channel">
                    <select
                      className="form-input"
                      required
                      value={target}
                      onChange={(e) => setTarget(e.target.value)}
                    >
                      <option value="">Choose a verified record</option>
                      {candidates.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.receipt_number || refundLabel(r)} ·{" "}
                          {r.settled_at?.slice(0, 10) ||
                            r.created_at?.slice(0, 10)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  {!candidates.length && (
                    <p className="work-notice">
                      No available record matches this amount and channel. Leave
                      this line unmatched and investigate.
                    </p>
                  )}
                  <Field label="Matching evidence">
                    <textarea
                      required
                      className="form-input"
                      maxLength={2000}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                  </Field>
                  <button className="btn btn-primary" disabled={!target}>
                    Confirm reviewed match
                  </button>
                </fieldset>
              </form>
            </section>
          )}
          <div className="work-columns">
            <section className="work-panel">
              <h2>Payments awaiting a match</h2>
              {sales
                .filter((r) => !matchedSales.has(r.id))
                .map((r) => (
                  <p key={r.id}>
                    {r.receipt_number || r.id.slice(0, 8)} · {r.payment_method}{" "}
                    · {Number(r.amount_paid).toFixed(2)}
                  </p>
                ))}
            </section>
            <section className="work-panel">
              <h2>Refunds awaiting confirmation</h2>
              {refunds
                .filter((r) => !matchedRefunds.has(r.id))
                .map((r) => (
                  <p key={r.id}>
                    {refundLabel(r)} · {r.refund_method} ·{" "}
                    {Number(r.payment_refund_amount).toFixed(2)}
                  </p>
                ))}
            </section>
          </div>
        </>
      )}
    </WorkPage>
  );
}
