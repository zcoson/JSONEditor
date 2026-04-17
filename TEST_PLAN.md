# JSON Editor 功能测试计划

## 测试环境

- **测试工具**: Playwright (无头浏览器自动化测试)
- **测试范围**: 所有按钮、节点切换、快捷键、交互功能
- **测试平台**: macOS (Tauri 桌面应用)

---

## 一、Toolbar 工具栏测试

### 1.1 文件操作按钮

| 测试项 | 测试步骤 | 预期结果 |
|--------|----------|----------|
| Open file 按钮 | 1. 点击工具栏的打开文件按钮<br>2. 在文件对话框中选择一个 JSON 文件 | 文件内容正确加载，文件名显示在工具栏 |
| Open file - 取消 | 1. 点击打开文件按钮<br>2. 在对话框中点击取消 | 无任何变化，保持当前状态 |
| Paste 按钮 | 1. 复制一段有效的 JSON 到剪贴板<br>2. 点击 Paste 按钮 | JSON 正确解析并显示在树形视图中 |
| Paste - 无效 JSON | 1. 复制无效 JSON 到剪贴板<br>2. 点击 Paste 按钮 | 显示错误提示 "Invalid JSON" |
| Save 按钮 | 1. 加载一个文件<br>2. 修改内容<br>3. 点击 Save 按钮 | 文件保存成功，按钮短暂显示 "Saved!" |
| Save - 新文件 | 1. 粘贴 JSON 内容（无文件路径）<br>2. 点击 Save 按钮 | 弹出保存对话框，选择路径后保存成功 |
| Save - 禁用状态 | 1. 清空所有内容<br>2. 观察 Save 按钮 | 按钮处于禁用状态，不可点击 |

### 1.2 编辑操作按钮

| 测试项 | 测试步骤 | 预期结果 |
|--------|----------|----------|
| Reset 按钮 | 1. 加载文件<br>2. 修改某些值<br>3. 点击 Reset 按钮 | 内容恢复到原始加载时的状态 |
| Reset - 禁用状态 | 1. 初始状态（无原始内容）<br>2. 观察 Reset 按钮 | 按钮处于禁用状态 |
| Undo 按钮 | 1. 加载文件<br>2. 修改一个值<br>3. 点击 Undo 按钮 | 恢复到修改前的状态 |
| Undo - 多次 | 1. 进行多次修改<br>2. 连续点击 Undo | 逐步撤销所有修改 |
| Undo - 禁用状态 | 1. 初始状态（无历史记录）<br>2. 观察 Undo 按钮 | 按钮处于禁用状态 |
| Clear 按钮 | 1. 加载文件<br>2. 点击 Clear 按钮 | 所有内容清空，恢复初始状态 |
| Clear - 禁用状态 | 1. 初始状态（无内容）<br>2. 观察 Clear 按钮 | 按钮处于禁用状态 |

### 1.3 复制操作按钮

| 测试项 | 测试步骤 | 预期结果 |
|--------|----------|----------|
| Compress 按钮 | 1. 加载格式化的 JSON 文件<br>2. 点击 Compress 按钮 | 压缩后的 JSON 复制到剪贴板，按钮短暂显示 "Copied!" |
| Compress - 禁用状态 | 1. 清空内容<br>2. 观察 Compress 按钮 | 按钮处于禁用状态 |
| Copy 按钮 | 1. 加载 JSON 文件<br>2. 点击 Copy 按钮 | 格式化的 JSON 复制到剪贴板，按钮短暂显示 "Copied!" |
| Copy - 禁用状态 | 1. 清空内容<br>2. 观察 Copy 按钮 | 按钮处于禁用状态 |

### 1.4 字体缩放按钮

| 测试项 | 测试步骤 | 预期结果 |
|--------|----------|----------|
| A+ 放大字体 | 1. 点击 A+ 按钮多次 | 字体逐渐增大，最大到 24px |
| A- 缩小字体 | 1. 点击 A- 按钮多次 | 字体逐渐缩小，最小到 10px |
| 字体显示 | 1. 点击 A+ 或 A- 按钮 | 中间数字显示当前字体大小 |
| 字体应用 | 1. 调整字体大小<br>2. 观察编辑面板 | 编辑面板字体大小随之改变 |

