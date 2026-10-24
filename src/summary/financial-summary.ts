import type {
  Category,
  DatasetBundle,
  Transaction,
} from '../../contracts/index.js';
import { formatMoneyMinor } from '../../contracts/index.js';
import { answerQuestionDeterministically } from '../ask/index.js';
import { CATEGORY_COLORS } from '../grid/interactive-grid.js';

export interface FinancialSummaryCallbacks {
  onPlayStory: () => void;
  onOpenGrid: () => void;
  onOpenAsk: (question?: string) => void;
  onUploadNew: () => void;
  onSelectTransaction?: (txn: Transaction) => void;
}

interface MonthlySummary {
  month: number;
  monthName: string;
  inflowMinor: number;
  outflowMinor: number;
  netMinor: number;
  count: number;
  topVendor: string;
}

interface DepartmentSummary {
  name: string;
  category: Category;
  outflowMinor: number;
  inflowMinor: number;
  count: number;
  pct: number;
  color: string;
}

interface CounterpartySummary {
  name: string;
  category: string;
  totalMinor: number;
  direction: 'in' | 'out';
  count: number;
  pct: number;
}

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

export class FinancialSummaryView {
  public readonly containerEl: HTMLElement;
  private bundle: DatasetBundle;
  private callbacks: FinancialSummaryCallbacks;

  // Interactive filtering state
  private activePeriod: 'all' | 'Q1' | 'Q2' | 'Q3' | 'Q4' | 'H1' | 'H2' | number = 'all';
  private activeFlow: 'all' | 'in' | 'out' = 'all';
  private activeDepartment: string = 'all';
  private activeSheet: string = 'all';
  private searchQuery: string = '';
  private sortColumn: 'date' | 'amount' | 'merchant' | 'department' = 'date';
  private sortAsc = false;
  private currentPage = 1;
  private readonly pageSize = 25;

  private selectedTxn: Transaction | null = null;
  private askResultHtml = '';

  constructor(
    containerEl: HTMLElement,
    bundle: DatasetBundle,
    callbacks: FinancialSummaryCallbacks
  ) {
    this.containerEl = containerEl;
    this.bundle = bundle;
    this.callbacks = callbacks;
  }

  public setDataset(bundle: DatasetBundle): void {
    this.bundle = bundle;
    this.activePeriod = 'all';
    this.activeFlow = 'all';
    this.activeDepartment = 'all';
    this.activeSheet = 'all';
    this.searchQuery = '';
    this.currentPage = 1;
    this.selectedTxn = null;
    this.askResultHtml = '';
    this.render();
  }

  public show(): void {
    this.containerEl.style.display = 'block';
    this.containerEl.style.visibility = 'visible';
    this.render();
  }

  public hide(): void {
    this.containerEl.style.display = 'none';
    this.containerEl.style.visibility = 'hidden';
  }

  private getCurrencySymbol(): string {
    return this.bundle.plan.business_meta?.currency_symbol ?? 'US$';
  }

  private formatAmount(minor: number): string {
    const sym = this.getCurrencySymbol();
    const formatted = formatMoneyMinor(minor, { showCents: true });
    return `${sym}${formatted}`;
  }

  /**
   * Identifies unique sheets/source files if multi-table workbook was uploaded.
   */
  private getAvailableSheets(): string[] {
    const files = this.bundle.plan.business_meta?.source_files ?? [];
    if (files.length <= 1) return [];
    return files.map((f) => f.replace(/^.*[/\\]/, '').replace(/\.csv$|\.json$|\.xlsx?$/i, ''));
  }

  /**
   * Filters transactions based on active UI controls.
   */
  private getFilteredTransactions(): Transaction[] {
    let list = this.bundle.transactions;

    // Filter by Sheet
    if (this.activeSheet !== 'all') {
      const targetSheet = this.activeSheet.toLowerCase();
      list = list.filter((t) => {
        const file = (t.source_row.account || '').toLowerCase();
        const desc = (t.raw_description || '').toLowerCase();
        return file.includes(targetSheet) || desc.includes(targetSheet);
      });
    }

    // Filter by Period
    if (this.activePeriod !== 'all') {
      if (typeof this.activePeriod === 'number') {
        const mStr = String(this.activePeriod).padStart(2, '0');
        list = list.filter((t) => t.date.slice(5, 7) === mStr);
      } else if (this.activePeriod === 'Q1') {
        list = list.filter((t) => ['01', '02', '03'].includes(t.date.slice(5, 7)));
      } else if (this.activePeriod === 'Q2') {
        list = list.filter((t) => ['04', '05', '06'].includes(t.date.slice(5, 7)));
      } else if (this.activePeriod === 'Q3') {
        list = list.filter((t) => ['07', '08', '09'].includes(t.date.slice(5, 7)));
      } else if (this.activePeriod === 'Q4') {
        list = list.filter((t) => ['10', '11', '12'].includes(t.date.slice(5, 7)));
      } else if (this.activePeriod === 'H1') {
        list = list.filter((t) =>
          ['01', '02', '03', '04', '05', '06'].includes(t.date.slice(5, 7))
        );
      } else if (this.activePeriod === 'H2') {
        list = list.filter((t) =>
          ['07', '08', '09', '10', '11', '12'].includes(t.date.slice(5, 7))
        );
      }
    }

    // Filter by Flow
    if (this.activeFlow === 'in') {
      list = list.filter((t) => t.direction === 'in');
    } else if (this.activeFlow === 'out') {
      list = list.filter((t) => t.direction === 'out');
    }

    // Filter by Department
    if (this.activeDepartment !== 'all') {
      list = list.filter(
        (t) =>
          (t.category_label && t.category_label === this.activeDepartment) ||
          t.category === this.activeDepartment
      );
    }

    // Search Query
    if (this.searchQuery.trim().length > 0) {
      const q = this.searchQuery.trim().toLowerCase();
      list = list.filter(
        (t) =>
          t.merchant.toLowerCase().includes(q) ||
          t.raw_description.toLowerCase().includes(q) ||
          (t.category_label && t.category_label.toLowerCase().includes(q)) ||
          t.category.toLowerCase().includes(q) ||
          t.date.includes(q) ||
          t.id.toLowerCase().includes(q)
      );
    }

    // Sorting
    const sorted = [...list].sort((a, b) => {
      let cmp = 0;
      if (this.sortColumn === 'date') {
        cmp = a.date.localeCompare(b.date);
      } else if (this.sortColumn === 'amount') {
        cmp = a.amount_minor - b.amount_minor;
      } else if (this.sortColumn === 'merchant') {
        cmp = a.merchant.localeCompare(b.merchant);
      } else if (this.sortColumn === 'department') {
        const da = a.category_label || a.category;
        const db = b.category_label || b.category;
        cmp = da.localeCompare(db);
      }
      return this.sortAsc ? cmp : -cmp;
    });

    return sorted;
  }

