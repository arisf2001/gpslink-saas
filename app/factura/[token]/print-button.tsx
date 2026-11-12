"use client";

export function PrintButton() {
  return <button type="button" className="btn" style={{ background: "#fff", color: "#0F4C5C", border: "1px solid #0F4C5C" }} onClick={() => window.print()}>Descargar PDF</button>;
}