### 1.5 布局切换按钮

| 测试项 | 测试步骤 | 预期结果 |
|--------|----------|----------|
| 切换到垂直布局 | 1. 默认水平布局<br>2. 点击布局切换按钮 | 布局变为垂直（上下排列），图标变为三条竖线 |
| 切换到水平布局 | 1. 垂直布局状态<br>2. 点击布局切换按钮 | 布局变为水平（左右排列），图标变为三条横线 |
| 多次切换 | 1. 连续点击切换按钮多次 | 布局在水平和垂直之间交替切换 |

---

## 二、JsonTree 树形视图测试

### 2.1 节点选择

| 测试项 | 测试步骤 | 预期结果 |
|--------|----------|----------|
| 点击根节点 | 1. 加载 JSON<br>2. 点击 "root" 节点 | 根节点高亮选中，编辑面板显示完整 JSON |
| 点击对象属性 | 1. 加载包含对象的 JSON<br>2. 点击某个对象属性节点 | 该节点高亮，编辑面板显示该对象的编辑界面 |
| 点击数组项 | 1. 加载包含数组的 JSON<br>2. 点击数组中的某项 | 该项高亮，编辑面板显示该项内容 |
| 点击基本类型值 | 1. 加载 JSON<br>2. 点击字符串/数字/布尔值节点 | 该节点高亮，编辑面板显示单值编辑界面 |
| 切换选中节点 | 1. 选中节点 A<br>2. 选中节点 B | 节点 A 取消高亮，节点 B 高亮 |

### 2.2 展开/折叠功能

| 测试项 | 测试步骤 | 预期结果 |
|--------|----------|----------|
| 展开对象 | 1. 点击折叠状态的对象节点展开图标 | 显示所有子属性 |
| 折叠对象 | 1. 点击展开状态的对象节点展开图标 | 隐藏所有子属性，递归折叠所有子节点 |
| 展开数组 | 1. 点击折叠状态的数组节点展开图标 | 显示所有数组项 |
| 折叠数组 | 1. 点击展开状态的数组节点展开图标 | 隐藏所有数组项 |
| 点击节点自动展开 | 1. 点击一个折叠的节点（非展开图标） | 节点被选中，同时自动展开 |
| 嵌套节点折叠 | 1. 展开多层嵌套结构<br>2. 折叠父节点 | 所有子节点同时被折叠 |

### 2.3 空状态显示

| 测试项 | 测试步骤 | 预期结果 |
|--------|----------|----------|
| 无 JSON 加载 | 1. 启动应用（未加载任何文件） | 显示 "No JSON loaded" 提示 |

---

## 三、EditorPanel 编辑面板测试

### 3.1 模式切换

| 测试项 | 测试步骤 | 预期结果 |
|--------|----------|----------|
| Edit 按钮 | 1. 选中一个对象节点<br>2. 点击 Edit 按钮 | 切换到编辑模式，显示属性编辑界面 |
| Preview 按钮 | 1. 在编辑模式<br>2. 点击 Preview 按钮 | 切换到预览模式，显示格式化 JSON |
| 模式保持 | 1. 切换到编辑模式<br>2. 选择另一个节点 | 保持编辑模式 |
| 模式记忆 | 1. 切换到编辑模式<br>2. 重新加载文件 | 保持上次选择的模式 |

### 3.2 复制按钮（编辑面板内）

| 测试项 | 测试步骤 | 预期结果 |
|--------|----------|----------|
| Compress（当前节点） | 1. 选中一个节点<br>2. 点击 Compress 按钮 | 当前节点的压缩 JSON 复制到剪贴板 |
| Copy（当前节点） | 1. 选中一个节点<br>2. 点击 Copy 按钮 | 当前节点的格式化 JSON 复制到剪贴板 |

### 3.3 Filter 功能

