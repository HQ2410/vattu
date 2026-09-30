/* KIO CONFIG — chỉ chứa cấu hình persistence (tên bảng, storage key). Không có business logic. */
const KIO_CONFIG = Object.freeze({
  supplyTables: Object.freeze({
    categories: 'vtsc_categories', supplies: 'vtsc_supplies', suppliers: 'vtsc_suppliers',
    receipts: 'vtsc_goods_receipts', issues: 'vtsc_goods_issues', stocktakes: 'vtsc_stocktakes',
    warehouses: 'vtsc_warehouses', locations: 'vtsc_locations', lots: 'vtsc_stock_lots',
    balances: 'vtsc_inventory_balances', transfers: 'vtsc_stock_transfers', conversions: 'vtsc_unit_conversions',
  }),
  purchaseTables: Object.freeze({
    purchaseRequests: 'vtsc_purchase_requests', quotes: 'vtsc_supplier_quotes', orders: 'vtsc_purchase_orders',
    standards: 'vtsc_material_standards', reorderRules: 'vtsc_reorder_rules',
  }),
  requestTables: Object.freeze({ requests: 'vtsc_material_requests' }),
  repairTables: Object.freeze({ equipment: 'vtsc_equipment', repairs: 'vtsc_repair_orders' }),
  maintenanceTables: Object.freeze({ schedules: 'vtsc_maintenance_schedules', maintLogs: 'vtsc_maintenance_logs', usage: 'vtsc_maintenance_material_usage', compat: 'vtsc_material_compatible_assets' }),
  systemTables: Object.freeze({ users: 'vtsc_users', audit: 'vtsc_audit_logs', approvals: 'vtsc_approval_requests' }),
  aiTables: Object.freeze({ forecasts: 'vtsc_ai_demand_forecasts', recommendations: 'vtsc_ai_recommendations', alerts: 'vtsc_ai_alerts' }),
  storageKeys: Object.freeze({ prefix: 'vtsc:cache:v1:', session: 'vtsc:session:v1' }),
});
