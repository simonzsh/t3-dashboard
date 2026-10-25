import type { Ref } from "react";

interface Props {
  accept: string;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
  /** A button opens the picker with ref.current.click(). */
  ref?: Ref<HTMLInputElement>;
}

export function FileInput({ accept, multiple, onFiles, ref }: Props) {
  return (
    <input
      ref={ref}
      type="file"
      hidden
      accept={accept}
      multiple={multiple}
      onChange={(e) => {
        const files = [...(e.target.files ?? [])];
        // Cleared so that picking the same file again fires a change.
        e.target.value = "";
        onFiles(files);
      }}
    />
  );
}
