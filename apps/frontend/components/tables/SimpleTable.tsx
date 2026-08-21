export function SimpleTable({
  headers,
  rows
}: {
  headers: string[];
  rows: Array<Array<string | number>>;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-soft">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
            {headers.map((head) => (
              <th key={head} className="px-5 py-3 font-medium">
                {head}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={headers.length} className="px-5 py-10 text-center text-muted-foreground">
                Sin registros.
              </td>
            </tr>
          ) : (
            rows.map((row, idx) => (
              <tr key={idx}>
                {row.map((cell, cidx) => (
                  <td key={cidx} className={`px-5 py-3 ${cidx === 0 ? "font-semibold" : "text-muted-foreground"}`}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
