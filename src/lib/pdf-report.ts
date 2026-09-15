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

// ---------------------------------------------------------------------------
// SACCO full report: cashflow + fleet performance + commissions + complaints,
// all scoped to a date range. Used from the SACCO Fleet dashboard
// (fleet.$saccoId.tsx) so an admin can hand one PDF to their committee
// instead of stitching together the wallet ledger, trip logs, and complaint
// queue by hand.

export type FleetVehicleStat = {
  plateNumber: string;
  nickname?: string | null;
  trips: number;
  revenue: number;
};

export type ComplaintRow = {
  category: string;
  status: string;
  recipient: string;
  created_at: string;
  resolved_at: string | null;
};

const COMMISSION_TYPES = new Set(["commission"]);

export function generateSaccoFullReportPdf(opts: {
  saccoName: string;
  rangeLabel: string; // e.g. "1 Sep 2026 – 15 Sep 2026"
  currentBalance: number;
  cashflowTxns: ReportTxn[]; // sacco commission wallet ledger, already filtered to range
  fleet: FleetVehicleStat[];
  complaints: ComplaintRow[];
}) {
  const { saccoName, rangeLabel, currentBalance, cashflowTxns, fleet, complaints } = opts;
  const doc = new jsPDF();

  const completed = cashflowTxns.filter((t) => t.status === "completed");
  const totalIn = completed
    .filter((t) => isCredit(t.type))
    .reduce((s, t) => s + Number(t.amount), 0);
  const totalOut = completed
    .filter((t) => !isCredit(t.type))
    .reduce((s, t) => s + Number(t.amount), 0);
  const commissionTxns = completed.filter((t) => COMMISSION_TYPES.has(t.type));
  const totalCommission = commissionTxns.reduce((s, t) => s + Number(t.amount), 0);

  const resolvedComplaints = complaints.filter((c) => c.status === "resolved").length;
  const openComplaints = complaints.length - resolvedComplaints;
  const totalTrips = fleet.reduce((s, v) => s + v.trips, 0);
  const totalRevenue = fleet.reduce((s, v) => s + v.revenue, 0);

  const addTitle = (text: string) => {
    doc.setFontSize(16);
    doc.setTextColor(20);
    doc.text(text, 14, 18);
  };
  const addSubline = (text: string, y: number) => {
    doc.setFontSize(10);
    doc.setTextColor(90);
    doc.text(text, 14, y);
    doc.setTextColor(20);
  };

  // --- Cover / summary page ---------------------------------------------
  addTitle(`${saccoName} — SACCO Report`);
  addSubline(`Period: ${rangeLabel}`, 26);
  addSubline(`Generated: ${new Date().toLocaleString()}`, 32);

  autoTable(doc, {
    startY: 42,
    head: [["Cash in", "Cash out", "Net", "Commission earned", "Wallet balance"]],
    body: [
      [
        `KES ${totalIn.toLocaleString()}`,
        `KES ${totalOut.toLocaleString()}`,
        `KES ${(totalIn - totalOut).toLocaleString()}`,
        `KES ${totalCommission.toLocaleString()}`,
        `KES ${currentBalance.toLocaleString()}`,
      ],
    ],
    theme: "grid",
    styles: { halign: "center", fontSize: 8.5 },
    headStyles: { fillColor: [22, 101, 52] },
  });

  const fleetSummaryY =
    (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  autoTable(doc, {
    startY: fleetSummaryY,
    head: [["Vehicles", "Trips completed", "Fleet revenue", "Complaints (open / resolved)"]],
    body: [
      [
        String(fleet.length),
        String(totalTrips),
        `KES ${totalRevenue.toLocaleString()}`,
        `${openComplaints} / ${resolvedComplaints}`,
      ],
    ],
    theme: "grid",
    styles: { halign: "center", fontSize: 8.5 },
    headStyles: { fillColor: [22, 101, 52] },
  });

  // --- Cashflow ledger -----------------------------------------------------
  doc.addPage();
  addTitle("Cashflow — commission wallet ledger");
  addSubline(`Period: ${rangeLabel}`, 26);
  autoTable(doc, {
    startY: 34,
    head: [["Date", "Type", "Status", "Amount (KES)", "Balance after", "Reference"]],
    body: cashflowTxns.map((t) => [
      new Date(t.created_at).toLocaleString(),
      t.type.replace(/_/g, " "),
      t.status,
      `${isCredit(t.type) ? "+" : "-"}${Number(t.amount).toLocaleString()}`,
      t.balance_after != null ? `KES ${Number(t.balance_after).toLocaleString()}` : "—",
      t.mpesa_receipt || t.phone || "—",
    ]),
    theme: "striped",
    headStyles: { fillColor: [22, 101, 52] },
    styles: { fontSize: 8 },
    columnStyles: { 0: { cellWidth: 32 } },
  });
  if (cashflowTxns.length === 0) {
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text("No wallet transactions in this period.", 14, 40);
    doc.setTextColor(20);
  }

  // --- Fleet performance -----------------------------------------------------
  doc.addPage();
  addTitle("Fleet performance");
  addSubline(`Period: ${rangeLabel} — ${fleet.length} vehicle(s)`, 26);
  autoTable(doc, {
    startY: 34,
    head: [["Plate", "Nickname", "Trips completed", "Revenue (KES)", "Avg. fare (KES)"]],
    body: fleet
      .slice()
      .sort((a, b) => b.revenue - a.revenue)
      .map((v) => [
        v.plateNumber,
        v.nickname || "—",
        String(v.trips),
        v.revenue.toLocaleString(),
        v.trips > 0 ? Math.round(v.revenue / v.trips).toLocaleString() : "—",
      ]),
    theme: "striped",
    headStyles: { fillColor: [22, 101, 52] },
    styles: { fontSize: 8.5 },
  });
  if (fleet.length === 0) {
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text("No vehicles with trips in this period.", 14, 40);
    doc.setTextColor(20);
  }

  // --- Complaints -----------------------------------------------------
  doc.addPage();
  addTitle("Complaints");
  addSubline(`Period: ${rangeLabel} — ${complaints.length} total, ${openComplaints} open`, 26);
  autoTable(doc, {
    startY: 34,
    head: [["Date", "Category", "Recipient", "Status", "Resolved"]],
    body: complaints.map((c) => [
      new Date(c.created_at).toLocaleDateString(),
      c.category.replace(/_/g, " "),
      c.recipient.replace(/_/g, " "),
      c.status,
      c.resolved_at ? new Date(c.resolved_at).toLocaleDateString() : "—",
    ]),
    theme: "striped",
    headStyles: { fillColor: [22, 101, 52] },
    styles: { fontSize: 8.5 },
  });
  if (complaints.length === 0) {
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text("No complaints in this period.", 14, 40);
    doc.setTextColor(20);
  }

  const filenameSafe = saccoName.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  doc.save(`matu-sacco-report-${filenameSafe}-${Date.now()}.pdf`);
}
