const months = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
];
const displayDay = (day) => day.split('-').reverse().join('.');
async function periodPopup(page) {
  await page.getByRole('button', { name: /^Dönem seç:/ }).click();
  return page.getByRole('dialog', { name: 'Dönem seçimi', exact: true });
}
async function setMonth(page, value) {
  const popup = await periodPopup(page);
  await popup.getByRole('button', { name: 'Ay', exact: true }).click();
  await popup.getByLabel('Dönem yılı', { exact: true }).fill(value.slice(0, 4));
  await popup
    .getByRole('button', { name: months[Number(value.slice(5, 7)) - 1], exact: true })
    .click();
  await popup.getByRole('button', { name: 'Uygula', exact: true }).click();
}
async function shortcut(page, label) {
  const popup = await periodPopup(page);
  await popup.getByRole('button', { name: label, exact: true }).click();
  await popup.getByRole('button', { name: 'Uygula', exact: true }).click();
}
async function setRange(page, start, end) {
  const popup = await periodPopup(page);
  await popup.getByRole('button', { name: 'Tarih aralığı', exact: true }).click();
  await popup.getByLabel('Başlangıç tarihi', { exact: true }).fill(displayDay(start));
  await popup.getByLabel('Bitiş tarihi', { exact: true }).fill(displayDay(end));
  await popup.getByRole('button', { name: 'Uygula', exact: true }).click();
}
function summary(page, label) {
  return page
    .locator('.summary-item')
    .filter({ has: page.locator('dt').getByText(label, { exact: true }) })
    .locator('dd');
}
async function expectSummary(page, label, value) {
  await summary(page, label).getByText(value, { exact: true }).waitFor();
}
async function discard(page) {
  await page.getByRole('button', { name: 'Vazgeç', exact: true }).click();
  const confirm = page.getByRole('alertdialog', {
    name: 'Değişiklikler kaydedilmedi',
    exact: true,
  });
  if (await confirm.isVisible())
    await confirm.getByRole('button', { name: 'Değişiklikleri bırak', exact: true }).click();
}
module.exports = {
  months,
  displayDay,
  periodPopup,
  setMonth,
  shortcut,
  setRange,
  summary,
  expectSummary,
  discard,
};
