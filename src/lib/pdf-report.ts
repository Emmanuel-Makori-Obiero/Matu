// FILE: src/lib/pdf-report.ts
// Generates a downloadable PDF financial/audit report from a wallet's transaction
// ledger. Used for all three owner types — passenger, driver, and sacco — since
// they all share the same wallet_transactions shape. This is meant to read like an
// audit trail: every row, running balance, and a summary of totals in/out.
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export type ReportTxn = {
  id: string;
  type: string;
  status: string;
  amount: number;
  balance_after: number | null;
  created_at: string;
  mpesa_receipt?: string | null;
  phone?: string | null;
};

// Wallet transaction "type" values credit vs debit the wallet — needed to compute
// meaningful totals in/out rather than just summing raw amounts (which are always
// stored positive regardless of direction).
const CREDIT_TYPES = new Set(["topup", "fare_received", "commission", "refund", "deposit"]);

function isCredit(type: string) {
  return CREDIT_TYPES.has(type) || type.includes("credit") || type.includes("received");
}

export function generateWalletReportPdf(opts: {
  ownerLabel: string; // e.g. "Jane Wanjiku — Passenger", "KBS Sacco — Commission wallet"
  currentBalance: number;
  txns: ReportTxn[];
  generatedFor?: string; // optional extra identity line (phone, email, sacco name)
}) {
  const { ownerLabel, currentBalance, txns, generatedFor } = opts;
  const doc = new jsPDF();

  const completed = txns.filter((t) => t.status === "completed");
  const totalIn = completed
    .filter((t) => isCredit(t.type))
    .reduce((s, t) => s + Number(t.amount), 0);
  const totalOut = completed
    .filter((t) => !isCredit(t.type))
    .reduce((s, t) => s + Number(t.amount), 0);

  doc.setFontSize(16);
  doc.text("Matu — Financial Audit Report", 14, 18);
  doc.setFontSize(10);
  doc.setTextColor(90);
  doc.text(`Account: ${ownerLabel}`, 14, 26);
  if (generatedFor) doc.text(generatedFor, 14, 32);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 14, generatedFor ? 38 : 32);
  doc.setTextColor(20);

  const summaryStartY = generatedFor ? 46 : 40;
  autoTable(doc, {
    startY: summaryStartY,
    head: [["Current balance", "Total credited", "Total debited", "Transactions"]],
    body: [
      [
        `KES ${currentBalance.toLocaleString()}`,
        `KES ${totalIn.toLocaleString()}`,
        `KES ${totalOut.toLocaleString()}`,
        String(txns.length),
      ],
    ],
    theme: "grid",
    styles: { halign: "center" },
  });

  const tableStartY =
    (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  autoTable(doc, {
    startY: tableStartY,
    head: [["Date", "Type", "Status", "Amount (KES)", "Balance after", "Reference"]],
    body: txns.map((t) => [
      new Date(t.created_at).toLocaleString(),
      t.type.replace(/_/g, " "),
      t.status,
      `${isCredit(t.type) ? "+" : "-"}${Number(t.amount).toLocaleString()}`,
      t.balance_after != null ? `KES ${Number(t.balance_after).toLocaleString()}` : "—",
      t.mpesa_receipt || t.phone || "—",
    ]),
    theme: "striped",
    headStyles: { fillColor: [22, 101, 52] }, // green-800, matches the app's install-button green
    styles: { fontSize: 8 },
    columnStyles: { 0: { cellWidth: 32 } },
  });

  const filenameSafe = ownerLabel.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  doc.save(`matu-audit-report-${filenameSafe}-${Date.now()}.pdf`);
}
