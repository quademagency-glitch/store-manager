import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useRecordedAction } from "../hooks/useRecordedAction";
import { useAuthContext } from "../lib/AuthContext";
import {
  WorkPage,
  Field,
  Badge,
  LoadState,
  Empty,
  ReceiptLink,
  ActionState,
  stamp,
  useRecords,
} from "../features/operations/WorkSurface";
export default function ItemHistory() {
  const [params, setParams] = useSearchParams();
  const [input, setInput] = useState(params.get("code") || "");
  const code = params.get("code") || "";
  const matches = useRecords(
    code ? `/traceability/lookup?code=${encodeURIComponent(code)}` : null,
  );
  // A scan that resolves to one item opens its history without a second click.
  const unitId =
    params.get("unit") ||
    (matches.data?.length === 1 ? matches.data[0].id : "");
  const detail = useRecords(unitId ? `/traceability/units/${unitId}` : null);
  const { hasPermission } = useAuthContext();
  const info = detail.data;
  const receiving = useRecords(
    unitId && hasPermission("receive_goods")
      ? `/traceability/receiving-records?unit_id=${unitId}`
      : null,
  );
  const [receipt, setReceipt] = useState(""),
    [evidence, setEvidence] = useState("");
  const link = useRecordedAction("unit-receiving", () => {
    detail.refresh();
    setReceipt("");
    setEvidence("");
  });
  const locked = link.busy || !!link.pending || !link.ready;
  return (
    <WorkPage
      title="Every item has a story"
      description="Scan a label, pack code or serial number to see the recorded journey in this branch."
    >
      <form
        className="work-search"
        onSubmit={(e) => {
          e.preventDefault();
          setParams({ code: input.trim() });
        }}
      >
        <Field label="Item code, pack code or serial number">
          <input
            className="form-input"
            autoFocus
            required
            maxLength={250}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Scan or type a code"
          />
        </Field>
        <button className="btn btn-primary">Find item</button>
      </form>
      <LoadState resource={matches} />
      {matches.data?.length === 0 && (
        <Empty>No matching item in the selected branch.</Empty>
      )}
      {matches.data?.length > 0 && (
        <div className="work-results">
          {matches.data.map((unit) => (
            <button
              type="button"
              className={`work-result ${unitId === unit.id ? "is-selected" : ""}`}
              key={unit.id}
              onClick={() => setParams({ code, unit: unit.id })}
            >
              <span>
                <strong>{unit.product_name}</strong>
                <small>
                  {unit.item_code || unit.serial_number || unit.product_code}
                </small>
              </span>
              <Badge>{unit.status}</Badge>
            </button>
          ))}
        </div>
      )}
      <LoadState resource={detail} />
      {info && (
        <>
          <div className="work-product-head">
            <div>
              <h2>{info.unit.product?.name}</h2>
              <p>
                {info.unit.product?.sku} · {info.unit.location?.name}
              </p>
            </div>
            <Badge>{info.unit.status}</Badge>
          </div>
          <div className="work-columns">
            <section className="work-panel">
              <h2>Recorded history</h2>
              <p className="workspace-status">
                Earlier records can be incomplete. A history-started entry is a
                snapshot, not proof of earlier movements.
              </p>
              <ol className="work-timeline">
                {info.events.map((event) => (
                  <li key={event.id}>
                    <strong>
                      {event.event_type === "history_started"
                        ? "History recording started"
                        : event.event_type === "assigned"
                          ? "Unit assigned"
                          : event.event_type === "receiving_link"
                            ? "Receiving record verified"
                            : `${event.details?.before?.status?.replaceAll("_", " ") || "Updated"} → ${event.details?.after?.status?.replaceAll("_", " ") || "Updated"}`}
                    </strong>
                    <p>{event.details?.note}</p>
                    <p>
                      {stamp(event.created_at)} · {event.location?.name}
                    </p>
                    <small>
                      {event.actor?.name || "Operator not recorded"}
                      {event.details?.reference
                        ? ` · Ref ${event.details.reference.slice(0, 8)}`
                        : ""}
                    </small>
                  </li>
                ))}
              </ol>
              <div className="work-divider">
                <h3>Supplier and receiving</h3>
                {info.receiving ? (
                  <>
                    <p>
                      {info.receiving.supplier_name} ·{" "}
                      {info.receiving.po_number}
                    </p>
                    <p>Received {stamp(info.receiving.created_at)}</p>
                  </>
                ) : (
                  <p className="workspace-status">
                    No verified receiving record is linked to this unit.
                  </p>
                )}
                {!info.receiving &&
                  info.unit.status === "in_stock" &&
                  hasPermission("receive_goods") && (
                    <>
                      <ActionState action={link} />
                      <LoadState resource={receiving} />
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          link.run("/traceability/actions", {
                            action: "link_receipt",
                            unit_id: unitId,
                            receipt_id: receipt,
                            note: evidence,
                          });
                        }}
                      >
                        <Field label="Verified goods receipt">
                          <select
                            required
                            className="form-input"
                            value={receipt}
                            disabled={locked}
                            onChange={(e) => setReceipt(e.target.value)}
                          >
                            <option value="">
                              Choose the original delivery
                            </option>
                            {receiving.data?.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.po_number} · {r.supplier_name} ·{" "}
                                {stamp(r.created_at)}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Receiving evidence">
                          <input
                            required
                            className="form-input"
                            disabled={locked}
                            value={evidence}
                            maxLength={2000}
                            onChange={(e) => setEvidence(e.target.value)}
                            placeholder="Verified label against supplier delivery note"
                          />
                        </Field>
                        <button
                          className="btn btn-secondary"
                          disabled={locked || !receipt}
                        >
                          Link verified receiving record
                        </button>
                      </form>
                    </>
                  )}
              </div>
              {info.batch && (
                <div className="work-divider">
                  <h3>Receiving batch</h3>
                  <p>
                    {info.batch.batch_number} · {stamp(info.batch.received_at)}
                  </p>
                  <p>{info.batch.notes}</p>
                </div>
              )}
              {info.returns.length > 0 && (
                <div className="work-divider">
                  <h3>Returns</h3>
                  {info.returns.map((row) => (
                    <p key={row.id}>
                      {stamp(row.returns?.created_at)} · {row.returns?.reason}
                    </p>
                  ))}
                </div>
              )}
            </section>
            <aside className="work-panel">
              <h2>Tracking identifiers</h2>
              <dl className="work-details">
                <dt>Item code</dt>
                <dd>{info.unit.qr?.code || "Not recorded"}</dd>
                <dt>Pack code</dt>
                <dd>{info.unit.pack?.code || "Not recorded"}</dd>
                <dt>Serial number</dt>
                <dd>{info.unit.serial_number || "Not recorded"}</dd>
              </dl>
              <h3>Customer and receipts</h3>
              {info.sales.length ? (
                info.sales.map((sale) => (
                  <div className="work-divider" key={sale.id}>
                    <strong>
                      {sale.customer?.name ||
                        sale.customer?.customer_code ||
                        "Customer reference not recorded"}
                    </strong>
                    <p>
                      <ReceiptLink sale={sale} />
                    </p>
                    {hasPermission("manage_returns") && (
                      <Link
                        className="btn btn-secondary"
                        to={`/returns?sale=${sale.id}`}
                      >
                        Start return from receipt
                      </Link>
                    )}
                  </div>
                ))
              ) : (
                <Empty>No recorded sale.</Empty>
              )}
              <Link className="workspace-link" to="/investigations">
                Investigate or request a replacement label
              </Link>
            </aside>
          </div>
        </>
      )}
    </WorkPage>
  );
}
