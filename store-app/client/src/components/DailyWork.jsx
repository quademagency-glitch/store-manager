import { Link } from 'react-router-dom';
import { useAuthContext } from '../lib/AuthContext';
import { useRecords, LoadState, Badge } from '../features/operations/WorkSurface';

export default function DailyWork({ summary, updatedAt }) {
  const { role, hasPermission, activeLocationId } = useAuthContext();
  const queue = useRecords(activeLocationId ? '/operations/daily-work' : null);
  const tasks = [
    { permission: 'manage_till', path: '/till-account', title: 'Open or close your till', hint: 'Count cash and record a handover' },
    { permission: 'view_inventory', path: '/inventory?stock=low_stock', title: 'Review stock shortages', hint: summary ? `${summary.lowStockCount ?? 0} reported · review branch thresholds` : 'Review branch thresholds and tracking' },
    { permission: 'receive_goods', path: '/purchase-orders?status=sent', title: 'Receive deliveries', hint: 'Match delivered units to purchase orders' },
    { permission: 'manage_purchases', path: '/inventory?tab=analytics&analysis=reorder', title: 'Prepare replenishment', hint: 'Review suggested quantities and suppliers' },
    { permission: 'manage_financials', path: '/accounts-receivable?tab=aging', title: 'Collect outstanding invoices', hint: 'Review overdue customer balances' },
    { permission: 'manage_financials', path: '/accounts-payable?tab=aging', title: 'Review supplier payments', hint: 'Check unpaid bills before recording payment' },
    { permission: 'approve_accounting', path: '/accounting-approvals', title: 'Review entries awaiting approval', hint: 'Check supporting records and amounts' },
    { permission: 'create_sales', path: '/sales', title: 'Continue selling', hint: 'Customer identity and unit tracking stay with every sale' },
  ].filter(task => hasPermission(task.permission));
  return <section className="workspace-panel" aria-label="Daily work">
    <h2>Needs your attention</h2>
    <LoadState resource={queue} />
    {queue.data?.errors.map(message=><p role="alert" className="work-error" key={message}>{message}</p>)}
    {queue.data && <div className="workspace-actions">{queue.data.items.map(task=><Link key={`${task.path}:${task.id}`} to={task.path}><span><strong>{task.title}</strong><small className="block">{task.detail}</small></span><Badge>{task.category}</Badge></Link>)}</div>}
    {queue.data && !queue.data.items.length && !queue.data.errors.length && <p className="workspace-status">No pending records in the available work queues.</p>}
    {queue.data && <p className="workspace-status">Updated {new Date(queue.data.updated_at).toLocaleTimeString()} · Up to 12 oldest records per queue.</p>}
    <h2>Your daily work</h2>
    <p className="workspace-status">{role} · {activeLocationId ? 'Working in the selected branch' : 'Choose a branch to work with stock and cash'}{updatedAt ? ` · Sales summary updated ${new Date(updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}</p>
    <div className="workspace-actions">{tasks.map(task => <Link key={task.path} to={task.path}><span>{task.title}<small className="block">{task.hint}</small></span><span aria-hidden="true">→</span></Link>)}</div>
  </section>;
}
