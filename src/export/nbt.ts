export const Tag = { End:0, Byte:1, Short:2, Int:3, Long:4, Float:5, Double:6, ByteArray:7, String:8, List:9, Compound:10, IntArray:11, LongArray:12 } as const;
export type NbtValue = { type:number; value:unknown };
export type NbtCompound = Record<string,NbtValue>;

export const nbt = {
  int:(value:number):NbtValue=>({type:Tag.Int,value}),
  long:(value:bigint):NbtValue=>({type:Tag.Long,value}),
  string:(value:string):NbtValue=>({type:Tag.String,value}),
  longArray:(value:bigint[]):NbtValue=>({type:Tag.LongArray,value}),
  compound:(value:NbtCompound):NbtValue=>({type:Tag.Compound,value}),
  list:(childType:number,value:unknown[]):NbtValue=>({type:Tag.List,value:{childType,value}}),
};

class Writer {
  private bytes:number[]=[];
  byte(value:number){this.bytes.push(value&255);}
  short(value:number){this.byte(value>>>8);this.byte(value);}
  int(value:number){this.byte(value>>>24);this.byte(value>>>16);this.byte(value>>>8);this.byte(value);}
  long(value:bigint){for(let shift=56n;shift>=0n;shift-=8n)this.byte(Number((value>>shift)&255n));}
  string(value:string){const encoded=new TextEncoder().encode(value);this.short(encoded.length);this.bytes.push(...encoded);}
  payload(type:number,value:unknown){
    if(type===Tag.Int)this.int(value as number);
    else if(type===Tag.Long)this.long(value as bigint);
    else if(type===Tag.String)this.string(value as string);
    else if(type===Tag.LongArray){const values=value as bigint[];this.int(values.length);for(const item of values)this.long(item);}
    else if(type===Tag.Compound){for(const [name,child] of Object.entries(value as NbtCompound)){this.byte(child.type);this.string(name);this.payload(child.type,child.value);}this.byte(Tag.End);}
    else if(type===Tag.List){const list=value as {childType:number;value:unknown[]};this.byte(list.childType);this.int(list.value.length);for(const item of list.value)this.payload(list.childType,item);}
    else throw new Error(`NBT tag ${type} is not implemented.`);
  }
  finish(){return Uint8Array.from(this.bytes);}
}

export function writeNbt(root:NbtCompound):Uint8Array{
  const writer=new Writer();writer.byte(Tag.Compound);writer.string('');writer.payload(Tag.Compound,root);return writer.finish();
}
