import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { BeamModel } from '../src/model';

async function exportedModel(page: Page): Promise<BeamModel> {
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '保存 JSON', exact: true }).click();
  const download = await downloadPromise;
  return JSON.parse(await readFile((await download.path())!, 'utf8')) as BeamModel;
}

async function canvasCoordinates(page: Page) {
  const box = await page.getByTestId('beam-canvas').boundingBox();
  if (!box) throw new Error('模型画布未显示');
  const scale = Math.max(25, Math.min(95, (box.width - 140) / 8));
  return (x: number, y: number) => ({
    x: box.x + box.width / 2 + (x - 3) * scale,
    y: box.y + 225 - y * scale,
  });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('max-moment')).toContainText('15');
});

for (const geometry of [
  { name: 'vertical', end: { x: 1, y: 2 } },
  { name: 'diagonal', end: { x: 3, y: 2 } },
]) {
  test(`connects ${geometry.name} nodes by clicking in a blank model`, async ({ page }) => {
    await page.getByRole('button', { name: '新建', exact: true }).click();
    const toScreen = await canvasCoordinates(page);
    const start = toScreen(1, 0), end = toScreen(geometry.end.x, geometry.end.y);
    await page.mouse.click(start.x, start.y);
    await page.mouse.click(end.x, end.y);
    await page.getByRole('button', { name: '添加杆件', exact: true }).click();
    await page.mouse.click(start.x, start.y);
    await page.mouse.click(end.x, end.y);
    await expect(page.locator('.model-count')).toContainText('2 节点 / 1 杆件');
    await expect(page.getByRole('button', { name: '删除杆件', exact: true })).toBeVisible();

    const saved = await exportedModel(page);
    expect(saved.nodes.map(({ x, y }) => ({ x, y }))).toEqual([{ x: 1, y: 0 }, geometry.end]);
    expect(saved.members).toHaveLength(1);
    expect(new Set([saved.members[0].start, saved.members[0].end])).toEqual(new Set(saved.nodes.map(n => n.id)));
    // An unconstrained model must not retain results from the startup example.
    await expect(page.getByTestId('max-moment')).toContainText('—');
    await expect(page.getByRole('button', { name: '求解模型', exact: true })).toBeDisabled();
  });
}

test('an unrelated node between endpoint X coordinates does not prevent a diagonal member', async ({ page }) => {
  await page.getByRole('button', { name: '新建', exact: true }).click();
  const toScreen = await canvasCoordinates(page);
  const start = toScreen(1, 0), end = toScreen(3, 2), offSegment = toScreen(2, -0.75);
  for (const p of [start, end, offSegment]) await page.mouse.click(p.x, p.y);
  await page.getByRole('button', { name: '添加杆件', exact: true }).click();
  await page.mouse.click(start.x, start.y);
  await page.mouse.click(end.x, end.y);
  await expect(page.locator('.model-count')).toContainText('3 节点 / 1 杆件');
});

test('deletes an attached support from the node inspector without deleting geometry and restores it with undo', async ({ page }) => {
  const before = await exportedModel(page);
  const node = (await canvasCoordinates(page))(0, 0);
  await page.mouse.click(node.x, node.y);
  await expect(page.getByLabel('X 坐标')).toHaveValue('0');
  await page.getByRole('button', { name: '删除此节点的支座', exact: true }).click();
  await expect(page.locator('.model-count')).toContainText('2 节点 / 1 杆件');
  await expect(page.getByLabel('X 坐标')).toHaveValue('0');
  await expect(page.getByRole('button', { name: '删除此节点的支座', exact: true })).toHaveCount(0);
  const deleted = await exportedModel(page);
  expect(deleted).toEqual({ ...before, supports: before.supports.filter(s => s.nodeId !== 'N1') });
  await expect(page.getByTestId('max-moment')).toContainText('—');

  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect(page.getByRole('button', { name: '删除此节点的支座', exact: true })).toBeVisible();
  expect(await exportedModel(page)).toEqual(before);
  await expect(page.getByTestId('max-moment')).toContainText('15');

  await page.getByRole('button', { name: '重做', exact: true }).click();
  expect(await exportedModel(page)).toEqual(deleted);
});

test('clicking the visible pin support body selects the support for independent deletion', async ({ page }) => {
  const before = await exportedModel(page);
  const node = (await canvasCoordinates(page))(0, 0);
  await page.mouse.click(node.x, node.y + 20);
  await expect(page.getByLabel('支座类型')).toHaveValue('pin');
  await page.getByRole('button', { name: '删除支座', exact: true }).click();
  await expect(page.locator('.model-count')).toContainText('2 节点 / 1 杆件');
  expect(await exportedModel(page)).toEqual({ ...before, supports: before.supports.filter(s => s.id !== 'S1') });
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  expect(await exportedModel(page)).toEqual(before);
});

