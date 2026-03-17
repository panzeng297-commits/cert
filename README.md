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
