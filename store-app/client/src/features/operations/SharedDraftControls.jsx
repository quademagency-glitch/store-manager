import { useState } from "react";
import { useRecordedAction } from "../../hooks/useRecordedAction";
import { useConfirm } from "../../hooks/useConfirm";
import { useOfflineScope } from "../../hooks/useOfflineScope";
import {
  ActionState,
  Field,
  LoadState,
  stamp,
  useRecords,
} from "./WorkSurface";
export default function SharedDraftControls(props) {
  const scope = useOfflineScope();
  const scopeId = scope
    ? `${scope.businessId}:${scope.userId}:${scope.locationId}:${props.kind}`
    : "";
  return <ScopedDraftControls key={scopeId} scopeId={scopeId} {...props} />;
}
function ScopedDraftControls({
  kind,
  value,
  onLoad,
  disabled = false,
  scopeId,
}) {
  const drafts = useRecords("/operations/drafts");
  const confirm = useConfirm();
  const [device] = useState(() => {
      const key = `shared-draft-device:${scopeId}`;
      const id = sessionStorage.getItem(key) || crypto.randomUUID();
      sessionStorage.setItem(key, id);
      return id;
    }),
    [selected, setSelected] = useState(null),
    [title, setTitle] = useState(""),
    [message, setMessage] = useState("");
  const action = useRecordedAction(
    `shared-draft-${kind}`,
    (record, request) => {
      if (request.body.action === "claim") {
        onLoad(record.payload);
        setTitle(record.title);
        setMessage("Draft loaded. This tab owns the current ten-minute claim.");
      } else
        setMessage(
          request.body.action === "release"
            ? "Released. You can now resume it on another device."
            : request.body.action === "close"
              ? "Saved draft closed."
              : "Saved to your account for this branch.",
        );
      setSelected(
        ["release", "close"].includes(request.body.action) ? null : record,
      );
      drafts.refresh();
    },
  );
  const locked = disabled || !action.ready || action.busy || !!action.pending;
  async function claim(row) {
    if (
      !(await confirm({
        title: "Resume saved work",
        message:
          "Replace the current unpaid draft with this saved version? Your current local draft will be replaced.",
        confirmText: "Resume draft",
      }))
    )
      return;
    await action.run("/operations/drafts/actions", {
      action: "claim",
      draft_id: row.id,
      version: row.version,
      device_id: device,
    });
  }
  const save = () =>
    action.run("/operations/drafts/actions", {
      action: selected ? "save" : "create",
      device_id: device,
      ...(selected
        ? { draft_id: selected.id, version: selected.version }
        : { kind }),
      title: title.trim(),
      payload: value,
    });
  return (
    <details className="work-drafts">
      <summary>Continue on another device</summary>
      <p className="workspace-status">
        Only your account and this branch can open these drafts. A ten-minute
        claim protects saved revisions. Stock is checked at checkout. Close the
        saved copy when checkout or the purchase order is finished.
      </p>
      <ActionState action={action} />
      {message && (
        <p role="status" className="workspace-status">
          {message}
        </p>
      )}
      <Field label="Saved draft name">
        <input
          className="form-input"
          maxLength={120}
          disabled={locked}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={
            kind === "basket"
              ? "Customer name or order description"
              : "Supplier or purchase description"
          }
        />
      </Field>
      <div className="work-actions">
        <button
          type="button"
          className="btn btn-secondary"
          disabled={locked || !title.trim()}
          onClick={save}
        >
          Save current draft
        </button>
        {selected && (
          <>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={locked}
              onClick={() =>
                action.run("/operations/drafts/actions", {
                  action: "release",
                  device_id: device,
                  draft_id: selected.id,
                  version: selected.version,
                })
              }
            >
              Release for another device
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={locked}
              onClick={async () => {
                if (
                  await confirm({
                    title: "Close saved draft",
                    message:
                      "Close this saved copy after finishing it? Your current local work remains available.",
                    confirmText: "Close saved draft",
                  })
                )
                  action.run("/operations/drafts/actions", {
                    action: "close",
                    device_id: device,
                    draft_id: selected.id,
                    version: selected.version,
                  });
              }}
            >
              Close finished draft
            </button>
          </>
        )}
      </div>
      <LoadState resource={drafts} />
      <button type="button" className="btn btn-ghost" disabled={locked || drafts.loading} onClick={drafts.refresh}>Refresh saved drafts</button>
      {drafts.data
        ?.filter((row) => row.kind === kind)
        .map((row) => (
          <div className="work-row" key={row.id}>
            <strong>{row.title}</strong>
            <p>
              Revision {row.version} · {stamp(row.updated_at)}
            </p>
            <p>
              {row.device_id === device
                ? "Claimed by this tab"
                : row.claimed_until && new Date(row.claimed_until) > new Date()
                  ? `Claimed until ${new Date(row.claimed_until).toLocaleTimeString()}`
                  : "Available to resume"}
            </p>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={locked || (row.id === selected?.id && row.version === selected.version && row.device_id === device && new Date(row.claimed_until) > new Date())}
              onClick={() => claim(row)}
            >
              Resume saved draft
            </button>
          </div>
        ))}
    </details>
  );
}
