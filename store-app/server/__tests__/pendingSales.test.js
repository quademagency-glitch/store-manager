// Database behavior, including races and rollback, is exercised against actual
// PostgreSQL in checkout-transactions.db.cjs. These are the service contracts.
function load(result) {
  jest.resetModules();
  const mock = { rpc: jest.fn().mockResolvedValue(result) };
  jest.doMock('../db/supabase', () => ({ supabaseAdmin: mock }));
  return { mock, ...require('../services/pendingSales') };
}
for (const data of [{ reversed:true }, ...['completed','voided','void_pending','not-found'].map(skipped=>({reversed:false,skipped}))]) {
  test(`forwards atomic cancellation outcome ${JSON.stringify(data)}`,async()=>{
    const {mock,reversePendingSale}=load({data,error:null});
    expect(await reversePendingSale('sale-id')).toEqual(data);
    expect(mock.rpc).toHaveBeenCalledWith('cancel_pending_sale',{p_sale_id:'sale-id'});
  });
}
test('propagates a failed transaction instead of reporting restored inventory',async()=>{
  const error={message:'Inventory record is missing',code:'P0001'};
  const {reversePendingSale}=load({data:null,error});
  await expect(reversePendingSale('sale-id')).rejects.toEqual(error);
});
