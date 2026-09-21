import { useRef, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { apiRequest } from '../lib/api'
import { useResource } from '../hooks/useResource'
import LoadState from '../components/LoadState'

declare global { interface Window { Razorpay?: any } }
type Payment={id:number;registration_id?:number|null;amount:number;method:string;status:string;created_at:string;event_name:string;online_payment?:boolean;offline_payment?:boolean;can_pay?:boolean}
let checkoutLoading: Promise<boolean> | null = null
function loadRazorpay(): Promise<boolean> {
  if(window.Razorpay) return Promise.resolve(true)
  if(checkoutLoading) return checkoutLoading
  checkoutLoading = new Promise<boolean>(resolve => {
    document.querySelector('script[data-eventhub-razorpay]')?.remove()
    const script=document.createElement('script')
    const finish=(success:boolean)=>{clearTimeout(timer);script.onload=null;script.onerror=null;if(!success)script.remove();resolve(success)}
    const timer=window.setTimeout(()=>finish(false),15000)
    script.src='https://checkout.razorpay.com/v1/checkout.js';script.async=true;script.dataset.eventhubRazorpay='1'
    script.onload=()=>finish(Boolean(window.Razorpay));script.onerror=()=>finish(false)
    document.body.appendChild(script)
  }).finally(()=>{checkoutLoading=null})
  return checkoutLoading
}
export default function StudentPaymentsPage(){
  const {token,user}=useAuth()
  const records=useResource<{rows:Payment[]}>('/api/payments/my',token)
  const [busy,setBusy]=useState<number|null>(null),[error,setError]=useState(''),[message,setMessage]=useState('')
  const inFlight=useRef(false)
  function finish(){inFlight.current=false;setBusy(null)}
  async function pay(payment:Payment){
    if(!payment.registration_id||inFlight.current)return
    inFlight.current=true;setBusy(payment.id);setError('');setMessage('')
    const headers={Authorization:`Bearer ${token}`}
    try{
      if(!await loadRazorpay())throw new Error('Could not load checkout. Check your connection and try again.')
      const order=await apiRequest(`/api/payments/registration/${payment.registration_id}/order`,{method:'POST',headers})
      const checkout=new window.Razorpay({key:order.key_id,amount:order.amount,currency:order.currency,name:'GEMS EventHub',description:order.event_name,order_id:order.order_id,prefill:{name:user?.name||'',email:user?.email||''},modal:{ondismiss:finish},handler:async(response:any)=>{
        try{
          await apiRequest(`/api/payments/registration/${payment.registration_id}/verify`,{method:'POST',headers,body:JSON.stringify(response)})
          setMessage('Payment verified. Check My Registrations for your current registration status.');records.reload()
        }catch(error){setError(error instanceof Error?error.message:'Could not verify payment. Contact the coordinator with your payment reference before retrying.')}
        finally{finish()}
      }})
      checkout.on('payment.failed',(response:any)=>{setError(response?.error?.description||'Payment failed.');finish()})
      checkout.open()
    }catch(error){setError(error instanceof Error?error.message:'Could not start payment.');finish()}
  }
  return <section className="portal-content"><div className="page-toolbar"><div><span className="eyebrow">Payments</span><h2>My Payments</h2><p>Complete paid registrations and track payment status.</p></div></div>
    <LoadState loading={records.loading} error={records.error} retry={records.reload}/>
    {error&&<div className="form-alert error" role="alert">{error}</div>}{message&&<div className="form-alert success" role="status">{message}</div>}
    {!records.loading&&!records.error&&(records.data?.rows.length?<div className="payment-list">{records.data.rows.map(payment=><article key={payment.id}><div><small>{payment.created_at}</small><h3>{payment.event_name}</h3><p>{payment.method} · ₹{Number(payment.amount).toFixed(2)}</p></div><span className="status-pill">{payment.status}</span>{payment.status==='Pending'&&payment.online_payment&&payment.can_pay!==false&&<button className="button button-primary button-small" disabled={busy!==null} onClick={()=>pay(payment)}>{busy===payment.id?'Checkout open…':'Pay Online'}</button>}{payment.status==='Pending'&&payment.can_pay===false&&<span className="helper-text">Your team leader manages this payment.</span>}{payment.status==='Pending'&&!payment.online_payment&&payment.offline_payment&&<span className="helper-text">Contact the event coordinator for offline payment.</span>}</article>)}</div>:<div className="empty-state"><h3>No payments yet</h3><p>Paid event registrations create payment records automatically.</p></div>)}
  </section>
}
