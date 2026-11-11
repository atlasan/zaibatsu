/** Cross-check a single-product physical supply against its sourced inventory. */
export function modeBonusSupplyErrors(mode:any,products:any[]):string[] {
 if(mode.expansions?.length!==1)return [];
 const product=products.find(p=>p.game===mode.expansions[0]),component=product?.components?.find((c:any)=>c.kind==="bonus-counter");
 if(component && mode.bonusCounterSupply===undefined && !mode.provisional)return [`${mode.id}: official bonus-counter supply is required by the sourced product inventory`];
 return component && mode.bonusCounterSupply!==undefined && component.count!==mode.bonusCounterSupply?[`${mode.id}: bonus-counter supply must match the sourced product inventory (${component.count})`]:[];
}
