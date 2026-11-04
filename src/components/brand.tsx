export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? 'brand-compact' : ''}`} aria-label="SucukCenter">
      <img className="brand-symbol" src="./brand/program.png" alt="" width="40" height="40" />
      {!compact && (
        <div className="brand-copy">
          <strong>
            Sucuk<span>Center</span>
          </strong>
          <small>İŞİNİZİN MERKEZİ</small>
        </div>
      )}
    </div>
  );
}
