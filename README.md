# 喵Stay 民宿房态脚本

当前网站采用“先提交入住申请，房东确认可住后再付款”的流程：

1. 客人在网页提交入住日期、离店日期、人数和房型。
2. 网页只根据公开房态提示“可申请/不可申请”，不自动锁房、不自动收款。
3. 房东确认途家等平台没有占用后，再通过邮箱或微信发送支付宝/微信支付二维码。
4. 入住日前 3 天及以前可免费取消；不足 3 天取消，扣除订单金额 50%。

## 手动锁房

在正式仓库目录运行：

```bash
node tools/update-availability.mjs add --room 喵A --source tujia --checkin 2026-10-01 --checkout 2026-10-04 --note 国庆途家订单
```

说明：

- `--room` 可填 `喵A`、`喵B`、`all`
- `--source` 可填 `tujia`、`direct`、`manual`
- `--checkin` 是入住日，`--checkout` 是离店日；脚本会锁住中间每一晚
- 不要把客人电话、邮箱、身份证、支付信息写入公开仓库

生成后提交并推送：

```bash
git add data/blockouts.csv data/availability.json
git commit -m "Update availability"
git push origin main
```

## 取消或释放房态

编辑 `data/blockouts.csv`，把对应行的 `status` 改成 `cancelled`，再运行：

```bash
node tools/update-availability.mjs
```

会锁房的状态：`blocked`、`confirmed`、`hold`、`manual`、`paid`、`tujia`

不会锁房的状态：`cancelled`、`free`、`pending`、`rejected`、`request`

## 接入途家日历

如果途家后台能导出房态日历 `.ics` 链接，把链接保存到 GitHub 仓库 Secret：

`CALENDAR_SOURCES_JSON`

内容格式：

```json
{
  "sources": [
    {
      "room": "喵A",
      "source": "tujia",
      "url": "https://example.com/miao-a-calendar.ics"
    },
    {
      "room": "喵B",
      "source": "tujia",
      "url": "https://example.com/miao-b-calendar.ics"
    }
  ]
}
```

自动任务模板已放在 `tools/update-availability-workflow.yml`。当前 GitHub 登录令牌没有 `workflow` 权限，不能直接推送 `.github/workflows/` 文件；等授权后，把这个模板复制到 `.github/workflows/update-availability.yml`，GitHub Actions 就会每 6 小时自动运行一次，生成公开的 `data/availability.json`。

如果途家没有日历链接，就用手动锁房命令维护。

---

# 部署指南：鸡爪健康证书验证二维码

## 最终效果
扫描二维码 → 跳转到 `https://wohl.top/qrcode/S0IxNjcyMTAtQ0hJQ0tFTi1QQVctVlZLLUdST1VQLTIwMjY`
→ 显示乌克兰食品安全局风格的验证页面 → 点击蓝色按钮查看证书详情

---

## 第一步：创建 GitHub 仓库

1. 登录 GitHub → 点击右上角 "+" → "New repository"
2. 仓库名随意，比如 `cert-verify`
3. 选 **Public**（GitHub Pages 免费版要求公开）
4. 点 "Create repository"

## 第二步：上传文件

把 `github-repo.zip` 里的所有文件上传到仓库根目录，结构如下：

```
cert-verify/
├── CNAME                          ← 自定义域名配置
├── .nojekyll                      ← 禁用 Jekyll
└── qrcode/
    └── S0IxNjcyMTAtQ0hJQ0tFTi1QQVctVlZLLUdST1VQLTIwMjY/
        └── index.html             ← 验证页面
```

**上传方法**：在仓库页面点 "Add file" → "Upload files"，把解压后的文件全拖进去。

> 注意：`.nojekyll` 是隐藏文件，确保上传了。也可以在 GitHub 网页上手动创建。

## 第三步：开启 GitHub Pages

1. 进入仓库 → Settings → Pages
2. Source 选 **Deploy from a branch**
3. Branch 选 **main**，文件夹选 **/ (root)**
4. 点 Save

## 第四步：绑定 wohl.top 域名

### 4.1 GitHub 端
在 Settings → Pages → Custom domain 输入 `wohl.top`，点 Save。

### 4.2 DNS 端（你的域名管理后台）
添加以下 DNS 记录：

| 类型 | 名称 | 值 |
|------|------|-----|
| A | @ | 185.199.108.153 |
| A | @ | 185.199.109.153 |
| A | @ | 185.199.110.153 |
| A | @ | 185.199.111.153 |

如果你想同时支持 www 子域：
| 类型 | 名称 | 值 |
|------|------|-----|
| CNAME | www | 你的用户名.github.io |

### 4.3 开启 HTTPS
DNS 生效后（通常几分钟到几小时），回到 GitHub Pages 设置，勾选 **Enforce HTTPS**。

## 第五步：测试

打开浏览器访问：
`https://wohl.top/qrcode/S0IxNjcyMTAtQ0hJQ0tFTi1QQVctVlZLLUdST1VQLTIwMjY`

看到验证页面就成功了。然后用手机扫描二维码图片（qr_code_wohl_top.png）确认跳转正常。
