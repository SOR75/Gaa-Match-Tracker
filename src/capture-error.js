// Surface a rejected attribution without losing the saved event or closing capture.
export function captureAttempt(root,save){
 let error=root.querySelector('[data-capture-error]');
 try{save();if(error)error.hidden=true;return true;}
 catch(reason){if(!error){error=document.createElement('p');error.dataset.captureError='';error.className='warning';error.setAttribute('role','alert');root.append(error);}error.textContent=reason.message||'This player is not eligible for this event.';error.hidden=false;return false;}
}
