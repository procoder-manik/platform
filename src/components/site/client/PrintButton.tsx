'use client';

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="btn btn-ghost print:hidden">
      Print or save as PDF
    </button>
  );
}
