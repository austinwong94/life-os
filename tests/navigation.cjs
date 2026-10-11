async function workspace(page, mode) {
  if(mode==='calendar'){await workspace(page,'tasks');return page.locator('#planCalendarButton').click();}
  const desktop=page.locator('#'+mode+'ModeButton');
  if(await desktop.isVisible())return desktop.click();
  const mobile={today:'mobileTodayButton',tasks:'mobileTasksButton',board:'mobileBoardButton',priorities:'mobileProgressButton'}[mode];
  if(mobile)return page.locator('#'+mobile).click();
  await page.locator('#mobileMoreButton').click();
  await page.locator('#dailyDialog').getByRole('button',{name:mode==='board'?'My board':'Priorities',exact:true}).click();
}
async function capture(page) {
  if(await page.locator('#railAddButton').isVisible())return page.locator('#railAddButton').click();
  await page.locator('#mobileMoreButton').click();
  return page.locator('#dailyDialog').getByRole('button',{name:'Capture',exact:true}).click();
}
module.exports={workspace,capture};