test('all five themes change the visible palette, persist on reload, and preserve the model', async ({ page }) => {
  const before = await exportedModel(page);
  const palettes = new Set<string>();
  for (const theme of ['原野白', '极夜霓虹', '星云紫', '深海蓝图', '琥珀工坊']) {
    await page.getByRole('button',{name:'切换主题'}).click();
    await page.getByRole('button',{name:`使用${theme}`,exact:true}).click();
    await expect(page.getByRole('button',{name:'切换主题'})).toContainText(theme);
    palettes.add(await page.locator('body').evaluate(el => {
      const style = getComputedStyle(el);
      return `${style.backgroundColor}|${style.backgroundImage}|${style.color}`;
    }));
    expect(await exportedModel(page)).toEqual(before);
    await page.reload();
    await expect(page.getByRole('button',{name:'切换主题'})).toContainText(theme);
    await expect(page.getByTestId('max-moment')).toContainText('15');
  }
  expect(palettes.size).toBe(5);
  expect(await exportedModel(page)).toEqual(before);
});

async function hoverChartAtMiddle(page: Page, label: string) {
  const chart = page.getByRole('img', { name: `${label}，可悬停查看数值` });
  const box = await chart.boundingBox();
  if (!box) throw new Error(`${label}未显示`);
  await page.mouse.move(box.x + box.width * (55 + (750 - 55) / 2) / 800, box.y + box.height / 2);
  return chart;
}

for (const benchmark of [
  { value: 'vertical', moment: '30', shear: '10' },
  { value: 'inclined', moment: '30', shear: '7.071' },
  { value: 'frame', moment: '40', shear: '10' },
]) {
  test(`${benchmark.value} example solves through the real API and renders member diagrams`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.getByLabel('选择验证算例').selectOption(benchmark.value);
    await expect(page.getByTestId('max-moment')).toContainText(benchmark.moment);
    await expect(page.getByTestId('max-shear')).toContainText(benchmark.shear);
    await expect(page.locator('.validation-bar')).toContainText('通过');
    await expect(page.getByTestId('structure-diagram')).toBeVisible();
    await page.getByRole('button',{name:'截面曲线',exact:true}).click();
    await expect(page.getByLabel('查看杆件内力')).toHaveValue('B1');
    await hoverChartAtMiddle(page, '弯矩图');
    await expect(page.getByTestId('chart-readout')).toContainText('M');
    await expect(page.getByTestId('chart-readout')).toContainText('kN·m');
    await expect(page.getByTestId('chart-readout')).not.toContainText('NaN');

    for (const label of ['剪力图', '轴力图', '挠度图', '水平位移']) {
      await page.getByRole('button', { name: label }).click();
      const chart = await hoverChartAtMiddle(page, label);
      await expect(chart).toBeVisible();
      // Constant shear/axial diagrams are horizontal paths: zero bounding-box
      // height is valid SVG, so verify their drawn length instead of visibility.
      expect(await chart.locator('path[fill="none"]').first().evaluate(el=>(el as SVGPathElement).getTotalLength())).toBeGreaterThan(0);
      await expect(page.getByTestId('chart-readout')).toContainText(label.includes('位移') || label === '挠度图' ? 'mm' : 'kN');
      await expect(page.getByTestId('chart-readout')).not.toContainText('NaN');
    }
    expect(errors).toEqual([]);
  });
}

test('frame member selector displays the selected member without joining unrelated member diagrams', async ({ page }) => {
  await page.getByLabel('选择验证算例').selectOption('frame');
  await expect(page.getByTestId('max-moment')).toContainText('40');
  await page.getByRole('button',{name:'截面曲线',exact:true}).click();
  const selector = page.getByLabel('查看杆件内力');
  await expect(selector.locator('option')).toHaveCount(2);
  await expect(selector).toHaveValue('B1');
  const chart = await hoverChartAtMiddle(page, '弯矩图');
  const columnMomentPath = await chart.locator('path[fill="none"]').first().getAttribute('d');
  await selector.selectOption('B2');
  await expect(selector).toHaveValue('B2');
  await hoverChartAtMiddle(page, '弯矩图');
  await expect(chart.locator('path[fill="none"]').first()).not.toHaveAttribute('d', columnMomentPath!);
  await expect(page.getByTestId('chart-readout')).toContainText('20');
  await expect(page.getByTestId('chart-readout')).toContainText('kN·m');
  await expect(page.getByTestId('max-moment')).toContainText('40');
});