| 测试项 | 测试步骤 | 预期结果 |
|--------|----------|----------|
| 过滤数组 | 1. 选中数组节点<br>2. 输入 `root.filter(x => x.active)` | 显示过滤后的结果 |
| 映射转换 | 1. 选中数组节点<br>2. 输入 `root.map(x => x.name)` | 显示映射后的结果 |
| 统计函数 | 1. 选中数字数组<br>2. 输入 `sum(root)` | 显示求和结果 |
| 分组函数 | 1. 选中对象数组<br>2. 输入 `groupBy(root, 'category')` | 显示分组结果 |
| 清空过滤 | 1. 输入过滤表达式<br>2. 清空输入框 | 显示原始数据 |
| 错误表达式 | 1. 输入无效表达式 | 显示错误提示 |

### 3.4 Object 编辑器

| 测试项 | 测试步骤 | 预期结果 |
|--------|----------|----------|
| 编辑字符串属性 | 1. 选中对象<br>2. 修改字符串属性的值 | 值更新，树形视图同步更新 |
| 编辑数字属性 | 1. 选中对象<br>2. 修改数字属性的值 | 值更新，验证数字格式 |
| 编辑布尔属性 | 1. 选中对象<br>2. 点击复选框切换布尔值 | 值在 true/false 之间切换 |
| 编辑 null 属性 | 1. 选中包含 null 的对象<br>2. 使用下拉菜单选择新值 | null 可转换为其他类型 |
| 删除属性 | 1. 选中对象<br>2. 点击某属性的删除按钮 | 属性被删除 |
| 添加属性 | 1. 选中对象<br>2. 输入新属性名<br>3. 点击 Add Property | 新属性添加成功 |
| 添加重复属性 | 1. 输入已存在的属性名<br>2. 点击 Add Property | 按钮禁用，无法添加 |
| 空对象显示 | 1. 选中空对象 `{}` | 显示 "Empty object" 提示 |

### 3.5 Array 编辑器 - 表格模式

| 测试项 | 测试步骤 | 预期结果 |
|--------|----------|----------|
| 表格显示 | 1. 选中对象数组 `[{a:1,b:2},{a:3,b:4}]` | 显示表格，列头为属性名 |
| 编辑单元格 | 1. 点击单元格<br>2. 修改值 | 值更新，同步到树形视图 |
| 插入行 | 1. 点击某行的插入按钮 | 在该行下方插入新行 |
| 删除行 | 1. 点击某行的删除按钮 | 该行被删除 |
| 添加行 | 1. 点击 Add Row 按钮 | 在末尾添加新行 |

### 3.6 Array 编辑器 - 简单模式

| 测试项 | 测试步骤 | 预期结果 |
|--------|----------|----------|
| 简单数组显示 | 1. 选中简单数组 `[1,2,3]` | 显示索引和值的表格 |
| 编辑项 | 1. 修改某项的值 | 值更新 |
| 插入项 | 1. 点击某项的插入按钮 | 在该项后插入 null |
| 删除项 | 1. 点击某项的删除按钮 | 该项被删除 |
| 添加项 | 1. 点击 Add Item 按钮 | 在末尾添加 null |

### 3.7 单值编辑

| 测试项 | 测试步骤 | 预期结果 |
|--------|----------|----------|
| 字符串编辑 | 1. 选中字符串值<br>2. 修改文本框内容 | 值更新 |
| 数字编辑 | 1. 选中数字值<br>2. 修改数字输入框 | 值更新 |
| 布尔切换 | 1. 选中布尔值<br>2. 点击复选框 | 值切换 |
| null 类型转换 | 1. 选中 null 值<br>2. 使用下拉菜单选择 | null 转换为其他类型 |
| Set to null | 1. 选中非 null 值<br>2. 点击 ⊘ 按钮 | 值变为 null |

### 3.8 空状态显示

| 测试项 | 测试步骤 | 预期结果 |
|--------|----------|----------|
| 无 JSON 加载 | 1. 未加载任何文件 | 显示 "No JSON loaded" 提示 |
| 未选中节点 | 1. 加载文件但未选中任何节点 | 显示 "Select a node to edit" 提示 |

---

## 四、快捷键测试

