// Small RFC-4180 parser for exported test data, including quoted multiline cells.
export function parseCSV(input){
 const text=input.replace(/^\uFEFF/,''),rows=[];let row=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){
  const ch=text[i];
  if(ch==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
  else if(ch===','&&!quoted){row.push(cell);cell='';}
  else if((ch==='\r'||ch==='\n')&&!quoted){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(cell);rows.push(row);row=[];cell='';}
  else cell+=ch;
 }
 if(cell||row.length){row.push(cell);rows.push(row);}if(quoted)throw new Error('Unclosed CSV quote');
 const [headers=[],...values]=rows;return {headers,rows:values.map(r=>Object.fromEntries(headers.map((key,i)=>[key,r[i]??''])))};
}
