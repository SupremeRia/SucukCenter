export function SummaryGrid({
  items,
}: {
  items: { label: string; value: string; hint?: string }[];
}) {
  return (
    <dl className="summary-grid">
      {items.map((i) => (
        <div className="summary-item" key={i.label}>
          <dt>{i.label}</dt>
          <dd className={/^[−-]/.test(i.value) ? 'text-negative' : undefined}>{i.value}</dd>
          {i.hint && <small>{i.hint}</small>}
        </div>
      ))}
    </dl>
  );
}