| 测试项 | 测试步骤 | 预期结果 |
|--------|----------|----------|
| Cmd+S 保存 | 1. 加载文件<br>2. 修改内容<br>3. 按 Cmd+S | 文件保存成功 |
| Cmd+Z 撤销 | 1. 修改内容<br>2. 按 Cmd+Z | 撤销到修改前状态 |
| Cmd+V 粘贴（全局） | 1. 复制 JSON 到剪贴板<br>2. 焦点不在输入框<br>3. 按 Cmd+V | JSON 加载成功 |
| Cmd+V 粘贴（输入框） | 1. 焦点在输入框<br>2. 按 Cmd+V | 正常粘贴文本，不触发 JSON 加载 |
| Cmd+A 全选（预览模式） | 1. 在预览模式<br>2. 按 Cmd+A | 选中所有预览内容 |
| Cmd+A 全选（单值编辑） | 1. 编辑单值<br>2. 按 Cmd+A | 选中输入框全部内容 |

---

## 五、面板交互测试

### 5.1 多列面板（嵌套 JSON 字符串）

| 测试项 | 测试步骤 | 预期结果 |
|--------|----------|----------|
| 选择 JSON 字符串 | 1. 选中值为 JSON 字符串的属性 | 新增一列显示解析后的 JSON |
| 多层嵌套 | 1. 在第二列继续选择 JSON 字符串 | 继续新增列 |
| 切换第一列选择 | 1. 在第二列激活时<br>2. 在第一列选择其他节点 | 第二列及之后的列关闭 |
| 选择非 JSON 字符串 | 1. 在第二列选择非字符串值 | 第二列关闭 |

### 5.2 面板大小调整

| 测试项 | 测试步骤 | 预期结果 |
|--------|----------|----------|
| 拖拽分隔线 | 1. 拖拽面板间的分隔线 | 面板大小随之调整 |
| 最小宽度限制 | 1. 尝试将面板拖到很小 | 有最小宽度限制，不会完全折叠 |
| 布局切换后 | 1. 调整面板大小<br>2. 切换布局 | 面板大小重置为默认比例 |

---

## 六、文件操作测试

### 6.1 拖拽打开文件

| 测试项 | 测试步骤 | 预期结果 |
|--------|----------|----------|
| 拖拽 JSON 文件 | 1. 从 Finder 拖拽 JSON 文件到窗口 | 文件加载成功 |
| 拖拽非 JSON 文件 | 1. 拖拽非 JSON 文件 | 显示错误或忽略 |

### 6.2 双击打开文件

| 测试项 | 测试步骤 | 预期结果 |
|--------|----------|----------|
| 双击 JSON 文件 | 1. 在 Finder 中双击 JSON 文件<br>2. 应用已关联 .json 扩展名 | 应用打开并加载文件 |

---

## 七、边界情况测试

| 测试项 | 测试步骤 | 预期结果 |
|--------|----------|----------|
| 空对象 `{}` | 1. 加载 `{}` | 正确显示，编辑器显示 "Empty object" |
| 空数组 `[]` | 1. 加载 `[]` | 正确显示，可添加项 |
| 深层嵌套 | 1. 加载多层嵌套的 JSON | 正确展开/折叠 |
| 大数组 | 1. 加载包含大量项的数组 | 性能良好，可正常操作 |
| 特殊字符 | 1. 加载包含特殊字符的字符串 | 正确显示和编辑 |
| Unicode 字符 | 1. 加载包含中文/emoji 的 JSON | 正确显示和编辑 |

---

## 八、Playwright 测试代码示例

