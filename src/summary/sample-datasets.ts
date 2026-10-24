import type { RawIngestFile } from '../../contracts/index.js';
import nimbusCsv from '../../data/sample_b2b/nimbus_cloud_saas_fy2025.csv?raw';
import revArrCsv from '../../data/sample_b2b/multi_table_cfo_audit/01_revenue_and_arr_settlements_2025.csv?raw';
import opexCsv from '../../data/sample_b2b/multi_table_cfo_audit/02_cloud_and_opex_ledger_2025.csv?raw';
import capexJson from '../../data/sample_b2b/multi_table_cfo_audit/03_capex_and_treasury_2025.json?raw';

export interface SampleDatasetPreset {
  id: string;
  name: string;
  badge: string;
  description: string;
  entityName: string;
  files: RawIngestFile[];
}

export const SAMPLE_DATASETS: SampleDatasetPreset[] = [
  {
    id: 'nimbus_saas',
    name: 'Nimbus Cloud SaaS FY2025',
    badge: 'Enterprise ARR & Cloud OpEx',
    description: 'High-growth B2B Cloud ledger: Stripe ARR settlements, AWS/Snowflake compute, and facilities.',
    entityName: 'Nimbus Cloud SaaS',
    files: [
      {
        name: 'nimbus_cloud_saas_fy2025.csv',
        mimeType: 'text/csv',
        content: nimbusCsv,
        encoding: 'utf8',
      },
    ],
  },
  {
    id: 'cfo_audit',
    name: 'Multi-Table Enterprise CFO Audit',
    badge: 'Consolidated 3-Sheet Ledger',
    description: 'Full multi-table ledger: 01 Revenue & ARR, 02 Cloud & OpEx, and 03 CapEx & Treasury reserves.',
    entityName: 'Nimbus AI Cloud Corp',
    files: [
      {
        name: '01_revenue_and_arr_settlements_2025.csv',
        mimeType: 'text/csv',
        content: revArrCsv,
        encoding: 'utf8',
      },
      {
        name: '02_cloud_and_opex_ledger_2025.csv',
        mimeType: 'text/csv',
        content: opexCsv,
        encoding: 'utf8',
      },
      {
        name: '03_capex_and_treasury_2025.json',
        mimeType: 'application/json',
        content: capexJson,
        encoding: 'utf8',
      },
    ],
  },
  {
    id: 'northbank_coffee',
    name: 'Northbank Roasters & Retail POS',
    badge: 'High-Volume Retail POS',
    description: 'Multi-site coffee roastery & cafe trading log with daily item breakdowns, COGS, and footfall.',
    entityName: 'Northbank Roasters',
    files: [
      {
        name: 'northbank_trading_pos_2025.csv',
        mimeType: 'text/csv',
        content: `Date,Vendor,Department,Description,Amount,Currency
2025-01-02,Square POS Terminals,Retail Sales & Inflow,Northbank Cafe Daily POS Register Settlement,4850.00,GBP
2025-01-03,Monmouth Green Beans,COGS & Coffee Supply,Single-Origin Ethiopian Arabica 500kg Sack,-3400.00,GBP
2025-01-05,Square POS Terminals,Retail Sales & Inflow,Northbank Cafe Daily POS Register Settlement,5210.00,GBP
2025-01-07,Oatly Barista Wholesale,Dairy & Milk Alternatives,Barista Edition Oat Milk Pallet - 120 Cases,-1850.00,GBP
2025-01-10,Square POS Terminals,Retail Sales & Inflow,Northbank Cafe Daily POS Register Settlement,4980.00,GBP
2025-01-12,La Marzocco UK,Equipment & Maintenance,Commercial Espresso Machine Preventative Service,-850.00,GBP
2025-01-15,Square POS Terminals,Retail Sales & Inflow,Northbank Cafe Daily POS Register Settlement,5640.00,GBP
2025-01-18,St. John Bakery,Fresh Pastries & Bakery,Weekly Sourdough, Viennoiserie & Cardamom Buns,-1240.00,GBP
2025-01-20,Square POS Terminals,Retail Sales & Inflow,Northbank Cafe Daily POS Register Settlement,5190.00,GBP
2025-01-25,Square POS Terminals,Retail Sales & Inflow,Northbank Cafe Daily POS Register Settlement,6230.00,GBP
2025-02-02,Square POS Terminals,Retail Sales & Inflow,Northbank Cafe Daily POS Register Settlement,5420.00,GBP
2025-02-06,Monmouth Green Beans,COGS & Coffee Supply,Guatemala Huehuetenango Washed Lots - 600kg,-4100.00,GBP
2025-02-14,Square POS Terminals,Retail Sales & Inflow,Valentine's Special Tasting Menu & Retail Bags,7150.00,GBP
2025-02-20,Packaging Direct UK,Packaging & Consumables,Compostable Takeaway Cups & Kraft Coffee Pouches,-1620.00,GBP
2025-03-05,Square POS Terminals,Retail Sales & Inflow,Northbank Cafe Daily POS Register Settlement,5890.00,GBP
2025-03-12,Monmouth Green Beans,COGS & Coffee Supply,Colombia Geisha Micro-Lot Reserve Lots,-5200.00,GBP
2025-03-20,Square POS Terminals,Retail Sales & Inflow,Northbank Cafe Daily POS Register Settlement,6410.00,GBP
2025-04-04,Square POS Terminals,Retail Sales & Inflow,Easter Weekend Spring Roasts & Coffee Flights,8250.00,GBP
2025-04-18,Square POS Terminals,Retail Sales & Inflow,Northbank Cafe Daily POS Register Settlement,6100.00,GBP
2025-05-02,Square POS Terminals,Retail Sales & Inflow,Bank Holiday Patio Trading & Cold Brew Tap Sales,7920.00,GBP
2025-05-15,Monmouth Green Beans,COGS & Coffee Supply,Kenya Nyeri Hill Natural Process Lot,-4600.00,GBP
2025-06-08,Square POS Terminals,Retail Sales & Inflow,Summer Cold Brew Festival & Retail Merchandise,8450.00,GBP
2025-07-12,Square POS Terminals,Retail Sales & Inflow,Northbank Cafe Daily POS Register Settlement,7300.00,GBP
2025-08-15,Square POS Terminals,Retail Sales & Inflow,Northbank Cafe Daily POS Register Settlement,7480.00,GBP
2025-09-05,Square POS Terminals,Retail Sales & Inflow,Autumn Roasting Season Launch & Subscriptions,8120.00,GBP
2025-10-04,Square POS Terminals,Retail Sales & Inflow,Northbank Cafe Daily POS Register Settlement,6950.00,GBP
2025-11-15,Square POS Terminals,Retail Sales & Inflow,Pre-Holiday Gift Box Pre-Orders & Subscription Surge,9240.00,GBP
2025-11-20,Monmouth Green Beans,COGS & Coffee Supply,Holiday Winter Blend Green Coffee Tranche,-5800.00,GBP
2025-12-05,Square POS Terminals,Retail Sales & Inflow,Holiday Gift Shop & Single Origin Advent Calendars,11450.00,GBP
2025-12-18,Square POS Terminals,Retail Sales & Inflow,Peak Holiday Retail & Festive Catering Deliveries,12800.00,GBP
2025-12-24,Square POS Terminals,Retail Sales & Inflow,Christmas Eve Cafe & Last-Minute Retail Beans,9600.00,GBP
`,
        encoding: 'utf8',
      },
    ],
  },
];
