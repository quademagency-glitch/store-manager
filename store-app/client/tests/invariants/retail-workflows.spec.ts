import {test,expect} from '@playwright/test';
import {gotoApp} from '../helpers';
test.skip(process.env.VITE_USE_MOCKS === 'empty', 'Populated workflow fixtures; empty-state behavior has its own suite.');

test('configured low-stock threshold and saved inventory view survive reload',async({page})=>{
 await gotoApp(page,'/inventory?stock=low_stock&density=compact');
 await expect(page.locator('.desktop-table-view').first()).toContainText('Gino Tomato Paste');
 await expect(page.locator('.workspace-table--compact')).toBeVisible();
 await page.reload();
 await expect(page.getByLabel('Stock status')).toHaveValue('low_stock');
 await expect(page.locator('.desktop-table-view').first()).toContainText('Gino Tomato Paste');
});

test('mobile checkout opens above catalogue, keeps customer and tracking gates, and restores parked baskets',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await gotoApp(page,'/sales');
 await page.getByRole('button',{name:'Add Perfumed Rice 5kg to cart'}).click();
 await page.locator('.pos-mobile-bar button').click();
 const cart=page.getByRole('dialog',{name:'Current order'});
 await expect(cart).toBeVisible();
 await expect(cart.getByRole('button',{name:'Select Customer First'})).toBeDisabled();
 await expect(cart).toContainText('unit codes are required');
 await cart.getByRole('button',{name:'Park basket'}).click();
 await expect(cart.getByLabel('Resume parked basket')).toContainText('1 unit ·');
 await page.reload();
 await page.locator('.pos-mobile-bar button').click();
 const resume=page.getByLabel('Resume parked basket');
 await expect(resume).toContainText('1 unit ·');
 await resume.selectOption({index:1});
 await expect(page.locator('.cart-items')).toContainText('Perfumed Rice');
 await expect(cart.getByRole('button',{name:'Select Customer First'})).toBeDisabled();
});

test('purchase form saves and restores line costs without silently substituting retail price',async({page})=>{
 await gotoApp(page,'/purchase-orders');
 await page.getByRole('button',{name:'Create PO',exact:true}).click();
 await page.getByRole('combobox',{name:'Supplier',exact:true}).selectOption({index:1});
 await page.getByRole('combobox',{name:'Product 1',exact:true}).selectOption({index:1});
 await page.getByLabel('Quantity',{exact:true}).fill('12');
 await page.getByLabel('Unit cost',{exact:true}).fill('7.50');
 await page.getByRole('button',{name:'Close & keep draft'}).click();
 await page.reload();
 await page.getByRole('button',{name:'Create PO',exact:true}).click();
 await expect(page.getByLabel('Quantity',{exact:true})).toHaveValue('12');
 await expect(page.getByLabel('Unit cost',{exact:true})).toHaveValue('7.50');
});

test('till open, cash count, variance and review can be completed in the UI',async({page})=>{
 await gotoApp(page,'/till-account');
 await page.getByLabel('Opening cash float').fill('100');
 await page.getByRole('button',{name:'Open till',exact:true}).click();
 await expect(page.getByText('Expected cash now')).toBeVisible();
 await page.getByLabel('Actual cash counted').fill('95');
 await page.getByLabel('Handover / variance explanation').fill('Five cedis short after count');
 await page.getByRole('button',{name:'Close till & record count'}).click();
 await page.getByText('Recent handovers',{exact:true}).click();
 await expect(page.getByText('Five cedis short after count')).toBeVisible();
 await page.getByLabel('Review note').fill('Checked by manager');
 await page.getByRole('button',{name:'Record review'}).click();
 await expect(page.getByText('Status: reviewed',{exact:false})).toBeVisible();
});

test('reorder handoff keeps product and purchasing cost and creates a reviewable PO',async({page})=>{
 await gotoApp(page,'/inventory?tab=analytics&analysis=reorder');
 await page.getByRole('checkbox',{name:'Reorder Gino Tomato Paste 400g at Osu Branch'}).check();
 await page.getByRole('button',{name:'Create PO from 1 items'}).click();
 const form=page.getByRole('dialog',{name:'Create purchase order'});
 await expect(form.getByRole('combobox',{name:'Product 1',exact:true})).toHaveValue('p6');
 await expect(form.getByLabel('Quantity',{exact:true})).toHaveValue('45');
 await expect(form.getByLabel('Unit cost',{exact:true})).toHaveValue('12');
 await form.getByRole('button',{name:'Create PO',exact:true}).click();
 await expect(form).not.toBeVisible();
 await expect(page.locator('.desktop-table-view')).toContainText('PO-TEST');
});

test('inventory detail returns to the same stock filter',async({page})=>{
 await gotoApp(page,'/inventory?stock=low_stock&q=Gino&density=compact');
 await page.locator('.desktop-table-view').getByRole('link',{name:'Gino Tomato Paste 400g',exact:true}).click();
 await page.getByRole('button',{name:/Back to Inventory/}).click();
 await expect(page.getByLabel('Stock status')).toHaveValue('low_stock');
 await expect(page.locator('.workspace-table--compact')).toBeVisible();
});