```typescript
import { test, expect } from '@playwright/test';

test.describe('Toolbar Tests', () => {
  test('Paste button should load valid JSON', async ({ page }) => {
    await page.goto('/');

    // 模拟剪贴板内容
    await page.evaluate(() => {
      navigator.clipboard.writeText('{"name": "test", "value": 123}');
    });

    await page.click('button:has-text("Paste")');

    // 验证 JSON 树显示
    await expect(page.locator('.json-tree')).toContainText('name');
    await expect(page.locator('.json-tree')).toContainText('value');
  });

  test('Compress button should copy compressed JSON', async ({ page }) => {
    await page.goto('/');

    // 加载 JSON
    await page.evaluate(() => {
      navigator.clipboard.writeText('{\n  "a": 1,\n  "b": 2\n}');
    });
    await page.click('button:has-text("Paste")');

    // 点击 Compress
    await page.click('button:has-text("Compress")');

    // 验证按钮状态变化
    await expect(page.locator('button:has-text("Copied!")')).toBeVisible();

    // 验证剪贴板内容
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toBe('{"a":1,"b":2}');
  });

  test('Layout toggle should switch between horizontal and vertical', async ({ page }) => {
    await page.goto('/');

    // 默认水平布局
    const container = page.locator('.flex-1.flex');
    await expect(container).toHaveClass(/flex-row/);

    // 切换到垂直
    await page.click('button[title="Switch to vertical layout"]');
    await expect(container).toHaveClass(/flex-col/);

    // 切换回水平
    await page.click('button[title="Switch to horizontal layout"]');
    await expect(container).toHaveClass(/flex-row/);
  });
});

test.describe('JsonTree Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      navigator.clipboard.writeText(JSON.stringify({
        user: {
          name: "John",
          age: 30,
          tags: ["a", "b", "c"]
        },
        items: [
          { id: 1, active: true },
          { id: 2, active: false }
        ]
      }));
    });
    await page.click('button:has-text("Paste")');
  });

  test('Clicking node should select it', async ({ page }) => {
    // 点击 user 节点
    await page.click('text=user');
    await expect(page.locator('.bg-blue-50')).toContainText('user');

    // 编辑面板应显示 user 对象
    await expect(page.locator('.editor-panel')).toContainText('name');
    await expect(page.locator('.editor-panel')).toContainText('age');
  });

  test('Expand/collapse should work', async ({ page }) => {
    // 折叠 user 节点
    const userNode = page.locator('text=user').locator('..');
    await userNode.locator('svg').first().click();

    // 子节点应该隐藏
    await expect(page.locator('text=name')).not.toBeVisible();

    // 再次点击展开
    await userNode.locator('svg').first().click();
    await expect(page.locator('text=name')).toBeVisible();
  });
});

test.describe('EditorPanel Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      navigator.clipboard.writeText(JSON.stringify({
        name: "test",
        count: 10,
        active: true,
        data: null
      }));
    });
    await page.click('button:has-text("Paste")');
    await page.click('text=root');
  });

  test('Edit mode should show property editors', async ({ page }) => {
    await page.click('button:has-text("Edit")');

    // 应该显示属性编辑器
    await expect(page.locator('input[value="test"]')).toBeVisible();
    await expect(page.locator('input[type="number"]')).toBeVisible();
    await expect(page.locator('input[type="checkbox"]')).toBeVisible();
  });

  test('Preview mode should show formatted JSON', async ({ page }) => {
    await page.click('button:has-text("Preview")');

    // 应该显示格式化的 JSON
    await expect(page.locator('pre')).toContainText('"name"');
    await expect(page.locator('pre')).toContainText('"test"');
  });

  test('Editing value should update tree', async ({ page }) => {
    await page.click('button:has-text("Edit")');

    // 修改 name 属性
    const nameInput = page.locator('input[value="test"]');
    await nameInput.fill('modified');

    // 树形视图应该更新
    await expect(page.locator('.json-tree')).toContainText('modified');
  });

  test('Add property should work', async ({ page }) => {
    await page.click('button:has-text("Edit")');

    // 添加新属性
    await page.fill('input[placeholder="New property name"]', 'newProp');
    await page.click('button:has-text("Add Property")');

    // 新属性应该出现
    await expect(page.locator('text=newProp')).toBeVisible();
  });

  test('Delete property should work', async ({ page }) => {
    await page.click('button:has-text("Edit")');

    // 删除 count 属性
    const countRow = page.locator('text=count').locator('..');
    await countRow.locator('button:has(svg)').last().click();

    // count 应该消失
    await expect(page.locator('text=count')).not.toBeVisible();
  });
});

test.describe('Array Editor Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      navigator.clipboard.writeText(JSON.stringify([
        { id: 1, name: "Item1" },
        { id: 2, name: "Item2" }
      ]));
    });
    await page.click('button:has-text("Paste")');
    await page.click('text=root');
    await page.click('button:has-text("Edit")');
  });

  test('Table mode should display correctly', async ({ page }) => {
    // 应该显示表格
    await expect(page.locator('table')).toBeVisible();
    await expect(page.locator('th:has-text("id")')).toBeVisible();
    await expect(page.locator('th:has-text("name")')).toBeVisible();
  });

  test('Add row should work', async ({ page }) => {
    await page.click('button:has-text("Add Row")');

    // 应该有 3 行
    await expect(page.locator('tbody tr')).toHaveCount(3);
  });

  test('Delete row should work', async ({ page }) => {
    // 点击第一行的删除按钮
    await page.locator('tbody tr').first().locator('button').last().click();

    // 应该只剩 1 行
    await expect(page.locator('tbody tr')).toHaveCount(1);
  });
});

test.describe('Keyboard Shortcuts', () => {
  test('Cmd+Z should undo', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      navigator.clipboard.writeText('{"a": 1}');
    });
    await page.click('button:has-text("Paste")');
    await page.click('text=root');
    await page.click('button:has-text("Edit")');

    // 修改值
    await page.fill('input[type="number"]', '100');

    // 撤销
    await page.keyboard.press('Meta+z');

    // 应该恢复
    await expect(page.locator('input[type="number"]')).toHaveValue('1');
  });
});

test.describe('Filter Tests', () => {
  test('Filter should work on arrays', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      navigator.clipboard.writeText(JSON.stringify([
        { id: 1, active: true },
        { id: 2, active: false },
        { id: 3, active: true }
      ]));
    });
    await page.click('button:has-text("Paste")');
    await page.click('text=root');
    await page.click('button:has-text("Preview")');

    // 输入过滤表达式
    await page.fill('input[placeholder*="filter"]', 'root.filter(x => x.active)');

    // 应该显示过滤结果
    await expect(page.locator('pre')).toContainText('"id": 1');
    await expect(page.locator('pre')).toContainText('"id": 3');
    await expect(page.locator('pre')).not.toContainText('"id": 2');
  });

  test('Sum function should work', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      navigator.clipboard.writeText(JSON.stringify([1, 2, 3, 4, 5]));
    });
    await page.click('button:has-text("Paste")');
    await page.click('text=root');
    await page.click('button:has-text("Preview")');

    await page.fill('input[placeholder*="filter"]', 'sum(root)');

    await expect(page.locator('pre')).toContainText('15');
  });
});
```