  /**
   * Computes high-level financial summary KPIs based on currently active subset.
   */
  private computeKPIs(txns: Transaction[]) {
    let totalInflowMinor = 0;
    let totalOutflowMinor = 0;
    let countIn = 0;
    let countOut = 0;
    const activeDaysSet = new Set<string>();

    for (const t of txns) {
      activeDaysSet.add(t.date);
      if (t.direction === 'in') {
        totalInflowMinor += t.amount_minor;
        countIn++;
      } else {
        totalOutflowMinor += t.amount_minor;
        countOut++;
      }
    }

    const netMinor = totalInflowMinor - totalOutflowMinor;
    const netMarginPct =
      totalInflowMinor > 0 ? ((netMinor / totalInflowMinor) * 100).toFixed(1) : 'N/A';

    const activeDaysCount = activeDaysSet.size || 1;
    const dailyBurnMinor = Math.round(totalOutflowMinor / Math.max(1, activeDaysCount));

    return {
      totalInflowMinor,
      totalOutflowMinor,
      netMinor,
      netMarginPct,
      countIn,
      countOut,
      totalCount: txns.length,
      activeDaysCount,
      dailyBurnMinor,
    };
  }

  /**
   * Computes 12-month performance breakdown for charts.
   */
  private computeMonthlySummaries(txns: Transaction[]): MonthlySummary[] {
    const months: MonthlySummary[] = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      monthName: MONTH_NAMES[i]!,
      inflowMinor: 0,
      outflowMinor: 0,
      netMinor: 0,
      count: 0,
      topVendor: '',
    }));

    const vendorByMonth = Array.from({ length: 12 }, () => new Map<string, number>());

    for (const t of txns) {
      const mIdx = Number.parseInt(t.date.slice(5, 7), 10) - 1;
      if (mIdx >= 0 && mIdx < 12) {
        const m = months[mIdx]!;
        m.count++;
        if (t.direction === 'in') {
          m.inflowMinor += t.amount_minor;
        } else {
          m.outflowMinor += t.amount_minor;
          const vMap = vendorByMonth[mIdx]!;
          vMap.set(t.merchant, (vMap.get(t.merchant) ?? 0) + t.amount_minor);
        }
        m.netMinor = m.inflowMinor - m.outflowMinor;
      }
    }

    for (let i = 0; i < 12; i++) {
      const vMap = vendorByMonth[i]!;
      let topV = '';
      let topAmt = -1;
      for (const [v, amt] of vMap.entries()) {
        if (amt > topAmt) {
          topAmt = amt;
          topV = v;
        }
      }
      months[i]!.topVendor = topV;
    }

    return months;
  }

  /**
   * Computes Department / Cost Center distribution.
   */
  private computeDepartmentSummaries(txns: Transaction[]): DepartmentSummary[] {
    const map = new Map<string, { cat: Category; inMinor: number; outMinor: number; count: number }>();
    let totalOutflow = 0;

    for (const t of txns) {
      const label = t.category_label || this.bundle.plan.category_labels?.[t.category] || t.category;
      let entry = map.get(label);
      if (!entry) {
        entry = { cat: t.category, inMinor: 0, outMinor: 0, count: 0 };
        map.set(label, entry);
      }
      entry.count++;
      if (t.direction === 'out') {
        entry.outMinor += t.amount_minor;
        totalOutflow += t.amount_minor;
      } else {
        entry.inMinor += t.amount_minor;
      }
    }

    const items: DepartmentSummary[] = [];
    for (const [name, data] of map.entries()) {
      const pct = totalOutflow > 0 ? (data.outMinor / totalOutflow) * 100 : 0;
      const color = CATEGORY_COLORS[data.cat] || '#F4F03A';
      items.push({
        name,
        category: data.cat,
        outflowMinor: data.outMinor,
        inflowMinor: data.inMinor,
        count: data.count,
        pct,
        color,
      });
    }

    items.sort((a, b) => b.outflowMinor - a.outflowMinor);
    return items;
  }

  /**
   * Computes Top Counterparties & Vendors.
   */
  private computeCounterparties(txns: Transaction[]): CounterpartySummary[] {
    const map = new Map<string, { total: number; direction: 'in' | 'out'; count: number; category: string }>();
    let grandTotal = 0;

    for (const t of txns) {
      grandTotal += t.amount_minor;
      let entry = map.get(t.merchant);
      if (!entry) {
        entry = {
          total: 0,
          direction: t.direction,
          count: 0,
          category: t.category_label || t.category,
        };
        map.set(t.merchant, entry);
      }
      entry.total += t.amount_minor;
      entry.count++;
    }

    const list: CounterpartySummary[] = [];
    for (const [name, data] of map.entries()) {
      const pct = grandTotal > 0 ? (data.total / grandTotal) * 100 : 0;
      list.push({
        name,
        category: data.category,
        totalMinor: data.total,
        direction: data.direction,
        count: data.count,
        pct,
      });
    }

    list.sort((a, b) => b.totalMinor - a.totalMinor);
    return list;
  }

  public render(): void {
    const txns = this.getFilteredTransactions();
    const allTxns = this.bundle.transactions;
    const kpis = this.computeKPIs(txns);
    const monthly = this.computeMonthlySummaries(txns);
    const departments = this.computeDepartmentSummaries(txns);
    const counterparties = this.computeCounterparties(txns);
    const sheets = this.getAvailableSheets();

    const entityName = this.bundle.plan.person_name || 'Enterprise Ledger';
    const periodLabel = this.bundle.plan.business_meta?.fiscal_period_label || `FY ${this.bundle.plan.year}`;
    const archetypeLabel = this.bundle.plan.business_meta?.archetype_label || 'Corporate Operating Ledger';

    // Pagination for ledger table
    const totalPages = Math.max(1, Math.ceil(txns.length / this.pageSize));
    const startIdx = (this.currentPage - 1) * this.pageSize;
    const pageTxns = txns.slice(startIdx, startIdx + this.pageSize);

    // Max volume for monthly chart
    const maxMonthlyVolume = Math.max(
      1,
      ...monthly.map((m) => Math.max(m.inflowMinor, m.outflowMinor))
    );

    // Unique departments for filter dropdown
    const allDeptNames = Array.from(
      new Set(allTxns.map((t) => t.category_label || this.bundle.plan.category_labels?.[t.category] || t.category))
    ).sort();

    // Multi-sheet tabs HTML
    const sheetTabsHtml =
      sheets.length > 0
        ? `
      <div style="display:flex;align-items:center;gap:6px;padding:8px 0;overflow-x:auto;" class="no-scrollbar">
        <span style="font-family:'JetBrains Mono',monospace;font-size:11px;text-transform:uppercase;color:var(--muted-bone);margin-right:6px">Sheets:</span>
        <button type="button" class="btn ${this.activeSheet === 'all' ? 'primary' : ''}" data-sheet="all" style="padding:6px 12px;font-size:11px">All Consolidated (${allTxns.length})</button>
        ${sheets
          .map(
            (s) =>
              `<button type="button" class="btn ${this.activeSheet === s ? 'primary' : ''}" data-sheet="${s}" style="padding:6px 12px;font-size:11px">${s}</button>`
          )
          .join('')}
      </div>
    `
        : '';

    this.containerEl.innerHTML = `
      <div style="min-height:100vh;background:#0d0d0c;color:var(--bone);font-family:'Inter Tight',system-ui,sans-serif;padding:24px 32px 80px 32px;box-sizing:border-box;">
        
        <!-- Header Zone (3-Zone Top Bar Contract) -->
        <header style="display:flex;align-items:center;justify-content:space-between;gap:32px;padding-bottom:20px;border-bottom:1.5px solid rgba(243,240,230,0.12);margin-bottom:24px;flex-wrap:wrap;">
          
          <!-- Zone 1: Brand wordmark -->
          <div style="display:flex;align-items:baseline;gap:12px;white-space:nowrap;" class="shrink-0">
            <h1 style="font-size:24px;font-weight:600;letter-spacing:-0.02em;margin:0;color:var(--bone)">${this.escapeHtml(entityName)}</h1>
            <span style="font-family:'JetBrains Mono',monospace;font-size:12px;letter-spacing:0.08em;color:var(--c1);text-transform:uppercase;">${this.escapeHtml(periodLabel)}</span>
            <span style="font-family:'JetBrains Mono',monospace;font-size:11px;color:rgba(243,240,230,0.45);text-transform:uppercase;">· ${this.escapeHtml(archetypeLabel)}</span>
          </div>

          <!-- Zone 2: Navigation views -->
          <nav style="display:flex;align-items:center;gap:12px;font-family:'JetBrains Mono',monospace;font-size:12px;text-transform:uppercase;" class="shrink-0">
            <button type="button" class="btn primary" id="sum-tab-summary" style="padding:8px 14px;background:var(--c1);color:var(--ink);border-color:var(--c1);font-weight:600">Executive Summary</button>
            <button type="button" class="btn" id="sum-btn-story" style="padding:8px 14px;border-color:rgba(243,240,230,0.3)">▶ Play Story (120 BPM)</button>
            <button type="button" class="btn" id="sum-btn-grid" style="padding:8px 14px;border-color:rgba(243,240,230,0.3)">📅 365-Day Grid</button>
            <button type="button" class="btn" id="sum-btn-ask" style="padding:8px 14px;border-color:rgba(243,240,230,0.3)">💬 Query Studio</button>
          </nav>

          <!-- Zone 3: Primary Action -->
          <div style="display:flex;align-items:center;gap:10px;" class="shrink-0">
            <button type="button" class="btn" id="sum-btn-upload-new" style="background:#1b1b1a;border-color:rgba(243,240,230,0.25);color:var(--bone)">
              + Upload Excel (.xlsx)
            </button>
            <button type="button" class="btn primary" id="sum-btn-export-csv" style="background:var(--bone);color:var(--ink);border-color:var(--bone);font-weight:600">
              Download CSV ↓
            </button>
          </div>
        </header>

        ${sheetTabsHtml}

        <!-- KPI Scoreboard Ribbon -->
        <section aria-label="Executive Financial KPIs" style="display:grid;grid-template-columns:repeat(auto-fit, minmax(210px, 1fr));gap:16px;margin:20px 0 28px 0;">
          
          <!-- Gross Inflow / Revenue -->
          <div style="background:#161615;border:1px solid rgba(243,240,230,0.1);padding:18px 20px;border-radius:4px;display:flex;flex-direction:column;justify-content:space-between;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <span style="font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:rgba(243,240,230,0.6);">Total Revenue / Inflows</span>
              <span style="font-family:'JetBrains Mono',monospace;font-size:10px;color:#16A34A;background:rgba(22,163,74,0.12);padding:2px 6px;border-radius:2px">${kpis.countIn} Inflows</span>
            </div>
            <div style="margin-top:10px;">
              <div style="font-family:'JetBrains Mono',monospace;font-size:28px;font-weight:600;letter-spacing:-0.03em;color:#16A34A;font-variant-numeric:tabular-nums">
                ${this.formatAmount(kpis.totalInflowMinor)}
              </div>
              <div style="font-size:11px;color:rgba(243,240,230,0.5);margin-top:4px;font-family:'JetBrains Mono',monospace">
                Avg. ${this.formatAmount(Math.round(kpis.totalInflowMinor / 12))}/mo
              </div>
            </div>
          </div>

          <!-- Total OPEX / Outflow -->
          <div style="background:#161615;border:1px solid rgba(243,240,230,0.1);padding:18px 20px;border-radius:4px;display:flex;flex-direction:column;justify-content:space-between;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <span style="font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:rgba(243,240,230,0.6);">Operating Outflows (OPEX)</span>
              <span style="font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--c4);background:rgba(255,90,20,0.12);padding:2px 6px;border-radius:2px">${kpis.countOut} Outflows</span>
            </div>
            <div style="margin-top:10px;">
              <div style="font-family:'JetBrains Mono',monospace;font-size:28px;font-weight:600;letter-spacing:-0.03em;color:var(--bone);font-variant-numeric:tabular-nums">
                ${this.formatAmount(kpis.totalOutflowMinor)}
              </div>
              <div style="font-size:11px;color:rgba(243,240,230,0.5);margin-top:4px;font-family:'JetBrains Mono',monospace">
                Run rate: ${this.formatAmount(Math.round(kpis.totalOutflowMinor / 12))}/mo
              </div>
            </div>
          </div>

          <!-- Net Operating Income / Profit -->
          <div style="background:#161615;border:1px solid rgba(243,240,230,0.1);padding:18px 20px;border-radius:4px;display:flex;flex-direction:column;justify-content:space-between;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <span style="font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:rgba(243,240,230,0.6);">Net Operating Income</span>
              <span style="font-family:'JetBrains Mono',monospace;font-size:10px;color:${kpis.netMinor >= 0 ? '#16A34A' : '#D97706'};background:rgba(244,240,58,0.1);padding:2px 6px;border-radius:2px">${kpis.netMarginPct}% Margin</span>
            </div>
            <div style="margin-top:10px;">
              <div style="font-family:'JetBrains Mono',monospace;font-size:28px;font-weight:600;letter-spacing:-0.03em;color:${kpis.netMinor >= 0 ? 'var(--c1)' : '#FF5A14'};font-variant-numeric:tabular-nums">
                ${kpis.netMinor >= 0 ? '+' : ''}${this.formatAmount(kpis.netMinor)}
              </div>
              <div style="font-size:11px;color:rgba(243,240,230,0.5);margin-top:4px;font-family:'JetBrains Mono',monospace">
                ${kpis.netMinor >= 0 ? 'Positive Operating Profit' : 'Net Operating Outflow'}
              </div>
            </div>
          </div>

          <!-- Daily Cash Velocity / Burn -->
          <div style="background:#161615;border:1px solid rgba(243,240,230,0.1);padding:18px 20px;border-radius:4px;display:flex;flex-direction:column;justify-content:space-between;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <span style="font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:rgba(243,240,230,0.6);">Daily Cash Velocity</span>
              <span style="font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--lav);background:rgba(169,162,224,0.12);padding:2px 6px;border-radius:2px">${kpis.activeDaysCount} Days</span>
            </div>
            <div style="margin-top:10px;">
              <div style="font-family:'JetBrains Mono',monospace;font-size:28px;font-weight:600;letter-spacing:-0.03em;color:var(--bone);font-variant-numeric:tabular-nums">
                ${this.formatAmount(kpis.dailyBurnMinor)}<span style="font-size:14px;color:rgba(243,240,230,0.4)">/day</span>
              </div>
              <div style="font-size:11px;color:rgba(243,240,230,0.5);margin-top:4px;font-family:'JetBrains Mono',monospace">
                ${kpis.totalCount.toLocaleString()} movements verified
              </div>
            </div>
          </div>

          <!-- Top Cost Center -->
          <div style="background:#161615;border:1px solid rgba(243,240,230,0.1);padding:18px 20px;border-radius:4px;display:flex;flex-direction:column;justify-content:space-between;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <span style="font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:rgba(243,240,230,0.6);">Top Cost Center</span>
              <span style="font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--c2);background:rgba(255,168,228,0.12);padding:2px 6px;border-radius:2px">${departments[0]?.pct.toFixed(0) ?? 0}% OPEX</span>
            </div>
            <div style="margin-top:10px;">
              <div style="font-size:18px;font-weight:600;color:var(--bone);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${this.escapeHtml(departments[0]?.name ?? 'None')}">
                ${this.escapeHtml(departments[0]?.name ?? 'None')}
              </div>
              <div style="font-family:'JetBrains Mono',monospace;font-size:13px;color:var(--c1);margin-top:4px;font-variant-numeric:tabular-nums">
                ${this.formatAmount(departments[0]?.outflowMinor ?? 0)}
              </div>
            </div>
          </div>

        </section>

        <!-- Filter Controls Strip -->
        <section aria-label="Financial Filter Controls" style="background:#141413;border:1px solid rgba(243,240,230,0.12);padding:14px 18px;border-radius:4px;margin-bottom:28px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;">
          
          <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;">
            
            <!-- Period Selector -->
            <div style="display:flex;align-items:center;gap:4px;background:#0d0d0c;padding:3px;border-radius:4px;border:1px solid rgba(243,240,230,0.12);">
              ${(['all', 'Q1', 'Q2', 'Q3', 'Q4', 'H1', 'H2'] as const)
                .map(
                  (p) =>
                    `<button type="button" class="btn-period" data-period="${p}" style="font-family:'JetBrains Mono',monospace;font-size:11px;padding:5px 9px;border:none;border-radius:3px;cursor:pointer;background:${
                      this.activePeriod === p ? 'var(--bone)' : 'transparent'
                    };color:${this.activePeriod === p ? 'var(--ink)' : 'rgba(243,240,230,0.7)'};font-weight:${
                      this.activePeriod === p ? '600' : '400'
                    }">${p === 'all' ? 'Full Year' : p}</button>`
                )
                .join('')}
            </div>

            <!-- Flow Filter -->
            <div style="display:flex;align-items:center;gap:4px;background:#0d0d0c;padding:3px;border-radius:4px;border:1px solid rgba(243,240,230,0.12);">
              ${(['all', 'in', 'out'] as const)
                .map(
                  (f) =>
                    `<button type="button" class="btn-flow" data-flow="${f}" style="font-family:'JetBrains Mono',monospace;font-size:11px;padding:5px 9px;border:none;border-radius:3px;cursor:pointer;background:${
                      this.activeFlow === f ? 'var(--bone)' : 'transparent'
                    };color:${this.activeFlow === f ? 'var(--ink)' : 'rgba(243,240,230,0.7)'};font-weight:${
                      this.activeFlow === f ? '600' : '400'
                    }">${f === 'all' ? 'All Flows' : f === 'in' ? 'Revenue / Inflows' : 'Operating Expenses'}</button>`
                )
                .join('')}
            </div>

            <!-- Department Dropdown -->
            <select id="sum-dept-select" style="background:#0d0d0c;color:var(--bone);border:1px solid rgba(243,240,230,0.16);padding:6px 12px;font-family:'JetBrains Mono',monospace;font-size:11.5px;border-radius:4px;outline:none;cursor:pointer;">
              <option value="all">All Departments (${allDeptNames.length})</option>
              ${allDeptNames
                .map(
                  (d) =>
                    `<option value="${this.escapeHtml(d)}" ${this.activeDepartment === d ? 'selected' : ''}>${this.escapeHtml(d)}</option>`
                )
                .join('')}
            </select>

            <!-- Reset Filters if active -->
            ${
              this.activePeriod !== 'all' ||
              this.activeFlow !== 'all' ||
              this.activeDepartment !== 'all' ||
              this.activeSheet !== 'all' ||
              this.searchQuery.trim().length > 0
                ? `<button type="button" id="sum-reset-filters-btn" style="font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--c1);background:transparent;border:1px solid var(--c1);padding:5px 10px;border-radius:3px;cursor:pointer;">Reset Filters ✕</button>`
                : ''
            }
          </div>

          <!-- Live Search Input -->
          <div style="position:relative;min-width:240px;flex:1;max-width:380px;">
            <input
              type="text"
              id="sum-search-input"
              placeholder="Search vendor, description, account…"
              value="${this.escapeHtml(this.searchQuery)}"
              style="width:100%;box-sizing:border-box;background:#0d0d0c;color:var(--bone);border:1px solid rgba(243,240,230,0.18);padding:7px 12px 7px 30px;font-family:'JetBrains Mono',monospace;font-size:12px;border-radius:4px;outline:none;"
            />
            <span style="position:absolute;left:10px;top:8px;font-size:12px;opacity:0.4;">🔍</span>
          </div>

        </section>

        <!-- Visual Analytics Grid (Monthly P&L Dual Bars + Department Breakdown + Trajectory) -->
        <div style="display:grid;grid-template-columns:1.5fr 1fr;gap:24px;margin-bottom:32px;">
          
          <!-- Monthly Performance Chart (Dual Bar + Net Indicator) -->
          <div style="background:#141413;border:1px solid rgba(243,240,230,0.1);padding:22px 24px;border-radius:4px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
              <div>
                <h3 style="font-size:16px;font-weight:600;margin:0;color:var(--bone)">Monthly Financial Performance (P&amp;L)</h3>
                <div style="font-size:11px;color:rgba(243,240,230,0.5);margin-top:3px;font-family:'JetBrains Mono',monospace">Revenue vs Expenses across 12 months · Click a month to filter</div>
              </div>
              <div style="display:flex;align-items:center;gap:14px;font-family:'JetBrains Mono',monospace;font-size:11px;">
                <span style="display:flex;align-items:center;gap:5px;"><i style="width:9px;height:9px;background:#16A34A;display:inline-block"></i> Inflows</span>
                <span style="display:flex;align-items:center;gap:5px;"><i style="width:9px;height:9px;background:var(--c4);display:inline-block"></i> Outflows</span>
              </div>
            </div>

            <!-- SVG Dual Bar Chart -->
            <div style="width:100%;height:220px;display:flex;align-items:flex-end;gap:8px;padding-top:20px;box-sizing:border-box;border-bottom:1px solid rgba(243,240,230,0.15)">
              ${monthly
                .map((m) => {
                  const inPct = (m.inflowMinor / maxMonthlyVolume) * 100;
                  const outPct = (m.outflowMinor / maxMonthlyVolume) * 100;
                  const isSelected = this.activePeriod === m.month;
                  return `
                  <div class="month-col" data-month="${m.month}" style="flex:1;height:100%;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;cursor:pointer;opacity:${
                    isSelected || this.activePeriod === 'all' ? '1' : '0.45'
                  };transition:opacity 0.15s;" title="${m.monthName}: Inflows ${this.formatAmount(
                    m.inflowMinor
                  )} | Outflows ${this.formatAmount(m.outflowMinor)} | Net ${this.formatAmount(m.netMinor)}">
                    
                    <div style="width:100%;display:flex;gap:2px;align-items:flex-end;height:180px;justify-content:center;">
                      <!-- Inflow Bar -->
                      <div style="width:42%;height:${Math.max(
                        2,
                        inPct
                      )}%;background:#16A34A;border-radius:2px 2px 0 0;transition:height 0.25s ease-out;"></div>
                      <!-- Outflow Bar -->
                      <div style="width:42%;height:${Math.max(
                        2,
                        outPct
                      )}%;background:var(--c4);border-radius:2px 2px 0 0;transition:height 0.25s ease-out;"></div>
                    </div>

                    <div style="font-family:'JetBrains Mono',monospace;font-size:11px;margin-top:8px;color:${
                      isSelected ? 'var(--c1)' : 'rgba(243,240,230,0.65)'
                    };font-weight:${isSelected ? '600' : '400'}">${m.monthName}</div>
                  </div>
                `;
                })
                .join('')}
            </div>

            <!-- Cumulative Cash Position Footnote -->
            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:14px;font-family:'JetBrains Mono',monospace;font-size:11.5px;color:rgba(243,240,230,0.55)">
              <span>Fiscal Year Net Accumulation: <b style="color:var(--c1)">${this.formatAmount(kpis.netMinor)}</b></span>
              <span>120 BPM Story ready</span>
            </div>
          </div>

          <!-- Cost Center & Department Breakdown -->
          <div style="background:#141413;border:1px solid rgba(243,240,230,0.1);padding:22px 24px;border-radius:4px;display:flex;flex-direction:column;justify-content:space-between;">
            <div>
              <h3 style="font-size:16px;font-weight:600;margin:0;color:var(--bone)">Cost Center &amp; Department Allocation</h3>
              <div style="font-size:11px;color:rgba(243,240,230,0.5);margin-top:3px;font-family:'JetBrains Mono',monospace">Ranked OPEX distribution · Click to filter ledger</div>
            </div>

            <div style="margin:16px 0;display:flex;flex-direction:column;gap:12px;">
              ${departments
                .slice(0, 5)
                .map((dept) => {
                  const isDeptActive = this.activeDepartment === dept.name;
                  return `
                  <div class="dept-row" data-dept="${this.escapeHtml(
                    dept.name
                  )}" style="cursor:pointer;padding:6px 8px;border-radius:3px;background:${
                    isDeptActive ? 'rgba(244,240,58,0.1)' : 'transparent'
                  };border:1px solid ${
                    isDeptActive ? 'var(--c1)' : 'transparent'
                  };transition:background-color 0.12s;">
                    <div style="display:flex;justify-content:space-between;align-items:center;font-size:12.5px;margin-bottom:4px;">
                      <span style="font-weight:500;color:var(--bone);display:flex;align-items:center;gap:6px;">
                        <i style="width:8px;height:8px;background:${dept.color};display:inline-block"></i>
                        ${this.escapeHtml(dept.name)}
                      </span>
                      <span style="font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--c1);font-variant-numeric:tabular-nums">
                        ${this.formatAmount(dept.outflowMinor)} <span style="font-size:10.5px;color:rgba(243,240,230,0.5)">(${dept.pct.toFixed(
                          1
                        )}%)</span>
                      </span>
                    </div>
                    <div style="width:100%;height:5px;background:#242422;border-radius:2px;overflow:hidden;">
                      <div style="width:${Math.max(2, dept.pct)}%;height:100%;background:${dept.color};"></div>
                    </div>
                  </div>
                `;
                })
                .join('')}
            </div>

            <div style="font-family:'JetBrains Mono',monospace;font-size:11px;color:rgba(243,240,230,0.45);text-align:right">
              Showing top 5 of ${departments.length} cost centers
            </div>
          </div>

        </div>

        <!-- Second Visual Row: Top Counterparties Leaderboard + Ask Query Bar -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:32px;">
          
          <!-- Top Counterparties Leaderboard -->
          <div style="background:#141413;border:1px solid rgba(243,240,230,0.1);padding:22px 24px;border-radius:4px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
              <div>
                <h3 style="font-size:16px;font-weight:600;margin:0;color:var(--bone)">Top Counterparties &amp; Vendors</h3>
                <div style="font-size:11px;color:rgba(243,240,230,0.5);margin-top:3px;font-family:'JetBrains Mono',monospace">Highest volume settlement partners</div>
              </div>
              <span style="font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--muted-bone)">${counterparties.length} Vendors</span>
            </div>

            <div style="display:flex;flex-direction:column;gap:8px;">
              ${counterparties
                .slice(0, 6)
                .map((cp, idx) => `
                <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;background:#1a1a19;border-radius:3px;font-family:'JetBrains Mono',monospace;font-size:12px;">
                  <div style="display:flex;align-items:center;gap:10px;min-width:0;">
                    <span style="color:rgba(243,240,230,0.4);font-size:10px;width:14px">${idx + 1}.</span>
                    <span style="font-weight:500;color:var(--bone);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${this.escapeHtml(
                      cp.name
                    )}</span>
                    <span style="font-size:10px;color:rgba(243,240,230,0.45);padding:1px 5px;background:#262624;border-radius:2px">${this.escapeHtml(
                      cp.category
                    )}</span>
                  </div>
                  <div style="display:flex;align-items:center;gap:12px;flex-shrink:0;">
                    <span style="color:${
                      cp.direction === 'in' ? '#16A34A' : 'var(--bone)'
                    };font-weight:600;font-variant-numeric:tabular-nums">${this.formatAmount(
                      cp.totalMinor
                    )}</span>
                    <button type="button" class="btn-vendor-filter" data-vendor="${this.escapeHtml(
                      cp.name
                    )}" style="font-size:10px;padding:2px 6px;background:transparent;border:1px solid rgba(243,240,230,0.2);color:rgba(243,240,230,0.8);border-radius:2px;cursor:pointer;">Filter</button>
                  </div>
                </div>
              `)
                .join('')}
            </div>
          </div>

          <!-- Ask Financial AI & Query Studio Card -->
          <div style="background:#141413;border:1px solid rgba(243,240,230,0.1);padding:22px 24px;border-radius:4px;display:flex;flex-direction:column;justify-content:space-between;">
            <div>
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                <h3 style="font-size:16px;font-weight:600;margin:0;color:var(--bone)">Financial Natural-Language Query Studio</h3>
                <span style="font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--c1);background:rgba(244,240,58,0.1);padding:2px 6px;border-radius:2px">&lt;1ms Deterministic</span>
              </div>
              <p style="font-size:12px;color:rgba(243,240,230,0.6);margin:0 0 14px 0;">
                Ask any question about this financial spreadsheet, vendors, dates, categories, or quarterly performance.
              </p>

              <!-- Query Input Bar -->
              <div style="display:flex;gap:8px;margin-bottom:12px;">
                <input
                  type="text"
                  id="sum-ask-input"
                  placeholder="e.g. How much did we spend on AWS in Q3?"
                  style="flex:1;background:#0d0d0c;color:var(--bone);border:1px solid rgba(243,240,230,0.22);padding:9px 12px;font-family:'JetBrains Mono',monospace;font-size:12px;border-radius:4px;outline:none;"
                />
                <button
                  type="button"
                  id="sum-ask-submit-btn"
                  style="padding:0 18px;background:var(--c1);color:var(--ink);border:none;border-radius:4px;font-family:'JetBrains Mono',monospace;font-size:11.5px;letter-spacing:0.06em;font-weight:600;text-transform:uppercase;cursor:pointer;"
                >
                  Ask ↵
                </button>
              </div>

              <!-- Instant Sample Query Chips -->
              <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;">
                ${[
                  'Highest spending month?',
                  'Total spend on Cloud & SaaS?',
                  'What was our Q3 net income?',
                  'Top 5 vendors by spend?',
                  'Average daily spend?',
                ]
                  .map(
                    (q) =>
                      `<button type="button" class="btn-ask-sample" data-q="${this.escapeHtml(
                        q
                      )}" style="font-family:'JetBrains Mono',monospace;font-size:10.5px;padding:4px 8px;background:#20201e;color:rgba(243,240,230,0.85);border:1px solid rgba(243,240,230,0.15);border-radius:3px;cursor:pointer;">${this.escapeHtml(
                        q
                      )}</button>`
                  )
                  .join('')}
              </div>

              <!-- Ask Result Area -->
              <div id="sum-ask-result-box" style="display:${
                this.askResultHtml ? 'block' : 'none'
              };background:#1b1b19;border:1px solid var(--c1);padding:12px 14px;border-radius:4px;margin-top:8px;">
                ${this.askResultHtml}
              </div>
            </div>

            <div style="font-family:'JetBrains Mono',monospace;font-size:11px;color:rgba(243,240,230,0.45);text-align:right">
              Powered by deterministic AST query engine
            </div>
          </div>

        </div>

        <!-- Interactive Detailed Ledger Table -->
        <section aria-label="Interactive Ledger Table" style="background:#141413;border:1px solid rgba(243,240,230,0.1);border-radius:4px;overflow:hidden;">
          
          <!-- Table Toolbar -->
          <div style="padding:16px 20px;border-bottom:1px solid rgba(243,240,230,0.1);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
            <div>
              <h3 style="font-size:16px;font-weight:600;margin:0;color:var(--bone)">Interactive Financial Ledger</h3>
              <div style="font-size:11px;color:rgba(243,240,230,0.5);margin-top:2px;font-family:'JetBrains Mono',monospace">
                Showing ${pageTxns.length} of ${txns.length} matching rows · Click any row for full line-item audit
              </div>
            </div>

            <div style="display:flex;align-items:center;gap:12px;font-family:'JetBrains Mono',monospace;font-size:11.5px;">
              <span>Page ${this.currentPage} of ${totalPages}</span>
              <button type="button" id="sum-page-prev" ${
                this.currentPage <= 1 ? 'disabled style="opacity:0.3;cursor:not-allowed"' : ''
              } class="btn" style="padding:4px 10px;font-size:11px">← Prev</button>
              <button type="button" id="sum-page-next" ${
                this.currentPage >= totalPages
                  ? 'disabled style="opacity:0.3;cursor:not-allowed"'
                  : ''
              } class="btn" style="padding:4px 10px;font-size:11px">Next →</button>
            </div>
          </div>

          <!-- Table Container -->
          <div style="overflow-x:auto;">
            <table style="width:100%;border-collapse:collapse;text-align:left;font-family:'JetBrains Mono',monospace;font-size:12px;">
              <thead>
                <tr style="background:#1a1a19;border-bottom:1.5px solid rgba(243,240,230,0.15);color:rgba(243,240,230,0.6);text-transform:uppercase;font-size:11px;letter-spacing:0.06em;">
                  <th style="padding:10px 14px;cursor:pointer;" class="sum-th-sort" data-sort="date">
                    Date ${this.sortColumn === 'date' ? (this.sortAsc ? '▲' : '▼') : ''}
                  </th>
                  <th style="padding:10px 14px;cursor:pointer;" class="sum-th-sort" data-sort="merchant">
                    Counterparty / Vendor ${
                      this.sortColumn === 'merchant' ? (this.sortAsc ? '▲' : '▼') : ''
                    }
                  </th>
                  <th style="padding:10px 14px;cursor:pointer;" class="sum-th-sort" data-sort="department">
                    Cost Center / Department ${
                      this.sortColumn === 'department' ? (this.sortAsc ? '▲' : '▼') : ''
                    }
                  </th>
                  <th style="padding:10px 14px;">Description / Memo</th>
                  <th style="padding:10px 14px;text-align:center;">Flow</th>
                  <th style="padding:10px 14px;text-align:right;cursor:pointer;" class="sum-th-sort" data-sort="amount">
                    Amount ${this.sortColumn === 'amount' ? (this.sortAsc ? '▲' : '▼') : ''}
                  </th>
                </tr>
              </thead>
              <tbody>
                ${
                  pageTxns.length === 0
                    ? `<tr><td colspan="6" style="padding:36px;text-align:center;color:rgba(243,240,230,0.4)">No transactions matching the active filters.</td></tr>`
                    : pageTxns
                        .map(
                          (t) => `
                  <tr class="sum-table-row" data-id="${t.id}" style="border-bottom:1px solid rgba(243,240,230,0.06);cursor:pointer;transition:background-color 0.12s;">
                    <td style="padding:9px 14px;color:rgba(243,240,230,0.7);white-space:nowrap;">${t.date}</td>
                    <td style="padding:9px 14px;font-weight:500;color:var(--bone);white-space:nowrap;">${this.escapeHtml(
                      t.merchant
                    )}</td>
                    <td style="padding:9px 14px;color:rgba(243,240,230,0.65);white-space:nowrap;">
                      <span style="padding:2px 6px;background:#20201e;border-radius:2px;font-size:11px;">
                        ${this.escapeHtml(
                          t.category_label || this.bundle.plan.category_labels?.[t.category] || t.category
                        )}
                      </span>
                    </td>
                    <td style="padding:9px 14px;color:rgba(243,240,230,0.85);max-width:320px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${this.escapeHtml(
                      t.raw_description
                    )}</td>
                    <td style="padding:9px 14px;text-align:center;white-space:nowrap;">
                      <span style="padding:2px 7px;border-radius:2px;font-size:10px;font-weight:600;letter-spacing:0.04em;background:${
                        t.direction === 'in' ? 'rgba(22,163,74,0.15)' : 'rgba(255,90,20,0.15)'
                      };color:${t.direction === 'in' ? '#16A34A' : '#FF5A14'};">
                        ${t.direction === 'in' ? 'INFLOW' : 'OPEX'}
                      </span>
                    </td>
                    <td style="padding:9px 14px;text-align:right;font-weight:600;color:${
                      t.direction === 'in' ? '#16A34A' : 'var(--bone)'
                    };font-variant-numeric:tabular-nums;white-space:nowrap;">
                      ${t.direction === 'in' ? '+' : '-'}${this.formatAmount(t.amount_minor)}
                    </td>
                  </tr>
                `
                        )
                        .join('')
                }
              </tbody>
            </table>
          </div>

          <!-- Table Bottom Pagination -->
          <div style="padding:12px 20px;background:#181817;border-top:1px solid rgba(243,240,230,0.08);display:flex;align-items:center;justify-content:space-between;font-family:'JetBrains Mono',monospace;font-size:11.5px;color:rgba(243,240,230,0.6);">
            <span>Displaying rows ${startIdx + 1}–${Math.min(startIdx + this.pageSize, txns.length)} of ${
              txns.length
            }</span>
            <div style="display:flex;gap:6px;">
              <button type="button" id="sum-page-prev-bottom" ${
                this.currentPage <= 1 ? 'disabled style="opacity:0.3;cursor:not-allowed"' : ''
              } class="btn" style="padding:4px 10px;font-size:11px">← Prev</button>
              <button type="button" id="sum-page-next-bottom" ${
                this.currentPage >= totalPages
                  ? 'disabled style="opacity:0.3;cursor:not-allowed"'
                  : ''
              } class="btn" style="padding:4px 10px;font-size:11px">Next →</button>
            </div>
          </div>

        </section>

      </div>

      <!-- Transaction Detail Inspection Modal -->
      <div id="sum-txn-modal" style="display:${
        this.selectedTxn ? 'flex' : 'none'
      };position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:90;align-items:center;justify-content:center;padding:20px;">
        ${this.renderTxnModalContent()}
      </div>
    `;

    this.bindEvents();
  }

  private renderTxnModalContent(): string {
    if (!this.selectedTxn) return '';
    const t = this.selectedTxn;
    const cat = t.category_label || this.bundle.plan.category_labels?.[t.category] || t.category;

    return `
      <div style="background:#181817;border:2px solid var(--bone);color:var(--bone);width:min(580px, 94vw);padding:28px 32px;font-family:'Inter Tight',sans-serif;position:relative;">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:16px;">
          <span style="font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:var(--c1)">Line Item Verification</span>
          <button type="button" id="sum-modal-close-btn" style="font-family:'JetBrains Mono',monospace;font-size:14px;background:none;border:none;color:var(--bone);cursor:pointer;">✕ Close</button>
        </div>

        <h2 style="font-size:26px;font-weight:600;margin:0 0 6px 0;">${this.escapeHtml(t.merchant)}</h2>
        <div style="font-family:'JetBrains Mono',monospace;font-size:32px;font-weight:600;color:${
          t.direction === 'in' ? '#16A34A' : 'var(--bone)'
        };margin-bottom:20px;font-variant-numeric:tabular-nums">
          ${t.direction === 'in' ? '+' : '-'}${this.formatAmount(t.amount_minor)}
        </div>

        <div style="display:flex;flex-direction:column;gap:10px;font-family:'JetBrains Mono',monospace;font-size:12px;border-top:1px solid rgba(243,240,230,0.15);padding-top:16px;">
          <div style="display:flex;justify-content:space-between;">
            <span style="color:rgba(243,240,230,0.5)">Date:</span>
            <span>${t.date}</span>
          </div>
          <div style="display:flex;justify-content:space-between;">
            <span style="color:rgba(243,240,230,0.5)">Cost Center / Dept:</span>
            <span>${this.escapeHtml(cat)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;">
            <span style="color:rgba(243,240,230,0.5)">Account / Source:</span>
            <span>${this.escapeHtml(t.source_row.account || 'Operating Ledger')}</span>
          </div>
          <div style="display:flex;justify-content:space-between;">
            <span style="color:rgba(243,240,230,0.5)">Transaction ID:</span>
            <span>${t.id}</span>
          </div>
          <div style="display:flex;flex-direction:column;gap:4px;margin-top:6px;">
            <span style="color:rgba(243,240,230,0.5)">Raw Description:</span>
            <div style="background:#0d0d0c;padding:8px 10px;border:1px solid rgba(243,240,230,0.1);border-radius:2px;font-size:11.5px;word-break:break-all;">
              ${this.escapeHtml(t.raw_description)}
            </div>
          </div>
        </div>

        <div style="margin-top:24px;display:flex;gap:10px;justify-content:flex-end;">
          <button type="button" id="sum-modal-filter-vendor" style="padding:8px 14px;background:#242422;color:var(--bone);border:1px solid rgba(243,240,230,0.25);font-family:'JetBrains Mono',monospace;font-size:11px;cursor:pointer;">
            Filter by ${this.escapeHtml(t.merchant)}
          </button>
          <button type="button" id="sum-modal-ok-btn" style="padding:8px 18px;background:var(--c1);color:var(--ink);border:none;font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:600;cursor:pointer;">
            Done
          </button>
        </div>
      </div>
    `;
  }

  private bindEvents(): void {
    // Mode Switching
    this.containerEl.querySelector('#sum-btn-story')?.addEventListener('click', () => {
      this.callbacks.onPlayStory();
    });

    this.containerEl.querySelector('#sum-btn-grid')?.addEventListener('click', () => {
      this.callbacks.onOpenGrid();
    });

    this.containerEl.querySelector('#sum-btn-ask')?.addEventListener('click', () => {
      this.callbacks.onOpenAsk();
    });

    this.containerEl.querySelector('#sum-btn-upload-new')?.addEventListener('click', () => {
      this.callbacks.onUploadNew();
    });

    // CSV Download
    this.containerEl.querySelector('#sum-btn-export-csv')?.addEventListener('click', () => {
      this.exportFilteredCsv();
    });

    // Sheet tabs
    const sheetBtns = this.containerEl.querySelectorAll<HTMLButtonElement>('button[data-sheet]');
    sheetBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        this.activeSheet = btn.dataset.sheet ?? 'all';
        this.currentPage = 1;
        this.render();
      });
    });

    // Period buttons
    const periodBtns = this.containerEl.querySelectorAll<HTMLButtonElement>('.btn-period');
    periodBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const p = btn.dataset.period;
        if (p) {
          if (p === 'all' || p === 'Q1' || p === 'Q2' || p === 'Q3' || p === 'Q4' || p === 'H1' || p === 'H2') {
            this.activePeriod = p;
          } else {
            const num = Number(p);
            if (!Number.isNaN(num)) {
              this.activePeriod = num;
            }
          }
          this.currentPage = 1;
          this.render();
        }
      });
    });

    // Flow buttons
    const flowBtns = this.containerEl.querySelectorAll<HTMLButtonElement>('.btn-flow');
    flowBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const f = btn.dataset.flow;
        if (f === 'all' || f === 'in' || f === 'out') {
          this.activeFlow = f;
          this.currentPage = 1;
          this.render();
        }
      });
    });

    // Department select
    const deptSelect = this.containerEl.querySelector<HTMLSelectElement>('#sum-dept-select');
    deptSelect?.addEventListener('change', () => {
      this.activeDepartment = deptSelect.value;
      this.currentPage = 1;
      this.render();
    });

    // Reset filters
    this.containerEl.querySelector('#sum-reset-filters-btn')?.addEventListener('click', () => {
      this.activePeriod = 'all';
      this.activeFlow = 'all';
      this.activeDepartment = 'all';
      this.activeSheet = 'all';
      this.searchQuery = '';
      this.currentPage = 1;
      this.render();
    });

    // Live search input
    const searchInput = this.containerEl.querySelector<HTMLInputElement>('#sum-search-input');
    searchInput?.addEventListener('input', () => {
      this.searchQuery = searchInput.value;
      this.currentPage = 1;
      this.render();
    });

    // Monthly chart column click
    const monthCols = this.containerEl.querySelectorAll<HTMLElement>('.month-col');
    monthCols.forEach((col) => {
      col.addEventListener('click', () => {
        const m = Number(col.dataset.month);
        this.activePeriod = this.activePeriod === m ? 'all' : m;
        this.currentPage = 1;
        this.render();
      });
    });

    // Department row click
    const deptRows = this.containerEl.querySelectorAll<HTMLElement>('.dept-row');
    deptRows.forEach((row) => {
      row.addEventListener('click', () => {
        const d = row.dataset.dept;
        if (d) {
          this.activeDepartment = this.activeDepartment === d ? 'all' : d;
          this.currentPage = 1;
          this.render();
        }
      });
    });

    // Vendor filter button in counterparty leaderboard
    const vendorBtns = this.containerEl.querySelectorAll<HTMLButtonElement>('.btn-vendor-filter');
    vendorBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const v = btn.dataset.vendor;
        if (v) {
          this.searchQuery = v;
          this.currentPage = 1;
          this.render();
        }
      });
    });

    // Ask query submission
    const askInput = this.containerEl.querySelector<HTMLInputElement>('#sum-ask-input');
    const askSubmit = this.containerEl.querySelector<HTMLButtonElement>('#sum-ask-submit-btn');
    const executeAsk = (q: string) => {
      if (!q.trim()) return;
      const res = answerQuestionDeterministically(q, this.bundle.transactions);
      this.askResultHtml = `
        <div style="font-size:11px;color:var(--c1);font-family:'JetBrains Mono',monospace;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;">
          Q: "${this.escapeHtml(q)}"
        </div>
        <div style="font-family:'JetBrains Mono',monospace;font-size:24px;font-weight:600;color:var(--bone);margin-bottom:6px;">
          ${this.escapeHtml(res.formatted_answer)}
        </div>
        <div style="font-size:12px;color:rgba(243,240,230,0.85);line-height:1.4;">
          ${this.escapeHtml(res.interpretation)}
        </div>
        <div style="margin-top:8px;font-family:'JetBrains Mono',monospace;font-size:11px;color:rgba(243,240,230,0.5);">
          ${res.matching_txn_ids.length} matching transactions verified
        </div>
      `;
      this.render();
    };

    askSubmit?.addEventListener('click', () => {
      if (askInput) executeAsk(askInput.value);
    });
    askInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        executeAsk(askInput.value);
      }
    });

    // Sample question chips
    const sampleChips = this.containerEl.querySelectorAll<HTMLButtonElement>('.btn-ask-sample');
    sampleChips.forEach((btn) => {
      btn.addEventListener('click', () => {
        const q = btn.dataset.q;
        if (q) {
          if (askInput) askInput.value = q;
          executeAsk(q);
        }
      });
    });

    // Table Sorting
    const sortHeaders = this.containerEl.querySelectorAll<HTMLElement>('.sum-th-sort');
    sortHeaders.forEach((th) => {
      th.addEventListener('click', () => {
        const col = th.dataset.sort;
        if (col === 'date' || col === 'amount' || col === 'merchant' || col === 'department') {
          if (this.sortColumn === col) {
            this.sortAsc = !this.sortAsc;
          } else {
            this.sortColumn = col;
            this.sortAsc = false;
          }
          this.render();
        }
      });
    });

    // Pagination buttons
    const prevFn = () => {
      if (this.currentPage > 1) {
        this.currentPage--;
        this.render();
      }
    };
    const nextFn = () => {
      const txns = this.getFilteredTransactions();
      const totalPages = Math.max(1, Math.ceil(txns.length / this.pageSize));
      if (this.currentPage < totalPages) {
        this.currentPage++;
        this.render();
      }
    };

    this.containerEl.querySelector('#sum-page-prev')?.addEventListener('click', prevFn);
    this.containerEl.querySelector('#sum-page-next')?.addEventListener('click', nextFn);
    this.containerEl.querySelector('#sum-page-prev-bottom')?.addEventListener('click', prevFn);
    this.containerEl.querySelector('#sum-page-next-bottom')?.addEventListener('click', nextFn);

    // Row click for detail modal
    const rows = this.containerEl.querySelectorAll<HTMLElement>('.sum-table-row');
    rows.forEach((row) => {
      row.addEventListener('click', () => {
        const id = row.dataset.id;
        const txn = this.bundle.transactions.find((t) => t.id === id);
        if (txn) {
          this.selectedTxn = txn;
          this.render();
        }
      });
    });

    // Modal close events
    const closeModal = () => {
      this.selectedTxn = null;
      this.render();
    };

    this.containerEl.querySelector('#sum-modal-close-btn')?.addEventListener('click', closeModal);
    this.containerEl.querySelector('#sum-modal-ok-btn')?.addEventListener('click', closeModal);
    this.containerEl.querySelector('#sum-modal-filter-vendor')?.addEventListener('click', () => {
      if (this.selectedTxn) {
        this.searchQuery = this.selectedTxn.merchant;
        this.selectedTxn = null;
        this.currentPage = 1;
        this.render();
      }
    });

    const modalBackdrop = this.containerEl.querySelector('#sum-txn-modal');
    modalBackdrop?.addEventListener('click', (e) => {
      if (e.target === modalBackdrop) {
        closeModal();
      }
    });
  }

  private exportFilteredCsv(): void {
    const txns = this.getFilteredTransactions();
    const rows = [
      ['Transaction ID', 'Date', 'Vendor', 'Department', 'Description', 'Flow', 'Amount', 'Currency'],
      ...txns.map((t) => [
        t.id,
        t.date,
        `"${t.merchant.replace(/"/g, '""')}"`,
        `"${(t.category_label || t.category).replace(/"/g, '""')}"`,
        `"${t.raw_description.replace(/"/g, '""')}"`,
        t.direction,
        (t.amount_minor / 100).toFixed(2),
        t.currency,
      ]),
    ];

    const csvContent = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute(
      'download',
      `${this.bundle.plan.person_name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_financial_summary.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
