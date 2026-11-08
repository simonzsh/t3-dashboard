import { Icon } from "./Icon.tsx";
import { TextInput } from "./TextInput.tsx";

type Props = Parameters<typeof TextInput>[0];

/** A text field with a search icon. `className` goes on the wrapper, `ref` on the input. */
export function SearchField({ className, ...rest }: Props) {
  return (
    <div className={className ? `search-field ${className}` : "search-field"}>
      <Icon name="search" />
      <TextInput {...rest} />
    </div>
  );
}
