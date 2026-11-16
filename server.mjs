import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
const routes = new Map([['/','index.html'],...['app.js','model.js','style.css','data/input.json','data/candidates.json'].map(f=>['/'+f,f])]);
const server=createServer(async(req,res)=>{
  const file=routes.get(req.url);
  if(req.method!=='GET'||!file) return void res.writeHead(404).end('Not found');
  try {
    const content=await readFile(new URL(file,import.meta.url));
    const type=file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':'text/html';
    res.writeHead(200,{'Content-Type':type+'; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"}).end(content);
  }catch{res.writeHead(500).end('File unavailable');}
});
server.listen(Number(process.env.PORT||4194),'127.0.0.1',()=>console.log('クラウド連携の管理分担デモを起動しました'));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close());
