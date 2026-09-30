/* SUPPLY API — danh mục, vật tư, nhà cung cấp, phiếu nhập/xuất, kiểm kê */
const SupplyAPI = KioStore.bind({
  categories: KIO_CONFIG.supplyTables.categories, supplies: KIO_CONFIG.supplyTables.supplies,
  suppliers: KIO_CONFIG.supplyTables.suppliers, receipts: KIO_CONFIG.supplyTables.receipts,
  issues: KIO_CONFIG.supplyTables.issues, stocktakes: KIO_CONFIG.supplyTables.stocktakes,
  warehouses: KIO_CONFIG.supplyTables.warehouses, locations: KIO_CONFIG.supplyTables.locations, lots: KIO_CONFIG.supplyTables.lots,
  balances: KIO_CONFIG.supplyTables.balances, transfers: KIO_CONFIG.supplyTables.transfers, conversions: KIO_CONFIG.supplyTables.conversions,
});
