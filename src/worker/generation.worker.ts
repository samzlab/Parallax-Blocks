/// <reference lib="webworker" />
import { generateSculpture } from '../domain/generator';
import type { WorkerRequest, WorkerResponse } from '../domain/types';

let cancelled=false;
self.onmessage=async(event:MessageEvent<WorkerRequest>)=>{
  if(event.data.type==='cancel'){cancelled=true;return;}
  cancelled=false;
  try{
    const sculpture=await generateSculpture(event.data.request,(phase,progress,message)=>self.postMessage({type:'progress',phase,progress,message} satisfies WorkerResponse),()=>cancelled);
    if(cancelled){self.postMessage({type:'cancelled'} satisfies WorkerResponse);return;}
    const transfers:Transferable[]=[sculpture.coordinates.buffer,sculpture.paletteIndices.buffer];if(sculpture.backdrop)transfers.push(sculpture.backdrop.coordinates.buffer);
    self.postMessage({type:'complete',sculpture} satisfies WorkerResponse,transfers);
  }catch(error){
    if(error instanceof DOMException&&error.name==='AbortError')self.postMessage({type:'cancelled'} satisfies WorkerResponse);
    else self.postMessage({type:'error',message:error instanceof Error?error.message:String(error)} satisfies WorkerResponse);
  }
};
