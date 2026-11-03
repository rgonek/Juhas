const pad=value=>String(value).padStart(2,'0');
const sameDay=(a,b)=>a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate();

export function formatCommitTime(timestampSeconds,nowMs=Date.now()){
 if(typeof timestampSeconds!=='number'||!Number.isFinite(timestampSeconds)||typeof nowMs!=='number'||!Number.isFinite(nowMs))return '';
 const date=new Date(timestampSeconds*1000),now=new Date(nowMs);
 if(!Number.isFinite(date.getTime())||!Number.isFinite(now.getTime())||date.getFullYear()<0||date.getFullYear()>9999)return '';
 const age=(nowMs-date.getTime())/1000;
 if(age>=-60&&age<10800){
  if(age<60)return 'just now';
  const count=Math.floor(age/(age<3600?60:3600)),unit=age<3600?'minute':'hour';
  return `${count} ${unit}${count===1?'':'s'} ago`;
 }
 const time=`${pad(date.getHours())}:${pad(date.getMinutes())}`;
 if(sameDay(date,now))return `Today ${time}`;
 const yesterday=new Date(now.getFullYear(),now.getMonth(),now.getDate()-1);
 if(sameDay(date,yesterday))return `Yesterday ${time}`;
 return `${String(date.getFullYear()).padStart(4,'0')}-${pad(date.getMonth()+1)}-${pad(date.getDate())} ${time}`;
}
