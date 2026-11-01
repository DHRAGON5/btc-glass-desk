import {createServer} from 'node:http';
import worker from '../dist/server/index.js';

const port=Number(process.env.PORT||3000),server=createServer(async(req,res)=>{
  try{
    const request=new Request(`http://${req.headers.host}${req.url}`,{method:req.method,headers:req.headers});
    const response=await worker.fetch(request,{}, {waitUntil(promise){Promise.resolve(promise).catch(()=>{});}});
    res.statusCode=response.status;for(const [key,value] of response.headers)res.setHeader(key,value);res.end(Buffer.from(await response.arrayBuffer()));
  }catch(error){res.statusCode=500;res.end(error.message);}
});
server.listen(port,'0.0.0.0',()=>console.log(`Worker Vorschau auf Port ${port}`));
