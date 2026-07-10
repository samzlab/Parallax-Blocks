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
    self.postMessage({type:'complete',sculpture} satisfies WorkerResponse,[sculpture.coordinates.buffer,sculpture.paletteIndices.buffer]);
  }catch(error){
    if(error instanceof DOMException&&error.name==='AbortError')self.postMessage({type:'cancelled'} satisfies WorkerResponse);
    else self.postMessage({type:'error',message:error instanceof Error?error.message:String(error)} satisfies WorkerResponse);
  }
};
