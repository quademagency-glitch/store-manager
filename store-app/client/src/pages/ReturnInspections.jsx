import { useState } from "react";
import { Link } from "react-router-dom";
import { useRecordedAction } from "../hooks/useRecordedAction";
import { unitCount } from "../lib/stockStatus";
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
export default function ReturnInspections() {
  const records = useRecords("/traceability/inspections");
  const [selected, setSelected] = useState(null),
    [condition, setCondition] = useState("damaged"),
    [disposition, setDisposition] = useState("quarantine"),
    [note, setNote] = useState(""),
    [warranty, setWarranty] = useState(""),
    [reference, setReference] = useState("");
  const action = useRecordedAction("return-inspection", () => {
    records.refresh();
    setSelected(null);
  });
  const finalDecision=["restock","supplier_return"].includes(selected?.status);
  const locked = action.busy || !!action.pending || !action.ready;
  return (
    <WorkPage
      title="Inspect before restocking"
      description="Record condition and warranty evidence. Refunds stay attached to the original return."
      action={
        <Link className="btn btn-secondary" to="/returns">
          Find original sale
        </Link>
      }
    >
      <ActionState action={action} />
      <LoadState resource={records} />
      <div className="work-columns">
        <section className="work-panel">
          <h2>Returned goods</h2>
          {records.data?.length === 0 && (
            <Empty>No returned items awaiting inspection.</Empty>
          )}
          {records.data?.map((row) => (
            <article className="work-row" key={row.id}>
              <div className="work-row-head">
                <strong>{row.item?.product?.name}</strong>
                <Badge>{row.status}</Badge>
              </div>
              <p>
                {unitCount(row.item?.quantity)} · {row.item?.return?.reason}
              </p>
              <small>{stamp(row.created_at)}</small>
              {(
                <button
                  className="btn btn-secondary"
                  disabled={locked}
                  onClick={() => {
                    setSelected(row);
                    setCondition(row.condition || "damaged");
                    setDisposition(
                      row.status === "awaiting_inspection" ? "quarantine" : row.status,
                    );
                    setNote(["restock","supplier_return"].includes(row.status)?row.note||"":"");
                    setWarranty(row.warranty_until || "");
                    setReference(row.warranty_reference || "");
                  }}
                >
                  {["restock","supplier_return"].includes(row.status)?"View inspection":"Inspect goods"}
                </button>
              )}
              {row.note && <p>{row.note}</p>}
            </article>
          ))}
        </section>
        {selected ? (
          <section className="work-panel">
            <h2>{selected.item?.product?.name}</h2>
            <p className="work-notice">
              {finalDecision?"This inspection is complete. Its findings and photos remain available below.":"Held outside sellable stock until an inspection authorises restocking."}
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                action.run("/traceability/actions", {
                  action: "inspect",
                  inspection_id: selected.id,
                  condition,
                  disposition,
                  note,
                  warranty_until: warranty || null,
                  warranty_reference: reference,
                });
              }}
            >
              <fieldset disabled={locked||finalDecision} className="workspace-fieldset">
                <div className="work-form-grid">
                  <Field label="Item condition">
                    <select
                      className="form-input"
                      value={condition}
                      onChange={(e) => {
                        setCondition(e.target.value);
                        if (e.target.value === "damaged")
                          setDisposition("quarantine");
                      }}
                    >
                      <option value="damaged">Damaged</option>
                      <option value="unopened">Unopened</option>
                      <option value="working">Working and tested</option>
                    </select>
                  </Field>
                  <Field label="Next step">
                    <select
                      className="form-input"
                      value={disposition}
                      onChange={(e) => setDisposition(e.target.value)}
                    >
                      <option value="quarantine">Keep in quarantine</option>
                      <option value="repair">Send for repair</option>
                      <option value="supplier_return">
                        Return to supplier
                      </option>
                      <option
                        value="restock"
                        disabled={condition === "damaged"}
                      >
                        Release to sellable stock
                      </option>
                    </select>
                  </Field>
                  <Field label="Warranty expiry, if documented">
                    <input
                      className="form-input"
                      type="date"
                      value={warranty}
                      onChange={(e) => setWarranty(e.target.value)}
                    />
                  </Field>
                  <Field label="Warranty document reference">
                    <input
                      className="form-input"
                      maxLength={200}
                      value={reference}
                      onChange={(e) => setReference(e.target.value)}
                    />
                  </Field>
                </div>
                <Field label="Inspection findings">
                  <textarea
                    required
                    maxLength={2000}
                    className="form-input"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </Field>
                <button className="btn btn-primary">Save inspection</button>
              </fieldset>
            </form>
            <Evidence key={selected.id} readOnly={finalDecision} kind="inspection" id={selected.id} />
          </section>
        ) : (
          <aside className="work-panel">
            <h2>Every decision leaves a record</h2>
            <p>
              Choose a return to record condition, evidence and disposition.
              Quarantine and repair never add to available stock.
            </p>
          </aside>
        )}
      </div>
    </WorkPage>
  );
}
