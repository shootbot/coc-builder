// === Types for specs / inventory / board events ===
export interface BuildingSpec {
  name: string;
  size: number;     // tile size (1..)
  radius: number;   // attack radius in tiles (can be fractional)
  cls: string;      // visual class (for color/icon)
}
export interface BuildingDef extends BuildingSpec {
  key: string;      // stable id
  count: number;    // how many available initially
}
export type InventoryState = Record<string, {
  name: string; size: number; count: number; radius: number; cls: string
}>;
export interface PlacedBuilding {
  id: string; key: string; x: number; y: number;
  size: number; radius: number; cls: string; selected: boolean;
}

export type ExpandDir = 'N' | 'E' | 'S' | 'W';
export interface BoardPlaceEvent { id:string; key:string; x:number; y:number; size:number; radius:number; cls:string }
export interface BoardMoveEvent  extends BoardPlaceEvent {}
export interface BoardExpandEvent { id: string; dir: ExpandDir }

// === Single source of truth: all building definitions ===
export const SPEC_DEFS: BuildingDef[] = [
  { key:'cannon',        name:'cannon',        size:3, radius: 9,   count: 5, cls:'cannon' },
  { key:'archer-tower',  name:'archer tower',  size:3, radius:10,   count: 6, cls:'archer' },
  { key:'wall',          name:'wall',          size:1, radius: 0,   count:250, cls:'wall' },
  { key:'mortar',        name:'mortar',        size:3, radius:11,   count: 4, cls:'mortar' },
  { key:'air-defense',   name:'air defense',   size:3, radius:10,   count: 4, cls:'airdef' },
  { key:'wizard-tower',  name:'wizard tower',  size:3, radius: 7,   count: 4, cls:'wizard' },
  { key:'air-sweeper',   name:'air sweeper',   size:2, radius:15,   count: 2, cls:'sweeper' },
  { key:'hidden-tesla',  name:'hidden tesla',  size:2, radius: 7,   count: 4, cls:'tesla' },
  { key:'bomb-tower',    name:'bomb tower',    size:3, radius: 6,   count: 1, cls:'bomb' },
  { key:'xbow',          name:'x-bow',         size:3, radius:11.5, count: 2, cls:'xbow' },
  { key:'storage',       name:'storage',       size:3, radius: 0,   count: 7, cls:'storage' },
  { key:'townhall',      name:'townhall',      size:4, radius: 0,   count: 1, cls:'th' },
  { key:'clan-castle',   name:'clan castle',   size:3, radius:13,   count: 1, cls:'clan' },
  { key:'hero-beacon',   name:'hero beacon',   size:2, radius:10,   count: 1, cls:'hero' },
  { key:'spring-trap',   name:'spring trap',   size:1, radius: 0,   count: 6, cls:'spring' },
];

// Derived maps (no duplication)
export const SPECS: Record<string, BuildingSpec> =
  Object.fromEntries(SPEC_DEFS.map(d => [d.key, { name:d.name, size:d.size, radius:d.radius, cls:d.cls }]));

export const INITIAL_INVENTORY: InventoryState =
  Object.fromEntries(SPEC_DEFS.map(d => [d.key, { name:d.name, size:d.size, count:d.count, radius:d.radius, cls:d.cls }]));
