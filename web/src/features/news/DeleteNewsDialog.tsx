import { useState } from "react";
import { failure } from "../../lib/format.ts";
import { useNotify } from "../../lib/notices.tsx";
import { Dialog } from "../../ui/index.ts";

interface Props {
  /** The article to delete, or null to delete all of them. */
  article: { date: string; title: string } | null;
  count: number;
  /** A search is on: say that Delete all is not limited to the matches. */
  filtered?: boolean;
  /** Throws when the delete fails. */
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

export function DeleteNewsDialog({ article, count, filtered = false, onConfirm, onClose }: Props) {
  const [busy, setBusy] = useState(false);
  const notify = useNotify();

  async function confirm() {
    setBusy(true);
    try {
      await onConfirm();
      onClose();
    } catch (e) {
      notify(failure(article ? "delete the article" : "delete the articles", e));
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={article ? "Delete article?" : "Delete all articles?"}
      onClose={onClose}
      onCancel={onClose}
      primary={{ label: busy ? "Deleting…" : article ? "Delete" : "Delete all", onClick: () => void confirm(), disabled: busy }}
    >
      <p>
        {article ? <strong>{article.title}</strong> : <strong>{count === 1 ? "The article" : `All ${count} articles`}</strong>} will be deleted from this machine{!article && filtered ? ", not only the ones that match your search" : ""}. This cannot be undone.
      </p>
    </Dialog>
  );
}
