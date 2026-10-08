import { useState } from "react";
import { api } from "../lib/api";
import { useAuthContext } from "../lib/AuthContext";
import { unitCount } from "../lib/stockStatus";
import { useRecordedAction } from "../hooks/useRecordedAction";
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
export default function UnitTransfers() {
  const { activeLocationId } = useAuthContext();
  const transfers = useRecords("/traceability/shipments"),
    locations = useRecords("/locations");
  const [target, setTarget] = useState(""),
    [code, setCode] = useState(""),
    [units, setUnits] = useState([]),
    [note, setNote] = useState(""),
    [shipment, setShipment] = useState(null),
    [error, setError] = useState(""),
    [searching, setSearching] = useState(false);
  const action = useRecordedAction("unit-transfer", () => {
    setUnits([]);
    setNote("");
    setShipment(null);
    transfers.refresh();
  });
  const locked = action.busy || !!action.pending || !action.ready;
  async function scan(e) {
    e.preventDefault();
    setError("");
    setSearching(true);
    try {
      const path = shipment
        ? `/traceability/shipment-lookup?shipment=${shipment.id}&code=${encodeURIComponent(code.trim())}`
        : `/traceability/lookup?code=${encodeURIComponent(code.trim())}`;
      const found = await api.get(path);
      if (found.length !== 1)
        throw new Error(
          found.length
            ? "This code matches more than one unit. Use its unique item code."
            : "No matching unit for this transfer.",
        );
      const unit = found[0];
      if (units.some((u) => u.id === unit.id))
        throw new Error("This unit is already scanned.");
      if (!shipment && unit.status !== "in_stock")
        throw new Error("Only available units can be dispatched.");
      setUnits((previous) => [...previous, unit]);
      setCode("");
    } catch (e) {
      setError(e.message);
    } finally {
      setSearching(false);
    }
  }
  return (
    <WorkPage
      title="Scan out. Scan in."
      description="Each transferred unit stays unavailable for sale until the receiving branch scans it."
    >
      <div className="work-columns">
        <section className="work-panel">
          <h2>{shipment ? "Receive transfer" : "Dispatch from this branch"}</h2>
          {shipment && (
            <p>
              From {shipment.source?.name} · {stamp(shipment.dispatched_at)}
            </p>
          )}
          <ActionState action={action} />
          {error && (
            <p role="alert" className="work-error">
              {error}
            </p>
          )}
          {!shipment && (
            <Field label="Receiving branch">
              <select
                className="form-input"
                value={target}
                disabled={locked}
                onChange={(e) => setTarget(e.target.value)}
              >
                <option value="">Choose branch</option>
                {(locations.data || [])
                  .filter((l) => l.id !== activeLocationId)
                  .map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
              </select>
            </Field>
          )}
          <form className="work-search" onSubmit={scan}>
            <Field label="Scan unique item code">
              <input
                className="form-input"
                value={code}
                required
                disabled={locked || searching}
                onChange={(e) => setCode(e.target.value)}
              />
            </Field>
            <button
              className="btn btn-secondary"
              disabled={locked || searching || units.length >= 200}
            >
              {searching ? "Finding…" : "Add unit"}
            </button>
          </form>
          <ul className="work-list">
            {units.map((u) => (
              <li key={u.id}>
                <span>
                  {u.product_name}
                  <small>{u.item_code || u.serial_number}</small>
                </span>
                <button
                  className="btn btn-ghost"
                  disabled={locked}
                  onClick={() => setUnits(units.filter((v) => v.id !== u.id))}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <Field label="Handover or delivery notes">
            <textarea
              className="form-input"
              maxLength={2000}
              value={note}
              disabled={locked}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
          <div className="work-actions">
            <button
              className="btn btn-primary"
              disabled={locked || !units.length || (!shipment && !target)}
              onClick={() =>
                action.run("/traceability/actions", {
                  action: shipment ? "receive" : "dispatch",
                  ...(shipment
                    ? { shipment_id: shipment.id }
                    : { destination_id: target }),
                  unit_ids: units.map((u) => u.id),
                  note,
                })
              }
            >
              {shipment
                ? `Receive ${unitCount(units.length)}`
                : `Dispatch ${unitCount(units.length)}`}
            </button>
            {shipment && (
              <button
                className="btn btn-secondary"
                disabled={locked}
                onClick={() => {
                  setShipment(null);
                  setUnits([]);
                }}
              >
                Cancel receiving
              </button>
            )}
          </div>
        </section>
        <section className="work-panel">
          <h2>Branch transfers</h2>
          <LoadState resource={transfers} />
          {transfers.data?.length === 0 && (
            <Empty>No transfers recorded.</Empty>
          )}
          {transfers.data?.map((row) => (
            <article className="work-row" key={row.id}>
              <div className="work-row-head">
                <strong>
                  {row.source?.name} → {row.destination?.name}
                </strong>
                <Badge>{row.status}</Badge>
              </div>
              <p>
                {row.items.length} dispatched ·{" "}
                {row.items.filter((i) => i.received_at).length} received ·{" "}
                {row.items.filter((i) => !i.received_at).length} outstanding
              </p>
              <small>
                {row.dispatcher?.name} · {stamp(row.dispatched_at)}
              </small>
              {row.to_location_id === activeLocationId &&
                row.status !== "received" && (
                  <button
                    className="btn btn-secondary"
                    disabled={locked}
                    onClick={() => {
                      setShipment(row);
                      setUnits([]);
                      setError("");
                    }}
                  >
                    Scan delivery
                  </button>
                )}
              <details>
                <summary>Unit handover records</summary>
                {row.items.map((item) => (
                  <p key={item.unit_id}>
                    {item.unit_id.slice(0, 8)} ·{" "}
                    {item.received_at
                      ? `Received ${stamp(item.received_at)}`
                      : "Awaiting receipt"}
                    {item.receipt_note ? ` · ${item.receipt_note}` : ""}
                  </p>
                ))}
              </details>
            </article>
          ))}
        </section>
      </div>
    </WorkPage>
  );
}
