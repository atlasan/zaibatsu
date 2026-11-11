import {test,expect} from "bun:test";
import inventory from "../spec/inventory.json";
import mode from "../spec/data/speedrunners/mode.json";
import {modeBonusSupplyErrors} from "./validate-bonus.ts";

test("mode physical bonus supply matches the independently sourced inventory",()=>{
 expect(modeBonusSupplyErrors(mode,inventory.products)).toEqual([]);expect(modeBonusSupplyErrors({...mode,bonusCounterSupply:23},inventory.products)).toHaveLength(1);expect(modeBonusSupplyErrors({...mode,bonusCounterSupply:undefined},inventory.products)).toHaveLength(1);expect(modeBonusSupplyErrors({...mode,bonusCounterSupply:undefined,provisional:true},inventory.products)).toEqual([]);
});