---

## 九、测试执行计划

### 阶段一：基础功能测试（优先级：高）
1. Toolbar 所有按钮功能
2. JsonTree 节点选择和展开/折叠
3. EditorPanel 基本编辑功能

### 阶段二：高级功能测试（优先级：中）
1. 快捷键测试
2. Filter 功能测试
3. 多列面板测试

### 阶段三：边界情况测试（优先级：低）
1. 特殊字符处理
2. 大数据量性能
3. 错误处理

---

## 十、测试数据准备

```json
// 简单对象
{"name": "test", "value": 123, "active": true}

// 嵌套对象
{
  "user": {
    "name": "John",
    "age": 30,
    "address": {
      "city": "Beijing",
      "zip": "100000"
    }
  }
}

// 数组
[1, 2, 3, 4, 5]

// 对象数组
[
  {"id": 1, "name": "Item1", "active": true},
  {"id": 2, "name": "Item2", "active": false}
]

// 嵌套 JSON 字符串
{
  "config": "{\"theme\": \"dark\", \"fontSize\": 14}"
}

// 空值
{}
[]
null

// 特殊字符
{
  "chinese": "中文测试",
  "emoji": "🎉🎊🎁",
  "special": "line1\nline2\ttab"
}
```

---

## 十一、注意事项

1. **Tauri 特有功能**: 文件对话框、拖拽文件、双击打开需要特殊处理，可能需要 mock 或使用 Tauri 的测试工具
2. **剪贴板操作**: Playwright 需要权限访问剪贴板，需要在测试配置中设置
3. **异步操作**: 按钮点击后的状态变化可能需要等待
4. **快捷键**: macOS 使用 Meta 键，Windows/Linux 使用 Control 键