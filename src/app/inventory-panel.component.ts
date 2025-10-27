import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { InventoryState } from './types';

@Component({
  selector: 'app-inventory-panel',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="inventory">
      <div class="inv-row" *ngFor="let key of keys()" (mousedown)="beginDrag(key)" [class.disabled]="inventory[key].count<=0">
        <div class="icon" [ngClass]="iconClass(key)">{{abbr(key)}}</div>
        <div>
          <div style="font-weight:600">{{label(key)}}</div>
          <div class="hint">{{inventory[key].size}}×{{inventory[key].size}}<ng-container *ngIf="inventory[key].radius"> · R{{inventory[key].radius}}</ng-container></div>
        </div>
        <div class="qty">× {{inventory[key].count}}</div>
      </div>
    </div>
  `,
})
export class InventoryPanelComponent {
  @Input() inventory!: InventoryState;
  @Output() dragStart = new EventEmitter<string>();

  keys(){ return Object.keys(this.inventory); }
  label(k:string){ return this.inventory[k].name; }
  abbr(k:string){ return this.inventory[k].name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,3); }
  iconClass(k:string){ return this.inventory[k].cls; }
  beginDrag(key:string){ if(this.inventory[key].count>0) this.dragStart.emit(key); }
}
