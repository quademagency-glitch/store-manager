/* eslint-disable react-refresh/only-export-components */
import { cloneElement, useCallback, useEffect, useId, useState } from "react";
import { Link } from "react-router-dom";
import { api, scopedApi } from "../../lib/api";
import { useOfflineScope } from "../../hooks/useOfflineScope";
import { useAuthContext } from "../../lib/AuthContext";

export function useRecords(path) {
  const { businessId, activeLocationId, user } = useAuthContext();
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState({ data: null, loading: true, error: "" });
  const refresh = useCallback(() => setRevision((n) => n + 1), []);
  useEffect(() => {
    let active = true;
    setState({ data: null, loading: !!path, error: "" });
    if (path)
      api
        .get(path)
        .then((data) => {
          if (active) setState({ data, loading: false, error: "" });
        })
        .catch((e) => {
          if (active)
            setState({ data: null, loading: false, error: e.message });
        });
    return () => {
      active = false;
    };
  }, [path, revision, businessId, activeLocationId, user?.id]);
  return { ...state, refresh };
}
export function WorkPage({ title, description, children, action }) {
  return (
    <div className="work-page">
      <header className="work-heading">
        <div>
          <p className="work-eyebrow">QUADERP / DAILY OPERATIONS</p>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        {action}
      </header>
      {children}
    </div>
  );
}
export function LoadState({ resource }) {
  return resource.loading ? (
    <p role="status" className="work-empty">
      Loading records…
    </p>
  ) : resource.error ? (
    <div role="alert" className="work-error">
      {resource.error}
      <button
        type="button"
        className="btn btn-secondary"
        onClick={resource.refresh}
      >
        Retry
      </button>
    </div>
  ) : null;
}
export function ActionState({ action }) {
  return (
    <>
      {action.error && (
        <p role="alert" className="work-error">
          {action.error}
        </p>
      )}
      {action.pending && (
        <div className="work-notice">
          A saved request is awaiting confirmation.
          <button
            type="button"
            className="btn btn-secondary"
            disabled={action.busy}
            onClick={action.retry}
          >
            {action.busy ? "Confirming…" : "Retry saved request"}
          </button>
        </div>
      )}
    </>
  );
}
export function Empty({ children }) {
  return <p className="work-empty">{children}</p>;
}
export function Badge({ children }) {
  return (
    <span className="work-badge">
      {String(children || "Unknown").replaceAll("_", " ")}
    </span>
  );
}
export function Field({ label, children }) {
  const id = useId();
  return (
    <div className="work-field">
      <label htmlFor={id}>{label}</label>
      {cloneElement(children, { id })}
    </div>
  );
}
export function ReceiptLink({ sale }) {
  return (
    <Link
      className="workspace-link"
      to={`/sales-record?date=${sale.created_at?.slice(0, 10) || ""}&highlight=${sale.id}`}
    >
      {sale.receipt_number || "Open receipt"}
    </Link>
  );
}
export const stamp = (value) =>
  value ? new Date(value).toLocaleString() : "Not recorded";

export function Evidence({ kind, id, readOnly=false }) {
  const scope = useOfflineScope();
  const resource = useRecords(`/traceability/evidence/${kind}/${id}`);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [photo, setPhoto] = useState(null);
  async function upload(file) {
    if (!file) return;
    const client = scopedApi(scope);
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 2 * 1024 * 1024
    ) {
      setError("Choose a JPEG, PNG or WebP under 2 MB.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const content = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      await client.post(`/traceability/evidence/${kind}/${id}`, {
        id: crypto.randomUUID(),
        filename: file.name,
        content_type: file.type,
        content_base64: content,
      });
      resource.refresh();
    } catch (e) {
      setError(e.message || "Photo could not be saved.");
    } finally {
      setBusy(false);
    }
  }
  async function view(file) {
    setError("");
    try {
      const result = await api.get(
        `/traceability/evidence/${kind}/${id}/${file.id}`,
      );
      setPhoto({ ...result, filename: file.filename });
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <div className="work-evidence">
      <h3>Evidence photos</h3>
      <p className="workspace-status">
        Private to authorised staff. Up to ten images, 2 MB each.
      </p>
      <LoadState resource={resource} />
      {error && (
        <p role="alert" className="work-error">
          {error}
        </p>
      )}
      {!readOnly && <Field label={busy ? "Saving photo…" : "Add a photo"}>
        <input
          disabled={busy}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => upload(e.target.files?.[0])}
        />
      </Field>}
      <div className="work-actions">
        {resource.data?.map((file) => (
          <button
            key={file.id}
            type="button"
            className="btn btn-secondary"
            onClick={() => view(file)}
          >
            {file.filename}
          </button>
        ))}
      </div>
      {photo && (
        <figure>
          <img
            className="work-photo"
            src={`data:${photo.content_type};base64,${photo.content_base64}`}
            alt={photo.filename}
          />
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setPhoto(null)}
          >
            Close photo
          </button>
        </figure>
      )}
    </div>
  );
}
