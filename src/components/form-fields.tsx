import { useState, useEffect, Children, isValidElement, createContext, useContext } from 'react';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { DateField } from './calendar';
import { SearchableChoice } from './searchable';
export const FormErrorsContext = createContext<Record<string, string>>({});
export function Field({
  label,
  name,
  initial = '',
  required = true,
  type = 'text',
  ...props
}: {
  label: string;
  name: string;
  initial?: string;
  required?: boolean;
  type?: string;
  maxLength?: number;
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
}) {
  const error = useContext(FormErrorsContext)[name];
  if (type === 'date')
    return <DateField label={label} name={name} initial={initial} required={required} />;
  return (
    <div className="field">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        defaultValue={initial}
        required={required}
        type={type}
        maxLength={200}
        aria-invalid={!!error}
        aria-describedby={error ? `${name}-error` : undefined}
        {...props}
      />
      {error && (
        <small id={`${name}-error`} className="field-error">
          {error}
        </small>
      )}
    </div>
  );
}
export function SelectField({
  label,
  name,
  children,
  initial = '',
  onChange,
  searchable = false,
  lookupKind,
  required = true,
}: {
  label: string;
  name: string;
  children: React.ReactNode;
  initial?: string;
  onChange?: (value: string) => void;
  searchable?: boolean;
  lookupKind?: 'customers' | 'suppliers';
  required?: boolean;
}) {
  const [value, setValue] = useState(initial);
  useEffect(() => setValue(initial), [initial]);
  const options = Children.toArray(children)
    .filter(isValidElement)
    .map((child) => {
      const c = child as React.ReactElement<{ value?: string | number; children: React.ReactNode }>;
      return { value: String(c.props.value ?? c.props.children), label: String(c.props.children) };
    })
    .filter((o) => o.value !== '');
  return (
    <div className="field">
      <Label htmlFor={name}>{label}</Label>
      {searchable ? (
        <>
          <input type="hidden" name={name} value={value} />
          <SearchableChoice
            id={name}
            label={label}
            value={value}
            required={required}
            options={options}
            onChange={(v) => {
              setValue(v);
              onChange?.(v);
            }}
            load={
              lookupKind
                ? async (search) => {
                    const r = await window.desktop.lookup({
                      kind: lookupKind,
                      search,
                      selected: Number(value) || undefined,
                    });
                    if (!r.ok) throw new Error(r.error);
                    return r.data.map((p) => ({ value: String(p.id), label: p.name, record: p }));
                  }
                : undefined
            }
          />
        </>
      ) : (
        <select
          id={name}
          name={name}
          defaultValue={initial}
          required={required}
          onChange={(e) => onChange?.(e.target.value)}
        >
          {children}
        </select>
      )}
    </div>
  );
}
