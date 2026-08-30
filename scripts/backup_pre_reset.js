require('dotenv').config({ path: '.env' });
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const ALL_TABLES = [
  'profiles',
  'categories',
  'brands',
  'units',
  'products',
  'services',
  'customers',
  'suppliers',
  'payment_methods',
  'payment_instruments',
  'aeps_banks',
  'aeps_portals',
  'upi_merchant_qrs',
  'recharge_providers',
  'recharge_commission_slabs',
  'whatsapp_templates',
  'whatsapp_opt_outs',
  'whatsapp_gateway_secrets',
  'settings',
  'saved_contacts',
  'invoices',
  'invoice_items',
  'payments',
  'quick_sales',
  'quick_sale_items',
  'purchases',
  'purchase_items',
  'supplier_ledger',
  'stock_movements',
  'customer_ledger',
  'transactions',
  'cash_entries',
  'expenses',
  'settlements',
  'closings',
  'closing_balances',
  'opening_positions',
  'opening_balances',
  'returns',
  'return_items',
  'whatsapp_outbox',
  'whatsapp_logs',
  'notification_reads',
  'audit_runs',
  'audit_findings',
  'ai_audit_snapshots',
  'ai_document_vault',
  'audit_logs'
];

async function createBackup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(__dirname, '..', 'supabase', 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const jsonBackupPath = path.join(backupDir, `backup_pre_reset_${timestamp}.json`);
  const metaBackupPath = path.join(backupDir, `backup_metadata_${timestamp}.json`);

  console.log(`[Backup] Starting full database snapshot at ${new Date().toISOString()}...`);
  console.log(`[Backup] Target: ${process.env.NEXT_PUBLIC_SUPABASE_URL}`);

  const snapshot = {
    metadata: {
      timestamp: new Date().toISOString(),
      target_supabase_url: process.env.NEXT_PUBLIC_SUPABASE_URL,
      git_commit: '430b56fcd86a0c4f63f6cb19305010311e3b239e',
      backup_type: 'FULL_PRE_RESET_SNAPSHOT'
    },
    tables: {},
    counts: {}
  };

  for (const table of ALL_TABLES) {
    try {
      const { data, error, count } = await supabase
        .from(table)
        .select('*', { count: 'exact' });

      if (error) {
        console.warn(`[Backup] Table '${table}' query note:`, error.message);
        snapshot.tables[table] = { status: 'skipped_or_error', message: error.message };
        snapshot.counts[table] = 0;
      } else {
        snapshot.tables[table] = data || [];
        snapshot.counts[table] = data ? data.length : 0;
        console.log(`[Backup] Captured '${table}': ${data ? data.length : 0} rows`);
      }
    } catch (e) {
      console.warn(`[Backup] Exception on '${table}':`, e.message);
      snapshot.tables[table] = { status: 'exception', message: e.message };
      snapshot.counts[table] = 0;
    }
  }

  fs.writeFileSync(jsonBackupPath, JSON.stringify(snapshot, null, 2), 'utf8');
  fs.writeFileSync(metaBackupPath, JSON.stringify({
    backup_file: jsonBackupPath,
    ...snapshot.metadata,
    table_counts: snapshot.counts
  }, null, 2), 'utf8');

  console.log(`\n✅ [Backup] Checkpoint created successfully!`);
  console.log(`   JSON Snapshot: ${jsonBackupPath}`);
  console.log(`   Metadata File: ${metaBackupPath}`);
  return { jsonBackupPath, metaBackupPath, counts: snapshot.counts };
}

createBackup();
