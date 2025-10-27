export interface BuildingSpec { name:string; size:number; radius:number; cls:string }
export type InventoryState = Record<string, { name:string; size:number; count:number; radius:number; cls:string }>;
export interface PlacedBuilding { id:string; key:string; x:number; y:number; size:number; radius:number; cls:string; selected:boolean }


export const DEFAULT_SPECS: Record<string, BuildingSpec> = {
wall100: { name:'wall100', size:1, radius:0, cls:'wall' },
tower: { name:'tower', size:3, radius:7, cls:'tower' },
cannon: { name:'cannon', size:3, radius:5, cls:'cannon' },
mortar: { name:'mortar', size:3, radius:11, cls:'mortar' },
'sorcery tower': { name:'sorcery tower', size:3, radius:4, cls:'sorcery' },
'tesla tower': { name:'tesla tower', size:2, radius:3, cls:'tesla' },
mine: { name:'mine', size:3, radius:0, cls:'mine' },
townhall: { name:'townhall', size:4, radius:0, cls:'th' },
'anti air': { name:'anti air', size:3, radius:8, cls:'aa' },
};


export interface BoardPlaceEvent { id:string; key:string; x:number; y:number; size:number; radius:number; cls:string }
export interface BoardMoveEvent extends BoardPlaceEvent {}
export type ExpandDir = 'N' | 'E' | 'S' | 'W';
export interface BoardExpandEvent { id: string; dir: ExpandDir }

